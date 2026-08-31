import { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine-manager";

/**
 * POST /api/chat/approve
 * body: { characterId: string, approved: boolean }
 * 恢复因工具审批而暂停的对话，返回 SSE 流（与 /api/chat/stream 相同格式）。
 */
export async function POST(req: NextRequest) {
  try {
    const { characterId, approved } = await req.json();

    if (!characterId || typeof approved !== "boolean") {
      return new Response(
        `data: ${JSON.stringify({ type: "error", data: "参数不完整" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const engine = getEngine(characterId);
    if (!engine.hasPendingApproval()) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", data: "当前没有待审批的工具调用" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await engine.resumeApproval(approved, (chunk) => {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          });

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "done", data: result })}\n\n`
            )
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`,
      { status: 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
