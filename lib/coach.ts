import { jsonrepair } from "jsonrepair";
import { complete, type ChatMessage } from "./minimax";
import { chunkMarkdown } from "./translate";

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

/**
 * How the coach behaves in live conversation — the pedagogy layer on top of the
 * persona. The default chatbot failure mode is "dump a complete, generic answer":
 * this makes it teach instead.
 */
export const TUTOR_SYSTEM = `${COACH_SYSTEM}

HOW YOU TEACH (in conversation):
- Answer the actual question first, directly, in the first sentence or two. Then teach around it. Never open with filler or restate the question.
- Diagnose before you explain: if the learner is confused, ask ONE precise question or make ONE quick check ("what do you get for step 2?") rather than re-explaining everything.
- When the learner is working a problem or exercise (code, math, a drill), use a HINT LADDER instead of handing over the answer: 1) a nudge that points at where to look, 2) the strategy or rule to apply, 3) the next concrete step or a partial solution, 4) the full worked solution — and only climb a rung when they ask or are clearly stuck. If they explicitly ask for the answer, give it, worked step by step.
- After they finish something, DEBRIEF briefly: what they got right, the one misconception or slip that matters most, and the single next thing to practice.
- Show your work for anything technical: worked steps for math, runnable code with the expected output for programming, the reasoning chain for analysis. Prefer one concrete example to three abstract sentences.
- Match their level: don't re-teach what they already know (you know their progress), don't skip the step a beginner needs.
- Keep it tight. Short paragraphs, lists only when there are real parallel items, no headers in a chat reply unless it's a long reference answer. End with ONE concrete next action or a single question — not a menu.`;

/** Ground the tutor in the lesson the learner is currently working through. */
export function lessonGroundingPrompt(lesson: {
  title: string;
  objective: string;
  kind: string;
  content: string;
  milestoneTitle?: string;
  goalTitle?: string;
}): string {
  const stage: Record<string, string> = {
    read: "They are orienting — help them map the terrain and see what matters most.",
    teach: "They are learning the core idea — explain, re-explain differently if needed, check understanding with a quick question.",
    practice:
      "They are DOING exercises from this lesson. Do NOT hand over answers: use the hint ladder, check their attempts against the lesson's answers, and explain the reasoning behind a correct answer only after they've tried.",
    apply:
      "They are applying the skill to a real task. Act as a reviewer: ask what they produced, give specific feedback against the lesson's checklist, and push them to improve one thing.",
    check: "They are self-checking. Quiz them from the lesson, grade what they say, and explain each miss briefly.",
    review: "They are doing spaced recall. Ask, don't tell: prompt recall first, reveal only after an attempt.",
  };
  return `\n\nTHE LEARNER IS CURRENTLY INSIDE THIS LESSON — treat it as the authoritative material and anchor every reply to it (quote or reference its parts, use its examples and terminology, don't contradict it; if it's missing something, say so and add it carefully).\n${
    lesson.goalTitle ? `Course: ${lesson.goalTitle}\n` : ""
  }${lesson.milestoneTitle ? `Milestone: ${lesson.milestoneTitle}\n` : ""}Lesson (${lesson.kind}): ${lesson.title}\nObjective: ${lesson.objective}\n${
    stage[lesson.kind] ?? ""
  }\n\n--- LESSON CONTENT ---\n${lesson.content.slice(0, 20000)}\n--- END LESSON ---`;
}

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

/* ── Program outline: a reusable org course template (structural, no content) ── */

import type { CurriculumInput } from "./org";

/**
 * Author a reusable training PROGRAM for an org to deploy to a team. Produces the
 * full structure — milestones each with a lesson arc (titles/objectives/kinds) —
 * but NO lesson content: content is generated per-employee after deploy and
 * localized by the translation engine, exactly like the normal lesson pipeline.
 */
export async function generateProgramOutline(input: {
  title: string;
  description: string;
}): Promise<CurriculumInput> {
  const system = `${COACH_SYSTEM}

You are designing a REUSABLE TRAINING PROGRAM an organization will deploy to many employees. Design OUTCOME-FIRST: decide what each employee must be able to DO, then structure milestones toward it. Respond with ONLY a single JSON object, no prose or fences:
{
  "title": "short program title",
  "description": "2-3 sentences: who it's for, the level it assumes, and the outcome the whole team reaches",
  "milestones": [
    { "title": "milestone title", "detail": "what it covers and how you know it's done", "estimate": "e.g. '1 week'",
      "lessons": [ { "title": "concrete lesson title", "objective": "one line: what you can do after", "kind": "read|teach|practice|apply|check|review" } ] }
  ]
}
Rules:
- 3 to 7 milestones ordered foundation → advanced.
- Each milestone has 4 to 6 lessons following the arc read → teach → practice → apply → check → review (always include practice, apply, check).
- "kind" MUST be one of read|teach|practice|apply|check|review.
- Titles concrete and specific to the subject, not generic. Do NOT write lesson content — structure only.
- Realistic and honest scope for a workplace cohort.`;

  const raw = await complete({
    system,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `Program title: ${input.title}\n${input.description ? `Details: ${input.description}` : ""}`,
      },
    ],
  });

  let parsed: any;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable program");
  }
  const validKind = (k: unknown): LessonKind => (KINDS.includes(k as (typeof KINDS)[number]) ? (k as LessonKind) : "read");
  const milestones = (Array.isArray(parsed?.milestones) ? parsed.milestones : [])
    .filter((m: any) => m && typeof m.title === "string" && m.title.trim())
    .slice(0, 8)
    .map((m: any) => ({
      title: m.title.toString().slice(0, 160),
      detail: (m.detail || "").toString().slice(0, 400),
      estimate: (m.estimate || "").toString().slice(0, 40),
      lessons: (Array.isArray(m.lessons) ? m.lessons : [])
        .filter((l: any) => l && typeof l.title === "string" && l.title.trim())
        .slice(0, 8)
        .map((l: any) => ({
          title: l.title.toString().slice(0, 160),
          objective: (l.objective || "").toString().slice(0, 200),
          kind: validKind(l.kind),
          content: "",
        })),
    }));
  if (!milestones.length) throw new Error("Coach returned an empty program");
  return {
    title: (parsed?.title || input.title).toString().slice(0, 200),
    description: (parsed?.description || input.description || "").toString().slice(0, 900),
    milestones,
  };
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
  goalDescription?: string;
  milestoneTitle: string;
  milestoneDetail?: string;
  milestoneOutcomes?: string[];
  lessonTitle: string;
  lessonObjective: string;
  kind: LessonStub["kind"];
  /** The other lessons in this milestone, in order, so this one neither repeats nor skips ahead. */
  siblingTitles?: string[];
  /** Learner calibration from the plan intake. */
  level?: "new" | "some" | "solid";
  focus?: string;
  sources?: { title: string; url: string; description: string }[];
}): Promise<string> {
  const kindGuide: Record<LessonStub["kind"], string> = {
    read: "STAGE: READ — a short, skimmable overview that maps what's coming in this milestone. Use headings and a compact list or table of the key items/ideas, say why each matters, and flag the 1-2 things people usually get wrong. This is orientation, not deep teaching. Keep it tight (the shortest lesson of the arc).",
    teach:
      "STAGE: TEACH — teach the concept from first principles with concrete WORKED EXAMPLES (at least two, each fully worked step by step, with the reasoning at every step — never just the answer) and one good analogy (the why and how). For a hands-on skill, demonstrate the technique step by step with real code / real numbers / real phrases and the expected result. Include a short '## Common mistakes' section with the fix for each. End with '## Key takeaways' (3 bullets).",
    practice:
      "STAGE: PRACTICE — active work the learner does themselves, ADAPTED TO THE SUBJECT, laid out as a PROGRESSIVE ROUTE:\n- Start with ONE fully worked example that models the exact method.\n- Then 6-10 exercises in three rungs, labeled in the headings: '### Warm-up' (2-3, one idea each), '### Core' (3-4, the real skill), '### Stretch' (1-3, combine ideas or add a twist). Number every exercise (1, 2, 3…). For code: give the task, any starter code, and the expected output/behavior. For math/EE: give the problem cleanly, with units. For language: drills and sentences to produce. For a body of knowledge: prompts to summarize, argue, connect. For an interpretive subject: reflection/discussion prompts.\n- Then a '## Hints' section: exactly ONE nudge per exercise (numbered to match), each pointing at where to look or which rule applies — never the answer itself.\n- Then a '## Answers' section at the very end: the worked solution for EVERY exercise (numbered to match), with the reasoning, and a one-line 'if you missed this, the gap is probably…' note on the ones that usually trip people up.\nTell the learner up front: attempt each exercise, use a hint only when stuck, check against the answers, and note what tripped them up.",
    apply:
      "STAGE: APPLY — one realistic task that TRANSFERS the skill to a novel, real context: produce the language in a short dialogue, build a small thing (code — specify inputs, outputs and a way to test it), solve word problems, analyze a real case through the framework, or (for interpretive subjects) apply it to the learner's own life. Structure: '## The task' (clear brief + constraints), '## Plan before you start' (2-4 guiding questions), '## Hints if you get stuck' (a short ladder: nudge → strategy → first step), '## Model answer' (a complete strong example, worked), and '## Debrief checklist' (what a strong result does, the common shortfalls, and one way to push it further).",
    check:
      "STAGE: CHECK — a low-stakes self-check. For skills/knowledge, an 8-10 question quiz that ramps from recall to application (say which is which), covering every idea in the milestone at least once, with an '## Answer key' that gives the answer AND a one-sentence explanation of why (and what a typical wrong answer reveals). For interpretive/values subjects, replace the quiz with honest self-reflection questions (no graded answers). For exam-targeted goals, mirror the real assessment's format and timing. Close with '## Score yourself' — what different scores mean and what to revisit.",
    review:
      "STAGE: REVIEW — an active-recall workout over the WHOLE milestone (spaced retrieval, not new material): 10-14 flashcard-style prompts (question, then the answer under a 'Answer:' line so it can be covered) spanning everything covered, ordered easy → hard, plus '## If you missed these, revisit…' mapping each prompt to the lesson it came from, and a '## One-minute summary' the learner should be able to reproduce from memory.",
  };

  const calibration =
    ctx.level === "new"
      ? "The learner is a COMPLETE BEGINNER: assume no prior knowledge, define every term the first time, go slower and smaller."
      : ctx.level === "solid"
        ? "The learner has a SOLID FOUNDATION: skip basics, go straight to nuance, edge cases and harder work."
        : "The learner has SOME EXPERIENCE: skip the true basics, but don't assume mastery.";

  const hasSources = ctx.sources && ctx.sources.length > 0;
  const sourcesGuide = hasSources
    ? ` This subject is time-sensitive, so you are given CURRENT web search results below. Ground any up-to-date facts (recent events, latest tools, current figures) in them, and prefer them over your own prior knowledge where they conflict. Cite inline like [1], [2] and end with a "## Sources" section listing the numbered sources as markdown links.`
    : "";
  const sourcesBlock = hasSources
    ? `\n\nCURRENT WEB SOURCES (as of today):\n${ctx.sources!
        .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}\n${s.description}`)
        .join("\n\n")}`
    : "";

  const siblings = (ctx.siblingTitles ?? []).filter((t) => t !== ctx.lessonTitle);
  const outcomes = ctx.milestoneOutcomes?.filter(Boolean) ?? [];
  const contextBlock = [
    ctx.goalDescription ? `Course details: ${ctx.goalDescription}` : "",
    ctx.milestoneDetail ? `Milestone means: ${ctx.milestoneDetail}` : "",
    outcomes.length ? `By the end of this milestone the learner can: ${outcomes.join("; ")}` : "",
    siblings.length
      ? `The other lessons in this milestone are: ${siblings.join(" | ")}. Stay in YOUR lane — don't re-teach what an earlier lesson covered or pre-empt a later one; reference them by name where useful.`
      : "",
    ctx.focus ? `Why the learner is doing this / what to emphasize: ${ctx.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return complete({
    system: `${COACH_SYSTEM}

You are writing the ACTUAL learning material for a single lesson — the real content the user studies, not a description of it. Be genuinely useful and complete for this one lesson only: specific to the subject, concrete, with real examples (real code that runs, real numbers, real sentences), never generic filler or "in this lesson we will…". Output clean GitHub-flavored markdown. Do not include the lesson title as an H1 (the app shows it). ${calibration}

First silently judge HOW this subject is learned — a hands-on skill, a body of knowledge/ideas, something interpretive/reflective, memorization-heavy, or exam-targeted (or a mix) — and shape the content accordingly, so a reflective subject never gets rote worksheets and a skill never gets only prose.

When a concept is inherently visual or structural, include a diagram. Use a \`\`\`mermaid code block for processes, timelines, hierarchies, state machines, decision trees, or sequences (flowchart, sequenceDiagram, timeline, mindmap, stateDiagram-v2, erDiagram). For a SYSTEM or ARCHITECTURE diagram (components/services and their connections), use an \`\`\`arch code block with a compact TOON spec instead: a nodes[N]{id,label,group} block then an edges[M]{from,to,label} block, where group is one of frontend|backend|service|data|external|queue (ids short with no spaces, labels short, no commas inside values). Keep diagrams focused (a handful of nodes) and use them only where they genuinely aid understanding — not for every lesson. ${kindGuide[ctx.kind]}${sourcesGuide}`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Goal: ${ctx.goalTitle}\nMilestone: ${ctx.milestoneTitle}\nLesson: ${ctx.lessonTitle}\nObjective: ${ctx.lessonObjective}${contextBlock ? `\n${contextBlock}` : ""}${sourcesBlock}\n\nWrite this lesson's content now.`,
      },
    ],
  });
}

/* ── Translation: render existing content into another language ── */

/**
 * Faithfully translate generated markdown into `targetLangName`, preserving all
 * structure. Runs on whatever model the caller's `withLlm` scope resolves — so a
 * keyless English learner on a free-AI deployment can translate a Spanish course
 * for free. NOTE: pass the RAW target language name (e.g. "English"), not a
 * language directive, and DO NOT wrap this call in a `withLanguage`-injected
 * scope pinned to the reader's own language — that would fight the instruction.
 */
export async function translateMarkdown(markdown: string, targetLangName: string): Promise<string> {
  if (!markdown.trim()) return markdown;
  // Translation output ≈ input length; cap proportionally so it can't run away,
  // and prefer the fast non-reasoning model (K3's thinking is wasted on translation).
  const maxTokens = Math.min(16000, Math.max(2000, Math.ceil(markdown.length / 2) + 1000));
  const out = await complete({
    prefer: "minimax",
    maxTokens,
    system: `You are an expert translator. Translate the user's markdown document into ${targetLangName}.

STRICT RULES:
- Output ONLY the translated document. No preamble, no notes, no fences around the whole thing.
- Preserve EVERY markdown construct exactly: headings (#), lists, tables, bold/italic, links, blockquotes, and horizontal rules. Keep the literal slide separator lines (a line that is exactly ---) unchanged and in place.
- Inside fenced code blocks (\`\`\`), translate ONLY comments and human-readable string literals; never translate code, identifiers, keywords, or syntax.
- In \`\`\`mermaid and \`\`\`arch diagram blocks, translate the visible node/edge LABEL text only; leave diagram keywords, ids, arrows, and structure exactly as-is.
- Keep URLs, file paths, code identifiers, math, and proper nouns unchanged.
- Translate naturally and completely into ${targetLangName} — do not leave sentences in the original language.`,
    temperature: 0.2,
    messages: [{ role: "user", content: markdown }],
  });
  return out.trim();
}

/**
 * Translate a long document by splitting it into fence-safe chunks and doing them
 * ONE AT A TIME. Sequential (not parallel) is deliberate: each chunk is a small,
 * fast MiniMax request, and holding just one shared queue slot at a time keeps us
 * a good citizen when other users are generating too.
 */
export async function translateMarkdownChunked(markdown: string, targetLangName: string): Promise<string> {
  if (!markdown.trim()) return markdown;
  const chunks = chunkMarkdown(markdown, 3000);
  if (chunks.length <= 1) return translateMarkdown(markdown, targetLangName);
  const out: string[] = [];
  for (const c of chunks) out.push(await translateMarkdown(c, targetLangName));
  return out.join("\n\n");
}

/** Translate a single short line (a title) into `targetLangName`. */
export async function translateLine(text: string, targetLangName: string): Promise<string> {
  const t = text.trim();
  if (!t) return text;
  const out = await complete({
    prefer: "minimax",
    system: `Translate the user's text into ${targetLangName}. Output ONLY the translation — no quotes, no notes, no punctuation you weren't given. Keep proper nouns and code identifiers unchanged.`,
    maxTokens: 400,
    temperature: 0.2,
    messages: [{ role: "user", content: t }],
  });
  return out.trim().replace(/^["']|["']$/g, "") || text;
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

/** A fresh question set for an exam whose study guide already exists (each sitting gets new questions). */
export async function generateExamQuestions(ctx: {
  goalTitle: string;
  scope: "midterm" | "final";
  sections: { title: string; objective: string; content: string }[];
  studyGuide?: string;
}): Promise<{ question: string }[]> {
  const n = ctx.scope === "final" ? 8 : 6;
  const material = ctx.sections
    .map((s, i) => `### ${i + 1}. ${s.title}\n${s.objective}\n${s.content.slice(0, 1800)}`)
    .join("\n\n")
    .slice(0, 14000);
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are writing a FRESH set of exactly ${n} ${ctx.scope} exam questions for the course "${ctx.goalTitle}". Cover ALL the material evenly (spread questions across sections — never cluster on one). Mix recall, explanation and application; adapt to the subject (a skill gets "do it" questions, knowledge gets "explain/compare", exam-targeted subjects mirror the real test). Each must be answerable in a few sentences without any tool, and must be gradable against the material. Do NOT include answers. Respond with ONLY JSON, no prose or fences:
{ "questions": [ "question one", "question two" ] }`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: `COURSE MATERIAL:\n${material}${ctx.studyGuide ? `\n\nSTUDY GUIDE (what the learner revised from):\n${ctx.studyGuide.slice(0, 6000)}` : ""}\n\nWrite the ${n} questions.`,
      },
    ],
  });
  let parsed: { questions?: unknown };
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned unparseable questions");
  }
  const qs = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((q) => (typeof q === "string" ? q : (q as { question?: string })?.question))
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .slice(0, n)
    .map((q) => ({ question: q.slice(0, 500) }));
  if (!qs.length) throw new Error("Coach returned no exam questions");
  return qs;
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
  /** How much reference material to show the grader (an exam spans a whole course). */
  maxRef?: number;
  /** "exam" grades strictly and treats the reference as the whole course; default is a lesson recall. */
  mode?: "recall" | "exam";
}): Promise<QuizGrade> {
  const exam = ctx.mode === "exam";
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are grading a learner's ${exam ? "EXAM" : "recall quiz"} against the reference material (the source of truth). For each question+answer, judge "correct", "partial", or "incorrect" and give one short, kind, specific feedback line (name exactly what was missed or wrong, and the correct idea in a few words). ${
      exam
        ? "Grade fairly but strictly: 'correct' means the answer would satisfy a knowledgeable examiner; 'partial' means the core idea is there with a gap or error; vague or generic answers that could be written without studying are 'incorrect'."
        : ""
    }Then give a 1-2 sentence overall summary and a suggested spaced-repetition rating based on how they did overall: "again" (mostly wrong), "hard" (shaky), "good" (solid), "easy" (nailed it). A blank answer is "incorrect". Respond with ONLY JSON, no prose or fences:
{ "results": [ { "verdict": "correct|partial|incorrect", "feedback": "..." } ], "summary": "...", "suggested": "again|hard|good|easy" }
The results array MUST have exactly one entry per question, in order.`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `${exam ? "Exam" : "Lesson"}: ${ctx.lessonTitle}\n\nREFERENCE MATERIAL:\n${ctx.content.slice(0, ctx.maxRef ?? 6000)}\n\nQUIZ:\n${ctx.items
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

/* ── Interactive practice: progressive problem sets, checking, variants, debrief ── */

import type { Problem } from "./practice";

const PROBLEM_KINDS = ["short", "code", "numeric", "explain"] as const;
const DIFFS = ["warmup", "core", "stretch"] as const;

function cleanProblem(raw: unknown): Problem | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";
  if (!prompt) return null;
  const hints = (Array.isArray(p.hints) ? p.hints : [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .slice(0, 3)
    .map((h) => h.slice(0, 600));
  while (hints.length < 3) hints.push(hints[hints.length - 1] ?? "Re-read the worked example in the lesson and match its steps to this problem.");
  return {
    prompt: prompt.slice(0, 4000),
    kind: (PROBLEM_KINDS as readonly string[]).includes(p.kind as string) ? (p.kind as Problem["kind"]) : "short",
    difficulty: (DIFFS as readonly string[]).includes(p.difficulty as string) ? (p.difficulty as Problem["difficulty"]) : "core",
    starter: typeof p.starter === "string" ? p.starter.slice(0, 4000) : "",
    hints,
    solution: typeof p.solution === "string" ? p.solution.slice(0, 6000) : "",
    rubric: typeof p.rubric === "string" ? p.rubric.slice(0, 1500) : "",
    answerFormat: typeof p.answerFormat === "string" ? p.answerFormat.slice(0, 200) : "",
  };
}

const PROBLEM_SHAPE = `{ "prompt": "the problem, in markdown (code in fences; math written plainly)", "kind": "short|code|numeric|explain", "difficulty": "warmup|core|stretch", "starter": "starter code or template the learner completes ('' if none)", "hints": ["rung 1: a nudge — where to look, what to notice", "rung 2: the rule/strategy to apply", "rung 3: the next concrete step or a partial solution"], "solution": "the full worked solution with reasoning (markdown)", "rubric": "what a correct answer MUST contain, for a grader", "answerFormat": "e.g. 'a number with units', 'a Python function', '2-3 sentences'" }`;

/** A progressive problem set for one lesson: warm-up → core → stretch. */
export async function generatePracticeSet(ctx: {
  goalTitle: string;
  lessonTitle: string;
  lessonObjective: string;
  kind: string;
  content: string;
  level?: "new" | "some" | "solid";
  count?: number;
}): Promise<Problem[]> {
  const n = Math.max(4, Math.min(8, ctx.count ?? 6));
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are writing an INTERACTIVE PRACTICE SET for one lesson — problems the learner will actually solve one at a time inside the app, with a hint ladder and an AI check of each attempt. Ground every problem in THIS lesson's content and terminology; don't test things it never taught.

Design a PROGRESSIVE ROUTE of exactly ${n} problems: about a third "warmup" (one idea each, quick wins), half "core" (the real skill, the lesson's worked example transferred to new numbers/inputs/situations), and 1-2 "stretch" (combine ideas, add a twist or a realistic edge case). Order easy → hard.

Adapt the problem KIND to the subject:
- programming → "code": a precise task with inputs → expected outputs (give an example), "starter" holds a function signature or template; the solution is complete, runnable code with the expected output.
- math / engineering / anything quantitative → "numeric": clean statement with units; the solution shows every step.
- languages, terminology, recall drills → "short": produce the word/sentence/fact.
- ideas, analysis, reflection, safety/procedures → "explain": a scenario or question answered in 2-4 sentences, with a rubric of what must be mentioned.

Each problem needs a 3-rung hint ladder that NEVER contains the answer (nudge → strategy → next concrete step), a complete worked solution, and a grading rubric. ${
      ctx.level === "new" ? "The learner is a complete beginner — keep warm-ups very gentle and define terms in prompts." : ctx.level === "solid" ? "The learner is strong — make the core problems genuinely demanding." : ""
    }

Respond with ONLY JSON, no prose or fences: { "problems": [ ${PROBLEM_SHAPE} ] }`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Course: ${ctx.goalTitle}\nLesson (${ctx.kind}): ${ctx.lessonTitle}\nObjective: ${ctx.lessonObjective}\n\nLESSON CONTENT:\n${ctx.content.slice(0, 14000)}\n\nWrite the ${n}-problem practice set.`,
      },
    ],
  });
  let parsed: { problems?: unknown };
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable practice set");
  }
  const problems = (Array.isArray(parsed.problems) ? parsed.problems : []).map(cleanProblem).filter((p): p is Problem => !!p).slice(0, 8);
  if (problems.length < 2) throw new Error("Coach returned too few problems");
  return problems;
}

export type AttemptGrade = {
  verdict: "correct" | "partial" | "incorrect";
  feedback: string; // what's right / what's wrong, specifically
  misconception: string; // the single gap this reveals ('' if none)
  nextStep: string; // one concrete thing to do now
};

/** Check one attempt against the problem's solution + rubric. Coaches, doesn't just mark. */
export async function gradePracticeAttempt(ctx: {
  lessonTitle: string;
  problem: Problem;
  answer: string;
  hintsUsed: number;
  priorAttempts: string[];
}): Promise<AttemptGrade> {
  const raw = await complete({
    system: `${COACH_SYSTEM}

You are checking ONE attempt at a practice problem. Judge it against the reference solution and rubric — but grade the IDEA, not the wording: an equivalent method, a different but correct code approach, or a correct number expressed differently is still "correct". "partial" = the core idea is there but with an error, gap, or unfinished step. "incorrect" = wrong approach, wrong result, or blank. For code, mentally run it on the example inputs.

Coach, don't just mark: name exactly what is right, then exactly what is wrong or missing and WHY (not just "incorrect"). If the answer is wrong, do NOT give the full solution — give the one correction or question that unblocks them, so they can try again. If it's correct, say what made it work and add one sharpening insight. Keep feedback to 2-5 sentences.

Respond with ONLY JSON, no prose or fences:
{ "verdict": "correct|partial|incorrect", "feedback": "...", "misconception": "the single underlying gap this reveals, or ''", "nextStep": "one concrete thing to do right now" }`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `Lesson: ${ctx.lessonTitle}\n\nPROBLEM:\n${ctx.problem.prompt}\n${ctx.problem.starter ? `\nSTARTER:\n${ctx.problem.starter}\n` : ""}\nREFERENCE SOLUTION:\n${ctx.problem.solution}\n\nRUBRIC: ${ctx.problem.rubric}\nExpected answer format: ${ctx.problem.answerFormat}\nHints the learner has used so far: ${ctx.hintsUsed} of 3${
          ctx.priorAttempts.length ? `\nTheir earlier attempts on this problem: ${ctx.priorAttempts.map((a, i) => `(${i + 1}) ${a.slice(0, 400)}`).join(" | ")}` : ""
        }\n\nLEARNER'S ANSWER:\n${ctx.answer || "(blank)"}\n\nCheck it.`,
      },
    ],
  });
  let parsed: Partial<AttemptGrade>;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable check");
  }
  const verdicts = new Set(["correct", "partial", "incorrect"]);
  return {
    verdict: (verdicts.has(parsed.verdict as string) ? parsed.verdict : "partial") as AttemptGrade["verdict"],
    feedback: (parsed.feedback ?? "").toString().slice(0, 1500),
    misconception: (parsed.misconception ?? "").toString().slice(0, 400),
    nextStep: (parsed.nextStep ?? "").toString().slice(0, 400),
  };
}

/** One more problem: an easier stepping-stone toward `problem`, or a harder follow-up. */
export async function generateVariantProblem(ctx: {
  lessonTitle: string;
  content: string;
  problem: Problem;
  direction: "easier" | "harder";
  struggle?: string;
}): Promise<Problem> {
  const raw = await complete({
    system: `${COACH_SYSTEM}

Write ONE new practice problem for this lesson, ${
      ctx.direction === "easier"
        ? "EASIER than the given one: isolate the single sub-skill the learner is stuck on (see their struggle), with smaller numbers / a simpler input / one fewer step — a stepping stone that, once solved, makes the original problem approachable. Difficulty 'warmup'."
        : "HARDER than the given one: same skill with a twist, an edge case, or a second idea combined. Difficulty 'stretch'."
    } Same kind as the original. Full hint ladder (no answers in hints), worked solution, rubric. Respond with ONLY JSON, no prose or fences: ${PROBLEM_SHAPE}`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.6,
    messages: [
      {
        role: "user",
        content: `Lesson: ${ctx.lessonTitle}\n\nLESSON CONTENT (excerpt):\n${ctx.content.slice(0, 8000)}\n\nORIGINAL PROBLEM (${ctx.problem.difficulty}, ${ctx.problem.kind}):\n${ctx.problem.prompt}\n\nIts solution: ${ctx.problem.solution.slice(0, 2000)}${ctx.struggle ? `\n\nWhere the learner is struggling: ${ctx.struggle}` : ""}\n\nWrite the ${ctx.direction} problem.`,
      },
    ],
  });
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch {
    throw new Error("Coach returned an unparseable problem");
  }
  const p = cleanProblem((parsed as { problem?: unknown })?.problem ?? parsed);
  if (!p) throw new Error("Coach returned no problem");
  p.difficulty = ctx.direction === "easier" ? "warmup" : "stretch";
  return p;
}

/** The end-of-set debrief: patterns across attempts, the one thing to fix, what to do next. */
export async function debriefPracticeSet(ctx: {
  lessonTitle: string;
  problems: Problem[];
  results: { verdict: string | null; hintsUsed: number; misconception?: string }[];
}): Promise<string> {
  const lines = ctx.problems.map(
    (p, i) => `${i + 1}. [${p.difficulty}] ${p.prompt.slice(0, 160).replace(/\n/g, " ")} → ${ctx.results[i]?.verdict ?? "skipped"} (hints: ${ctx.results[i]?.hintsUsed ?? 0})${ctx.results[i]?.misconception ? ` — gap: ${ctx.results[i]!.misconception}` : ""}`,
  );
  const out = await complete({
    system: `${COACH_SYSTEM}

Write a short DEBRIEF for a practice session the learner just finished — the kind a great coach gives after a set: honest, specific, encouraging. Markdown, no H1, under 220 words:
- **What worked**: 1-2 specific strengths shown by the results.
- **The one thing to fix**: the single most important pattern across the misses/hints (name the misconception plainly and how to think about it instead). If everything was correct, name what to push toward next.
- **Do this next**: one concrete action (redo problem N without hints, re-read one section of the lesson, try the stretch problem, move on).
No filler, no generic praise.`,
    maxTokens: 4000,
    temperature: 0.5,
    messages: [{ role: "user", content: `Lesson: ${ctx.lessonTitle}\n\nRESULTS:\n${lines.join("\n")}\n\nWrite the debrief.` }],
  });
  return out.trim();
}

/* ── Study guides: a standalone, keepable revision document ── */

export async function generateStudyGuide(ctx: {
  title: string;
  topic?: string;
  goalTitle?: string;
  sections?: { title: string; objective: string; content: string }[];
}): Promise<{ title: string; content: string }> {
  const material = (ctx.sections ?? [])
    .map((s, i) => `### ${i + 1}. ${s.title}\n${s.objective}\n${s.content.slice(0, 2500)}`)
    .join("\n\n")
    .slice(0, 16000);
  const grounded = material
    ? ` Ground the guide in the COURSE MATERIAL below — cover what it actually teaches, in its own terms, and don't invent beyond it.`
    : "";
  const content = await complete({
    system: `${COACH_SYSTEM}

You are writing a STUDY GUIDE — a standalone, beautiful, self-contained revision document the learner keeps and returns to. Output clean GitHub-flavored markdown (no H1; the app shows the title). Make it genuinely useful:
- Open with a one-paragraph orientation: what this covers and how to use it.
- Organize by topic with "## " sections; under each, the key concepts, definitions, formulas/rules, and the common mistakes to avoid.
- Use compact tables for facts that compare or enumerate, and — where a concept is structural or visual — a \`\`\`mermaid or \`\`\`arch diagram (same rules as elsewhere; keep them focused).
- End with a "## Quick-recall checklist" of the must-know points and a "## If you're short on time" triage note.
Adapt depth and tone to the subject.${grounded}`,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: 0.5,
    messages: [
      {
        role: "user",
        content: `Study guide title: ${ctx.title}${ctx.goalTitle ? `\nCourse/goal: ${ctx.goalTitle}` : ""}${
          ctx.topic ? `\nFocus: ${ctx.topic}` : ""
        }${material ? `\n\nCOURSE MATERIAL:\n${material}` : ""}\n\nWrite the study guide now.`,
      },
    ],
  });
  const clean = content.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  return { title: ctx.title.slice(0, 160), content: clean };
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
