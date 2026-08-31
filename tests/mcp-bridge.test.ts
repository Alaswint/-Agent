import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mcpToolName,
  parseMcpToolName,
  mcpSchemaToToolSchema,
  mcpToolToTool,
} from "../lib/mcp/bridge";
import { extractMcpResultText } from "../lib/mcp/manager";

describe("MCP 桥接", () => {
  it("命名与解析 round-trip", () => {
    const name = mcpToolName("my-server", "list_files");
    assert.strictEqual(name, "mcp__my-server__list_files");
    const parsed = parseMcpToolName(name);
    assert.ok(parsed);
    assert.strictEqual(parsed!.serverId, "my-server");
    assert.strictEqual(parsed!.toolName, "list_files");
  });

  it("解析非 MCP 名称返回 null", () => {
    assert.strictEqual(parseMcpToolName("weather"), null);
    assert.strictEqual(parseMcpToolName("plugin__foo__bar"), null);
    assert.strictEqual(parseMcpToolName("mcp__foo"), null);
  });

  it("简单 inputSchema → ToolSchema", () => {
    const schema = mcpSchemaToToolSchema({
      type: "object",
      properties: {
        path: { type: "string", description: "路径" },
        recursive: { type: "boolean", description: "是否递归", default: false },
      },
      required: ["path"],
    });
    assert.strictEqual(schema.type, "object");
    assert.strictEqual(schema.properties.path.type, "string");
    assert.strictEqual(schema.properties.recursive.default, false);
    assert.deepStrictEqual(schema.required, ["path"]);
  });

  it("嵌套对象 inputSchema → ToolSchema（保留 properties）", () => {
    const schema = mcpSchemaToToolSchema({
      type: "object",
      properties: {
        config: {
          type: "object",
          description: "配置",
          properties: { retries: { type: "number", description: "重试次数" } },
        },
      },
    });
    assert.ok(schema.properties.config.properties);
    assert.strictEqual(schema.properties.config.properties!.retries.type, "number");
  });

  it("数组 inputSchema → ToolSchema（保留 items）", () => {
    const schema = mcpSchemaToToolSchema({
      type: "object",
      properties: {
        tags: { type: "array", description: "标签", items: { type: "string" } },
      },
    });
    assert.deepStrictEqual(schema.properties.tags.items, { type: "string" });
  });

  it("mcpToolToTool 绑定正确的 handler（延迟执行不报错）", () => {
    const info = {
      serverId: "files",
      serverName: "文件服务器",
      name: "read_file",
      description: "读取文件",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: "路径" } },
        required: ["path"],
      },
    };
    const tool = mcpToolToTool(info as any);
    assert.strictEqual(tool.schema.name, "mcp__files__read_file");
    assert.ok(tool.schema.description.includes("文件服务器"));
    assert.ok(tool.schema.description.includes("读取文件"));
    assert.strictEqual(typeof tool.handler, "function");
  });

  it("提取 callTool 纯文本结果", () => {
    assert.strictEqual(
      extractMcpResultText([{ type: "text", text: "hello" }]),
      "hello"
    );
    assert.strictEqual(
      extractMcpResultText([
        { type: "text", text: "line1" },
        { type: "text", text: "line2" },
      ]),
      "line1\nline2"
    );
  });

  it("提取 callTool 图片与资源", () => {
    assert.strictEqual(
      extractMcpResultText([{ type: "image", data: "base64" }]),
      "[图片内容]"
    );
    assert.ok(
      extractMcpResultText([
        { type: "resource", resource: { uri: "http://a/b", text: "hi" } },
      ]).includes("hi")
    );
    assert.ok(
      extractMcpResultText([
        { type: "resource", resource: { uri: "http://a/b" } },
      ]).includes("http://a/b")
    );
  });

  it("提取 callTool 字符串与 null", () => {
    assert.strictEqual(extractMcpResultText("plain"), "plain");
    assert.strictEqual(extractMcpResultText(null as any), "");
    assert.strictEqual(extractMcpResultText(undefined as any), "");
    assert.strictEqual(extractMcpResultText({ text: "struct" }), "struct");
    assert.strictEqual(extractMcpResultText({ x: 1 }), JSON.stringify({ x: 1 }));
  });
});
