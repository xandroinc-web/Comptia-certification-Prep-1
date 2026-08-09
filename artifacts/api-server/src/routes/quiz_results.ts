import { Router, type IRouter } from "express";
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { quizResultsTable, insertQuizResultSchema } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = (auth as any)?.userId || (auth as any)?.sessionClaims?.userId;
  if (!userId || typeof userId !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
}

router.get("/quiz-results", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const results = await db
      .select()
      .from(quizResultsTable)
      .where(eq(quizResultsTable.userId, userId))
      .orderBy(desc(quizResultsTable.completedAt));
    res.json(results);
  } catch (err) {
    (req as any).log?.error(err);
    res.status(500).json({ error: "Failed to fetch quiz results" });
  }
});

router.post("/quiz-results", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const parsed = insertQuizResultSchema.parse(req.body);
    const [result] = await db
      .insert(quizResultsTable)
      .values({ ...parsed, userId })
      .returning();
    res.status(201).json(result);
  } catch (err) {
    (req as any).log?.error(err);
    res.status(400).json({ error: "Invalid quiz result data" });
  }
});

export default router;
