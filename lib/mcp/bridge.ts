// MCP 工具桥接：把 MCP 服务器的工具转换为内部 Tool 格式
// 命名规则：mcp__<服务器id>__<工具名>
import { Tool, ToolParameter, ToolSchema } from "@/lib/tools/types";
import { McpToolInfo, callMcpTool } from "./manager";

export const MCP_PREFIX = "mcp__";

export function mcpToolName(serverId: string, toolName: string): string {
  return `${MCP_PREFIX}${serverId}__${toolName}`;
}

export function parseMcpToolName(name: string): { serverId: string; toolName: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null;
  const rest = name.slice(MCP_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  return { serverId: rest.slice(0, sep), toolName: rest.slice(sep + 2) };
}

/** JSON Schema 属性 → 内部 ToolParameter（支持嵌套对象与数组） */
function toToolParameter(prop: any): ToolParameter {
  if (!prop || typeof prop !== "object") {
    return { type: "string", description: "" };
  }
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

/** MCP inputSchema（JSON Schema）→ 内部 ToolSchema.parameters */
export function mcpSchemaToToolSchema(inputSchema: any): ToolSchema["parameters"] {
  if (!inputSchema || typeof inputSchema !== "object") {
    return { type: "object", properties: {} };
  }
  const properties: Record<string, ToolParameter> = {};
  const srcProps = inputSchema.properties || {};
  for (const [key, prop] of Object.entries<any>(srcProps)) {
    properties[key] = toToolParameter(prop);
  }
  return {
    type: "object",
    properties,
    required: Array.isArray(inputSchema.required)
      ? inputSchema.required.map(String)
      : undefined,
  };
}

/** MCP 工具信息 → 内部 Tool（handler 走 manager.callMcpTool） */
export function mcpToolToTool(info: McpToolInfo): Tool {
  const name = mcpToolName(info.serverId, info.name);
  return {
    schema: {
      name,
      description: `[MCP:${info.serverName}] ${info.description || info.name}`,
      parameters: mcpSchemaToToolSchema(info.inputSchema),
    },
    handler: (args) => callMcpTool(info.serverId, info.name, args),
  };
}
