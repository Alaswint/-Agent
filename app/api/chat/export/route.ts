import { NextRequest } from "next/server";
import { exportChatAsJson, exportChatAsMarkdown, exportAllChats } from "@/lib/chat-history";
import { loadCharacter } from "@/lib/character";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");
    const format = searchParams.get("format") || "json"; // json | markdown
    const all = searchParams.get("all") === "true";

    if (all) {
      // 导出所有对话
      const content = exportAllChats();
      return new Response(content, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="all-chats-${Date.now()}.json"`,
        },
      });
    }

    if (!characterId) {
      return Response.json({ error: "请指定角色ID" }, { status: 400 });
    }

    const character = loadCharacter(characterId);

    if (format === "markdown") {
      const content = exportChatAsMarkdown(characterId, character.name);
      return new Response(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="chat-${character.name}-${Date.now()}.md"`,
        },
      });
    } else {
      const content = exportChatAsJson(characterId, character.name);
      return new Response(content, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="chat-${character.name}-${Date.now()}.json"`,
        },
      });
    }
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
