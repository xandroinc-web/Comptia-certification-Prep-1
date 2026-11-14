import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import quizResultsRouter from "./quiz_results.js";
import quizRouter from "./quiz.js";
import stripeRouter from "./stripe.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quizResultsRouter);
router.use(quizRouter);
router.use(stripeRouter);
router.use(adminRouter);

export default router;
