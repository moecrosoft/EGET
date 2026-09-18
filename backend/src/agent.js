import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

// Constructed lazily (not at module load) so that `new Anthropic(...)` only
// runs once ANTHROPIC_API_KEY has actually been loaded into process.env —
// see backend/server.js for why module-load-time construction is unsafe.
let _anthropic;
function getAnthropic() {
  return (_anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
}

const SYSTEM_PROMPT = `You are Commute Companion, a proactive AI agent for Singapore public transit
commuters. You have live tools for train alerts, bus arrivals, alternate
routes, station crowding, and weather — use them instead of guessing whenever
a question could depend on current conditions.

Be concrete and brief: state what's happening, what it means for this
specific commuter, and one clear recommended action. Avoid disclaimers and
avoid restating the question. If a tool shows no live key configured
(source "mock" or "mock-fallback"), you can still speak naturally about the
conditions returned — don't tell the commuter it's fake data.

If the commuter has given you a profile (home/work station, preferred
lines), tailor everything to that. If not, answer generally and ask once for
their commute details so future answers can be personalized.`;

/**
 * Runs one turn of the agent loop: sends the conversation to Claude, and if
 * Claude wants to call tools, executes them and feeds results back — looping
 * until Claude produces a final text answer. This is the real agentic part:
 * the model decides which live data it needs, not a hardcoded script.
 */
async function runAgentLoop(messages, systemPrompt = SYSTEM_PROMPT) {
  const conversation = [...messages];
  const toolCallsMade = [];

  for (let turn = 0; turn < 6; turn++) {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: conversation,
    });

    const toolUses = response.content.filter((b) => b.type === "tool_use");

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: text, toolCallsMade };
    }

    conversation.push({ role: "assistant", content: response.content });

    const toolResults = await Promise.all(
      toolUses.map(async (call) => {
        toolCallsMade.push({ tool: call.name, input: call.input });
        const result = await executeTool(call.name, call.input);
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result),
        };
      })
    );

    conversation.push({ role: "user", content: toolResults });
  }

  return {
    reply: "I looked into a few things but couldn't finish reasoning in time — try asking again.",
    toolCallsMade,
  };
}

export async function chatWithAgent({ message, profile, history = [] }) {
  const profileNote = profile
    ? `Commuter profile: home station = ${profile.home || "unset"}, work station = ${
        profile.work || "unset"
      }, preferred lines = ${(profile.lines || []).join(", ") || "unset"}.`
    : "No commuter profile set yet.";

  const messages = [
    ...history,
    { role: "user", content: `${profileNote}\n\nCommuter says: ${message}` },
  ];

  return runAgentLoop(messages);
}

/**
 * Used by the proactive monitor: given a profile and a specific disruption,
 * ask the agent to decide whether/how to notify the commuter. Returns null
 * if the agent decides it's not actually relevant.
 */
export async function generateProactiveNudge({ profile, alert }) {
  const prompt = `A new live disruption has appeared: ${JSON.stringify(alert)}.
Commuter profile: home station = ${profile.home}, work station = ${profile.work}, preferred lines = ${(
    profile.lines || []
  ).join(", ")}.

Decide if this disruption is actually relevant to this commuter's daily route.
If NOT relevant, respond with exactly: NOT_RELEVANT
If relevant, respond with a short proactive push-notification-style message (2-3 sentences max):
what's wrong, how it affects them specifically, and your recommended alternate action. Use your
tools if you need alternate-route detail.`;

  const { reply } = await runAgentLoop(
    [{ role: "user", content: prompt }],
    SYSTEM_PROMPT + "\nYou are running in proactive monitoring mode, not a live chat turn."
  );

  if (reply.trim() === "NOT_RELEVANT") return null;
  return reply.trim();
}
