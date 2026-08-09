import { Router, type IRouter } from "express";
import healthRouter from "./health";
import quizResultsRouter from "./quiz_results";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(quizResultsRouter);
router.use(stripeRouter);

export default router;
