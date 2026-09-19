import Groq from "groq-sdk";
import { toFile } from "groq-sdk/uploads";
import { getAllStations, findStationByName } from "./ltaClient.js";

const MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

// Constructed lazily (not at module load) — see getGroq() in arjunAgent.js /
// the dotenv-ordering comment in server.js for why this must be deferred
// until a request actually comes in.
let _groq;
function getGroq() {
  return (_groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));
}

// Whisper output is prose, not a clean station key ("Jurong East.", "go to
// jurong east please") — strip punctuation before comparing against names.
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Exact match first, then the longest known station name that appears
// anywhere in the spoken sentence (so "go to jurong east please" still
// matches "Jurong East" instead of failing because the sentence isn't an
// exact station name).
function matchStation(transcript) {
  const cleaned = normalize(transcript);
  if (!cleaned) return null;

  const exact = findStationByName(cleaned);
  if (exact) return exact;

  let best = null;
  for (const station of getAllStations()) {
    const name = station.name.toLowerCase();
    if (cleaned.includes(name) && (!best || name.length > best.name.length)) {
      best = station;
    }
  }
  return best;
}

export async function transcribeStation(audioBuffer) {
  const groq = getGroq();
  const file = await toFile(audioBuffer, "speech.webm");
  const result = await groq.audio.transcriptions.create({
    file,
    model: MODEL,
    language: "en",
    response_format: "json",
  });
  const transcript = (result.text || "").trim();
  const station = matchStation(transcript);
  const match = station ? { name: station.name, lat: station.latitude, lng: station.longitude } : null;
  return { transcript, match };
}
