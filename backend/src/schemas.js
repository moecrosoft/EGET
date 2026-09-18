import { z } from "zod";

// Structured final-answer shape for the Arjun agentic loop (backend/src/arjunAgent.js).
//
// IMPORTANT: `respondToCommuterSchema` (Zod, used to validate the model's tool
// input at runtime) and `respondToCommuterJsonSchema` (plain JSON Schema, used
// as the `input_schema`/`parameters` of the `respond_to_commuter` tool sent to
// the LLM's tool-calling API — currently Groq, via arjunAgent.js) describe the
// SAME shape. Tool-calling APIs take JSON Schema, not Zod objects, so we can't
// derive one from the other here — if you add/rename/retype a field in one,
// make the matching change in the other or the model's tool calls will fail
// `.parse()`.

const crowdLevelEnum = ["l", "m", "h", "NA"];
const confidenceEnum = ["low", "medium", "high"];
const recommendationIdEnum = ["cycle-lrt", "bus-only", "wait-and-leave-later"];

export const respondToCommuterSchema = z.object({
  recommendationId: z.enum(recommendationIdEnum),
  reason: z.string().min(1),
  options: z.array(
    z.object({
      id: z.string(),
      mode: z.string(),
      etaMinutes: z.number().nullable(),
      crowdLevel: z.enum(crowdLevelEnum),
      delayMinutes: z.number(),
    })
  ),
  alternativeTiming: z
    .object({
      label: z.string(),
      atTime: z.string(),
      reason: z.string(),
    })
    .nullable(),
  confidence: z.enum(confidenceEnum),
});

export const respondToCommuterJsonSchema = {
  type: "object",
  properties: {
    recommendationId: {
      type: "string",
      enum: recommendationIdEnum,
      description: "Which option the commuter should take.",
    },
    reason: {
      type: "string",
      description: "Concrete, non-empty explanation for the recommendation.",
    },
    options: {
      type: "array",
      description: "Every option considered, so the commuter can see the comparison.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          mode: { type: "string", description: "Human-readable mode label, e.g. 'Cycle + LRT'." },
          etaMinutes: { type: ["number", "null"] },
          crowdLevel: { type: "string", enum: crowdLevelEnum },
          delayMinutes: { type: "number" },
        },
        required: ["id", "mode", "etaMinutes", "crowdLevel", "delayMinutes"],
      },
    },
    alternativeTiming: {
      type: ["object", "null"],
      description: "A later departure time that meaningfully improves comfort, or null if none.",
      properties: {
        label: { type: "string" },
        atTime: { type: "string" },
        reason: { type: "string" },
      },
      required: ["label", "atTime", "reason"],
    },
    confidence: {
      type: "string",
      enum: confidenceEnum,
    },
  },
  required: ["recommendationId", "reason", "options", "alternativeTiming", "confidence"],
};
