import { Tool, ToolSchema, ToolHandler, ToolCall, ToolResult } from "./types";
import { weatherTool } from "./weather";
import { searchTool } from "./search";
import { reminderTool } from "./reminder";
import { calculatorTool } from "./calculator";
import { timeTool } from "./time";
import { BROWSER_TOOLS } from "./browser-tool-defs";
import { SYSTEM_TOOLS } from "./system-tool-defs";

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // 注册默认工具
    this.register(weatherTool);
    this.register(searchTool);
    this.register(reminderTool);
    this.register(calculatorTool);
    this.register(timeTool);

    // 注册浏览器工具
    for (const toolDef of BROWSER_TOOLS) {
      this.register(toolDef);
    }

    // 注册系统控制工具
    for (const toolDef of SYSTEM_TOOLS) {
      this.register(toolDef);
    }
  }

  register(tool: Tool) {
    this.tools.set(tool.schema.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.get(toolCall.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: "",
        error: `未知工具: ${toolCall.name}`,
      };
    }

    try {
      const result = await tool.handler(toolCall.arguments);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
      };
    } catch (err: any) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: "",
        error: err.message || String(err),
      };
    }
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc)));
  }
}

export const toolRegistry = new ToolRegistry();
