import { NextRequest, NextResponse } from "next/server";
import { toolRegistry } from "@/lib/tools/registry";
import {
  getToolSettings,
  updateToolSettings,
  HIGH_RISK_TOOLS,
  TOOL_CATEGORIES,
} from "@/lib/tools/tool-settings";
import { readAuditTrail } from "@/lib/tools/audit";

import { getDynamicToolInfos } from "@/lib/dynamic-tools";

// GET /api/tools —— 工具列表 + 当前配置（含 MCP / 插件动态工具）
export async function GET() {
  const settings = getToolSettings();
  const tools = toolRegistry.getAllTools().map((t) => ({
    name: t.schema.name,
    description: t.schema.description,
    category: TOOL_CATEGORIES[t.schema.name] || "其他",
    highRisk: HIGH_RISK_TOOLS.has(t.schema.name),
    enabled: settings.enabled[t.schema.name] === undefined
      ? true
      : !!settings.enabled[t.schema.name],
  }));

  const dynamic = await getDynamicToolInfos().catch(() => ({
    tools: [],
    errors: [] as { source: string; error: string }[],
  }));
  const dynamicTools = dynamic.tools.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.source,
    highRisk: false,
    enabled: t.enabled,
  }));

  return NextResponse.json({
    tools: [...tools, ...dynamicTools],
    settings,
    dynamicErrors: dynamic.errors,
  });
}

// PUT /api/tools —— 更新工具配置（开关 / 审批模式 / Agent 参数）
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: any = {};
    if (typeof body.approvalMode === "string") {
      if (body.approvalMode !== "auto" && body.approvalMode !== "manual") {
        return NextResponse.json({ error: "approvalMode 必须是 auto 或 manual" }, { status: 400 });
      }
      updates.approvalMode = body.approvalMode;
    }
    if (body.enabled && typeof body.enabled === "object") {
      updates.enabled = body.enabled;
    }
    if (body.maxIterations !== undefined) updates.maxIterations = body.maxIterations;
    if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens;
    if (body.toolTimeoutMs !== undefined) updates.toolTimeoutMs = body.toolTimeoutMs;

    const settings = updateToolSettings(updates);
    return NextResponse.json({ settings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "更新配置失败" }, { status: 500 });
  }
}

// DELETE /api/tools —— 读取审计日志（方便前端排查）
export async function DELETE() {
  // 不提供删除审计能力，仅暴露读取
  return NextResponse.json({ error: "不支持该操作" }, { status: 405 });
}

// POST /api/tools?action=audit —— 读取最近审计记录
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("action") === "audit") {
    const limit = Number(searchParams.get("limit")) || 50;
    return NextResponse.json({ entries: readAuditTrail(limit) });
  }
  return NextResponse.json({ error: "不支持该操作" }, { status: 400 });
}
