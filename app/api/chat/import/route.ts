import { NextRequest } from "next/server";
import { importChatFromJson, importAllChats } from "@/lib/chat-history";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mode = (formData.get("mode") as string) || "single"; // single | all

    if (!file) {
      return Response.json({ error: "请上传文件" }, { status: 400 });
    }

    const content = await file.text();

    if (mode === "all") {
      // 恢复所有对话
      const count = importAllChats(content);
      return Response.json({
        success: true,
        message: `成功恢复 ${count} 个角色的对话`,
        count,
      });
    } else {
      // 导入单个角色对话
      const result = importChatFromJson(content);
      return Response.json({
        success: true,
        message: `成功导入与 ${result.characterName} 的对话`,
        characterId: result.characterId,
        characterName: result.characterName,
        messageCount: result.messages.length,
      });
    }
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
