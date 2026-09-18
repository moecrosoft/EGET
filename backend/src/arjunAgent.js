import Groq from "groq-sdk";
import { toolDefinitions, executeTool } from "./tools.js";
import { getJourneyOptions } from "./journeyPlanner.js";
import { respondToCommuterSchema, respondToCommuterJsonSchema } from "./schemas.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

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

// Groq's chat completions API is OpenAI-compatible: tool definitions use the
// `{ type: "function", function: { name, description, parameters } }` shape,
// not Anthropic's `{ name, description, input_schema }`. tools.js's
// toolDefinitions stay Anthropic-shaped (agent.js, untouched, still relies on
// that), so we map to the Groq/OpenAI shape here at the point we build the
// tools array actually sent to Groq.
function toGroqTool(anthropicShapedTool) {
  return {
    type: "function",
    function: {
      name: anthropicShapedTool.name,
      description: anthropicShapedTool.description,
      parameters: anthropicShapedTool.input_schema,
    },
  };
}

const GROQ_TOOLS = ALL_TOOLS.map(toGroqTool);

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
  const conversation = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const response = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      tools: GROQ_TOOLS,
      messages: conversation,
    });

    const responseMessage = response.choices[0].message;
    const toolCalls = responseMessage.tool_calls || [];

    const finalCall = toolCalls.find((c) => c.function.name === RESPOND_TOOL_NAME);
    if (finalCall) {
      return respondToCommuterSchema.parse(JSON.parse(finalCall.function.arguments));
    }

    if (toolCalls.length === 0) {
      // Model produced only text with turns still remaining — nudge it back
      // toward tool use / the final structured answer on the next turn by
      // just continuing the loop with its text appended to history.
      conversation.push(responseMessage);
      conversation.push({
        role: "user",
        content:
          "Continue. Use tools as needed, then call respond_to_commuter with your final recommendation.",
      });
      continue;
    }

    conversation.push(responseMessage);

    const toolResultMessages = await Promise.all(
      toolCalls.map(async (call) => {
        const input = JSON.parse(call.function.arguments);
        const result = await executeArjunTool(call.function.name, input);
        return {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
      })
    );

    conversation.push(...toolResultMessages);
  }

  // Turn cap reached without a respond_to_commuter call — force it.
  const forcedResponse = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: GROQ_TOOLS,
    tool_choice: { type: "function", function: { name: RESPOND_TOOL_NAME } },
    messages: conversation,
  });

  const forcedToolCalls = forcedResponse.choices[0].message.tool_calls || [];
  const forcedCall = forcedToolCalls.find((c) => c.function.name === RESPOND_TOOL_NAME);

  if (!forcedCall) {
    throw new Error(
      "Arjun agent loop exhausted its turn cap and the forced respond_to_commuter call still did not produce a tool call."
    );
  }

  return respondToCommuterSchema.parse(JSON.parse(forcedCall.function.arguments));
}
