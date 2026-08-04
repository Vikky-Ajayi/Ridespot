import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import driverRouter from "./driver.js";
import hotspotsRouter from "./hotspots.js";
import eventsRouter from "./events.js";
import paymentsRouter from "./payments.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/driver", driverRouter);
router.use("/hotspots", hotspotsRouter);
router.use("/events", eventsRouter);
router.use("/payments", paymentsRouter);
router.use("/admin", adminRouter);

export default router;
