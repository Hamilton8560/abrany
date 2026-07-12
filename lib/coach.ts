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
    maxTokens: 4096,
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
    maxTokens: 900,
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
    parsed = JSON.parse(extractJson(raw));
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
    maxTokens: 1600,
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
    parsed = JSON.parse(extractJson(raw));
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

export { type ChatMessage };
