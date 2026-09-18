import express from "express";
import aiRoutes from "./routes/ai.routes.js";
import errorHandler from "./middleware/errorHandler.js";

const router = express.Router();

// Prefix AI endpoints under /ai
router.use("/ai", aiRoutes);

// Register error handling middleware
router.use(errorHandler);

export default router;
