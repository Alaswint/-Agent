import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  validateManifest,
  pluginToolName,
  parsePluginToolName,
  manifestToPlugin,
  loadPlugins,
  pluginsDir,
} from "../lib/plugins/loader";

describe("插件系统", () => {
  it("命名与解析 round-trip", () => {
    const name = pluginToolName("todo", "add_task");
    assert.strictEqual(name, "plugin__todo__add_task");
    const parsed = parsePluginToolName(name);
    assert.ok(parsed);
    assert.strictEqual(parsed!.plugin, "todo");
    assert.strictEqual(parsed!.tool, "add_task");
  });

  it("解析非插件名称返回 null", () => {
    assert.strictEqual(parsePluginToolName("mcp__a__b"), null);
    assert.strictEqual(parsePluginToolName("weather"), null);
    assert.strictEqual(parsePluginToolName("plugin__foo"), null);
  });

  it("校验合法清单通过", () => {
    assert.strictEqual(
      validateManifest({
        name: "my-plugin",
        description: "描述",
        tools: [
          {
            name: "fetch",
            description: "获取",
            http: { url: "https://api.example.com/fetch" },
          },
        ],
      }),
      null
    );
  });

  it("校验不合法清单返回错误", () => {
    assert.ok(
      validateManifest(null)?.includes("JSON 对象")
    );
    assert.ok(
      validateManifest({ name: "ok" })?.includes("tools")
    );
    assert.ok(
      validateManifest({
        name: "bad-tool",
        tools: [{ name: "x", http: {} }],
      })?.includes("url")
    );
    assert.ok(
      validateManifest({
        name: "bad-url",
        tools: [{ name: "x", http: { url: "ftp://x" } }],
      })?.includes("http://")
    );
  });

  it("manifestToPlugin 生成正确工具定义", () => {
    const plugin = manifestToPlugin({
      name: "todo",
      displayName: "待办插件",
      version: "1.0.0",
      tools: [
        {
          name: "list",
          description: "列出",
          parameters: {
            type: "object",
            properties: {
              done: { type: "boolean", description: "是否完成" },
            },
          },
          http: { url: "https://todo.example.com/list", method: "GET" },
        },
      ],
    });
    assert.strictEqual(plugin.plugin, "todo");
    assert.strictEqual(plugin.displayName, "待办插件");
    assert.strictEqual(plugin.tools.length, 1);
    assert.strictEqual(plugin.tools[0].schema.name, "plugin__todo__list");
    assert.ok(plugin.tools[0].schema.description.includes("待办插件"));
    assert.strictEqual(typeof plugin.tools[0].handler, "function");
  });

  it("loadPlugins 从临时目录扫描插件", () => {
    const prevRoot = process.env.PROJECT_ROOT;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rp-plugins-"));
    process.env.PROJECT_ROOT = tmp;
    try {
      fs.mkdirSync(path.join(tmp, "plugins"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "plugins", "todo.json"),
        JSON.stringify({
          name: "todo",
          description: "代办",
          tools: [
            {
              name: "list",
              description: "列出",
              parameters: { type: "object", properties: {} },
              http: { url: "https://todo.example.com/list" },
            },
          ],
        })
      );
      // 同时放一个目录形态的插件
      fs.mkdirSync(path.join(tmp, "plugins", "notes"), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, "plugins", "notes", "plugin.json"),
        JSON.stringify({
          name: "notes",
          tools: [
            {
              name: "add",
              description: "新增",
              parameters: { type: "object", properties: {} },
              http: { url: "https://notes.example.com/add" },
            },
          ],
        })
      );

      const result = loadPlugins();
      assert.strictEqual(result.plugins.length, 2);
      assert.ok(result.plugins.some((p) => p.plugin === "todo"));
      assert.ok(result.plugins.some((p) => p.plugin === "notes"));
      assert.strictEqual(result.errors.length, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      process.env.PROJECT_ROOT = prevRoot;
    }
  });
});
