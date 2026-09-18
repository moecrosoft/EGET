/**
 * Controller for AI endpoints. `arjunChat` wires the real Arjun agentic loop
 * (backend/src/arjunAgent.js) in; the other four are the original frontend
 * AI-playground placeholders (no real model behind them yet) — kept as-is
 * since frontend/app.js's playground buttons call them directly.
 */

import { chatWithArjunAgent } from "../../backend/src/arjunAgent.js";

export const arjunChat = async (req, res, next) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const result = await chatWithArjunAgent({
      message,
      history: Array.isArray(history) ? history : [],
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const generateText = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    // TODO: Connect AI Service here
    res.status(200).json({
      success: true,
      message: "Placeholder text response",
      data: { text: `Processed text for prompt: "${prompt}"` },
    });
  } catch (error) {
    next(error);
  }
};

export const generateImage = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    // TODO: Connect Image Model Service here
    res.status(200).json({
      success: true,
      message: "Placeholder image response",
      data: { url: "https://placeholder.sc/600x400" },
    });
  } catch (error) {
    next(error);
  }
};

export const createEmbeddings = async (req, res, next) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: "Input text is required." });
    }

    // TODO: Connect Embedding Model Service here
    res.status(200).json({
      success: true,
      message: "Placeholder embeddings response",
      data: { vector: [0.012, -0.045, 0.891, 0.234] },
    });
  } catch (error) {
    next(error);
  }
};

export const streamChat = async (req, res, next) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    // TODO: Connect Streaming Chat Service here
    res.status(200).json({
      success: true,
      message: "Placeholder chat completion response",
      data: { role: "assistant", content: "This is a mock chat response." },
    });
  } catch (error) {
    next(error);
  }
};
