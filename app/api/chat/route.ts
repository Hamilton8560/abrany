import { NextResponse } from "next/server";
import {
  getOrCreateDefaultThread,
  listMessages,
  addMessage,
  getGoal,
  getPlanForGoal,
  userOwnsGoal,
  getStudyGuide,
  userOwnsStudyGuide,
} from "@/lib/repo";
import { streamText, withLlm, llmContext, type ChatMessage } from "@/lib/minimax";
import { COACH_SYSTEM } from "@/lib/coach";
import { languageMismatch } from "@/lib/langdetect";
import { getSessionUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const threadId = getOrCreateDefaultThread(user.id);
  return NextResponse.json({ threadId, messages: listMessages(threadId) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const content = (body.message ?? "").toString().trim();
  if (!content) return NextResponse.json({ error: "Message is required" }, { status: 400 });
  const llm = llmContext(user);
  if ("error" in llm) return NextResponse.json({ error: llm.error }, { status: 400 });

  // If they're clearly typing in another language, let the client offer to switch
  // (unless they've already confirmed to continue as-is).
  if (!body.confirmLang) {
    const mismatch = languageMismatch(content, user.language);
    if (mismatch) return NextResponse.json({ languageMismatch: mismatch }, { status: 409 });
  }

  const ownsGoal = body.goalId != null && userOwnsGoal(user.id, Number(body.goalId));
  const threadId = getOrCreateDefaultThread(user.id, ownsGoal ? Number(body.goalId) : null);
  addMessage(threadId, "user", content);

  // Build context: prior turns + optional focused goal/plan.
  const history: ChatMessage[] = listMessages(threadId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let system = COACH_SYSTEM;
  if (ownsGoal) {
    const goal = getGoal(Number(body.goalId));
    if (goal) {
      const plan = getPlanForGoal(goal.id);
      system += `\n\nThe user is currently focused on the goal: "${goal.title}".${
        goal.description ? ` Details: ${goal.description}.` : ""
      }`;
      if (plan) {
        system += ` Their current plan "${plan.title}" has these milestones: ${plan.items
          .map((i) => `${i.title} (${i.status})`)
          .join("; ")}.`;
      }
    }
  }

  // Ground the tutor in a specific study guide when the user is discussing one.
  if (body.studyGuideId != null && userOwnsStudyGuide(user.id, Number(body.studyGuideId))) {
    const guide = getStudyGuide(Number(body.studyGuideId));
    if (guide && guide.content) {
      system +=
        `\n\nThe user is studying this STUDY GUIDE and wants to discuss it. Treat it as the authoritative material — answer from it, quote or reference its sections when helpful, clear up confusions, quiz them if they ask, and go deeper where they're stuck. Do not contradict it; if something is missing, say so and add it carefully.\n\n--- STUDY GUIDE: ${guide.title} ---\n${guide.content.slice(0, 24000)}\n--- END STUDY GUIDE ---`;
    }
  }

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await withLlm(llm.creds, async () => {
          for await (const chunk of streamText({
            system,
            messages: history,
            maxTokens: 2048,
            signal: request.signal,
          })) {
            full += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        }, user.language);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Coach is unavailable";
        controller.enqueue(encoder.encode(`\n\n⚠️ ${message}`));
      } finally {
        if (full.trim()) addMessage(threadId, "assistant", full);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
