// 动态工具聚合器：MCP 服务器工具 + 插件工具 → 统一 Tool[]
// 带 TTL 缓存，避免每轮对话都去连接 MCP 服务器
import { Tool } from "@/lib/tools/types";
import { listAllMcpTools } from "@/lib/mcp/manager";
import { mcpToolToTool } from "@/lib/mcp/bridge";
import { loadPluginTools } from "@/lib/plugins/loader";
import { isToolEnabled } from "@/lib/tools/tool-settings";

/** 动态工具缓存时长（毫秒） */
const CACHE_TTL_MS = 60000;

interface DynamicToolsCache {
  tools: Tool[];
  /** MCP 服务器加载失败的错误信息（透传给设置界面） */
  errors: { source: string; error: string }[];
  loadedAt: number;
}

function cache(): DynamicToolsCache | null {
  const g = globalThis as any;
  return g.__dynamicToolsCache ?? null;
}

function setCache(c: DynamicToolsCache | null) {
  (globalThis as any).__dynamicToolsCache = c;
}

/** 配置变化（增删改 MCP 服务器）后调用，强制下一轮重新加载 */
export function invalidateDynamicTools(): void {
  setCache(null);
}

/** 聚合所有动态工具（MCP + 插件），应用启用开关过滤 */
export async function getDynamicTools(): Promise<{
  tools: Tool[];
  errors: { source: string; error: string }[];
}> {
  const cached = cache();
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return { tools: cached.tools, errors: cached.errors };
  }

  const errors: { source: string; error: string }[] = [];

  // MCP 工具（异步，可能连接失败）
  const tools: Tool[] = [];
  try {
    const mcp = await listAllMcpTools();
    for (const info of mcp.tools) {
      tools.push(mcpToolToTool(info));
    }
    for (const e of mcp.errors) {
      errors.push({ source: `MCP:${e.serverName}`, error: e.error });
    }
  } catch (err: any) {
    errors.push({ source: "MCP", error: err?.message || String(err) });
  }

  // 插件工具（同步读本地文件）
  try {
    const plugins = loadPluginTools();
    tools.push(...plugins.tools);
    for (const e of plugins.errors) {
      errors.push({ source: `插件:${e.file}`, error: e.error });
    }
  } catch (err: any) {
    errors.push({ source: "插件", error: err?.message || String(err) });
  }

  const result = { tools, errors };
  setCache({ ...result, loadedAt: Date.now() });
  return result;
}

/** 按名称解析单个动态工具（执行时用，绕过 TTL 缓存的场景） */
export async function resolveDynamicTool(name: string): Promise<Tool | undefined> {
  // 插件工具：直接读清单，保证最新
  if (name.startsWith("plugin__")) {
    const { loadPluginTools } = await import("@/lib/plugins/loader");
    return loadPluginTools().tools.find((t) => t.schema.name === name);
  }
  // MCP 工具：走聚合缓存（连接已建立，开销小）
  if (name.startsWith("mcp__")) {
    const { tools } = await getDynamicTools();
    return tools.find((t) => t.schema.name === name);
  }
  return undefined;
}

/** 列出动态工具的 schema 概览（设置界面用） */
export async function getDynamicToolInfos(): Promise<{
  tools: { name: string; description: string; source: string; enabled: boolean }[];
  errors: { source: string; error: string }[];
}> {
  const { tools, errors } = await getDynamicTools();
  return {
    tools: tools.map((t) => {
      const source = t.schema.name.startsWith("mcp__")
        ? t.schema.description.match(/^\[MCP:(.+?)\]/)?.[1] || "MCP"
        : t.schema.description.match(/^\[插件:(.+?)\]/)?.[1] || "插件";
      return {
        name: t.schema.name,
        description: t.schema.description,
        source,
        enabled: isToolEnabled(t.schema.name),
      };
    }),
    errors,
  };
}
