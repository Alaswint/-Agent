import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// tool-settings 惰性解析 PROJECT_ROOT，测试前先指向临时目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "roleplay-tool-settings-"));
process.env.PROJECT_ROOT = tmpDir;

import {
  getToolSettings,
  updateToolSettings,
  isToolEnabled,
  requiresApproval,
  HIGH_RISK_TOOLS,
} from "../lib/tools/tool-settings.ts";

test("工具配置：默认全部启用 + 手动审批模式", () => {
  const settings = getToolSettings();
  assert.equal(settings.approvalMode, "manual");
  assert.equal(settings.maxIterations, 5);
  assert.equal(settings.maxTokens, 2048);
  assert.equal(isToolEnabled("run_command"), true);
  assert.equal(isToolEnabled("nonexistent_tool"), true);
});

test("工具配置：开关持久化", () => {
  updateToolSettings({ enabled: { run_command: false } });
  assert.equal(isToolEnabled("run_command"), false);
  assert.equal(isToolEnabled("read_file"), true);

  updateToolSettings({ enabled: { run_command: true } });
  assert.equal(isToolEnabled("run_command"), true);

  // 重新读取也生效（持久化到磁盘）
  assert.equal(getToolSettings().enabled.run_command, true);
});

test("工具配置：审批模式切换", () => {
  // 手动模式：高危工具需要批准
  updateToolSettings({ approvalMode: "manual" });
  assert.equal(requiresApproval("run_command"), true);
  assert.equal(requiresApproval("write_file"), true);
  assert.equal(requiresApproval("get_weather"), false);

  // 自动模式：全部直接执行
  updateToolSettings({ approvalMode: "auto" });
  assert.equal(requiresApproval("run_command"), false);

  updateToolSettings({ approvalMode: "manual" });
});

test("工具配置：参数钳制到合法范围", () => {
  const s = updateToolSettings({
    maxIterations: 999,
    maxTokens: 1,
    toolTimeoutMs: 1,
  });
  assert.equal(s.maxIterations, 10);
  assert.equal(s.maxTokens, 200);
  assert.equal(s.toolTimeoutMs, 5000);
});

test("高危工具清单包含命令执行与文件写入", () => {
  assert.ok(HIGH_RISK_TOOLS.has("run_command"));
  assert.ok(HIGH_RISK_TOOLS.has("write_file"));
  assert.ok(HIGH_RISK_TOOLS.has("open_application"));
  assert.ok(HIGH_RISK_TOOLS.has("take_desktop_screenshot"));
  assert.ok(!HIGH_RISK_TOOLS.has("calculate"));
});
