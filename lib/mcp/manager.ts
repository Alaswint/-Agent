// MCP 客户端管理器：懒连接 + globalThis 缓存，支持 stdio / sse / http 传输
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServerConfig, getMcpServers, getMcpServer } from "./config";

/** 连接超时（毫秒） */
const CONNECT_TIMEOUT_MS = 15000;
/** 工具调用超时（毫秒） */
const CALL_TIMEOUT_MS = 60000;

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  /** MCP 工具的原始 JSON Schema */
  inputSchema: any;
}

interface CachedConnection {
  client: Client;
  /** 配置签名：配置变化时需要重连 */
  signature: string;
  connectedAt: number;
  serverName: string;
}

/** dev 热重载下保住连接缓存（与 usage.ts 同样的做法） */
function connectionCache(): Map<string, CachedConnection> {
  const g = globalThis as any;
  if (!g.__mcpConnections) g.__mcpConnections = new Map<string, CachedConnection>();
  return g.__mcpConnections;
}

function configSignature(server: McpServerConfig): string {
  return JSON.stringify({
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function createTransport(server: McpServerConfig) {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command!,
      args: server.args || [],
      env: { ...process.env, ...(server.env || {}) } as Record<string, string>,
    });
  }
  const url = new URL(server.url!);
  if (server.transport === "sse") {
    return new SSEClientTransport(url);
  }
  return new StreamableHTTPClientTransport(url);
}

/** 获取（或建立）到某台服务器的连接；配置变化时自动重连 */
export async function getConnectedClient(server: McpServerConfig): Promise<Client> {
  const cache = connectionCache();
  const sig = configSignature(server);
  const cached = cache.get(server.id);
  if (cached && cached.signature === sig) {
    return cached.client;
  }
  // 配置变化或没有连接：断开旧的，建立新的
  if (cached) {
    await safeClose(cached.client);
    cache.delete(server.id);
  }

  const client = new Client({ name: "roleplay-agent", version: "1.2.0" });
  const transport = createTransport(server);
  await withTimeout(
    client.connect(transport),
    CONNECT_TIMEOUT_MS,
    `连接 MCP 服务器「${server.name}」`
  );
  cache.set(server.id, {
    client,
    signature: sig,
    connectedAt: Date.now(),
    serverName: server.name,
  });
  return client;
}

async function safeClose(client: Client) {
  try {
    await client.close();
  } catch {
    // 关闭失败忽略
  }
}

/** 断开某台服务器（删除/禁用/重连时用） */
export async function disconnectServer(id: string): Promise<void> {
  const cache = connectionCache();
  const cached = cache.get(id);
  if (cached) {
    await safeClose(cached.client);
    cache.delete(id);
  }
}

/** 断开全部连接 */
export async function disconnectAll(): Promise<void> {
  for (const id of Array.from(connectionCache().keys())) {
    await disconnectServer(id);
  }
}

/** 列出某台服务器的全部工具 */
export async function listServerTools(server: McpServerConfig): Promise<McpToolInfo[]> {
  const client = await getConnectedClient(server);
  const res = await withTimeout(
    client.listTools(),
    CONNECT_TIMEOUT_MS,
    `列出「${server.name}」工具`
  );
  return (res.tools || []).map((t: any) => ({
    serverId: server.id,
    serverName: server.name,
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  }));
}

export interface McpToolListResult {
  tools: McpToolInfo[];
  errors: { serverId: string; serverName: string; error: string }[];
}

/** 列出所有「已启用」服务器的工具（单台失败不影响其他） */
export async function listAllMcpTools(): Promise<McpToolListResult> {
  const servers = getMcpServers().filter((s) => s.enabled);
  const tools: McpToolInfo[] = [];
  const errors: McpToolListResult["errors"] = [];
  await Promise.all(
    servers.map(async (s) => {
      try {
        tools.push(...(await listServerTools(s)));
      } catch (err: any) {
        // 连接失败时清掉可能残留的缓存
        await disconnectServer(s.id).catch(() => {});
        errors.push({
          serverId: s.id,
          serverName: s.name,
          error: err?.message || String(err),
        });
      }
    })
  );
  return { tools, errors };
}

/** 从 callTool 结果中提取纯文本（导出供单测） */
export function extractMcpResultText(content: any): string {
  if (content === undefined || content === null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content.map((item: any) => {
      if (typeof item === "string") return item;
      if (item?.type === "text" && typeof item.text === "string") return item.text;
      if (item?.type === "image") return "[图片内容]";
      if (item?.type === "resource" && item.resource?.text) return item.resource.text;
      if (item?.type === "resource" && item.resource?.uri) return `[资源] ${item.resource.uri}`;
      return JSON.stringify(item);
    });
    return parts.join("\n").trim();
  }
  if (typeof content === "object") {
    // 结构化结果
    if (typeof content.text === "string") return content.text;
    return JSON.stringify(content);
  }
  return String(content);
}

/** 调用某台服务器上的工具 */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  const server = getMcpServer(serverId);
  if (!server) throw new Error(`MCP 服务器不存在: ${serverId}`);
  if (!server.enabled) throw new Error(`MCP 服务器「${server.name}」已被禁用`);
  const client = await getConnectedClient(server);
  const res = await withTimeout(
    client.callTool({ name: toolName, arguments: args }),
    CALL_TIMEOUT_MS,
    `调用 MCP 工具「${toolName}」`
  );
  const text = extractMcpResultText((res as any).content);
  if ((res as any).isError) {
    throw new Error(text || `MCP 工具「${toolName}」返回错误`);
  }
  return text || JSON.stringify((res as any).structuredContent ?? {});
}

/** 测试服务器配置：连接并返回工具名列表（不落盘，用于「测试连接」按钮） */
export async function testServer(
  server: McpServerConfig
): Promise<{ ok: true; tools: string[] } | { ok: false; error: string }> {
  try {
    const tools = await listServerTools(server);
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (err: any) {
    await disconnectServer(server.id).catch(() => {});
    return { ok: false, error: err?.message || String(err) };
  }
}
