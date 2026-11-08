import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  adminAuditLogsTable,
  adminMediaTable,
  adminQuestionsTable,
  adminSettingsTable,
  quizResultsTable,
} from "@workspace/db";
import { stripeStorage } from "../stripeStorage";
import { getUncachableStripeClient } from "../stripeClient";
import { CreateAdminSimulationEventBody, GetAppSettingsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const defaultPageBuilderSettings = {
  eyebrow: "CompTIA Certification Prep",
  title: "Trifecta Quiz",
  subtitle: "A+, Network+, and Security+ practice questions",
  tagline: "Build confidence by mastering what you know with certainty",
  disclaimerTitle: "Practice Disclaimer",
  disclaimerText:
    "This is a practice tool for CompTIA exam prep. The 100–900 scoring scale and 750 passing score are simulations based on CompTIA's real scoring model, but your actual exam results may differ. Questions are curated from the full question bank and are timed to mimic exam pressure.",
  primaryColor: "#dc2626",
  accentColor: "#06b6d4",
  backgroundColor: "#070b14",
  panelColor: "#111827",
  textColor: "#f3f4f6",
  tiers: {
    "1": { name: "Mild", description: "Foundational troubleshooting", questionCount: 270, secondsPerQuestion: 75, passingScore: 80, color: "#22c55e" },
    "2": { name: "Medium", description: "Applied exam scenarios", questionCount: 270, secondsPerQuestion: 60, passingScore: 80, color: "#f59e0b" },
    "3": { name: "HellMode", description: "Forensic logs and advanced troubleshooting", questionCount: 270, secondsPerQuestion: 45, passingScore: 80, color: "#ef4444" },
  },
};

function safeBuilderText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || fallback : fallback;
}

function safeBuilderColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function safeBuilderNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function sanitizePageBuilderSettings(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, any> : {};
  const incomingTiers = input.tiers && typeof input.tiers === "object" ? input.tiers : {};
  const tiers = {} as typeof defaultPageBuilderSettings.tiers;

  for (const tier of ["1", "2", "3"] as const) {
    const fallback = defaultPageBuilderSettings.tiers[tier];
    const incoming = incomingTiers[tier] && typeof incomingTiers[tier] === "object" ? incomingTiers[tier] : {};
    tiers[tier] = {
      name: safeBuilderText(incoming.name, fallback.name, 32),
      description: safeBuilderText(incoming.description, fallback.description, 80),
      questionCount: safeBuilderNumber(incoming.questionCount, fallback.questionCount, 1, 270),
      secondsPerQuestion: tier === "3" ? 45 : safeBuilderNumber(incoming.secondsPerQuestion, fallback.secondsPerQuestion, 15, 180),
      passingScore: safeBuilderNumber(incoming.passingScore, fallback.passingScore, 50, 100),
      color: safeBuilderColor(incoming.color, fallback.color),
    };
  }

  return {
    eyebrow: safeBuilderText(input.eyebrow, defaultPageBuilderSettings.eyebrow, 48),
    title: safeBuilderText(input.title, defaultPageBuilderSettings.title, 60),
    subtitle: safeBuilderText(input.subtitle, defaultPageBuilderSettings.subtitle, 100),
    tagline: safeBuilderText(input.tagline, defaultPageBuilderSettings.tagline, 120),
    disclaimerTitle: safeBuilderText(input.disclaimerTitle, defaultPageBuilderSettings.disclaimerTitle, 48),
    disclaimerText: safeBuilderText(input.disclaimerText, defaultPageBuilderSettings.disclaimerText, 700),
    primaryColor: safeBuilderColor(input.primaryColor, defaultPageBuilderSettings.primaryColor),
    accentColor: safeBuilderColor(input.accentColor, defaultPageBuilderSettings.accentColor),
    backgroundColor: safeBuilderColor(input.backgroundColor, defaultPageBuilderSettings.backgroundColor),
    panelColor: safeBuilderColor(input.panelColor, defaultPageBuilderSettings.panelColor),
    textColor: safeBuilderColor(input.textColor, defaultPageBuilderSettings.textColor),
    tiers,
  };
}

function changeValueForAudit(value: unknown): unknown {
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 157)}…` : value;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return Array.isArray(value) ? `[${value.length} items]` : "[configuration]";
}

function collectSettingsChanges(previous: unknown, next: unknown, prefix = ""): Array<{ field: string; from: unknown; to: unknown }> {
  const previousObject = previous && typeof previous === "object" && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  const nextObject = next && typeof next === "object" && !Array.isArray(next)
    ? next as Record<string, unknown>
    : {};
  const keys = new Set([...Object.keys(previousObject), ...Object.keys(nextObject)]);
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

  for (const key of keys) {
    const field = prefix ? `${prefix}.${key}` : key;
    const before = previousObject[key];
    const after = nextObject[key];
    if (
      before && after &&
      typeof before === "object" && typeof after === "object" &&
      !Array.isArray(before) && !Array.isArray(after)
    ) {
      changes.push(...collectSettingsChanges(before, after, field));
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field, from: changeValueForAudit(before), to: changeValueForAudit(after) });
    }
    if (changes.length >= 40) break;
  }
  return changes;
}

type AdminRole = "owner";
type AdminPermission =
  | "dashboard:read"
  | "dashboard:overview"
  | "quiz:read"
  | "quiz:manage"
  | "settings:manage"
  | "media:manage"
  | "users:read"
  | "users:manage"
  | "audit:read"
  | "simulation:run";

const rolePermissions: Record<AdminRole, AdminPermission[]> = {
  owner: [
    "dashboard:read",
    "dashboard:overview",
    "quiz:read",
    "quiz:manage",
    "settings:manage",
    "media:manage",
    "users:read",
    "users:manage",
    "audit:read",
    "simulation:run",
  ],
};

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

function getAdminRole(userId: string): AdminRole | null {
  return getAdminIds().has(userId) ? "owner" : null;
}

function requirePermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = getRequestUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = getAdminRole(userId);
    if (!role || !rolePermissions[role].includes(permission)) {
      res.status(403).json({
        error: "Admin access is not enabled for this Clerk user.",
        code: "ADMIN_NOT_ALLOWED",
      });
      return;
    }

    (req as any).adminUserId = userId;
    (req as any).adminRole = role;
    next();
  };
}

function adminUserId(req: Request): string {
  return (req as any).adminUserId as string;
}

function adminRole(req: Request): AdminRole {
  return (req as any).adminRole as AdminRole;
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

router.get("/app-settings", async (req, res): Promise<void> => {
  try {
    const [setting] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "app"))
      .limit(1);
    const value = setting?.value ?? {};
    res.json(GetAppSettingsResponse.parse({
      announcement: typeof value.announcement === "string" ? value.announcement : "",
      maintenanceMode: value.maintenanceMode === true,
      pricingHeadline: typeof value.pricingHeadline === "string" ? value.pricingHeadline : "Upgrade to Pro",
      monthlyPriceLabel: typeof value.monthlyPriceLabel === "string" ? value.monthlyPriceLabel : "",
      yearlyPriceLabel: typeof value.yearlyPriceLabel === "string" ? value.yearlyPriceLabel : "",
      pageBuilder: sanitizePageBuilderSettings(value.pageBuilder),
    }));
  } catch (error) {
    // Public settings are an enhancement; keep the quiz available if the
    // optional admin tables have not been provisioned yet.
    req.log.warn({ err: error }, "Unable to load public app settings");
    res.json(GetAppSettingsResponse.parse({
      announcement: "",
      maintenanceMode: false,
      pricingHeadline: "Upgrade to Pro",
      monthlyPriceLabel: "",
      yearlyPriceLabel: "",
      pageBuilder: defaultPageBuilderSettings,
    }));
  }
});

router.get("/managed-questions", async (_req, res): Promise<void> => {
  try {
    const questions = await db
      .select()
      .from(adminQuestionsTable)
      .where(eq(adminQuestionsTable.active, true))
      .orderBy(adminQuestionsTable.id);
    res.json(questions);
  } catch {
    res.json([]);
  }
});

router.get("/admin/access", requirePermission("dashboard:read"), async (req, res): Promise<void> => {
  try {
    const [setting] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "app"))
      .limit(1);
    res.json({
      isAdmin: true,
      role: adminRole(req),
      permissions: rolePermissions[adminRole(req)],
      freeTestSimulation: setting?.value?.freeTestSimulation === true,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load admin access settings");
    res.status(500).json({ error: "Failed to load admin access settings" });
  }
});

function validQuestionPayload(value: any): value is {
  category?: string;
  tier?: number;
  difficulty?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  active?: boolean;
  externalId?: string;
} {
  return Boolean(
    value &&
      typeof value.question === "string" &&
      value.question.trim() &&
      Array.isArray(value.options) &&
      value.options.length === 4 &&
      value.options.every((option: unknown) => typeof option === "string" && option.trim()) &&
      Number.isInteger(value.correctIndex) &&
      value.correctIndex >= 0 &&
      value.correctIndex < 4,
  );
}

router.get("/admin/questions", requirePermission("quiz:read"), async (_req, res): Promise<void> => {
  try {
    res.json({ data: await db.select().from(adminQuestionsTable).orderBy(desc(adminQuestionsTable.updatedAt)) });
  } catch {
    res.status(500).json({ error: "Failed to load managed questions" });
  }
});

router.post("/admin/questions", requirePermission("quiz:manage"), async (req, res): Promise<void> => {
  if (!validQuestionPayload(req.body)) {
    res.status(400).json({ error: "Question, four options, and a valid answer are required" });
    return;
  }
  try {
    const [question] = await db
      .insert(adminQuestionsTable)
      .values({
        externalId: typeof req.body.externalId === "string" ? req.body.externalId.trim() || null : null,
        category: typeof req.body.category === "string" ? req.body.category : "A+",
        tier: req.body.tier === 1 || req.body.tier === 2 || req.body.tier === 3 ? req.body.tier : 2,
        difficulty: req.body.difficulty === "easy" || req.body.difficulty === "medium" || req.body.difficulty === "hard" ? req.body.difficulty : "medium",
        question: req.body.question.trim(),
        options: req.body.options.map((option: string) => option.trim()),
        correctIndex: req.body.correctIndex,
        explanation: typeof req.body.explanation === "string" ? req.body.explanation.trim() : "",
        active: req.body.active !== false,
        createdBy: adminUserId(req),
      })
      .returning();
    await writeAudit(req, "question.created", "question", String(question.id));
    res.status(201).json(question);
  } catch (error) {
    req.log.error({ err: error }, "Failed to create managed question");
    res.status(500).json({ error: "Failed to create managed question" });
  }
});

router.patch("/admin/questions/:id", requirePermission("quiz:manage"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !validQuestionPayload({ ...req.body, question: req.body.question ?? "existing", options: req.body.options ?? ["a", "b", "c", "d"], correctIndex: req.body.correctIndex ?? 0 })) {
    res.status(400).json({ error: "Question fields are invalid" });
    return;
  }
  try {
    const [question] = await db
      .update(adminQuestionsTable)
      .set({
        ...(req.body.category !== undefined ? { category: req.body.category } : {}),
        ...(req.body.tier !== undefined && [1, 2, 3].includes(req.body.tier) ? { tier: req.body.tier } : {}),
        ...(req.body.difficulty !== undefined && ["easy", "medium", "hard"].includes(req.body.difficulty) ? { difficulty: req.body.difficulty } : {}),
        question: req.body.question.trim(),
        options: req.body.options.map((option: string) => option.trim()),
        correctIndex: req.body.correctIndex,
        explanation: typeof req.body.explanation === "string" ? req.body.explanation.trim() : "",
        ...(req.body.active !== undefined ? { active: Boolean(req.body.active) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(adminQuestionsTable.id, id))
      .returning();
    if (!question) {
      res.status(404).json({ error: "Managed question not found" });
      return;
    }
    await writeAudit(req, "question.updated", "question", String(id));
    res.json(question);
  } catch (error) {
    req.log.error({ err: error }, "Failed to update managed question");
    res.status(500).json({ error: "Failed to update managed question" });
  }
});

router.delete("/admin/questions/:id", requirePermission("quiz:manage"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid question id" });
    return;
  }
  try {
    const [question] = await db.delete(adminQuestionsTable).where(eq(adminQuestionsTable.id, id)).returning();
    if (!question) {
      res.status(404).json({ error: "Managed question not found" });
      return;
    }
    await writeAudit(req, "question.deleted", "question", String(id));
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete managed question");
    res.status(500).json({ error: "Failed to delete managed question" });
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

router.get("/admin/overview", requirePermission("dashboard:overview"), async (req, res): Promise<void> => {
  try {
    const [settings, media, auditLogs, resultCount] =
      await Promise.all([
        db.select().from(adminSettingsTable).orderBy(adminSettingsTable.key),
        db.select().from(adminMediaTable).orderBy(desc(adminMediaTable.updatedAt)),
        db.select().from(adminAuditLogsTable).orderBy(desc(adminAuditLogsTable.createdAt)).limit(12),
        db.select({ count: sql<number>`count(*)` }).from(quizResultsTable),
      ]);

    let activeSubscriptions = 0;
    try {
      const subscriptionRows = await db.execute(
        sql`SELECT count(*)::int AS count FROM stripe.subscriptions WHERE status IN ('active', 'trialing')`,
      );
      activeSubscriptions = Number((subscriptionRows.rows[0] as any)?.count ?? 0);
    } catch (error) {
      req.log.warn({ err: error }, "Unable to read Stripe subscription count");
    }

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
        activeSubscriptions,
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

router.patch("/admin/settings", requirePermission("settings:manage"), async (req, res): Promise<void> => {
  const value = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    res.status(400).json({ error: "Settings must be an object" });
    return;
  }
  try {
    const [currentSetting] = await db
      .select({ value: adminSettingsTable.value })
      .from(adminSettingsTable)
      .where(eq(adminSettingsTable.key, "app"))
      .limit(1);
    const nextValue = { ...value };
    if (Object.prototype.hasOwnProperty.call(nextValue, "pageBuilder")) {
      nextValue.pageBuilder = sanitizePageBuilderSettings(nextValue.pageBuilder);
    }
    const [setting] = await db
      .insert(adminSettingsTable)
      .values({ key: "app", value: nextValue, updatedBy: adminUserId(req) })
      .onConflictDoUpdate({
        target: adminSettingsTable.key,
        set: { value: nextValue, updatedBy: adminUserId(req), updatedAt: new Date() },
      })
      .returning();
    await writeAudit(req, "settings.updated", "settings", "app", {
      changes: collectSettingsChanges(currentSetting?.value ?? {}, nextValue),
    });
    res.json(setting);
  } catch (error) {
    req.log.error({ err: error }, "Failed to update admin settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/admin/media", requirePermission("media:manage"), async (req, res): Promise<void> => {
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

router.patch("/admin/media/:id", requirePermission("media:manage"), async (req, res): Promise<void> => {
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

router.delete("/admin/media/:id", requirePermission("media:manage"), async (req, res): Promise<void> => {
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

router.get("/admin/users", requirePermission("users:read"), async (req, res): Promise<void> => {
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

router.post("/admin/users", requirePermission("users:manage"), async (req, res): Promise<void> => {
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

router.post("/admin/users/:userId/action", requirePermission("users:manage"), async (req, res): Promise<void> => {
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

router.get("/admin/audit", requirePermission("audit:read"), async (req, res): Promise<void> => {
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

router.post(
  "/admin/simulation-events",
  requirePermission("simulation:run"),
  async (req, res): Promise<void> => {
    const parsed = CreateAdminSimulationEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { profile, event, dailyQuizLimit, featureFlags, quizMode, scorePercent } = parsed.data;
    try {
      await writeAudit(req, `simulation.${event}`, "simulation", profile, {
        dailyQuizLimit,
        featureFlags,
        ...(quizMode ? { quizMode } : {}),
        ...(scorePercent !== undefined ? { scorePercent } : {}),
        realAccountImpersonated: false,
      });
      res.status(201).json({ success: true });
    } catch (error) {
      req.log.error({ err: error, profile, event }, "Failed to record admin simulation event");
      res.status(500).json({ error: "Failed to record simulation event" });
    }
  },
);

export default router;