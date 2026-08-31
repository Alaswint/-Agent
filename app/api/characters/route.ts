import { NextRequest, NextResponse } from "next/server";
import { listCharacters, loadCharacter, saveCharacter, deleteCharacter, characterExists } from "@/lib/character";
import { invalidateEngine } from "@/lib/engine-manager";
import { Character } from "@/lib/types";

// GET /api/characters?id=xxx - 获取单个角色或列出所有角色
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // 获取单个角色
      if (!characterExists(id)) {
        return NextResponse.json({ error: "角色不存在" }, { status: 404 });
      }
      const character = loadCharacter(id);
      return NextResponse.json({ character });
    }

    // 列出所有角色
    const characters = listCharacters();
    return NextResponse.json({ characters });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/characters - 创建/更新角色
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, character } = body;

    if (!id || !character) {
      return NextResponse.json({ error: "缺少 id 或 character" }, { status: 400 });
    }

    // 验证必填字段
    const required = ["name", "role", "personality", "background", "speakingStyle", "scene", "initialState", "rules", "lore"];
    for (const field of required) {
      if ((character as any)[field] === undefined) {
        return NextResponse.json({ error: `缺少必填字段: ${field}` }, { status: 400 });
      }
    }

    // 确保 initialState 包含所有字段
    const defaultState = {
      mood: 0,
      affection: 0,
      trust: 0,
      plotStage: "初识",
      energy: 50,
      openness: 0,
      dominance: 0,
    };

    const fullCharacter: Character = {
      ...character,
      initialState: { ...defaultState, ...character.initialState },
    };

    saveCharacter(id, fullCharacter);
    // 让对话引擎缓存失效，新设定立即生效
    invalidateEngine(id);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/characters?id=xxx - 删除角色
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }

    if (!characterExists(id)) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    deleteCharacter(id);
    invalidateEngine(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
