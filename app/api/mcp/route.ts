import { NextRequest, NextResponse } from "next/server";
import {
  getMcpServers,
  getMcpServer,
  upsertMcpServer,
  removeMcpServer,
  toggleMcpServer,
} from "@/lib/mcp/config";
import { disconnectServer, testServer } from "@/lib/mcp/manager";
import { invalidateDynamicTools } from "@/lib/dynamic-tools";

export const dynamic = "force-dynamic";

// GET /api/mcp —— 服务器列表 + 连接状态 + 工具
export async function GET() {
  const servers = getMcpServers();
  const infos = await Promise.all(
    servers.map(async (s) => {
      if (!s.enabled) {
        return { ...s, status: "disabled" as const, tools: [] as string[] };
      }
      const result = await testServer(s);
      return {
        ...s,
        status: (result.ok ? "connected" : "error") as "connected" | "error",
        tools: result.ok ? result.tools : [],
        error: result.ok ? undefined : result.error,
      };
    })
  );
  return NextResponse.json({ servers: infos });
}

// POST /api/mcp —— 增/改/删/启停/测试/刷新
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "");

    switch (action) {
      case "add": {
        const { servers, server, error } = upsertMcpServer({
          name: body.name,
          transport: body.transport,
          command: body.command,
          args: body.args,
          env: body.env,
          url: body.url,
          enabled: body.enabled,
        });
        if (!server) {
          return NextResponse.json({ error: error || "配置不完整" }, { status: 400 });
        }
        invalidateDynamicTools();
        return NextResponse.json({ servers, server });
      }

      case "update": {
        if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
        const { servers, server, error } = upsertMcpServer({
          id: body.id,
          name: body.name,
          transport: body.transport,
          command: body.command,
          args: body.args,
          env: body.env,
          url: body.url,
          enabled: body.enabled,
        });
        if (!server) {
          return NextResponse.json({ error: error || "配置不完整" }, { status: 400 });
        }
        // 配置变化：断开连接，下次使用时重建
        await disconnectServer(body.id).catch(() => {});
        invalidateDynamicTools();
        return NextResponse.json({ servers, server });
      }

      case "remove": {
        if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
        const servers = removeMcpServer(body.id);
        await disconnectServer(body.id).catch(() => {});
        invalidateDynamicTools();
        return NextResponse.json({ servers });
      }

      case "toggle": {
        if (!body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
        const enabled = body.enabled === undefined ? true : !!body.enabled;
        const servers = toggleMcpServer(body.id, enabled);
        await disconnectServer(body.id).catch(() => {});
        invalidateDynamicTools();
        return NextResponse.json({ servers });
      }

      case "test": {
        // 用传入配置测试（可以还没保存），也可以传 id 测试已保存的
        const server = body.id ? getMcpServer(body.id) : (body as any);
        if (!server) {
          return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
        }
        const result = await testServer(server as any);
        invalidateDynamicTools();
        return NextResponse.json(result);
      }

      case "refresh": {
        invalidateDynamicTools();
        for (const s of getMcpServers()) {
          await disconnectServer(s.id).catch(() => {});
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "操作失败" }, { status: 500 });
  }
}
