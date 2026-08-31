import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAgentLoop,
  toolCallsToAssistantMessage,
  toolResultToMessage,
  withTimeout,
  shouldPostProcess,
  LLMMessage,
  LLMResponse,
} from "../lib/agent-loop.ts";
import { ToolCall, ToolResult, ToolSchema } from "../lib/tools/types.ts";

const dummyTool: ToolSchema = {
  name: "dummy",
  description: "测试工具",
  parameters: { type: "object", properties: {} },
};

function makeToolCall(id: string, name: string, args: any = {}): ToolCall {
  return { id, name, arguments: args };
}

test("Agent Loop：无工具调用时直接返回回复", async () => {
  const reply = "你好呀！";
  const result = await runAgentLoop({
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ],
    tools: [dummyTool],
    llmCall: async () => ({ content: reply }),
    executeTool: async () => {
      throw new Error("不应执行工具");
    },
  });

  assert.equal(result.reply, reply);
  assert.equal(result.paused, false);
  assert.equal(result.toolResults.length, 0);
});

test("Agent Loop：工具调用后模型基于结果继续生成（多轮循环）", async () => {
  const calls: string[] = [];
  // 第一次返回工具调用，第二次返回最终回复
  const responses: LLMResponse[] = [
    { content: "", toolCalls: [makeToolCall("c1", "dummy", { q: 1 })] },
    { content: "根据工具结果，答案是 42" },
  ];
  let callIndex = 0;

  const result = await runAgentLoop({
    messages: [{ role: "user", content: "问题" }],
    tools: [dummyTool],
    llmCall: async () => responses[callIndex++],
    executeTool: async (tc) => {
      calls.push(tc.name);
      return { toolCallId: tc.id, name: tc.name, result: "工具输出" };
    },
  });

  assert.equal(result.reply, "根据工具结果，答案是 42");
  assert.deepEqual(calls, ["dummy"]);
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.iterationsUsed, 2);

  // 消息序列应包含 assistant(tool_calls) + tool 结果
  const roles = result.messages.map((m) => m.role);
  assert.ok(roles.includes("assistant"));
  assert.ok(roles.includes("tool"));
  const toolMsg = result.messages.find((m) => m.role === "tool")!;
  assert.equal(toolMsg.tool_call_id, "c1");
  assert.equal(toolMsg.content, "工具输出");
});

test("Agent Loop：连续多步工具调用（A → B → 回复）", async () => {
  const executed: string[] = [];
  const responses: LLMResponse[] = [
    { content: "", toolCalls: [makeToolCall("a", "step_a")] },
    { content: "", toolCalls: [makeToolCall("b", "step_b")] },
    { content: "完成" },
  ];
  let i = 0;

  const result = await runAgentLoop({
    messages: [{ role: "user", content: "做多步任务" }],
    tools: [dummyTool],
    llmCall: async (msgs) => {
      // 每次调用都能看到之前全部消息（上下文累积）
      if (i === 1) {
        assert.ok(msgs.some((m) => m.role === "tool"));
      }
      return responses[i++];
    },
    executeTool: async (tc) => {
      executed.push(tc.name);
      return { toolCallId: tc.id, name: tc.name, result: `结果 ${tc.name}` };
    },
  });

  assert.deepEqual(executed, ["step_a", "step_b"]);
  assert.equal(result.reply, "完成");
  assert.equal(result.toolResults.length, 2);
});

test("Agent Loop：需要审批时暂停且不执行任何工具", async () => {
  const responses: LLMResponse[] = [
    { content: "", toolCalls: [makeToolCall("c1", "run_command", { command: "dir" })] },
  ];
  let i = 0;
  let approvalRequested: ToolCall[] | null = null;

  const result = await runAgentLoop({
    messages: [{ role: "user", content: "执行命令" }],
    tools: [dummyTool],
    llmCall: async () => responses[i++],
    executeTool: async () => {
      throw new Error("审批前不应执行工具");
    },
    needsApproval: (name) => name === "run_command",
    onApprovalRequest: (pending) => {
      approvalRequested = pending;
    },
  });

  assert.equal(result.paused, true);
  assert.ok(approvalRequested);
  assert.equal(result.pendingToolCalls!.length, 1);
  assert.equal(result.pendingToolCalls![0].name, "run_command");
});

test("Agent Loop：达到最大轮数后强制收尾", async () => {
  let llmCalls = 0;
  const result = await runAgentLoop({
    messages: [{ role: "user", content: "无限循环" }],
    tools: [dummyTool],
    maxIterations: 2,
    llmCall: async (_msgs, tools) => {
      llmCalls++;
      // 带 tools 时永远请求调用工具；收尾调用（无 tools）返回文本
      if (tools.length === 0) return { content: "最终回复" };
      return { content: "", toolCalls: [makeToolCall(`c${llmCalls}`, "dummy")] };
    },
    executeTool: async (tc) => ({
      toolCallId: tc.id,
      name: tc.name,
      result: "ok",
    }),
  });

  assert.equal(result.reply, "最终回复");
  assert.equal(result.toolResults.length, 2);
});

test("Agent Loop：工具执行超时转为错误结果并继续", async () => {
  const responses: LLMResponse[] = [
    { content: "", toolCalls: [makeToolCall("c1", "slow_tool")] },
    { content: "工具失败了，但我还在" },
  ];
  let i = 0;

  const result = await runAgentLoop({
    messages: [{ role: "user", content: "hi" }],
    tools: [dummyTool],
    toolTimeoutMs: 50,
    llmCall: async () => responses[i++],
    executeTool: () =>
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error("太慢了")), 500)
      ),
  });

  assert.equal(result.reply, "工具失败了，但我还在");
  assert.equal(result.toolResults[0].error, "工具 slow_tool 超时（0秒）");
});

test("消息转换：assistant 工具调用与 tool 结果", () => {
  const assistantMsg = toolCallsToAssistantMessage("我先查一下", [
    makeToolCall("c1", "search", { q: "x" }),
  ]);
  assert.equal(assistantMsg.role, "assistant");
  assert.equal(assistantMsg.content, "我先查一下");
  assert.equal(assistantMsg.tool_calls![0].function.name, "search");
  // 参数序列化为 JSON 字符串
  assert.deepEqual(JSON.parse(assistantMsg.tool_calls![0].function.arguments), { q: "x" });

  const toolMsg = toolResultToMessage({
    toolCallId: "c1",
    name: "search",
    result: "找到了",
  });
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.tool_call_id, "c1");
  assert.equal(toolMsg.content, "找到了");

  const errToolMsg = toolResultToMessage({
    toolCallId: "c2",
    name: "search",
    result: "",
    error: "炸了",
  });
  assert.equal(errToolMsg.content, "错误：炸了");
});

test("withTimeout：超时拒绝", async () => {
  await assert.rejects(
    withTimeout(
      new Promise((r) => setTimeout(r, 500)),
      30,
      "测试"
    ),
    /超时/
  );
});

test("shouldPostProcess：只在必要时触发", () => {
  // 平静的普通对话：第 1、2 轮不触发
  assert.equal(shouldPostProcess(0, 0, 1), false);
  assert.equal(shouldPostProcess(0, 0, 2), false);
  // 每 3 轮兜底一次
  assert.equal(shouldPostProcess(0, 0, 3), true);
  // 情绪强烈或紧急时立即触发
  assert.equal(shouldPostProcess(6, 0, 1), true);
  assert.equal(shouldPostProcess(-6, 0, 1), true);
  assert.equal(shouldPostProcess(0, 7, 1), true);
});
