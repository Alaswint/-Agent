import { Character, ChatResponse, Message } from "@/lib/types";
import { MemoryStore } from "@/lib/memory";
import { StateManager } from "@/lib/state";
import { InputUnderstandingAgent } from "@/lib/agents/input-understanding";
import { PostProcessAgent } from "@/lib/agents/post-process";
import { PromptEngine, PromptContext } from "@/lib/prompt-engine";
import { PlotSystem } from "@/lib/plot";
import { saveChatHistory, loadChatHistory, ChatMessage } from "@/lib/chat-history";
import { toolRegistry } from "@/lib/tools/registry";
import { Tool, ToolResult } from "@/lib/tools/types";
import { getDynamicTools, resolveDynamicTool } from "@/lib/dynamic-tools";
import {
  runAgentLoop,
  toolCallsToAssistantMessage,
  toolResultToMessage,
  withTimeout,
  shouldPostProcess,
  LLMMessage,
  AgentLoopResult,
} from "@/lib/agent-loop";
import { completeStreamWithTools } from "@/lib/llm";
import {
  getToolSettings,
  isToolEnabled,
  requiresApproval,
} from "@/lib/tools/tool-settings";
import { logToolExecution } from "@/lib/tools/audit";
import { getUsage } from "@/lib/usage";

/** 提供给 LLM 的历史消息条数 */
const HISTORY_WINDOW = 12;

interface PendingApproval {
  toolCalls: import("@/lib/tools/types").ToolCall[];
  messages: LLMMessage[];
  iterationsUsed: number;
  understanding: import("@/lib/types").UnderstandingResult;
}

export class RoleplayEngine {
  private character: Character;
  private memory: MemoryStore;
  private state: StateManager;
  private inputAgent: InputUnderstandingAgent;
  private postAgent: PostProcessAgent;
  private promptEngine: PromptEngine;
  private plotSystem: PlotSystem;
  private turnCount = 0;
  private characterId: string;
  private chatMessages: ChatMessage[] = [];
  private pendingApproval: PendingApproval | null = null;

  constructor(character: Character, characterId: string) {
    this.character = character;
    this.characterId = characterId;
    this.memory = new MemoryStore(character.name);
    this.state = new StateManager(character.initialState);
    this.inputAgent = new InputUnderstandingAgent();
    this.postAgent = new PostProcessAgent();
    this.promptEngine = new PromptEngine();
    this.plotSystem = new PlotSystem();

    // 加载历史对话
    this.loadHistory();
  }

  /**
   * 加载历史对话
   */
  private loadHistory() {
    const session = loadChatHistory(this.characterId);
    if (session) {
      this.chatMessages = session.messages;
      // 将历史对话加载到短期记忆中
      for (const msg of session.messages.slice(-10)) {
        // 只加载最近10条到短期记忆
        const content = msg.role === "user" ? `用户：${msg.content}` : `${this.character.name}：${msg.content}`;
        this.memory.addShortTerm(content, 1);
      }
      this.turnCount = session.messages.filter((m) => m.role === "user").length;
    }
  }

  /**
   * 保存对话历史
   */
  private saveHistory() {
    saveChatHistory(this.characterId, this.character.name, this.chatMessages);
  }

  /** 执行单个工具（动态工具优先，统一走审计日志） */
  private async executeTool(
    toolCall: import("@/lib/tools/types").ToolCall,
    approved: boolean
  ): Promise<ToolResult> {
    // MCP / 插件工具不在静态注册表中，先走动态解析
    if (
      toolCall.name.startsWith("mcp__") ||
      toolCall.name.startsWith("plugin__")
    ) {
      const dynTool = await resolveDynamicTool(toolCall.name);
      if (dynTool) {
        let result: ToolResult;
        try {
          const text = await dynTool.handler(toolCall.arguments);
          result = { toolCallId: toolCall.id, name: toolCall.name, result: text };
        } catch (err: any) {
          result = {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: "",
            error: err?.message || String(err),
          };
        }
        logToolExecution({
          timestamp: Date.now(),
          tool: toolCall.name,
          args: toolCall.arguments,
          resultSummary: result.result,
          error: result.error,
          approved,
          characterId: this.characterId,
        });
        return result;
      }
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: "",
        error: `工具不存在或所属 MCP 服务器/插件不可用: ${toolCall.name}`,
      };
    }
    const result = await toolRegistry.execute(toolCall);
    logToolExecution({
      timestamp: Date.now(),
      tool: toolCall.name,
      args: toolCall.arguments,
      resultSummary: result.result,
      error: result.error,
      approved,
      characterId: this.characterId,
    });
    return result;
  }

  /** 当前启用的工具（静态注册表 + MCP/插件动态工具） */
  private async getEnabledTools(): Promise<Tool[]> {
    const staticTools = toolRegistry
      .getAllTools()
      .filter((t) => isToolEnabled(t.schema.name));
    const dynamic = await getDynamicTools();
    const dynamicTools = dynamic.tools.filter((t) => isToolEnabled(t.schema.name));
    return [...staticTools, ...dynamicTools];
  }

  /**
   * 构建初始消息：system prompt + 真实对话历史 + 当前输入
   */
  private buildMessages(promptCtx: PromptContext): LLMMessage[] {
    const systemPrompt = this.promptEngine.buildSystemPrompt(promptCtx);
    const userPrompt = this.promptEngine.buildUserPrompt(promptCtx);

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // 真实的多轮历史（LLM 第一次能看到完整上下文）
    const history = this.chatMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-HISTORY_WINDOW);
    for (const m of history) {
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }

    messages.push({ role: "user", content: userPrompt });
    return messages;
  }

  async chat(
    userInput: string,
    onStream?: (chunk: import("@/lib/types").StreamChunk) => void
  ): Promise<ChatResponse> {
    this.turnCount++;
    // 用户发起了新对话，丢弃上一轮未决的审批请求
    this.pendingApproval = null;

    // 1. 输入理解 与 记忆检索 并行执行（省一次串行等待）
    const [understanding, relevant] = await Promise.all([
      this.inputAgent.analyze(userInput),
      this.memory.retrieveRelevant(userInput, 3),
    ]);
    if (onStream) {
      onStream({ type: "understanding", data: understanding });
    }

    // 2. 状态更新
    this.state.update(understanding.impact);
    const currentState = this.state.getState();

    // 3. 剧情检测
    const plotEvent = this.plotSystem.checkTrigger(
      currentState,
      {
        keywords: understanding.keywords,
        intent: understanding.intent,
        triggerPlot: understanding.triggerPlot,
      },
      this.turnCount
    );
    if (plotEvent.triggered && plotEvent.effects) {
      this.state.update(plotEvent.effects);
    }
    if (onStream && plotEvent.triggered) {
      onStream({ type: "plot", data: plotEvent });
    }

    // 4. 构建 Prompt 上下文与消息
    const longTermContext = relevant
      .map((m) => `- ${m.summary || m.content}`)
      .join("\n") || "";
    const shortTerm = this.memory
      .getShortTerm()
      .map((m) => m.content)
      .join("\n");

    const enabledTools = await this.getEnabledTools();
    const promptCtx: PromptContext = {
      character: this.character,
      state: currentState,
      userInput,
      emotion: understanding.emotion,
      intent: understanding.intent,
      shortTermMemory: shortTerm,
      longTermMemory: longTermContext,
      plotContext: plotEvent.triggered
        ? `当前剧情：${plotEvent.node?.name} - ${plotEvent.node?.description}`
        : this.plotSystem.getPlotHint()
          ? `提示：${this.plotSystem.getPlotHint()}`
          : "",
      turnCount: this.turnCount,
      availableTools: enabledTools.map((t) => ({
        name: t.schema.name,
        description: t.schema.description,
      })),
    };

    if (onStream) {
      onStream({
        type: "state",
        data: { state: currentState, understanding, plotHint: promptCtx.plotContext },
      });
    }

    // 5. Agent Loop：多轮「LLM → 工具 → 观察 → 再决策」
    const settings = getToolSettings();
    const messages = this.buildMessages(promptCtx);

    const loop = await runAgentLoop({
      messages,
      tools: enabledTools.map((t) => t.schema),
      llmCall: (msgs, tools, onToken) =>
        completeStreamWithTools(msgs, tools, onToken, {
          temperature: 0.85,
          maxTokens: settings.maxTokens,
        }),
      maxIterations: settings.maxIterations,
      toolTimeoutMs: settings.toolTimeoutMs,
      executeTool: (tc) => this.executeTool(tc, false),
      needsApproval: requiresApproval,
      onToken: (t) => onStream?.({ type: "token", data: t }),
      onToolCall: (tc) =>
        onStream?.({
          type: "tool_call",
          data: { name: tc.name, args: tc.arguments, status: "calling" },
        }),
      onToolResult: (tr) =>
        onStream?.({
          type: "tool_call",
          data: { name: tr.name, result: tr.result, error: tr.error, status: "done" },
        }),
      onApprovalRequest: (toolCalls, msgs, iterationsUsed) => {
        this.pendingApproval = {
          toolCalls,
          messages: msgs,
          iterationsUsed,
          understanding,
        };
        onStream?.({
          type: "tool_approval",
          data: {
            characterId: this.characterId,
            toolCalls: toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.arguments,
            })),
          },
        });
      },
    });

    // 6. 暂停等待人工审批：以系统提示收尾，等待 /api/chat/approve 恢复
    if (loop.paused && loop.pendingToolCalls) {
      const names = loop.pendingToolCalls
        .map((tc) => tc.name)
        .map((n) => `「${n}」`)
        .join("、");
      const reply = `（我想要执行 ${names}，正在等待你的确认…点击输入框上方的「同意」或「拒绝」）`;
      return this.finalizeTurn(reply, userInput, understanding, loop, plotEvent, onStream, true);
    }

    return this.finalizeTurn(
      loop.reply,
      userInput,
      understanding,
      loop,
      plotEvent,
      onStream,
      false
    );
  }

  /**
   * 恢复被审批暂停的对话：批准则执行工具并继续循环；拒绝则告知模型换方式回应。
   */
  async resumeApproval(
    approved: boolean,
    onStream?: (chunk: import("@/lib/types").StreamChunk) => void
  ): Promise<ChatResponse> {
    if (!this.pendingApproval) {
      throw new Error("当前没有待审批的工具调用");
    }
    const pending = this.pendingApproval;
    this.pendingApproval = null;

    const settings = getToolSettings();
    const enabledTools = await this.getEnabledTools();

    // 补上 assistant 的工具调用消息 + 每个工具的结果消息
    const messages: LLMMessage[] = [
      ...pending.messages,
      toolCallsToAssistantMessage(null, pending.toolCalls),
    ];
    const toolResults: ToolResult[] = [];

    for (const tc of pending.toolCalls) {
      onStream?.({
        type: "tool_call",
        data: { name: tc.name, args: tc.arguments, status: "calling" },
      });
      let tr: ToolResult;
      if (approved) {
        try {
          tr = await withTimeout(
            this.executeTool(tc, true),
            settings.toolTimeoutMs,
            `工具 ${tc.name} `
          );
        } catch (err: any) {
          tr = {
            toolCallId: tc.id,
            name: tc.name,
            result: "",
            error: err?.message || String(err),
          };
        }
      } else {
        tr = {
          toolCallId: tc.id,
          name: tc.name,
          result: "用户拒绝了该操作。请不要再尝试执行，直接以角色口吻回应用户即可。",
        };
      }
      toolResults.push(tr);
      onStream?.({
        type: "tool_call",
        data: { name: tr.name, result: tr.result, error: tr.error, status: "done" },
      });
      messages.push(toolResultToMessage(tr));
    }

    // 继续剩余轮数的 Agent Loop
    const loop = await runAgentLoop({
      messages,
      tools: enabledTools.map((t) => t.schema),
      llmCall: (msgs, tools, onToken) =>
        completeStreamWithTools(msgs, tools, onToken, {
          temperature: 0.85,
          maxTokens: settings.maxTokens,
        }),
      maxIterations: settings.maxIterations,
      iterationsUsed: pending.iterationsUsed,
      toolTimeoutMs: settings.toolTimeoutMs,
      executeTool: (tc) => this.executeTool(tc, false),
      needsApproval: requiresApproval,
      onToken: (t) => onStream?.({ type: "token", data: t }),
      onToolCall: (tc) =>
        onStream?.({
          type: "tool_call",
          data: { name: tc.name, args: tc.arguments, status: "calling" },
        }),
      onToolResult: (tr) =>
        onStream?.({
          type: "tool_call",
          data: { name: tr.name, result: tr.result, error: tr.error, status: "done" },
        }),
      onApprovalRequest: (toolCalls, msgs, iterationsUsed) => {
        this.pendingApproval = {
          toolCalls,
          messages: msgs,
          iterationsUsed,
          understanding: pending.understanding,
        };
        onStream?.({
          type: "tool_approval",
          data: {
            characterId: this.characterId,
            toolCalls: toolCalls.map((tc) => ({
              name: tc.name,
              args: tc.arguments,
            })),
          },
        });
      },
    });

    if (loop.paused && loop.pendingToolCalls) {
      const names = loop.pendingToolCalls
        .map((tc) => `「${tc.name}」`)
        .join("、");
      const reply = `（我还需要执行 ${names}，正在等待你的确认…）`;
      return this.finalizeTurn(reply, "", pending.understanding, loop, undefined, onStream, true);
    }

    return this.finalizeTurn(
      loop.reply,
      "",
      pending.understanding,
      loop,
      undefined,
      onStream,
      false
    );
  }

  hasPendingApproval(): boolean {
    return this.pendingApproval !== null;
  }

  /**
   * 收尾：后处理（按需触发）→ 记忆存储 → 历史保存
   */
  private async finalizeTurn(
    reply: string,
    userInput: string,
    understanding: import("@/lib/types").UnderstandingResult,
    loop: AgentLoopResult,
    plotEvent: import("@/lib/types").PlotEvent | undefined,
    onStream: ((chunk: import("@/lib/types").StreamChunk) => void) | undefined,
    paused: boolean
  ): Promise<ChatResponse> {
    let finalReply = reply;

    // 后处理（合规检查）只在必要时触发，避免每轮多一次 LLM 调用
    if (!paused && reply) {
      const needCheck = shouldPostProcess(
        understanding.impact.mood || 0,
        understanding.urgency || 0,
        this.turnCount
      );
      if (needCheck) {
        const check = await this.postAgent.check(this.character, reply, userInput);
        if (check.revised && check.revised !== reply) {
          finalReply = check.revised;
          // 后处理改写了回复时，通知前端替换已流式显示的内容
          onStream?.({ type: "revision", data: finalReply });
        }
      }
    }

    // 记忆存储
    if (userInput) {
      this.memory.addShortTerm(`用户：${userInput}`, understanding.urgency || 1);
    }
    this.memory.addShortTerm(`${this.character.name}：${finalReply}`, 1);

    // 保存到对话历史
    if (userInput) {
      this.chatMessages.push({ role: "user", content: userInput, timestamp: Date.now() });
    }
    this.chatMessages.push({ role: "assistant", content: finalReply, timestamp: Date.now() });
    this.saveHistory();

    // 触发剧情或情绪强烈时存入长期记忆
    if (
      userInput &&
      (understanding.triggerPlot ||
        Math.abs(understanding.impact.mood || 0) > 5 ||
        understanding.urgency > 5)
    ) {
      await this.memory.addLongTerm(
        `【${this.character.name}的记忆】用户说："${userInput}"，我回复："${finalReply}"（情绪：${understanding.emotion}，意图：${understanding.intent}）`,
        Math.min(3, (understanding.urgency || 1) / 2 + 1)
      );
    }

    return {
      reply: finalReply,
      state: this.state.getState(),
      understanding,
      plotEvent: plotEvent?.triggered ? plotEvent : undefined,
      toolResults: loop.toolResults.length > 0 ? loop.toolResults : undefined,
      pendingApproval: paused || undefined,
      usage: getUsage().total,
    };
  }

  getHistory(): Message[] {
    return this.memory
      .getShortTerm()
      .map((m) => ({
        role: m.content.startsWith("用户：")
          ? ("user" as const)
          : ("assistant" as const),
        content: m.content.replace(/^(用户|.+?)：/, ""),
      }));
  }

  /**
   * 获取完整对话历史（用于显示）
   */
  getChatMessages(): ChatMessage[] {
    return this.chatMessages;
  }

  /**
   * 清空对话历史
   */
  clearHistory() {
    this.chatMessages = [];
    saveChatHistory(this.characterId, this.character.name, []);
  }

  reset() {
    this.state.reset(this.character.initialState);
    this.turnCount = 0;
    this.pendingApproval = null;
  }

  getCharacter(): Character {
    return this.character;
  }

  getCharacterId(): string {
    return this.characterId;
  }
}
