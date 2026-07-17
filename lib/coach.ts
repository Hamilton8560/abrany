import { jsonrepair } from "jsonrepair";
import { complete, type ChatMessage } from "./minimax";

/**
 * The Abrany coach persona + structured plan generation.
 * The coach is realistic: it right-sizes goals to real study time, sets honest
 * timelines, proposes checkpoints, and never over-promises.
 */

/**
 * Generous per-call output ceiling. This is a CEILING, not a target — a model
 * still stops when its answer is done (end_turn), so latency is unchanged for
 * short answers. The headroom matters for two cases: long-form prose (a full
 * book chapter) and reasoning models like Kimi/k3 whose internal thinking
 * tokens count against the same budget and would otherwise truncate the visible
 * answer mid-sentence. complete() streams under the hood, so a cap this large is
 * allowed (a non-streaming call this large is rejected by the SDK).
 */
const MAX_OUTPUT_TOKENS = 64000;

export const COACH_SYSTEM = `You are Abrany's personal training coach — a sharp, encouraging, and above all REALISTIC learning coach.

Your job: help the user train their mind by turning ambitions into achievable practice. Principles:
- Break big goals ("learn all of math", "learn Spanish", "master an instrument") into digestible, sequenced milestones sized to real, sustainable study time.
- Be honest about timelines and effort. Mastery takes concentrated, repeated practice over weeks and months — say so, kindly. Never over-promise "fluent in 2 weeks".
- Meet the user where they are. Ask about current level, available time per week, and motivation when it matters.
- Favor concrete next actions over vague advice. Suggest checkpoints and periodic self-assessments so progress is measurable.
- Keep replies focused and warm. Use short paragraphs and the occasional list. Avoid filler.

You are talking inside a training app where the user also runs Pomodoro focus sessions, logs what they did, and tracks goals. Reference that context naturally when useful.

When something is clearer as a picture, include a diagram. Use a \`\`\`mermaid block for processes, timelines, hierarchies, state or sequence (flowchart, sequenceDiagram, timeline, mindmap, stateDiagram-v2). For a SYSTEM or ARCHITECTURE diagram (components/services and how they connect), use an \`\`\`arch block with a compact TOON spec instead:
\`\`\`arch
nodes[3]{id,label,group}:
  web,Web App,frontend
  api,API,backend
  db,Postgres,data
edges[2]{from,to,label}:
  web,api,HTTPS
  api,db,SQL
\`\`\`
group is one of frontend|backend|service|data|external|queue. Keep ids short with no spaces, labels short, and no commas inside any value. Keep diagrams focused; use them only where they genuinely help.`;

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

/**
 * Parse the model's JSON, self-healing common structure faults (trailing commas,
 * stray prose, unclosed braces/strings from a truncated response) instead of
 * failing and forcing a full regenerate. Only throws if it's truly unsalvageable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(raw: string): any {
  const candidate = extractJson(raw);
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      return JSON.parse(jsonrepair(raw));
    }
  }
}

export async function generatePlan(goal: {
  title: string;
  description: string;
}): Promise<GeneratedPlan> {
  const raw = await complete({
    system: planSystem(),
    maxTokens: MAX_OUTPUT_TOKENS,
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
    parsed = parseJson(raw);
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

/* ── V2 plans: outcome-first, time-budgeted, capstone-anchored ── */

export type PlanIntake = {
  level: "new" | "some" | "solid";
  hoursPerWeek: number;
  targetDate?: string; // ISO date, optional
  focus?: string; // why they're learning / what to emphasize
};

export const DEFAULT_INTAKE: PlanIntake = { level: "some", hoursPerWeek: 5 };

export type GeneratedPlanV2 = {
  title: string;
  summary: string;
  items: {
    title: string;
    detail: string;
    estimate: string;
    outcomes: string[];
    hours: number;
    difficulty: "intro" | "core" | "advanced";
  }[];
};

export async function generatePlanV2(
  goal: { title: string; description: string },
  intake: PlanIntake,
): Promise<GeneratedPlanV2> {
  const system = `${COACH_SYSTEM}

You are generating a STRUCTURED LEARNING PLAN, V2. Design OUTCOME-FIRST (backward design): for each milestone, first decide the 2-4 measurable "you can …" outcomes, then name the milestone after them. Respond with ONLY a single JSON object, no prose, no markdown fences. Shape:
{
  "title": "short plan title",
  "summary": "3-4 sentences: scope, the stated hours/week assumption, total estimated hours, and — if a target date was given — whether it fits (if it does NOT fit, say so plainly and state what you trimmed to make it fit)",
  "items": [
    {
      "title": "milestone title",
      "detail": "what to do and how to know you're done",
      "estimate": "e.g. '2 weeks at 5 h/wk'",
      "outcomes": ["you can …", "you can …"],
      "hours": 8,
      "difficulty": "intro|core|advanced"
    }
  ]
}
Rules:
- 5 to 9 items ordered foundation → advanced; "difficulty" must ramp (intro items first, advanced last).
- Every item has 2-4 OUTCOMES, each a concrete, checkable "you can …" statement — no vague "understand X".
- "hours" is a realistic number for THIS learner's level; the sum across items is the course's total hours. Estimates derive from the hours/week budget (e.g. 8 hours at 4 h/wk → "2 weeks").
- The FINAL item is a CAPSTONE: one integrating project whose outcomes restate the goal in demonstrable form. Mark it difficulty "advanced".
- Calibrate to the learner: "new" starts from zero; "some" skips true basics; "solid" goes straight to gaps and advanced work.
- Be honest about timelines. Never over-promise.`;

  const deadlineLine = intake.targetDate ? `\nTarget date: ${intake.targetDate} (today is ${new Date().toISOString().slice(0, 10)})` : "";
  const raw = await complete({
    system,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.55,
    messages: [
      {
        role: "user",
        content: `Build a V2 learning plan.\n\nGoal: ${goal.title}\n${goal.description ? `Details: ${goal.description}\n` : ""}Current level: ${intake.level === "new" ? "complete beginner" : intake.level === "some" ? "some experience" : "solid foundation, wants depth"}\nTime budget: ${intake.hoursPerWeek} hours/week${deadlineLine}${intake.focus ? `\nWhy / focus: ${intake.focus}` : ""}`,
      },
    ],
  });

  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable plan");
  }
  const p = parsed as Partial<GeneratedPlanV2>;
  const items = Array.isArray(p.items) ? p.items : [];
  const diffs = new Set(["intro", "core", "advanced"]);
  const clean: GeneratedPlanV2 = {
    title: (p.title || goal.title).toString().slice(0, 120),
    summary: (p.summary || "").toString().slice(0, 900),
    items: items
      .filter((it) => it && typeof it.title === "string" && it.title.trim())
      .slice(0, 12)
      .map((it) => ({
        title: it.title.toString().slice(0, 160),
        detail: (it.detail || "").toString().slice(0, 400),
        estimate: (it.estimate || "").toString().slice(0, 40),
        outcomes: (Array.isArray(it.outcomes) ? it.outcomes : [])
          .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
          .slice(0, 5)
          .map((o) => o.slice(0, 200)),
        hours: Math.max(0, Math.min(200, Number(it.hours) || 0)),
        difficulty: diffs.has(it.difficulty as string) ? (it.difficulty as GeneratedPlanV2["items"][number]["difficulty"]) : "core",
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
    maxTokens: MAX_OUTPUT_TOKENS,
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
    parsed = parseJson(raw);
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

import type { LessonKind } from "./repo";

export type LessonStub = {
  title: string;
  objective: string;
  kind: LessonKind;
  needsCurrent: boolean;
};

const KINDS = ["read", "teach", "practice", "apply", "check", "review"] as const;

export async function expandMilestone(ctx: {
  goalTitle: string;
  goalDescription: string;
  milestoneTitle: string;
  milestoneDetail: string;
}): Promise<LessonStub[]> {
  const system = `${COACH_SYSTEM}

You are breaking ONE milestone into a short sequence of concrete, do-able LESSONS. Each lesson is small enough to complete in a single focus session. The lessons MUST follow a fixed learning arc, IN THIS ORDER:

1. read     — a short, skimmable reference/overview that maps what's coming
2. teach    — teach the "why" and "how" from first principles, with worked examples
3. practice — guided drills/exercises the learner actually does, with answers
4. apply    — use the skill in a real, novel context (produce/build/perform, not drill)
5. check    — a low-stakes self-check quiz
6. review   — an active-recall workout over the WHOLE milestone (spaced retrieval)

Respond with ONLY a JSON object, no prose or fences:
{ "lessons": [ { "title": "...", "objective": "one line: what you'll be able to do after", "kind": "read|teach|practice|apply|check|review", "needsCurrent": false } ] }
Set "needsCurrent": true ONLY for lessons whose accuracy depends on up-to-date, post-2024 facts (current events, geopolitics, latest technology/tools/prices, evolving standards). Timeless material (grammar, math, theology, history, fundamentals) is false.

First judge HOW this subject is learned and reshape the stages' MEANING (the arc order stays the same):
- Hands-on skill (coding, language, math, electrical engineering, an instrument, PT technique): practice = drills/reps, apply = build or perform it.
- Body of knowledge/ideas (geopolitics, history, a book's framework like "48 Laws of Power"): practice = summarize/argue/connect, apply = analyze a real case through the lens, check = explain it back.
- Interpretive / values (Christianity, the Bible, philosophy): practice = reflect & discuss, apply = live it / journal, check = honest self-reflection (NOT a graded quiz).
- Memorization-heavy (terminology, verses, anatomy, regulations): make review a spaced-recall workout and lean on it.
- Exam-targeted (certifications): make check a mock aligned to the real assessment.

Rules:
- Follow the arc order above. Always include practice, apply, and check.
- You MAY add ONE extra "practice" or "apply" lesson for skill-heavy topics; for a tiny milestone you MAY merge read+teach into a single "read". Never fewer than 4 or more than 7 lessons.
- Keep titles concrete (e.g. "Words 1-20: greetings & introductions", not "Vocabulary").`;

  const raw = await complete({
    system,
    maxTokens: MAX_OUTPUT_TOKENS,
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
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned unparseable lessons");
  }
  const lessons = Array.isArray(parsed.lessons) ? parsed.lessons : [];
  const clean = (
    lessons as { title?: unknown; objective?: unknown; kind?: unknown; needsCurrent?: unknown }[]
  )
    .filter((l) => l && typeof l.title === "string" && (l.title as string).trim())
    .slice(0, 8)
    .map((l) => ({
      title: (l.title as string).slice(0, 160),
      objective: (l.objective ?? "").toString().slice(0, 300),
      kind: (KINDS as readonly string[]).includes(l.kind as string)
        ? (l.kind as LessonStub["kind"])
        : ("read" as const),
      needsCurrent: l.needsCurrent === true,
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
  sources?: { title: string; url: string; description: string }[];
}): Promise<string> {
  const kindGuide: Record<LessonStub["kind"], string> = {
    read: "STAGE: READ — a short, skimmable overview that maps what's coming. Use headings and a compact list or table of the key items/ideas. This is orientation, not deep teaching. Keep it tight.",
    teach:
      "STAGE: TEACH — teach the concept from first principles with concrete worked examples and analogies (the why and how). For a hands-on skill, demonstrate the technique step by step. End with 3 key takeaways.",
    practice:
      "STAGE: PRACTICE — active engagement the learner does themselves, ADAPTED TO THE SUBJECT: for a skill, 1-2 worked examples then 6-10 exercises/drills (vocab or conjugation tables for language; problem sets for math/EE); for a body of knowledge, prompts to summarize, argue, or connect the ideas; for an interpretive subject, reflection/discussion prompts. If there are exercises with objective answers, put them under a '## Answers' heading at the very end.",
    apply:
      "STAGE: APPLY — one realistic task that TRANSFERS the skill to a novel, real context: produce the language in a short dialogue, build a small thing (code), solve word problems, analyze a real case through the framework, or (for interpretive subjects) apply it to the learner's own life. Give clear instructions, a model/example answer, and a short checklist of what a strong result looks like.",
    check:
      "STAGE: CHECK — a low-stakes self-check. For skills/knowledge, a 6-10 question quiz with an '## Answer key' and brief explanations. For interpretive/values subjects, replace the quiz with honest self-reflection questions (no graded answers). For exam-targeted goals, mirror the real assessment's format.",
    review:
      "STAGE: REVIEW — an active-recall workout over the WHOLE milestone (spaced retrieval, not new material): 8-12 flashcard-style prompts (cover the answer, recall it) spanning everything covered, plus a short 'if you missed these, revisit…' guide.",
  };

  const hasSources = ctx.sources && ctx.sources.length > 0;
  const sourcesGuide = hasSources
    ? ` This subject is time-sensitive, so you are given CURRENT web search results below. Ground any up-to-date facts (recent events, latest tools, current figures) in them, and prefer them over your own prior knowledge where they conflict. Cite inline like [1], [2] and end with a "## Sources" section listing the numbered sources as markdown links.`
    : "";
  const sourcesBlock = hasSources
    ? `\n\nCURRENT WEB SOURCES (as of today):\n${ctx.sources!
        .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}\n${s.description}`)
        .join("\n\n")}`
    : "";

  return complete({
    system: `${COACH_SYSTEM}

You are writing the ACTUAL learning material for a single lesson — the real content the user studies, not a description of it. Be genuinely useful and complete for this one lesson only. Output clean GitHub-flavored markdown. Do not include the lesson title as an H1 (the app shows it).

First silently judge HOW this subject is learned — a hands-on skill, a body of knowledge/ideas, something interpretive/reflective, memorization-heavy, or exam-targeted (or a mix) — and shape the content accordingly, so a reflective subject never gets rote worksheets and a skill never gets only prose.

When a concept is inherently visual or structural, include a diagram. Use a \`\`\`mermaid code block for processes, timelines, hierarchies, state machines, decision trees, or sequences (flowchart, sequenceDiagram, timeline, mindmap, stateDiagram-v2, erDiagram). For a SYSTEM or ARCHITECTURE diagram (components/services and their connections), use an \`\`\`arch code block with a compact TOON spec instead: a nodes[N]{id,label,group} block then an edges[M]{from,to,label} block, where group is one of frontend|backend|service|data|external|queue (ids short with no spaces, labels short, no commas inside values). Keep diagrams focused (a handful of nodes) and use them only where they genuinely aid understanding — not for every lesson. ${kindGuide[ctx.kind]}${sourcesGuide}`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Goal: ${ctx.goalTitle}\nMilestone: ${ctx.milestoneTitle}\nLesson: ${ctx.lessonTitle}\nObjective: ${ctx.lessonObjective}${sourcesBlock}\n\nWrite this lesson's content now.`,
      },
    ],
  });
}

/* ── "Quiz me": generate + grade a recall quiz for spaced review ── */

export async function generateReviewQuiz(ctx: {
  goalTitle: string;
  lessonTitle: string;
  lessonObjective: string;
  content: string;
}): Promise<{ question: string }[]> {
  const raw = await complete({
    system: `${COACH_SYSTEM}

Generate a SHORT recall quiz that tests whether the learner still remembers and can use THIS one lesson. Adapt to the subject: recall/explain questions for knowledge, apply-it questions for skills, honest reflection prompts for interpretive subjects. Ground every question in the lesson content provided. Respond with ONLY JSON, no prose or fences:
{ "questions": [ { "question": "..." } ] }
Rules: 3 to 5 questions, answerable in a sentence or two. Do NOT include answers.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `Goal: ${ctx.goalTitle}\nLesson: ${ctx.lessonTitle}\nObjective: ${ctx.lessonObjective}\n\nLESSON CONTENT:\n${ctx.content.slice(0, 6000)}\n\nWrite the recall quiz.`,
      },
    ],
  });
  let parsed: { questions?: unknown };
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable quiz");
  }
  const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
  const clean = (qs as { question?: unknown }[])
    .filter((q) => q && typeof q.question === "string" && (q.question as string).trim())
    .slice(0, 6)
    .map((q) => ({ question: (q.question as string).slice(0, 400) }));
  if (!clean.length) throw new Error("Coach returned no questions");
  return clean;
}

/** A midterm/final exam: a study guide (Markdown) + a set of exam questions. */
export async function generateExam(ctx: {
  goalTitle: string;
  scope: "midterm" | "final";
  sections: { title: string; objective: string; content: string }[];
}): Promise<{ studyGuide: string; questions: { question: string }[] }> {
  const scopeLabel = ctx.scope === "midterm" ? "midterm (covering the first half of the course)" : "final (covering the whole course)";
  const n = ctx.scope === "final" ? 8 : 6;
  const material = ctx.sections
    .map((s, i) => `### ${i + 1}. ${s.title}\n${s.objective}\n${s.content.slice(0, 2200)}`)
    .join("\n\n")
    .slice(0, 14000);
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are setting a ${scopeLabel} exam for the course "${ctx.goalTitle}". Produce two things:
1. A concise STUDY GUIDE in Markdown — the key concepts, definitions, and skills a learner must know to pass, organized by topic with short bullet points and a "how to prepare" note. This is what they revise from.
2. Exactly ${n} exam QUESTIONS that fairly test understanding across ALL the material (mix recall, explanation, and application; adapt to the subject). Each answerable in a few sentences. Do NOT include answers.
Respond with ONLY JSON, no prose or fences:
{ "studyGuide": "# Study Guide\\n...markdown...", "questions": [ "question one", "question two" ] }`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    messages: [
      { role: "user", content: `COURSE MATERIAL:\n${material}\n\nWrite the ${scopeLabel} study guide and ${n} questions.` },
    ],
  });
  let parsed: { studyGuide?: unknown; questions?: unknown };
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable exam");
  }
  const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
  const questions = rawQs
    .map((q) => (typeof q === "string" ? q : (q as { question?: string })?.question))
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .slice(0, n)
    .map((q) => ({ question: q.slice(0, 500) }));
  if (!questions.length) throw new Error("Coach returned no exam questions");
  return { studyGuide: typeof parsed.studyGuide === "string" ? parsed.studyGuide : "", questions };
}

export type QuizVerdict = "correct" | "partial" | "incorrect";

export type QuizGrade = {
  results: { verdict: QuizVerdict; feedback: string }[];
  summary: string;
  suggested: "again" | "hard" | "good" | "easy";
};

export async function gradeReviewQuiz(ctx: {
  lessonTitle: string;
  content: string;
  items: { question: string; answer: string }[];
}): Promise<QuizGrade> {
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are grading a learner's recall quiz against the lesson content (the source of truth). For each question+answer, judge "correct", "partial", or "incorrect" and give one short, kind, specific feedback line (name what was missed). Then give a 1-2 sentence overall summary and a suggested spaced-repetition rating based on how they did overall: "again" (mostly wrong), "hard" (shaky), "good" (solid), "easy" (nailed it). A blank answer is "incorrect". Respond with ONLY JSON, no prose or fences:
{ "results": [ { "verdict": "correct|partial|incorrect", "feedback": "..." } ], "summary": "...", "suggested": "again|hard|good|easy" }
The results array MUST have exactly one entry per question, in order.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `Lesson: ${ctx.lessonTitle}\n\nLESSON CONTENT:\n${ctx.content.slice(0, 6000)}\n\nQUIZ:\n${ctx.items
          .map((it, i) => `Q${i + 1}: ${it.question}\nLearner's answer: ${it.answer || "(blank)"}`)
          .join("\n\n")}\n\nGrade it.`,
      },
    ],
  });
  let parsed: Partial<QuizGrade>;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable grade");
  }
  const verdicts = new Set(["correct", "partial", "incorrect"]);
  const ratings = new Set(["again", "hard", "good", "easy"]);
  const results = (Array.isArray(parsed.results) ? parsed.results : [])
    .slice(0, ctx.items.length)
    .map((r) => ({
      verdict: (verdicts.has((r as QuizGrade["results"][number]).verdict)
        ? (r as QuizGrade["results"][number]).verdict
        : "partial") as QuizVerdict,
      feedback: ((r as QuizGrade["results"][number]).feedback ?? "").toString().slice(0, 300),
    }));
  return {
    results,
    summary: (parsed.summary ?? "").toString().slice(0, 400),
    suggested: (ratings.has(parsed.suggested as string) ? parsed.suggested : "good") as QuizGrade["suggested"],
  };
}

/* ── Presentations: generate a markdown slide deck ─────────── */

export async function generatePresentation(ctx: {
  topic: string;
  goalTitle?: string;
}): Promise<{ title: string; content: string }> {
  const content = await complete({
    system: `${COACH_SYSTEM}

You are creating a PRESENTATION DECK that should genuinely impress — clear, visual, and effective at teaching. Output GitHub-flavored markdown only. Separate every slide with a line containing only three dashes (---).

STRUCTURE (follow exactly):
- Slide 1 (title slide): a single "# Deck Title" (≤ 8 words) and one *italic subtitle* line (≤ 16 words). Nothing else on it.
- 6 to 10 content slides, each starting with "## Slide heading" (≤ 7 words).
- A final "## Key takeaways" slide with 3-5 bullets.

PER-SLIDE DISCIPLINE (a slide is a SLIDE, not an essay):
- At most 5 bullets per slide, each ≤ 14 words. Bold the 1-3 key words per bullet.
- Never a paragraph longer than 2 lines; never a heading-only slide.
- One idea per slide. If a slide needs two diagrams or >5 bullets, split it.
- Use a small comparison table (≤ 3 columns, ≤ 5 rows) where contrast teaches better than bullets.

DIAGRAMS (aim for 2-4 across the deck — they make it):
- \`\`\`mermaid for flows/timelines/hierarchies/sequences (flowchart LR or TD, timeline, sequenceDiagram, pie, xychart-beta for curves/quantities).
- \`\`\`arch (nodes[N]{id,label,group} + edges[M]{from,to,label}) for system/architecture diagrams.
- Node/edge labels ≤ 4 words; ALWAYS double-quote mermaid labels that contain spaces, ( ) or commas, e.g. A["Working memory (short)"].
- Keep diagrams small: ≤ 8 nodes, one diagram per slide, a one-line caption or 1-2 bullets under it.

Adapt depth and tone to the topic. Do not wrap the whole output in a code fence.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Create a presentation deck about: ${ctx.topic}${
          ctx.goalTitle ? `\n(Related to the learner's goal: ${ctx.goalTitle})` : ""
        }`,
      },
    ],
  });

  const clean = content.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  const h1 = clean.match(/^#\s+(.+)$/m);
  const title = (h1 ? h1[1] : ctx.topic).trim().slice(0, 140);
  return { title, content: clean };
}

/* ── Books: outline, then chapter-by-chapter (bounded context) ── */

export async function generateBookOutline(ctx: {
  brief: string;
}): Promise<{ title: string; chapters: { title: string; summary: string }[] }> {
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are outlining a BOOK. Respond with ONLY JSON, no prose or fences:
{ "title": "book title", "chapters": [ { "title": "chapter title", "summary": "1-2 sentences on what this chapter covers" } ] }
Rules: 6 to 14 chapters in a logical progression (foundations → advanced → synthesis). Titles concrete and specific to the topic. This is a real book, so the arc should build.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [{ role: "user", content: `Outline a book about: ${ctx.brief}` }],
  });
  let parsed: { title?: unknown; chapters?: unknown };
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable outline");
  }
  const chapters = (Array.isArray(parsed.chapters) ? parsed.chapters : [])
    .filter((c): c is { title: string; summary?: string } => !!c && typeof (c as { title?: unknown }).title === "string" && !!(c as { title: string }).title.trim())
    .slice(0, 16)
    .map((c) => ({ title: c.title.slice(0, 160), summary: (c.summary ?? "").toString().slice(0, 300) }));
  if (!chapters.length) throw new Error("Coach returned no chapters");
  return {
    title: (typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : ctx.brief).slice(0, 160),
    chapters,
  };
}

export async function generateChapter(ctx: {
  bookTitle: string;
  bookBrief: string;
  chapterNumber: number;
  chapterTitle: string;
  chapterSummary: string;
  outlineTitles: string[];
}): Promise<string> {
  return complete({
    system: `${COACH_SYSTEM}

You are writing ONE chapter of a book — the real prose a reader reads, not an outline. This chapter must feel like it belongs to the SAME book as every other chapter, so hold these constants:
- Voice: second person ("you"), present tense, warm but direct — the same voice in every chapter.
- Structure: open with a 2-4 sentence hook (a scene, question, or surprising fact — NEVER "In this chapter we will…"), then 3-5 "## " section subheadings, then a short closing that hands off to the next chapter in one sentence (skip the handoff in the final chapter).
- Length: roughly 1,200-1,800 words of flowing narrative prose. Bullets only where a genuine list beats prose.
- Continuity: assume the reader has read the earlier chapters — build on them, never re-define their terms or restate the book's premise.
- Diagrams: only where a concept is genuinely structural or visual, a \`\`\`mermaid or \`\`\`arch block (≤ 8 nodes, labels ≤ 4 words, double-quote mermaid labels containing spaces/()/commas).
- Do NOT include the chapter number/title as an H1 (the reader shows it). No front-matter, no "---" separators.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: `Book: "${ctx.bookTitle}"\nAbout: ${ctx.bookBrief}\nFull chapter list: ${ctx.outlineTitles.map((t, i) => `${i + 1}. ${t}`).join(" | ")}\n\nWrite Chapter ${ctx.chapterNumber}: "${ctx.chapterTitle}".\nThis chapter covers: ${ctx.chapterSummary}\n\nWrite the chapter now.`,
      },
    ],
  });
}

export { type ChatMessage };
