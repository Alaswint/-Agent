// 插件系统：plugins/ 目录下的 JSON 清单 → HTTP 工具包
// 支持两种形态：
//   1. plugins/<name>/plugin.json —— 插件目录（推荐）
//   2. plugins/<name>.json —— 单文件清单
// 工具命名规则：plugin__<插件名>__<工具名>
import * as fs from "fs";
import * as path from "path";
import { Tool, ToolParameter, ToolSchema } from "@/lib/tools/types";

export const PLUGIN_PREFIX = "plugin__";

export interface PluginHttpConfig {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface PluginToolManifest {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  http: PluginHttpConfig;
}

export interface PluginManifest {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  tools: PluginToolManifest[];
}

export interface LoadedPlugin {
  plugin: string;
  displayName: string;
  description: string;
  version: string;
  tools: Tool[];
}

export interface PluginLoadResult {
  plugins: LoadedPlugin[];
  errors: { file: string; error: string }[];
}

function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

export function pluginsDir(): string {
  return path.join(getProjectRoot(), "plugins");
}

export function pluginToolName(pluginName: string, toolName: string): string {
  return `${PLUGIN_PREFIX}${pluginName}__${toolName}`;
}

export function parsePluginToolName(
  name: string
): { plugin: string; tool: string } | null {
  if (!name.startsWith(PLUGIN_PREFIX)) return null;
  const rest = name.slice(PLUGIN_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  return { plugin: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

function toToolParameter(prop: any): ToolParameter {
  if (!prop || typeof prop !== "object") return { type: "string", description: "" };
  const param: ToolParameter = {
    type: prop.type || "string",
    description: prop.description || "",
  };
  if (Array.isArray(prop.enum)) param.enum = prop.enum.map(String);
  if (prop.items !== undefined) param.items = prop.items;
  if (prop.default !== undefined) param.default = prop.default;
  if (prop.properties && typeof prop.properties === "object") {
    const nested: Record<string, ToolParameter> = {};
    for (const [key, sub] of Object.entries(prop.properties)) {
      nested[key] = toToolParameter(sub);
    }
    param.properties = nested;
    if (Array.isArray(prop.required)) param.required = prop.required.map(String);
  }
  return param;
}

function normalizeParameters(
  params: PluginToolManifest["parameters"] | undefined
): ToolSchema["parameters"] {
  if (!params || typeof params !== "object") {
    return { type: "object", properties: {} };
  }
  const properties: Record<string, ToolParameter> = {};
  for (const [key, prop] of Object.entries(params.properties || {})) {
    properties[key] = toToolParameter(prop);
  }
  return {
    type: "object",
    properties,
    required: Array.isArray(params.required) ? params.required.map(String) : undefined,
  };
}

/** 校验清单：返回 null 表示合法，否则返回错误信息 */
export function validateManifest(raw: any): string | null {
  if (!raw || typeof raw !== "object") return "清单必须是 JSON 对象";
  if (!raw.name || typeof raw.name !== "string") return "缺少 name 字段";
  if (!/^[a-zA-Z0-9_-]+$/.test(raw.name)) {
    return `插件名「${raw.name}」只能包含字母、数字、下划线和连字符`;
  }
  if (!Array.isArray(raw.tools) || raw.tools.length === 0) return "tools 必须是非空数组";
  for (const t of raw.tools) {
    if (!t?.name || typeof t.name !== "string") return "工具缺少 name 字段";
    if (!t?.http?.url || typeof t.http.url !== "string") {
      return `工具「${t?.name}」缺少 http.url 字段`;
    }
    if (!/^https?:\/\//.test(t.http.url)) {
      return `工具「${t.name}」的 url 必须以 http:// 或 https:// 开头`;
    }
  }
  return null;
}

/** 执行插件工具：POST JSON 参数（默认）或 GET 查询参数 */
async function callPluginHttp(
  http: PluginHttpConfig,
  args: Record<string, any>
): Promise<string> {
  const method = http.method || "POST";
  const timeoutMs = Math.max(1000, Math.min(120000, http.timeoutMs || 30000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    if (method === "GET") {
      const qs = new URLSearchParams(
        Object.entries(args).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])
      ).toString();
      const url = qs ? `${http.url}${http.url.includes("?") ? "&" : "?"}${qs}` : http.url;
      res = await fetch(url, {
        method: "GET",
        headers: { ...(http.headers || {}) },
        signal: controller.signal,
      });
    } else {
      res = await fetch(http.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(http.headers || {}) },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    if (contentType.includes("application/json")) {
      try {
        const json = JSON.parse(text);
        // 常见约定：{"result": ...} 直接取 result；否则整体返回
        if (
          json &&
          typeof json === "object" &&
          "result" in json &&
          Object.keys(json).length <= 2
        ) {
          return typeof json.result === "string" ? json.result : JSON.stringify(json.result);
        }
        return JSON.stringify(json);
      } catch {
        return text;
      }
    }
    return text;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`插件工具请求超时（${timeoutMs}ms）`);
    }
    throw new Error(err?.message || String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** 单个清单 → LoadedPlugin */
export function manifestToPlugin(raw: any): LoadedPlugin {
  const manifest: PluginManifest = raw;
  const tools: Tool[] = manifest.tools.map((t) => ({
    schema: {
      name: pluginToolName(manifest.name, t.name),
      description: `[插件:${manifest.displayName || manifest.name}] ${t.description || t.name}`,
      parameters: normalizeParameters(t.parameters),
    },
    handler: (args) => callPluginHttp(t.http, args),
  }));
  return {
    plugin: manifest.name,
    displayName: manifest.displayName || manifest.name,
    description: manifest.description || "",
    version: manifest.version || "0.0.0",
    tools,
  };
}

/** 扫描 plugins/ 目录并加载全部插件（单插件失败不影响其他） */
export function loadPlugins(): PluginLoadResult {
  const dir = pluginsDir();
  const plugins: LoadedPlugin[] = [];
  const errors: PluginLoadResult["errors"] = [];
  if (!fs.existsSync(dir)) {
    return { plugins, errors };
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    try {
      let file: string | null = null;
      if (entry.isDirectory()) {
        const candidate = path.join(dir, entry.name, "plugin.json");
        if (fs.existsSync(candidate)) file = candidate;
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        file = path.join(dir, entry.name);
      }
      if (!file) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
      const err = validateManifest(raw);
      if (err) {
        errors.push({ file: entry.name, error: err });
        continue;
      }
      // 同名插件不重复加载（目录插件优先）
      if (plugins.some((p) => p.plugin === raw.name)) continue;
      plugins.push(manifestToPlugin(raw));
    } catch (err: any) {
      errors.push({ file: entry.name, error: err?.message || String(err) });
    }
  }
  return { plugins, errors };
}

/** 加载全部插件并展开为 Tool 列表 */
export function loadPluginTools(): { tools: Tool[]; errors: PluginLoadResult["errors"] } {
  const { plugins, errors } = loadPlugins();
  return { tools: plugins.flatMap((p) => p.tools), errors };
}

/** 按工具名查找插件工具（执行时用） */
export function findPluginTool(name: string): Tool | undefined {
  const parsed = parsePluginToolName(name);
  if (!parsed) return undefined;
  const { tools } = loadPluginTools();
  return tools.find((t) => t.schema.name === name);
}
