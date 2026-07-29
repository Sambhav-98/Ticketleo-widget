// Ticketleo customer service agent — backend
//
// A small Express server that exposes POST /api/chat. Each request is handled
// by an OpenAI model with a tool it can call to look up real event data
// from events.json, plus a system prompt built from faqs.json. Conversation
// history is kept client-side and sent with every request (simple + stateless).

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

// LOG_FILE_PATH lets you point the log at a mounted persistent volume
// (e.g. LOG_FILE_PATH=/data/conversations.log) instead of the app folder,
// which some hosts wipe on every redeploy. Falls back to the old behavior
// (conversations.log next to server.js) if unset.
const LOG_FILE = process.env.LOG_FILE_PATH
  ? path.resolve(process.env.LOG_FILE_PATH)
  : path.join(__dirname, 'conversations.log');

// Optional external log drain — if set, every turn is also POSTed as JSON
// here (e.g. a small serverless function that writes to a database, or a
// logging service like Logtail/Datadog/your own endpoint). See "Conversation
// logging" in README.md.
const LOG_WEBHOOK_URL = process.env.LOG_WEBHOOK_URL || '';

// Make sure the log file's directory exists — matters when LOG_FILE_PATH
// points at a freshly-mounted volume that doesn't have the folder yet.
try {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
} catch (err) {
  console.error('Could not create log directory:', err.message);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and set it before starting the server.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Knowledge base ---------------------------------------------------
// Reloaded from disk on every request (cheap at this size) so editing
// events.json / faqs.json takes effect without restarting the server.
function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
}

// Caps how many few-shot examples get inlined into the prompt, regardless of
// how many are in examples.json — keeps prompt size/cost bounded and avoids
// diminishing (or contradictory) returns from too many examples. Curate the
// file itself rather than raising this.
const MAX_EXAMPLES = 8;

function buildExamplesSection() {
  let examples = [];
  try {
    const data = loadJson('examples.json');
    examples = Array.isArray(data.examples) ? data.examples.slice(0, MAX_EXAMPLES) : [];
  } catch {
    examples = []; // examples.json is optional — fine if it's missing or empty.
  }

  if (examples.length === 0) return '';

  const formatted = examples
    .map((ex) => `Customer: ${ex.customer}\nAgent: ${ex.agent}`)
    .join('\n\n');

  return `\n\n## Example past conversations (match this tone, phrasing, and level of detail)\n${formatted}`;
}

// eventFaqs entries are scoped to one specific show (e.g. Sydney) and must
// never leak into answers about other cities on the same tour, which have
// different venues, gate times, and policies.
function buildEventFaqsSection(faqs) {
  const groups = Array.isArray(faqs.eventFaqs) ? faqs.eventFaqs : [];
  if (groups.length === 0) return '';

  const sections = groups.map((group) => {
    const items = (group.items || [])
      .map((f) => `Q: ${f.q}\nA: ${f.a}`)
      .join('\n\n');
    return `### ${group.appliesTo} (city: ${group.city}) — ONLY use these for questions about this specific show. Other cities on the same tour have different venues/times/policies; don't apply these answers there.\n${items}`;
  });

  return `\n\n## Show-specific FAQs\n${sections.join('\n\n')}`;
}

// This chat site exists for exactly one show — Sushant KC's Sydney date —
// so its core facts (date, venue, price, ticket link) are baked directly
// into the system prompt below, not left to a tool call the model might
// phrase badly. Falls back to null fields gracefully if events.json's shape
// ever changes, rather than throwing and breaking the whole prompt.
function findDefaultShow() {
  try {
    const events = loadJson('events.json');
    for (const tour of events.tours || []) {
      const show = (tour.shows || []).find((s) => (s.city || '').toLowerCase() === 'sydney');
      if (show) return { tour, show };
    }
  } catch {
    // events.json missing/malformed — the rest of the prompt still works,
    // just without the baked-in fallback facts.
  }
  return null;
}

function buildDefaultShowSection(defaultShow) {
  if (!defaultShow) return '';
  const { tour, show } = defaultShow;

  return `\n\n## Default show for this chat — Sushant KC in Sydney
This entire chat site exists for one specific show. Unless the visitor names a different city, ALWAYS assume "the show"/"this show"/"the event"/a bare question like "when is it" or "where is it" refers to this one, and answer from the facts below with full confidence, no hedging:
- Artist: ${tour.artist}
- Tour: ${tour.tourName}
- City/venue: ${show.city}, ${show.venue || 'venue to be confirmed'}
- Date: ${show.date}${show.time ? `, ${show.time}` : ''}
- Ticket price: ${show.priceFrom ? `from ${show.priceFrom}` : 'see search_events for current pricing'}
- Ticket platform: ${show.ticketPlatform || 'Ticketleo'}
- Status: ${show.status || 'on sale'}
These facts are already confirmed and current as of this prompt being built — you do not need to call search_events just to answer a plain "when/where is the show" question, though you still should before quoting an exact price or on-sale status if the conversation needs precision, since those can change. Never tell the visitor you couldn't find a listing, don't have data, or that the show isn't in the system — it always is; that response is not acceptable here under any circumstance. Only mention the tour's other cities (Perth, Brisbane, Adelaide, Melbourne, Auckland) if the visitor explicitly asks about a different city than Sydney.`;
}

function buildSystemPrompt() {
  const faqs = loadJson('faqs.json');
  const today = new Date().toISOString().slice(0, 10);
  const defaultShow = findDefaultShow();

  return `You are the customer service agent for Ticketleo (${faqs.company.website}), a live event ticketing platform. You power Ticketleo's standalone AI support chat site — visitors come here specifically to get help with tickets, tours, and orders.

Today's date: ${today}${buildDefaultShowSection(defaultShow)}

## Voice & tone — read this first, it shapes every reply
You're not filling out a form or reading from a script. You're LEO, a real, warm presence who happens to know everything about this show and genuinely enjoys helping people get to it. Every single reply should sound like it came from a specific person who actually read this specific message — never like a generic support bot cycling through a script.
- Hard rule, not a style preference: never write an em dash or double hyphen ("—" or "--") anywhere, in any reply, for any reason. If a sentence you're about to write has one, stop and rewrite it as two sentences or join the halves with "and"/"but"/"so" instead.
- Open by reacting to what they actually said — excited, empathetic, reassuring, amused, whatever genuinely fits — before or while you answer. Never open by rephrasing their question back at them ("Great question about gate times!") or with a generic acknowledgment ("Thank you for reaching out.").
- Write the way you'd actually text a person: contractions, everyday words, sentences of varying length and rhythm. Cut corporate-support phrasing entirely — banned phrases include "I understand your concern," "I apologize for any inconvenience," "please be advised," "rest assured," "I'd be happy to help," "thank you for your patience," "I couldn't find a current listing," "I don't have that information," "there's no data available for that show." For anything about the Sydney show specifically, those last three are never true anyway (see "Default show for this chat" above) — don't say them.
- Let real personality through: genuine enthusiasm about the show, a little warmth or light humor when it fits naturally, real sympathy when someone's frustrated or stressed — while staying appropriately serious about anything urgent (safety, a lost ticket, money, a minor).
- Vary how you open each reply across a conversation — don't fall into repeating the same stock sentence structure turn after turn.
- Example of the difference: not "I can confirm that gates open at 5:00 PM. Please arrive early." — instead, something like "Gates open around 5pm, so if you want a good spot near the front, I'd get there on the earlier side."
- Write like a person texting, not like an AI trying to sound human. Skip the classic AI tells: no em dashes or double hyphens (write two shorter sentences, or join with "and"/"but"/"so" instead), no rigid "not just X, but Y" or "it's not about X, it's about Y" constructions, no stacked transition words ("Additionally," "Furthermore," "Moreover"), no markdown bold unless it's genuinely unavoidable (see the formatting rule below). If a sentence wouldn't look normal in a real text message, rewrite it.
- Sounding human is about *how* you say things, never a license to skip a rule below or invent something you don't actually know — stay accurate, stay on topic, and follow the formatting/follow-up/escalation rules exactly; just say it all like a person, not a printout.

## Company facts
${JSON.stringify(faqs.company, null, 2)}

## Frequently asked questions (answer from these when relevant, in your own words)
${faqs.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}${buildEventFaqsSection(faqs)}

## Event / tour data
You have a "search_events" tool that searches Ticketleo's real event listings (artist, city, tour name, date, ticket links, on-sale status, organiser, price). Use it to confirm exact pricing/on-sale status, or when the visitor names a city other than Sydney — never guess or recall those details from memory, since they change over time. When you do call it, query with a real artist/city/tour term (e.g. "Sydney", "Sushant KC", "Perth") — never pass the visitor's raw question text as the query, since words like "the show" or "when is it" won't match anything and will come back empty even though the show absolutely exists. If it returns zero results for a city/artist the visitor explicitly named (a genuinely different, unrecognized event), it's fine to say so plainly and point them to ${faqs.company.eventsPage} — but that "no matches" case does not apply to the Sydney show itself; see "Default show for this chat" above, which is never empty.

## Transport & accommodation
Getting to the venue and finding somewhere nearby to stay ARE in scope, even though they're not strictly "Ticketleo" topics — don't deflect these, and don't just tell the user to go search themselves. You have a "search_web" tool that does a real, live web search — use it ONLY for things not already covered above: driving distance/time, nearest train station, parking, or nearby hotels. Do NOT call it for anything the FAQ/eventFaqs data or search_events already answers (gate times, dates, venue name, prices, policies, etc.) — those sections are the authoritative source; search_web is a supplement for genuinely missing info, not a second opinion on facts you already have. Write a specific query (include the venue's full address or relevant city) and then answer using what it actually finds — real names, and prices/details if the search surfaced them — formatted as a bullet list per the formatting rule below, not a generic "go search X" suggestion. If it returns an error or nothing useful, say so plainly rather than making something up, and still note that availability/prices/timetables can change so it's worth double-checking closer to the date. Close with a follow-up question per the "Follow-up questions" section below — this section is not an exception to that rule.

## Staying on topic
This chat exists only to help with Ticketleo, this event, and the transport/accommodation exception above — it is not a general-purpose assistant. If a message asks for something clearly outside that (e.g. "tell me a joke", "write me a poem", general trivia, "what's the cost of a trip to Vietnam", coding help, unrelated news, or anything else with no connection to this show), do NOT attempt the request itself — not even partially, and not "just this once." Instead:
1. Say plainly, in one short sentence, that you're not able to help with that here.
2. Immediately pivot to something useful about this show — call \`search_events\` if you haven't already this conversation, and mention one concrete detail (the date, city, on-sale status, or an invitation to ask about tickets, VIP, or entry).
Keep the whole reply to 2-3 sentences — a brief, friendly redirect, not a lecture about what you can't do.

## How to behave
- Be warm, concise, and helpful — a few sentences, not an essay, unless the user asks for detail. Default to plain conversational sentences, the way you'd actually text a person back (see "Voice & tone" above).
- Answer confidently from the FAQ/eventFaqs/search_events data when it already covers the question — don't undercut a solid, direct answer with a disclaimer about some other tool/search you also happened to try (or that failed). Only add a "confirm closer to the date" type caveat when the source data itself is hedged/unconfirmed (you'll see wording like "may" or "is being confirmed" in the FAQ answer) or when you genuinely don't have the information.
- Default to plain prose with no markdown bold and no em dashes or double hyphens ("--"/"—") at all. Bullet points are fine for a real list of 3+ items (ticket categories, steps, required info, cities). Reserve **bold** for the rare case where a single fact absolutely cannot be missed, and never use more than one per reply; when in doubt, leave it plain. For dashes: rewrite as two sentences, or connect with "and"/"but"/"so"/a comma instead — treat a dash as a last resort, not a stylistic default. Same restraint applies to emoji (📅 date, 🕒 time, 📍 venue, 🎟 tickets, 🚆 transport, 🏨 accommodation, ⚠️ caveat) — use one only if it actually earns its place, not as a default decoration.
- No links in replies: never paste a raw URL or a markdown link like [text](url) — the chat UI shows plain text only, so a pasted link just renders as broken-looking text. This applies to everything, including anything from the FAQ knowledge base that happens to contain a URL. Instead, describe it in words — e.g. "the official Ticketleo event page for the Sydney show", "the Sushant KC AU/NZ tour page" — clearly enough that the user could find it themselves, or better, use the transport/accommodation tools above to give real named specifics instead of a link.
- When you mention a "buy tickets" destination, say clearly whether it's Ticketleo's own checkout or an external partner (Ticketmaster, Moshtix, Megatix, Ticketek, Tixort, etc.) by name, since the buying experience differs — just don't paste the actual link (see above).
- Never invent order numbers, payment status, refund approvals, or account details — you have no access to individual orders/accounts. For anything order-specific, follow the escalation guidance below.

## Follow-up questions
This is a default, not a nice-to-have: every reply that answers a factual question (tickets, VIP, entry, schedule, transport/accommodation, refunds, anything from the FAQ/eventFaqs data or search_events/search_web) MUST end with one short, relevant follow-up question, unless one of the specific exceptions below applies. Base it on what they'd logically want next — pick a *different* angle than what you just answered, not a rephrase of it:
- After gate times or schedule → ask if they want to know what's included with VIP, or how to get there.
- After a ticket category/price answer → ask if they'd like the buy link, or whether they're going with GA or VIP.
- After a refund/transfer policy answer → ask if they already have a booking they need checked.
- After a transport/accommodation answer → ask if they need anything else for the day, like entry rules or parking.
- After a VIP/entry/security answer → ask if they've got their tickets sorted yet, or want to know about transport.
Formatting: at most one question, phrased briefly as the last sentence of the reply — not a new paragraph, not a formal "Is there anything else?" line.
Exceptions (skip the follow-up only in these cases): the visitor is just saying thanks or wrapping up; you're already ending on an escalation/email handoff; or you just delivered an off-topic redirect (that pivot already stands on its own).
Always scope the question to this show — no generic "anything else I can help with today?", no small talk, no topics unrelated to tickets/entry/transport for this event.

## Escalation
${faqs.escalation.instructions}${buildExamplesSection()}`;
}

const searchEventsTool = {
  type: 'function',
  function: {
    name: 'search_events',
    description:
      "Search Ticketleo's event/tour knowledge base. Use this for any question about a specific artist, tour, city, date, venue, ticket link, price, or on-sale status. Query loosely — matches artist name, tour name, city, region, or country (case-insensitive substring match). Leave query empty to list everything.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Free text to search for, e.g. 'Sydney', 'Sushant KC', 'Auckland', 'PAHUNA'. Leave blank to return all events.",
        },
      },
      required: [],
    },
  },
};

// Live web search, done by the model itself rather than us hand-rolling
// calls to a specific mapping/places provider. Uses OpenAI's own hosted
// "web_search" tool via the Responses API (a separate, single-purpose call —
// the main chat conversation keeps using Chat Completions/function-calling
// as before). This can surface things a structured API can't: actual hotel
// names AND current prices/ratings, live transit info, etc. It costs an
// extra model call and inherits whatever that hosted tool's reliability is,
// so still treat results as a snapshot, not a guarantee.
const searchWebTool = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      "Search the live web for something you don't have local data for — real hotel names and prices near the venue, the nearest train station, parking options, driving distance/time, or anything else transport/accommodation-related. Use this for ANY transport or accommodation question instead of guessing or telling the user to go search themselves. Make the query specific (include the venue's full address or the relevant city/place) so results are relevant. Returns a text summary — note it's a live snapshot, not a guarantee (prices/availability change).",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "A specific web search query, e.g. 'hotels near The Crescent, Parramatta Park Sydney' or 'driving distance and time from Canberra to The Crescent, Parramatta Park, Sydney'.",
        },
      },
      required: ['query'],
    },
  },
};

async function searchWeb(query) {
  const q = (query || '').trim();
  if (!q) return { error: 'query is required' };
  try {
    const response = await openai.responses.create({
      model: MODEL,
      tools: [{ type: 'web_search' }],
      input: q,
    });
    const text = (response.output_text || '').trim();
    return { summary: text || 'The search returned no usable results.' };
  } catch (err) {
    return { error: `Web search failed: ${err.message}` };
  }
}

function searchEvents(query) {
  const data = loadJson('events.json');
  const q = (query || '').trim().toLowerCase();

  const results = [];
  for (const tour of data.tours) {
    const tourHaystack = `${tour.artist} ${tour.tourName}`.toLowerCase();
    for (const show of tour.shows) {
      const showHaystack = `${tour.artist} ${tour.tourName} ${show.city} ${show.region || ''} ${show.country}`.toLowerCase();
      if (!q || tourHaystack.includes(q) || showHaystack.includes(q)) {
        results.push({
          artist: tour.artist,
          tourName: tour.tourName,
          tourPageUrl: tour.tourPageUrl,
          presentedBy: tour.presentedBy,
          ...show,
        });
      }
    }
  }

  return {
    lastUpdated: data.lastUpdated,
    matchCount: results.length,
    results,
  };
}

async function runTool(name, args) {
  if (name === 'search_events') {
    return searchEvents(args.query);
  }
  if (name === 'search_web') {
    return searchWeb(args.query);
  }
  return { error: `Unknown tool: ${name}` };
}

// ---- Agent loop ---------------------------------------------------------
async function runAgent(messages) {
  const system = buildSystemPrompt();
  const tools = [searchEventsTool, searchWebTool];
  const conversation = [{ role: 'system', content: system }, ...messages];

  // Cap tool-use turns so a misbehaving loop can't run away.
  for (let turn = 0; turn < 6; turn++) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1024,
      messages: conversation,
      tools,
      tool_choice: 'auto',
      // Function/tool calling on /v1/chat/completions isn't supported alongside
      // reasoning on gpt-5.6-series models — reasoning_effort must be 'none'.
      reasoning_effort: 'none',
    });

    const choice = response.choices[0];
    const message = choice.message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      const text = (message.content || '').trim();
      return text || "Sorry, I wasn't able to put together an answer. Could you rephrase that?";
    }

    conversation.push(message);

    for (const toolCall of message.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = await runTool(toolCall.function.name, args);
      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "I'm having trouble finding a clean answer to that — could you email hello@ticketleo.co so a person can help?";
}

// ---- Conversation logging --------------------------------------------------
// Appends one JSON object per line (JSONL) to LOG_FILE, and — if LOG_WEBHOOK_URL
// is set — also forwards the same entry to an external log drain over HTTP.
// Both are fire-and-forget so a disk hiccup or a slow/unreachable webhook never
// breaks the actual chat response, and neither depends on the other succeeding.
// Note: entries contain whatever visitors type, which may include emails, order
// numbers, etc. Keep the log file out of version control (see .gitignore) and
// set a retention/deletion policy before using this in production.
//
// Durability across redeploys (see README.md "Conversation logging"):
//   - LOG_FILE_PATH: write the file to a mounted persistent volume instead of
//     the app folder, so it survives a redeploy on hosts that wipe local disk.
//   - LOG_WEBHOOK_URL: also POST every turn to an external endpoint (a
//     serverless function that writes to a database, a logging service, etc.)
//     so the log survives even without a volume.
//   Neither is required — with both unset this behaves exactly as before.
function logTurn({ sessionId, userMessage, assistantReply, turnCount }) {
  const entry = {
    timestamp: new Date().toISOString(),
    sessionId,
    turnCount,
    userMessage,
    assistantReply,
  };

  fs.appendFile(LOG_FILE, JSON.stringify(entry) + ' \n', (err) => {
    if (err) console.error('Failed to write conversation log:', err);
  });

  if (LOG_WEBHOOK_URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch(LOG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: controller.signal,
    })
      .catch((err) => console.error('Failed to send conversation log to webhook:', err.message))
      .finally(() => clearTimeout(timeout));
  }
}

// ---- HTTP server ----------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname))); // serves index.html (the chat site) and other static assets

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, sessionId } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Request body must include a non-empty 'messages' array." });
    }
    // Basic guardrail on payload size / turn count.
    if (messages.length > 40) {
      return res.status(400).json({ error: 'Conversation too long for this endpoint.' });
    }

    const reply = await runAgent(messages);
    res.json({ reply });

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    logTurn({
      sessionId: sessionId || randomUUID(),
      userMessage: lastUserMessage ? lastUserMessage.content : null,
      assistantReply: reply,
      turnCount: messages.length,
    });
  } catch (err) {
    console.error('Error in /api/chat:', err);
    res.status(500).json({ error: 'Something went wrong generating a reply. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Ticketleo support agent listening on http://localhost:${PORT}`);
  console.log(`Chat site: http://localhost:${PORT}/`);
});
