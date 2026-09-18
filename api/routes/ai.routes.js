import express from "express";
import { arjunChat } from "../controllers/ai.controller.js";

const router = express.Router();

// Arjun agentic chat — see backend/src/arjunAgent.js
router.post("/arjun/chat", arjunChat);

export default router;
