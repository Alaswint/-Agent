import { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine-manager";

export async function POST(req: NextRequest) {
  try {
    const { message, characterId } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        `data: ${JSON.stringify({ type: "error", data: "消息不能为空" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    if (!characterId) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", data: "请先选择角色" })}\n\n`,
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const engine = getEngine(characterId);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await engine.chat(message, (chunk) => {
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
