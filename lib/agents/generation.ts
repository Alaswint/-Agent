import { Character, AgentState, UnderstandingResult } from "@/lib/types";
import { MemoryStore } from "@/lib/memory";
import { complete, completeStream } from "@/lib/llm";
import { PromptEngine, PromptContext } from "@/lib/prompt-engine";
import { StreamChunk } from "@/lib/types";

export class GenerationAgent {
  async generateWithPrompt(
    character: Character,
    userInput: string,
    understanding: UnderstandingResult,
    state: AgentState,
    memory: MemoryStore,
    promptEngine: PromptEngine,
    promptCtx: PromptContext,
    onStream?: (chunk: StreamChunk) => void
  ): Promise<string> {
    const systemPrompt = promptEngine.buildSystemPrompt(promptCtx);
    const userPrompt = promptEngine.buildUserPrompt(promptCtx);

    // 流式输出：逐 token 发送
    if (onStream) {
      // 先发送 system prompt 摘要（调试用）
      onStream({
        type: "state",
        data: {
          state,
          understanding,
          plotHint: promptCtx.plotContext,
        },
      });
    }

    // 流式输出：真实逐 token 输出；无 onStream 时一次性完成
    let reply: string;
    if (onStream) {
      reply = await completeStream(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        (token) => onStream!({ type: "token", data: token }),
        { temperature: 0.85, maxTokens: 500 }
      );
      // 某些服务可能返回空流，兜底
      if (!reply) reply = "";
    } else {
      reply = await complete(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.85, maxTokens: 500 }
      );
    }

    return reply;
  }

  // 兼容旧接口
  async generate(
    character: Character,
    userInput: string,
    understanding: UnderstandingResult,
    state: AgentState,
    memory: MemoryStore
  ): Promise<string> {
    const promptEngine = new PromptEngine();
    const relevant = await memory.retrieveRelevant(userInput, 3);
    const longTermContext = relevant
      .map((m) => `- ${m.summary || m.content}`)
      .join("\n") || "";
    const shortTerm = memory.getShortTerm().map((m) => m.content).join("\n");

    const promptCtx: PromptContext = {
      character,
      state,
      userInput,
      emotion: understanding.emotion,
      intent: understanding.intent,
      shortTermMemory: shortTerm,
      longTermMemory: longTermContext,
      plotContext: "",
      turnCount: 0,
    };

    return this.generateWithPrompt(
      character,
      userInput,
      understanding,
      state,
      memory,
      promptEngine,
      promptCtx
    );
  }
}
