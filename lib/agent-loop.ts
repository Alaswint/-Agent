// Agent Loop —— 多轮工具调用循环（ReAct 式）
// 纯逻辑模块：LLM 调用通过注入 llmCall 完成，方便单元测试。
import { ToolSchema, ToolCall, ToolResult } from "@/lib/tools/types";

/** 标准 LLM 消息（含 OpenAI function calling 的 tool 角色） */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: LLMUsage;
}

export type LLMPromptFn = (
  messages: LLMMessage[],
  tools: ToolSchema[],
  onToken?: (token: string) => void
) => Promise<LLMResponse>;

export interface AgentLoopParams {
  /** 初始消息（system + 历史 + 当前输入） */
  messages: LLMMessage[];
  tools: ToolSchema[];
  llmCall: LLMPromptFn;
  /** 最大循环轮数（默认 5） */
  maxIterations?: number;
  /** 已消耗的轮数（审批恢复时传入） */
  iterationsUsed?: number;
  /** 单个工具执行超时（毫秒，默认 30000） */
  toolTimeoutMs?: number;
  executeTool: (toolCall: ToolCall) => Promise<ToolResult>;
  /** 返回 true 表示该工具需要人工批准后才能执行 */
  needsApproval?: (toolName: string) => boolean;
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolResult: ToolResult) => void;
  /** 需要审批时回调：暂停循环，等待外部调用方决定 */
  onApprovalRequest?: (
    pendingToolCalls: ToolCall[],
    messages: LLMMessage[],
    iterationsUsed: number
  ) => void;
}

export interface AgentLoopResult {
  reply: string;
  toolResults: ToolResult[];
  iterationsUsed: number;
  /** 完整消息列表（含工具交互），审批恢复时作为初始消息传入 */
  messages: LLMMessage[];
  /** true 表示因等待人工审批而暂停 */
  paused: boolean;
  /** 暂停时待批准的工具调用 */
  pendingToolCalls?: ToolCall[];
}

/** 把 ToolCall 转为 OpenAI 格式的 assistant 消息 */
export function toolCallsToAssistantMessage(
  content: string | null,
  toolCalls: ToolCall[]
): LLMMessage {
  return {
    role: "assistant",
    content: content || null,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
    })),
  };
}

/** 把工具执行结果转为 tool 角色消息 */
export function toolResultToMessage(tr: ToolResult): LLMMessage {
  return {
    role: "tool",
    tool_call_id: tr.toolCallId,
    name: tr.name,
    content: tr.error ? `错误：${tr.error}` : tr.result,
  };
}

/** 带超时的 Promise 包装 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "操作"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(ms / 1000)}秒）`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * 执行 Agent 循环：
 *   LLM → (有工具调用？) 执行工具 → 把结果以 tool 消息回传 → 再次调用 LLM → …
 * 直到模型不再调用工具、达到最大轮数，或因需要人工审批而暂停。
 */
export async function runAgentLoop(
  params: AgentLoopParams
): Promise<AgentLoopResult> {
  const {
    messages,
    tools,
    llmCall,
    maxIterations = 5,
    iterationsUsed = 0,
    toolTimeoutMs = 30000,
    executeTool,
    needsApproval,
    onToken,
    onToolCall,
    onToolResult,
    onApprovalRequest,
  } = params;

  const allMessages = [...messages];
  const allToolResults: ToolResult[] = [];
  let used = iterationsUsed;

  while (used < maxIterations) {
    used++;
    const response = await llmCall(allMessages, tools, onToken);

    // 没有工具调用：这就是最终回复
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        reply: response.content,
        toolResults: allToolResults,
        iterationsUsed: used,
        messages: allMessages,
        paused: false,
      };
    }

    const toolCalls = response.toolCalls;

    // 高危工具需要人工批准：整批暂停（保持消息序列完整）
    const requiresApproval =
      needsApproval && toolCalls.some((tc) => needsApproval(tc.name));
    if (requiresApproval && onApprovalRequest) {
      onApprovalRequest(toolCalls, allMessages, used);
      return {
        reply: "",
        toolResults: allToolResults,
        iterationsUsed: used,
        messages: allMessages,
        paused: true,
        pendingToolCalls: toolCalls,
      };
    }

    // 记录 assistant 的工具调用消息
    allMessages.push(toolCallsToAssistantMessage(response.content, toolCalls));

    // 逐个执行（顺序执行保证依赖关系；结果按调用顺序回传）
    for (const tc of toolCalls) {
      onToolCall?.(tc);
      let result: ToolResult;
      try {
        result = await withTimeout(
          executeTool(tc),
          toolTimeoutMs,
          `工具 ${tc.name} `
        );
      } catch (err: any) {
        result = {
          toolCallId: tc.id,
          name: tc.name,
          result: "",
          error: err?.message || String(err),
        };
      }
      allToolResults.push(result);
      onToolResult?.(result);
      allMessages.push(toolResultToMessage(result));
    }
    // 继续下一轮，让模型基于工具结果决定下一步
  }

  // 达到最大轮数：强制收尾一次（不带工具），让模型给出最终答复
  const final = await llmCall([...allMessages], [], onToken);
  return {
    reply: final.content,
    toolResults: allToolResults,
    iterationsUsed: used,
    messages: allMessages,
    paused: false,
  };
}

/**
 * 是否需要运行后处理（合规检查）。
 * 每轮都跑一次额外 LLM 调用太贵，只在情绪激烈/紧急/每 3 轮兜底时触发。
 */
export function shouldPostProcess(
  impactMood: number,
  urgency: number,
  turnCount: number
): boolean {
  if (Math.abs(impactMood) > 5) return true;
  if (urgency > 6) return true;
  return turnCount % 3 === 0;
}
