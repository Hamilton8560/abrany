import { complete, type ChatMessage } from "./minimax";

/**
 * The Abrany coach persona + structured plan generation.
 * The coach is realistic: it right-sizes goals to real study time, sets honest
 * timelines, proposes checkpoints, and never over-promises.
 */

export const COACH_SYSTEM = `You are Abrany's personal training coach — a sharp, encouraging, and above all REALISTIC learning coach.

Your job: help the user train their mind by turning ambitions into achievable practice. Principles:
- Break big goals ("learn all of math", "learn Spanish", "master an instrument") into digestible, sequenced milestones sized to real, sustainable study time.
- Be honest about timelines and effort. Mastery takes concentrated, repeated practice over weeks and months — say so, kindly. Never over-promise "fluent in 2 weeks".
- Meet the user where they are. Ask about current level, available time per week, and motivation when it matters.
- Favor concrete next actions over vague advice. Suggest checkpoints and periodic self-assessments so progress is measurable.
- Keep replies focused and warm. Use short paragraphs and the occasional list. Avoid filler.

You are talking inside a training app where the user also runs Pomodoro focus sessions, logs what they did, and tracks goals. Reference that context naturally when useful.`;

export function planSystem(): string {
  return `${COACH_SYSTEM}

You are now generating a STRUCTURED LEARNING PLAN. Respond with ONLY a single JSON object, no prose, no markdown fences. Shape:
{
  "title": "short plan title",
  "summary": "2-3 sentence realistic overview: scope, rough time horizon, how to use this plan",
  "items": [
    { "title": "milestone title", "detail": "what to do and how to know you're done", "estimate": "e.g. '1-2 weeks' or '4 sessions'" }
  ]
}
Rules: 5 to 9 items, ordered from foundation to advanced. Estimates must be realistic and honest. Keep detail to 1-2 sentences.`;
}

export type GeneratedPlan = {
  title: string;
  summary: string;
  items: { title: string; detail: string; estimate: string }[];
};

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export async function generatePlan(goal: {
  title: string;
  description: string;
}): Promise<GeneratedPlan> {
  const raw = await complete({
    system: planSystem(),
    maxTokens: 2048,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Build a realistic learning plan for this goal.\n\nGoal: ${goal.title}\n${
          goal.description ? `Details: ${goal.description}` : ""
        }`,
      },
    ],
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Coach returned an unparseable plan");
  }

  const p = parsed as Partial<GeneratedPlan>;
  const items = Array.isArray(p.items) ? p.items : [];
  const clean: GeneratedPlan = {
    title: (p.title || goal.title).toString().slice(0, 120),
    summary: (p.summary || "").toString().slice(0, 600),
    items: items
      .filter((it) => it && typeof it.title === "string" && it.title.trim())
      .slice(0, 12)
      .map((it) => ({
        title: it.title.toString().slice(0, 160),
        detail: (it.detail || "").toString().slice(0, 400),
        estimate: (it.estimate || "").toString().slice(0, 40),
      })),
  };
  if (!clean.items.length) throw new Error("Coach returned an empty plan");
  return clean;
}

/* ── Scope gate: is this goal feasible as one plan, or must it decompose? ── */

export type ScopeVerdict =
  | { feasible: true }
  | { feasible: false; rationale: string; tracks: { title: string; description: string }[] };

export async function assessScope(goal: {
  title: string;
  description: string;
}): Promise<ScopeVerdict> {
  const system = `${COACH_SYSTEM}

You are triaging whether a learning goal is realistically achievable as ONE staged plan, or is so broad that it must be split into separate sub-goals ("tracks") first.

Respond with ONLY a JSON object, no prose or fences:
{
  "feasible": true | false,
  "rationale": "one honest sentence — only when feasible is false",
  "tracks": [ { "title": "sub-goal title", "description": "one line: what it covers" } ]
}
Rules:
- feasible=true for goals a motivated person can pursue as a single multi-month plan (e.g. "conversational Spanish", "learn React", "play a song on guitar"). Return an empty tracks array.
- feasible=false ONLY for goals that clearly span many independent bodies of knowledge or years (e.g. "all of math", "every 1st-12th grade textbook", "become a doctor", "master 5 languages"). Then return 4 to 7 ordered tracks, each itself a reasonable standalone goal, from foundational to advanced.`;

  const raw = await complete({
    system,
    maxTokens: 1200,
    temperature: 0.4,
    messages: [
      {
        role: "user",
        content: `Goal: ${goal.title}\n${goal.description ? `Details: ${goal.description}` : ""}`,
      },
    ],
  });

  let parsed: { feasible?: boolean; rationale?: string; tracks?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { feasible: true }; // fail open — don't block goal creation on a parse error
  }
  if (parsed.feasible === false && Array.isArray(parsed.tracks) && parsed.tracks.length) {
    const tracks = (parsed.tracks as { title?: unknown; description?: unknown }[])
      .filter((t) => t && typeof t.title === "string" && (t.title as string).trim())
      .slice(0, 8)
      .map((t) => ({
        title: (t.title as string).slice(0, 120),
        description: (t.description ?? "").toString().slice(0, 240),
      }));
    if (tracks.length) {
      return { feasible: false, rationale: (parsed.rationale ?? "").toString().slice(0, 300), tracks };
    }
  }
  return { feasible: true };
}

/* ── Expand a milestone into lesson stubs (cheap, structural) ── */

export type LessonStub = {
  title: string;
  objective: string;
  kind: "reading" | "vocab" | "practice" | "quiz" | "lecture";
};

const KINDS = ["reading", "vocab", "practice", "quiz", "lecture"] as const;

export async function expandMilestone(ctx: {
  goalTitle: string;
  goalDescription: string;
  milestoneTitle: string;
  milestoneDetail: string;
}): Promise<LessonStub[]> {
  const system = `${COACH_SYSTEM}

You are breaking ONE milestone into a short sequence of concrete, do-able LESSONS. Each lesson is small enough to complete in a single focus session.

Respond with ONLY a JSON object, no prose or fences:
{ "lessons": [ { "title": "...", "objective": "one line: what you'll be able to do after", "kind": "reading|vocab|practice|quiz|lecture" } ] }
Rules: 3 to 6 lessons, ordered. Choose the "kind" that best fits each lesson's subject (vocab for word lists, practice for problem sets, lecture for conceptual teaching, quiz for self-check, reading otherwise). Keep titles concrete (e.g. "Words 1-20: greetings & introductions", not "Vocabulary").`;

  const raw = await complete({
    system,
    maxTokens: 1200,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `Goal: ${ctx.goalTitle}${ctx.goalDescription ? ` (${ctx.goalDescription})` : ""}\nMilestone: ${ctx.milestoneTitle}\n${ctx.milestoneDetail ? `What it means: ${ctx.milestoneDetail}` : ""}\n\nBreak this milestone into lessons.`,
      },
    ],
  });

  let parsed: { lessons?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error("Coach returned unparseable lessons");
  }
  const lessons = Array.isArray(parsed.lessons) ? parsed.lessons : [];
  const clean = (lessons as { title?: unknown; objective?: unknown; kind?: unknown }[])
    .filter((l) => l && typeof l.title === "string" && (l.title as string).trim())
    .slice(0, 8)
    .map((l) => ({
      title: (l.title as string).slice(0, 160),
      objective: (l.objective ?? "").toString().slice(0, 300),
      kind: (KINDS as readonly string[]).includes(l.kind as string)
        ? (l.kind as LessonStub["kind"])
        : ("reading" as const),
    }));
  if (!clean.length) throw new Error("Coach returned no lessons");
  return clean;
}

/* ── Generate the actual lesson content (adaptive, markdown) ── */

export async function generateLessonContent(ctx: {
  goalTitle: string;
  milestoneTitle: string;
  lessonTitle: string;
  lessonObjective: string;
  kind: LessonStub["kind"];
}): Promise<string> {
  const kindGuide: Record<LessonStub["kind"], string> = {
    vocab:
      "Produce the actual vocabulary as a markdown table (term | meaning | example sentence). Include every item the title implies (e.g. 'Words 1-20' = 20 rows). End with a short 5-item self-quiz.",
    practice:
      "Teach the method briefly, show 1-2 fully worked examples, then give 5-8 practice problems. Put all answers/solutions under a '## Answers' heading at the very end.",
    quiz: "Write a 6-10 question self-check quiz. Put an '## Answer key' with brief explanations at the end.",
    lecture:
      "Write a clear, structured mini-lecture that teaches the concept from first principles with concrete examples and analogies. End with 3 key takeaways.",
    reading:
      "Write a focused, readable explainer that fully covers the lesson. Use headings, short paragraphs, and examples. End with 3 key takeaways.",
  };

  return complete({
    system: `${COACH_SYSTEM}

You are writing the ACTUAL learning material for a single lesson — the real content the user studies, not a description of it. Be genuinely useful and complete for this one lesson only. Output clean GitHub-flavored markdown. Do not include the lesson title as an H1 (the app shows it). ${kindGuide[ctx.kind]}`,
    maxTokens: 4096,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Goal: ${ctx.goalTitle}\nMilestone: ${ctx.milestoneTitle}\nLesson: ${ctx.lessonTitle}\nObjective: ${ctx.lessonObjective}\n\nWrite this lesson's content now.`,
      },
    ],
  });
}

export { type ChatMessage };
