import { NextResponse } from "next/server";
import { listModels, getCurrentModel, setCurrentModel, addModel, deleteModel, updateModel } from "@/lib/models";

// GET /api/models - 获取模型列表和当前模型
export async function GET() {
  try {
    const models = listModels().map((m) => ({
      id: m.id,
      name: m.name,
      model: m.model,
      baseURL: m.baseURL,
      embeddingModel: m.embeddingModel || null,
      hasApiKey: !!m.apiKey,
    }));
    const current = getCurrentModel();
    return NextResponse.json({
      models,
      current: current.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/models - 添加模型 或 切换当前模型
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 切换当前模型
    if (body.current) {
      const ok = setCurrentModel(body.current);
      if (!ok) {
        return NextResponse.json({ error: "模型不存在" }, { status: 400 });
      }
      return NextResponse.json({ success: true, current: body.current });
    }

    // 添加新模型
    if (body.model) {
      const { name, baseURL, model, embeddingModel, apiKey } = body.model;
      if (!name || !baseURL || !model || !apiKey) {
        return NextResponse.json(
          { error: "缺少必填字段：name, baseURL, model, apiKey" },
          { status: 400 }
        );
      }
      const newModel = addModel({
        name,
        baseURL,
        model,
        embeddingModel: embeddingModel || undefined,
        apiKey,
      });
      return NextResponse.json({ success: true, model: newModel });
    }

    // 更新模型
    if (body.update) {
      const { id, ...updates } = body.update;
      const ok = updateModel(id, updates);
      if (!ok) {
        return NextResponse.json({ error: "模型不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "无效的请求" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/models?id=xxx - 删除模型
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }

    const ok = deleteModel(id);
    if (!ok) {
      return NextResponse.json({ error: "模型不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
