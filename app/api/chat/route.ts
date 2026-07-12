import { NextResponse } from "next/server";
import {
  getOrCreateDefaultThread,
  listMessages,
  addMessage,
  getGoal,
  getPlanForGoal,
} from "@/lib/repo";
import { streamText, type ChatMessage } from "@/lib/minimax";
import { COACH_SYSTEM } from "@/lib/coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const threadId = getOrCreateDefaultThread();
  return NextResponse.json({ threadId, messages: listMessages(threadId) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const content = (body.message ?? "").toString().trim();
  if (!content) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const threadId = getOrCreateDefaultThread(body.goalId ?? null);
  addMessage(threadId, "user", content);

  // Build context: prior turns + optional focused goal/plan.
  const history: ChatMessage[] = listMessages(threadId).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let system = COACH_SYSTEM;
  if (body.goalId != null) {
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

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamText({
          system,
          messages: history,
          maxTokens: 2048,
          signal: request.signal,
        })) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
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
