import OpenAI from "openai";
import { getCurrentModel, listModels } from "@/lib/models";
import { ToolSchema, ToolCall } from "@/lib/tools/types";
import { LLMMessage, LLMResponse } from "@/lib/agent-loop";
import { recordUsage } from "@/lib/usage";

const REQUEST_TIMEOUT_MS = 120000;
const MAX_RETRIES = 2;

/** 判断错误是否值得重试（限流 / 服务端错误 / 网络错误） */
function isRetryableError(err: any): boolean {
  const status = err?.status || err?.statusCode;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  const msg = String(err?.message || "");
  if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(msg)) {
    return true;
  }
  return false;
}

/** 带重试的调用封装：瞬时错误退避重试（1s、2s） */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function friendlyError(configName: string, err: any): Error {
  const status = err?.status || err?.statusCode || "";
  const detail = err?.message || String(err);
  let hint = "";
  if (String(status) === "404") {
    hint = "（很可能是 Chat 模型 ID 填错了，请检查「模型 ID」是否为该服务商提供的真实模型名，例如 Kimi 应为 moonshot-v1-8k）";
  } else if (String(status) === "401") {
    hint = "（API Key 无效或未授权，请检查 Key 是否正确）";
  }
  return new Error(
    `调用模型「${configName}」失败${status ? ` [HTTP ${status}]` : ""}: ${detail} ${hint}`.trim()
  );
}

function createClient() {
  const config = getCurrentModel();
  if (!config.apiKey) {
    throw new Error(`模型 "${config.name}" 未设置 API Key`);
  }
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0, // 重试由 withRetry 控制
  });
  return { client, config };
}

function captureUsage(configName: string, usage: any) {
  if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
    recordUsage(configName, {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    });
  }
}

export async function complete(
  messages: LLMMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const { client, config } = createClient();
  const {
    model = config.model,
    temperature = 0.7,
    maxTokens = 500,
    jsonMode = false,
  } = options;

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
        response_format: jsonMode ? { type: "json_object" } : undefined,
      })
    );
    captureUsage(config.name, (response as any).usage);
    return response.choices[0].message.content || "";
  } catch (err: any) {
    throw friendlyError(config.name, err);
  }
}

export interface ToolCallResult {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * 流式补全：逐 token 回调，返回完整内容。
 * 模型不支持流式时自动降级为一次性返回（只回调一次完整文本）。
 */
export async function completeStream(
  messages: LLMMessage[],
  onToken: (token: string) => void,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const { client, config } = createClient();
  const {
    model = config.model,
    temperature = 0.7,
    maxTokens = 500,
  } = options;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: messages as any,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    let content = "";
    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        content += delta;
        onToken(delta);
      }
    }
    return content;
  } catch (err: any) {
    // 部分兼容 OpenAI 协议的服务不支持 stream，降级为一次性返回
    console.warn("流式调用失败，降级为一次性返回:", err?.message || err);
    const content = await complete(messages, { model, temperature, maxTokens });
    if (content) onToken(content);
    return content;
  }
}

export async function completeWithTools(
  messages: LLMMessage[],
  tools: ToolSchema[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<ToolCallResult> {
  const { client, config } = createClient();
  const {
    model = config.model,
    temperature = 0.7,
    maxTokens = 500,
  } = options;

  // 转换工具格式为 OpenAI 格式
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  try {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model,
        messages: messages as any,
        tools: openaiTools,
        tool_choice: "auto",
        temperature,
        max_tokens: maxTokens,
      })
    );
    captureUsage(config.name, (response as any).usage);

    const message = response.choices[0].message;
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: ToolCall[] = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      }));
      return { content: message.content || "", toolCalls };
    }
    return { content: message.content || "" };
  } catch (err: any) {
    // 如果模型不支持 tools，降级为普通对话
    const status = err?.status || err?.statusCode || "";
    const detail = err?.message || String(err);

    if (
      detail.includes("tools") ||
      detail.includes("function") ||
      detail.includes("not supported") ||
      String(status) === "400"
    ) {
      console.warn("当前模型可能不支持工具调用，降级为普通对话:", detail);
      const content = await complete(messages, { model, temperature, maxTokens });
      return { content };
    }

    throw friendlyError(config.name, err);
  }
}

/**
 * 流式 + 工具调用：支持在 Agent Loop 中使用。
 * - 模型输出文本时逐 token 回调 onToken；
 * - 模型发起工具调用时解析增量 tool_calls 片段并返回完整 ToolCall 列表；
 * - 流式不支持时自动降级为 completeWithTools。
 */
export async function completeStreamWithTools(
  messages: LLMMessage[],
  tools: ToolSchema[],
  onToken: ((token: string) => void) | undefined,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<LLMResponse> {
  const { client, config } = createClient();
  const {
    model = config.model,
    temperature = 0.7,
    maxTokens = 500,
  } = options;

  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  // 没有工具时直接走纯流式
  if (openaiTools.length === 0) {
    const content = await completeStream(
      messages,
      onToken || (() => {}),
      { model, temperature, maxTokens }
    );
    return { content };
  }

  try {
    const response = await client.chat.completions.create({
      model,
      messages: messages as any,
      tools: openaiTools,
      tool_choice: "auto",
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    let content = "";
    let streamedAny = false;
    let usage: any = null;
    // tool_calls 增量按 index 累积
    const acc = new Map<
      number,
      { id: string; name: string; args: string }
    >();

    for await (const chunk of response) {
      if ((chunk as any).usage) usage = (chunk as any).usage;
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta: any = choice.delta || {};

      if (delta.content) {
        content += delta.content;
        streamedAny = true;
        onToken?.(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur =
            acc.get(idx) || { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          acc.set(idx, cur);
        }
      }
    }
    captureUsage(config.name, usage);

    if (acc.size > 0) {
      const toolCalls: ToolCall[] = Array.from(acc.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([_, v]) => ({
          id: v.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: v.name,
          arguments: safeParseArgs(v.args),
        }))
        .filter((tc) => tc.name);
      if (toolCalls.length > 0) {
        return { content, toolCalls };
      }
    }
    return { content };
  } catch (err: any) {
    // 流式工具调用不被支持时，降级为非流式工具调用
    console.warn(
      "流式工具调用失败，降级为非流式调用:",
      err?.message || err
    );
    const result = await completeWithTools(messages, tools, {
      model,
      temperature,
      maxTokens,
    });
    // 降级时一次性回调内容（避免前端完全没有流式输出）
    if (result.content && !onToken) {
      // 无回调直接返回
    } else if (result.content) {
      onToken!(result.content);
    }
    return { content: result.content, toolCalls: result.toolCalls };
  }
}

function safeParseArgs(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// 返回 null 表示当前没有任何模型配置了可用的 embedding（调用方需降级处理）
export async function getEmbedding(text: string): Promise<number[] | null> {
  const config = getCurrentModel();

  // 1. 优先用当前模型的 embedding
  if (config.embeddingModel && config.apiKey) {
    try {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: REQUEST_TIMEOUT_MS,
      });
      const response = await client.embeddings.create({
        model: config.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      console.warn(`当前模型 ${config.name} 的 embedding 调用失败，尝试其他模型:`, err);
    }
  }

  // 2. fallback：找第一个（非当前）配置了 embedding 模型和 apiKey 的
  const allModels = listModels();
  for (const m of allModels) {
    if (m.id === config.id) continue;
    if (m.embeddingModel && m.apiKey) {
      try {
        const client = new OpenAI({
          apiKey: m.apiKey,
          baseURL: m.baseURL,
          timeout: REQUEST_TIMEOUT_MS,
        });
        const response = await client.embeddings.create({
          model: m.embeddingModel,
          input: text,
        });
        return response.data[0].embedding;
      } catch (err) {
        console.warn(`模型 ${m.name} 的 embedding 调用失败:`, err);
      }
    }
  }

  // 没有可用的 embedding 模型，返回 null（不让整个对话崩溃）
  return null;
}
