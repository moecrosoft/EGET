import express from "express";
import {
  arjunChat,
  generateText,
  generateImage,
  createEmbeddings,
  streamChat,
} from "../controllers/ai.controller.js";

const router = express.Router();

// Arjun agentic chat — see backend/src/arjunAgent.js
router.post("/arjun/chat", arjunChat);

// Original frontend AI-playground placeholders (no real model behind them)
router.post("/generate-text", generateText);
router.post("/generate-image", generateImage);
router.post("/embeddings", createEmbeddings);
router.post("/chat", streamChat);

export default router;
