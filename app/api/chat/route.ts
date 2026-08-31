import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/lib/engine-manager";

export async function POST(req: NextRequest) {
  try {
    const { message, characterId } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }

    if (!characterId) {
      return NextResponse.json({ error: "请先选择角色" }, { status: 400 });
    }

    const engine = getEngine(characterId);
    const result = await engine.chat(message);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Chat API Error:", err);
    return NextResponse.json(
      { error: "服务器错误", detail: err.message },
      { status: 500 }
    );
  }
}
