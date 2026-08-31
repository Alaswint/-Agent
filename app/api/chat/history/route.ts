import { NextRequest } from "next/server";
import { loadChatHistory, deleteChatHistory, listChatSessions } from "@/lib/chat-history";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");
    const list = searchParams.get("list") === "true";

    if (list) {
      // 列出所有对话会话
      const sessions = listChatSessions();
      return Response.json({ sessions });
    }

    if (!characterId) {
      return Response.json({ error: "请指定角色ID" }, { status: 400 });
    }

    const session = loadChatHistory(characterId);
    if (!session) {
      return Response.json({ messages: [] });
    }

    return Response.json({
      characterId: session.characterId,
      characterName: session.characterName,
      messages: session.messages,
      lastUpdated: session.lastUpdated,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");

    if (!characterId) {
      return Response.json({ error: "请指定角色ID" }, { status: 400 });
    }

    deleteChatHistory(characterId);
    return Response.json({ success: true, message: "对话历史已删除" });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
