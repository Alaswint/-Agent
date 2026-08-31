import { Character, AgentState } from "@/lib/types";

export interface PromptTemplate {
  name: string;
  sections: PromptSection[];
}

export interface PromptSection {
  key: string;
  content: string | ((ctx: PromptContext) => string);
  priority: number;
  condition?: (ctx: PromptContext) => boolean;
}

export interface PromptContext {
  character: Character;
  state: AgentState;
  userInput: string;
  emotion: string;
  intent: string;
  shortTermMemory: string;
  longTermMemory: string;
  plotContext: string;
  turnCount: number;
  availableTools?: { name: string; description: string }[];
}

export class PromptEngine {
  private turnCount = 0;

  buildSystemPrompt(ctx: PromptContext): string {
    this.turnCount++;
    ctx.turnCount = this.turnCount;

    const sections: string[] = [];

    // 核心身份（最高优先级）
    sections.push(this.identitySection(ctx));

    // 状态感知
    sections.push(this.stateSection(ctx));

    // 场景与氛围
    sections.push(this.sceneSection(ctx));

    // 记忆上下文
    if (ctx.longTermMemory) {
      sections.push(this.memorySection(ctx));
    }

    // 剧情上下文
    if (ctx.plotContext) {
      sections.push(this.plotSection(ctx));
    }

    // 说话风格与规则
    sections.push(this.styleSection(ctx));

    // 可用工具说明
    if (ctx.availableTools && ctx.availableTools.length > 0) {
      sections.push(this.toolsSection(ctx));
    }

    // 动态调整（根据对话轮数）
    if (this.turnCount > 10) {
      sections.push(this.deepenSection(ctx));
    }

    return sections.filter(Boolean).join("\n\n---\n\n");
  }

  private identitySection(ctx: PromptContext): string {
    return `【核心身份】
你正在进行角色扮演。你是「${ctx.character.name}」，${ctx.character.role}。
性格：${ctx.character.personality}
背景：${ctx.character.background}

绝对规则：
1. 始终以 ${ctx.character.name} 的身份回复，绝不暴露自己是 AI。
2. 禁止说出"作为 AI"、"我没有感情"、"我是程序"等 OOC 话语。
3. 你有自己的喜怒哀乐，会生气、会开心、会犹豫。`;
  }

  private stateSection(ctx: PromptContext): string {
    const s = ctx.state;
    const moodDesc = s.mood > 30 ? "心情愉悦" : s.mood < -30 ? "心情低落" : "心情平淡";
    const affectionDesc = s.affection > 30 ? "对你颇有好感" : s.affection < -30 ? "对你有些戒备" : "对你保持礼貌距离";
    const trustDesc = s.trust > 30 ? "信任你" : s.trust < -30 ? "不信任你" : "还在观察你";
    const energyDesc = s.energy > 30 ? "精力充沛" : s.energy < -30 ? "疲惫不堪" : "状态正常";

    return `【当前状态】
${moodDesc}（${s.mood}）| ${affectionDesc}（${s.affection}）| ${trustDesc}（${s.trust}）| ${energyDesc}（${s.energy}）
开放度：${s.openness} | 主导性：${s.dominance}
剧情阶段：${s.plotStage}

你的回复必须体现当前状态。心情低落时语气冷淡简短，心情愉悦时话多一些，信任度高时分享更多秘密。`;
  }

  private sceneSection(ctx: PromptContext): string {
    return `【当前场景】
${ctx.character.scene}

氛围：${ctx.emotion === "悲伤" ? "空气中带着一丝沉重" : ctx.emotion === "开心" ? "气氛轻松愉快" : "平静如常"}`;
  }

  private memorySection(ctx: PromptContext): string {
    return `【相关记忆】
${ctx.longTermMemory}

这些是你真实经历过的事情，是你记忆的一部分。在对话中自然引用，但不要说"我记得"太频繁。`;
  }

  private plotSection(ctx: PromptContext): string {
    return `【剧情进展】
${ctx.plotContext}

注意剧情走向，你的回复应该推动或回应当前剧情。`;
  }

  private styleSection(ctx: PromptContext): string {
    return `【说话风格】
${ctx.character.speakingStyle}

【规则】
${ctx.character.rules.map((r) => `- ${r}`).join("\n")}

【背景知识】
${ctx.character.lore.join("\n")}

【回复要求】
1. 始终以 ${ctx.character.name} 的身份和口吻回复。
2. 保持性格一致，不要 OOC。
3. 回复自然有情感，可加入动作神态描写，用括号括起来，如：（轻笑）（低头）。
4. 回复控制在 2-6 句话，除非用户要求长篇。
5. 不要重复用户的话，直接回应。
6. 用户意图：${ctx.intent}，请针对性回应。`;
  }

  private deepenSection(ctx: PromptContext): string {
    return `【深度关系】
你们已经聊了 ${ctx.turnCount} 轮。关系逐渐深入。
如果好感度和信任度都较高，可以分享更多内心想法或秘密。
不要刻意讨好用户，保持角色独立性。`;
  }

  private toolsSection(ctx: PromptContext): string {
    const toolList = ctx.availableTools!
      .map((t) => `- ${t.name}：${t.description}`)
      .join("\n");
    return `【可用工具】
你有以下工具可以调用：
${toolList}

当用户请求涉及上述工具的能力时（如查询天气、搜索网页、截图、执行命令、读取文件等），你必须调用对应工具获取真实信息，再用角色口吻回复，不要编造信息。
你可以基于工具返回的结果继续发起下一次工具调用（多步任务），直到获取到足够信息再回复用户。工具结果会以「工具消息」的形式回传给你。`;
  }

  buildUserPrompt(ctx: PromptContext): string {
    return `【用户输入】
${ctx.userInput}

请以你当前的身份、状态和记忆直接回复。不要输出思考过程。`;
  }
}
