import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "./tools.js";
import { getJourneyOptions } from "./journeyPlanner.js";
import { respondToCommuterSchema, respondToCommuterJsonSchema } from "./schemas.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are Commute Companion, tailored for Arjun: a multi-modal, flexible-start
commuter travelling Punggol -> one-north. He can cycle to Punggol interchange and take the
LRT+rail, or take a bus door-to-door. He is not chasing the fastest option — he optimizes for
comfort and crowding, and will happily leave around 20 minutes later to dodge a crowd crush.

Use your tools to ground every recommendation in live conditions: check train alerts and weather
directly when relevant, and call get_journey_options to get an actual ranked comparison of his two
routes (with ETAs, crowding, delays, and a data-driven leave-later suggestion if one exists) rather
than guessing at numbers yourself.

Once you have enough information, you MUST call respond_to_commuter with your final recommendation.
Do not write a prose final answer — respond_to_commuter's structured input IS the answer. Keep the
reason concrete and specific to what the tools returned; don't fabricate an alternative departure
time or crowd level that a tool didn't give you.`;

const RESPOND_TOOL_NAME = "respond_to_commuter";

// Reuse only the two tools Arjun's loop needs from the shared tool set — don't
// redefine their JSON schemas or duplicate the LTA/weather calls.
const REUSED_TOOL_NAMES = ["get_train_alerts", "get_weather"];
const reusedToolDefinitions = toolDefinitions.filter((t) => REUSED_TOOL_NAMES.includes(t.name));

const GET_JOURNEY_OPTIONS_TOOL = {
  name: "get_journey_options",
  description:
    "Get a ranked comparison of Arjun's two routes (cycle+LRT vs bus-only) from Punggol to " +
    "one-north for a given time of day. Returns { requestedTime, weather, options: [{ id, mode, " +
    "etaMinutes, crowdLevel, delayMinutes, affectedSegments, legs }], recommendation: { optionId, " +
    "reason }, alternativeTiming: { label, atTime, reason } | null }. Call this whenever you need " +
    "real ETA/crowding/delay numbers to compare the two routes, or to check for a better departure time.",
  input_schema: {
    type: "object",
    properties: {
      time: {
        type: "string",
        description: "Departure time as HH:MM (24h). Defaults to the current time if omitted.",
      },
    },
    required: [],
  },
};

const RESPOND_TO_COMMUTER_TOOL = {
  name: RESPOND_TOOL_NAME,
  description:
    "Deliver your final recommendation to the commuter. Calling this tool IS the final answer — " +
    "its input must be the complete structured recommendation, not a partial draft.",
  input_schema: respondToCommuterJsonSchema,
};

const ALL_TOOLS = [...reusedToolDefinitions, GET_JOURNEY_OPTIONS_TOOL, RESPOND_TO_COMMUTER_TOOL];

function currentTimeHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function executeArjunTool(name, input) {
  if (name === "get_journey_options") {
    const time = input?.time || currentTimeHHMM();
    return getJourneyOptions(time);
  }
  // get_train_alerts / get_weather — delegate to the shared tool executor so
  // we don't duplicate their LTA/weather-client call sites.
  return executeTool(name, input);
}

/**
 * Runs the Arjun-specific agentic loop and returns the parsed, zod-validated
 * structured recommendation object. Modeled on the loop in agent.js, but the
 * loop's only valid exit is a `respond_to_commuter` tool call — there is no
 * free-text final answer.
 */
export async function chatWithArjunAgent({ message, history = [] }) {
  const conversation = [...history, { role: "user", content: message }];

  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS,
      messages: conversation,
    });

    const toolUses = response.content.filter((b) => b.type === "tool_use");

    const finalCall = toolUses.find((c) => c.name === RESPOND_TOOL_NAME);
    if (finalCall) {
      return respondToCommuterSchema.parse(finalCall.input);
    }

    if (toolUses.length === 0) {
      // Model produced only text with turns still remaining — nudge it back
      // toward tool use / the final structured answer on the next turn by
      // just continuing the loop with its text appended to history.
      conversation.push({ role: "assistant", content: response.content });
      conversation.push({
        role: "user",
        content:
          "Continue. Use tools as needed, then call respond_to_commuter with your final recommendation.",
      });
      continue;
    }

    conversation.push({ role: "assistant", content: response.content });

    const toolResults = await Promise.all(
      toolUses.map(async (call) => {
        const result = await executeArjunTool(call.name, call.input);
        return {
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result),
        };
      })
    );

    conversation.push({ role: "user", content: toolResults });
  }

  // Turn cap reached without a respond_to_commuter call — force it.
  const forcedResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: ALL_TOOLS,
    tool_choice: { type: "tool", name: RESPOND_TOOL_NAME },
    messages: conversation,
  });

  const forcedCall = forcedResponse.content.find(
    (b) => b.type === "tool_use" && b.name === RESPOND_TOOL_NAME
  );

  if (!forcedCall) {
    throw new Error(
      "Arjun agent loop exhausted its turn cap and the forced respond_to_commuter call still did not produce a tool call."
    );
  }

  return respondToCommuterSchema.parse(forcedCall.input);
}
