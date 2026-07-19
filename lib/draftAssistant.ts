import { jsonrepair } from "jsonrepair";
import { complete, type ChatMessage } from "./minimax";
import { COACH_SYSTEM } from "./coach";
import { getSurface, type DraftSurface } from "./draftSurfaces";

/**
 * The "Draft with AI" engine. A short, SMART-framed conversation that helps a
 * user say what they actually want to create, then drafts the real form fields
 * for them to review — instead of one-shotting a blank box.
 *
 * Each turn returns strict JSON: either the next question, or the finished draft.
 * The model decides when it has enough (SMART satisfied, ≤3 questions) to draft.
 */

export type DraftTurn = { role: "user" | "assistant"; content: string };

export type DraftResult =
  | { mode: "ask"; question: string; quickReplies?: string[] }
  | { mode: "draft"; fields: Record<string, string>; summary: string };

function buildSystem(surface: DraftSurface, context: string, mustDraft: boolean): string {
  const fieldLines = surface.fields
    .map((f) => `- "${f.key}" (${f.kind}${f.required ? ", required" : ""}): ${f.label}. ${f.hint ?? ""}`)
    .join("\n");

  return `${COACH_SYSTEM}

=== YOUR JOB RIGHT NOW ===
You are a drafting assistant helping the user create a ${surface.noun}. They came in with a
rough idea. Your job is to have a SHORT, friendly conversation that turns that rough idea into
a great, specific brief — then fill in the form for them.

Use the SMART frame to find what's vague or missing, but ask about it in plain, warm language:
${surface.smart}

What a great result looks like: ${surface.good}

RULES:
- Ask about only what is genuinely vague or missing. If the user's input is already specific
  enough, skip straight to drafting — do not pad with questions.
- Ask ONE question at a time. Keep it short and concrete. Never interrogate.
- Ask AT MOST 3 questions total across the whole conversation, then draft.
- When you ask, offer 2–4 tap-able example answers ("quickReplies") when they'd help — real,
  specific options tailored to this user, not generic filler.
- Consider what you already know about the user / who this is for (below) so you never ask
  something you can already infer.
${mustDraft ? "- You have asked enough. You MUST draft now — do not ask another question." : ""}

The form fields you must fill when you draft (use these exact keys):
${fieldLines}

=== CONTEXT ===
${context.trim() || "(no extra context)"}

Today's date is ${new Date().toISOString().slice(0, 10)} — resolve any relative dates ("in 3 weeks", "by Friday", "end of month") to an absolute YYYY-MM-DD.

=== OUTPUT FORMAT ===
Reply with ONE JSON object and nothing else. Two shapes:
1) To ask:   {"mode":"ask","question":"...","quickReplies":["...","..."]}   (quickReplies optional)
2) To draft: {"mode":"draft","summary":"one warm sentence on what you drafted","fields":{ ${surface.fields
    .map((f) => `"${f.key}":"..."`)
    .join(", ")} }}
Fill every field you reasonably can; leave a non-required field as "" only if truly unknown.
For date fields use YYYY-MM-DD. Do not wrap the JSON in markdown fences.`;
}

/** Pull the outermost {...} object out of a reply that may carry stray prose or fences. */
function extractJson(raw: string): string {
  const cleaned = raw.replace(/```json\s*|```/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned.trim();
}

/** Best-effort parse of the model's JSON into a validated DraftResult. */
function parse(raw: string, surface: DraftSurface): DraftResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonrepair(extractJson(raw)));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  if (o.mode === "ask" && typeof o.question === "string" && o.question.trim()) {
    const quickReplies = Array.isArray(o.quickReplies)
      ? o.quickReplies.filter((q): q is string => typeof q === "string").slice(0, 4)
      : undefined;
    return { mode: "ask", question: o.question.trim(), quickReplies };
  }

  if (o.mode === "draft" && o.fields && typeof o.fields === "object") {
    const src = o.fields as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const f of surface.fields) {
      const v = src[f.key];
      fields[f.key] = v == null ? "" : String(v);
    }
    const summary = typeof o.summary === "string" ? o.summary.trim() : "Here's a draft to review.";
    return { mode: "draft", fields, summary };
  }
  return null;
}

/**
 * Run one turn of the drafting conversation.
 * `messages` is the whole exchange so far (starts with the user's rough idea).
 * When `mustDraft` is set (client forces it after enough back-and-forth), the
 * model is told it must return a draft this turn.
 */
export async function runDraftTurn(opts: {
  surfaceId: string;
  messages: DraftTurn[];
  context: string;
  mustDraft?: boolean;
}): Promise<DraftResult> {
  const surface = getSurface(opts.surfaceId);
  if (!surface) throw new Error(`Unknown draft surface: ${opts.surfaceId}`);

  const messages: ChatMessage[] = opts.messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (messages.length === 0) messages.push({ role: "user", content: `Help me create a ${surface.noun}.` });
  // When the user forces a draft ("skip questions"), a trailing instruction makes
  // the model commit to fields on the first call rather than asking again.
  if (opts.mustDraft) {
    messages.push({
      role: "user",
      content:
        "Draft all the fields now using your best guesses from what I've told you. Do NOT ask another question — return the draft JSON.",
    });
  }

  const raw = await complete({
    system: buildSystem(surface, opts.context, !!opts.mustDraft),
    messages,
    temperature: 0.5,
    maxTokens: 1500,
  });

  const result = parse(raw, surface);
  if (result) return result;

  // Parse failed — degrade gracefully rather than break the form. If we were
  // meant to draft, hand back blank fields; otherwise ask a safe opener.
  if (opts.mustDraft) {
    const fields: Record<string, string> = {};
    for (const f of surface.fields) fields[f.key] = "";
    return { mode: "draft", fields, summary: "Draft the details yourself — I couldn't parse a clean draft." };
  }
  return {
    mode: "ask",
    question: `Tell me a bit more about the ${surface.noun} you want — what exactly, and for whom?`,
  };
}
