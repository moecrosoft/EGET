/**
 * Controller for AI endpoints. Wires the Arjun agentic loop
 * (backend/src/arjunAgent.js) into the api/ Express router.
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
