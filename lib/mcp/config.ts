// MCP 服务器配置：持久化到 data/mcp.json
import * as fs from "fs";
import * as path from "path";

export type McpTransport = "stdio" | "sse" | "http";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio 传输：要启动的命令，如 npx / node / uvx */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** sse / http 传输：服务器 URL */
  url?: string;
  enabled: boolean;
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

function mcpConfigFile(): string {
  return path.join(getProjectRoot(), "data", "mcp.json");
}

function ensureDir() {
  const dir = path.dirname(mcpConfigFile());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** 生成服务器 id：名称转 slug，冲突时追加序号 */
function generateId(name: string, existing: McpServerConfig[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server";
  let id = base;
  let i = 2;
  while (existing.some((s) => s.id === id)) {
    id = `${base}-${i++}`;
  }
  return id;
}

/** 校验并规范化一条服务器配置 */
function normalize(input: Partial<McpServerConfig>): McpServerConfig | null {
  const name = String(input.name || "").trim();
  if (!name) return null;
  const transport: McpTransport =
    input.transport === "sse" || input.transport === "http" ? input.transport : "stdio";
  if (transport === "stdio" && !input.command) return null;
  if (transport !== "stdio" && !input.url) return null;
  return {
    id: String(input.id || generateId(name, [])),
    name,
    transport,
    command: input.command ? String(input.command) : undefined,
    args: Array.isArray(input.args) ? input.args.map(String) : undefined,
    env:
      input.env && typeof input.env === "object" && !Array.isArray(input.env)
        ? Object.fromEntries(
            Object.entries(input.env).map(([k, v]) => [k, String(v)])
          )
        : undefined,
    url: input.url ? String(input.url) : undefined,
    enabled: input.enabled === undefined ? true : !!input.enabled,
  };
}

export function getMcpServers(): McpServerConfig[] {
  try {
    if (fs.existsSync(mcpConfigFile())) {
      const data = JSON.parse(fs.readFileSync(mcpConfigFile(), "utf-8"));
      const servers = Array.isArray(data.servers) ? data.servers : [];
      return servers
        .map((s: any) => normalize(s))
        .filter((s: McpServerConfig | null): s is McpServerConfig => !!s);
    }
  } catch {
    // 损坏则视为空配置
  }
  return [];
}

export function getMcpServer(id: string): McpServerConfig | undefined {
  return getMcpServers().find((s) => s.id === id);
}

function save(servers: McpServerConfig[]) {
  ensureDir();
  fs.writeFileSync(mcpConfigFile(), JSON.stringify({ servers }, null, 2), "utf-8");
}

/** 新增或更新（按 id 匹配）服务器配置 */
export function upsertMcpServer(
  input: Partial<McpServerConfig>
): { servers: McpServerConfig[]; server?: McpServerConfig; error?: string } {
  const servers = getMcpServers();
  if (input.id && servers.some((s) => s.id === input.id)) {
    // 更新：保留 id 与原有字段，覆盖传入字段
    const idx = servers.findIndex((s) => s.id === input.id);
    const merged = normalize({ ...servers[idx], ...input, id: servers[idx].id });
    if (!merged) return { servers, error: "配置不完整：stdio 需要 command，sse/http 需要 url，且名称不能为空" };
    const next = [...servers];
    next[idx] = merged;
    save(next);
    return { servers: next, server: merged };
  }
  // 新增
  const created = normalize({ ...input, enabled: input.enabled ?? true });
  if (!created) return { servers, error: "配置不完整：stdio 需要 command，sse/http 需要 url，且名称不能为空" };
  created.id = generateId(created.name, servers);
  const next = [...servers, created];
  save(next);
  return { servers: next, server: created };
}

/** 删除服务器配置 */
export function removeMcpServer(id: string): McpServerConfig[] {
  const next = getMcpServers().filter((s) => s.id !== id);
  save(next);
  return next;
}

/** 启用 / 禁用服务器 */
export function toggleMcpServer(id: string, enabled: boolean): McpServerConfig[] {
  const next = getMcpServers().map((s) => (s.id === id ? { ...s, enabled } : s));
  save(next);
  return next;
}
