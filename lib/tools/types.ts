// 工具调用框架 - 类型定义

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  /** 数组元素 schema（MCP/插件工具可能有复杂参数） */
  items?: any;
  /** 嵌套对象的子属性 */
  properties?: Record<string, ToolParameter>;
  /** 嵌套对象的必填字段 */
  required?: string[];
  default?: any;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: string;
  error?: string;
}

export type ToolHandler = (args: Record<string, any>) => Promise<string>;

export interface Tool {
  schema: ToolSchema;
  handler: ToolHandler;
}
