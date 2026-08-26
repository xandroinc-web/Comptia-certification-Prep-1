import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminAuditLogsTable,
  adminMediaTable,
  adminSettingsTable,
  quizResultsTable,
} from "@workspace/db";
import { stripeStorage } from "../stripeStorage";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

function getRequestUserId(req: Request): string | null {
  const auth = getAuth(req);
  const userId = (auth as any)?.userId || (auth as any)?.sessionClaims?.userId;
  return typeof userId === "string" ? userId : null;
}

function getAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const userId = getRequestUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!getAdminIds().has(userId)) {
    res.status(403).json({
      error: "Admin access is not configured for this account",
      code: "ADMIN_NOT_ALLOWED",
    });
    return;
  }
  (req as any).adminUserId = userId;
  next();
}

function adminUserId(req: Request): string {
  return (req as any).adminUserId as string;
}

async function writeAudit(
  req: Request,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(adminAuditLogsTable).values({
    actorUserId: adminUserId(req),
    action,
    targetType,
    targetId,
    metadata,
  });
}

router.get("/app-settings", async (_req, res): Promise<void> => {
  try {
    const [setting] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "app"))
      .limit(1);
    const value = setting?.value ?? {};
    res.json({
      announcement: typeof value.announcement === "string" ? value.announcement : "",
      maintenanceMode: value.maintenanceMode === true,
    });
  } catch (error) {
    // Public settings are an enhancement; keep the quiz available if the
    // optional admin tables have not been provisioned yet.
    req.log.warn({ err: error }, "Unable to load public app settings");
    res.json({ announcement: "", maintenanceMode: false });
  }
});

function serializeUser(user: any) {
  const primaryEmail = user.emailAddresses?.find(
    (email: any) => email.id === user.primaryEmailAddressId,
  )?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
  return {
    id: user.id,
    email: primaryEmail,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    imageUrl: user.imageUrl ?? null,
    banned: Boolean(user.banned),
    locked: Boolean(user.locked),
    createdAt: new Date(user.createdAt).toISOString(),
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : null,
  };
}

router.get("/admin/overview", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [settings, media, auditLogs, resultCount, activeSubscriptions] =
      await Promise.all([
        db.select().from(adminSettingsTable).orderBy(adminSettingsTable.key),
        db.select().from(adminMediaTable).orderBy(desc(adminMediaTable.updatedAt)),
        db.select().from(adminAuditLogsTable).orderBy(desc(adminAuditLogsTable.createdAt)).limit(12),
        db.select({ count: sql<number>`count(*)` }).from(quizResultsTable),
        db.execute(sql`SELECT count(*)::int AS count FROM stripe.subscriptions WHERE status IN ('active', 'trialing')`),
      ]);

    let users = 0;
    try {
      const response = await clerkClient.users.getUserList({ limit: 1 });
      users = response.totalCount ?? response.data.length;
    } catch (error) {
      req.log.warn({ err: error }, "Unable to read Clerk user count");
    }

    let products: unknown[] = [];
    try {
      const rows = await stripeStorage.listProductsWithPrices(false, 100, 0);
      const productMap = new Map<string, any>();
      for (const row of rows as any[]) {
        if (!productMap.has(row.product_id)) {
          productMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            prices: [],
          });
        }
        if (row.price_id) {
          productMap.get(row.product_id).prices.push({
            id: row.price_id,
            amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }
      products = Array.from(productMap.values());
    } catch (error) {
      req.log.warn({ err: error }, "Unable to read Stripe products for admin overview");
    }

    res.json({
      stats: {
        users,
        quizResults: Number(resultCount[0]?.count ?? 0),
        activeSubscriptions: Number((activeSubscriptions.rows[0] as any)?.count ?? 0),
        activeMedia: media.filter((item) => item.active).length,
      },
      settings,
      media,
      auditLogs,
      products,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load admin overview");
    res.status(500).json({ error: "Failed to load admin overview" });
  }
});

router.patch("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const value = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    res.status(400).json({ error: "Settings must be an object" });
    return;
  }
  try {
    const [setting] = await db
      .insert(adminSettingsTable)
      .values({ key: "app", value, updatedBy: adminUserId(req) })
      .onConflictDoUpdate({
        target: adminSettingsTable.key,
        set: { value, updatedBy: adminUserId(req), updatedAt: new Date() },
      })
      .returning();
    await writeAudit(req, "settings.updated", "settings", "app", {
      keys: Object.keys(value),
    });
    res.json(setting);
  } catch (error) {
    req.log.error({ err: error }, "Failed to update admin settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/admin/media", requireAdmin, async (req, res): Promise<void> => {
  const { kind, title, url, description, active } = req.body ?? {};
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof url !== "string" ||
    !/^https?:\/\//i.test(url)
  ) {
    res.status(400).json({ error: "A title and valid http(s) URL are required" });
    return;
  }
  try {
    const [media] = await db
      .insert(adminMediaTable)
      .values({
        kind: kind === "video" ? "video" : "link",
        title: title.trim(),
        url: url.trim(),
        description: typeof description === "string" ? description.trim() || null : null,
        active: active !== false,
        createdBy: adminUserId(req),
      })
      .returning();
    await writeAudit(req, "media.created", "media", String(media.id), { kind: media.kind });
    res.status(201).json(media);
  } catch (error) {
    req.log.error({ err: error }, "Failed to create admin media");
    res.status(500).json({ error: "Failed to create media item" });
  }
});

router.patch("/admin/media/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const { kind, title, url, description, active } = req.body ?? {};
  if (
    (title !== undefined && (typeof title !== "string" || !title.trim())) ||
    (url !== undefined && (typeof url !== "string" || !/^https?:\/\//i.test(url)))
  ) {
    res.status(400).json({ error: "Title and URL values are invalid" });
    return;
  }
  try {
    const [media] = await db
      .update(adminMediaTable)
      .set({
        ...(kind !== undefined ? { kind: kind === "video" ? "video" : "link" } : {}),
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(url !== undefined ? { url: url.trim() } : {}),
        ...(description !== undefined
          ? { description: typeof description === "string" ? description.trim() || null : null }
          : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(adminMediaTable.id, id))
      .returning();
    if (!media) {
      res.status(404).json({ error: "Media item not found" });
      return;
    }
    await writeAudit(req, "media.updated", "media", String(id));
    res.json(media);
  } catch (error) {
    req.log.error({ err: error }, "Failed to update admin media");
    res.status(500).json({ error: "Failed to update media item" });
  }
});

router.delete("/admin/media/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  try {
    const [media] = await db.delete(adminMediaTable).where(eq(adminMediaTable.id, id)).returning();
    if (!media) {
      res.status(404).json({ error: "Media item not found" });
      return;
    }
    await writeAudit(req, "media.deleted", "media", String(id), { title: media.title });
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete admin media");
    res.status(500).json({ error: "Failed to delete media item" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const rawQuery = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(Number(rawLimit) || 25, 1), 100);
  try {
    const response = await clerkClient.users.getUserList({
      limit,
      ...(query ? { query } : {}),
      orderBy: "-created_at",
    });
    res.json({
      data: response.data.map(serializeUser),
      totalCount: response.totalCount ?? response.data.length,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to list Clerk users");
    res.status(502).json({ error: "Unable to load users from Clerk" });
  }
});

router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { email, firstName, lastName } = req.body ?? {};
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  try {
    const user = await clerkClient.users.createUser({
      emailAddress: [email.trim()],
      ...(typeof firstName === "string" && firstName.trim() ? { firstName: firstName.trim() } : {}),
      ...(typeof lastName === "string" && lastName.trim() ? { lastName: lastName.trim() } : {}),
      skipPasswordRequirement: true,
    });
    await writeAudit(req, "user.created", "user", user.id, { email: email.trim() });
    res.status(201).json(serializeUser(user));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create Clerk user");
    res.status(502).json({ error: "Unable to create user in Clerk" });
  }
});

router.post("/admin/users/:userId/action", requireAdmin, async (req, res): Promise<void> => {
  const userId = typeof req.params.userId === "string" ? req.params.userId : "";
  const action = req.body?.action;
  if (!userId || !["ban", "unban", "delete", "cancel_subscription"].includes(action)) {
    res.status(400).json({ error: "Unsupported user action" });
    return;
  }
  if (userId === adminUserId(req)) {
    res.status(400).json({ error: "You cannot modify your own admin account" });
    return;
  }
  try {
    if (action === "ban") {
      await clerkClient.users.banUser(userId);
    } else if (action === "unban") {
      await clerkClient.users.unbanUser(userId);
    } else if (action === "delete") {
      await clerkClient.users.deleteUser(userId);
    } else {
      const customerResult = await db.execute(
        sql`SELECT stripe_customer_id FROM stripe_customers WHERE clerk_user_id = ${userId} LIMIT 1`,
      );
      const customerId = (customerResult.rows[0] as any)?.stripe_customer_id;
      if (!customerId) {
        res.status(404).json({ error: "No billing customer found for this user" });
        return;
      }
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 10 });
      await Promise.all(
        subscriptions.data.map((subscription) =>
          stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true }),
        ),
      );
    }
    await writeAudit(req, `user.${action}`, "user", userId);
    res.json({ success: true, action, userId });
  } catch (error) {
    req.log.error({ err: error, userId, action }, "Failed to apply admin user action");
    res.status(502).json({ error: "Unable to apply user action" });
  }
});

router.get("/admin/audit", requireAdmin, async (req, res): Promise<void> => {
  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
  try {
    const logs = await db
      .select()
      .from(adminAuditLogsTable)
      .orderBy(desc(adminAuditLogsTable.createdAt))
      .limit(limit);
    res.json({ data: logs });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load admin audit log");
    res.status(500).json({ error: "Failed to load audit history" });
  }
});

export default router;