import { NextResponse } from "next/server";
import { CHARACTER_TEMPLATES } from "@/lib/character-templates";

// GET /api/characters/templates - 获取角色模板列表
export async function GET() {
  try {
    const templates = CHARACTER_TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      description: t.description,
      character: t.character,
    }));
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
