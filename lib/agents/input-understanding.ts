import { UnderstandingResult } from "@/lib/types";
import { complete } from "@/lib/llm";
import { extractJson } from "@/lib/json-utils";

export class InputUnderstandingAgent {
  async analyze(userInput: string): Promise<UnderstandingResult> {
    const prompt = `你是一名输入理解专家。请分析用户的输入，并以 JSON 格式输出分析结果。

需要分析的维度：
- emotion: 用户当前情绪（如：开心、愤怒、悲伤、好奇、焦虑、中性等）
- intent: 用户意图（如：问候、提问、倾诉、调情、挑衅、剧情触发、日常对话等）
- triggerPlot: 是否触发了新的剧情事件（true/false），剧情事件指改变了当前场景或引入新人物/冲突
- keywords: 提取 2-5 个与角色记忆相关的关键词
- urgency: 紧急程度（0-10），用户是否急于得到回应或情绪激烈
- impact: 对角色状态的影响：
  * mood（心情）：-10 到 +10
  * affection（好感度）：-10 到 +10
  * trust（信任度）：-10 到 +10
  * energy（精力）：-10 到 +10，用户的话是否让角色感到疲惫或振奋
  * openness（开放度）：-10 到 +10，用户是否让角色愿意敞开心扉
  * dominance（主导性）：-10 到 +10，用户是在服从还是挑战角色的权威

请只输出 JSON，不要输出任何解释。`;

    const raw = await complete(
      [
        { role: "system", content: prompt },
        { role: "user", content: userInput },
      ],
      { temperature: 0.3, jsonMode: true }
    );

    try {
      const result = extractJson<any>(raw);
      if (!result) throw new Error("无法解析 JSON");

      return {
        emotion: result.emotion || "中性",
        intent: result.intent || "日常对话",
        keywords: result.keywords || [],
        triggerPlot: !!result.triggerPlot,
        urgency: result.urgency || 0,
        impact: {
          mood: result.impact?.mood || 0,
          affection: result.impact?.affection || 0,
          trust: result.impact?.trust || 0,
          energy: result.impact?.energy || 0,
          openness: result.impact?.openness || 0,
          dominance: result.impact?.dominance || 0,
          plotStage: result.impact?.plotStage,
        },
      };
    } catch {
      // JSON 解析失败，返回默认值
      return {
        emotion: "中性",
        intent: "日常对话",
        keywords: [],
        triggerPlot: false,
        urgency: 0,
        impact: {
          mood: 0,
          affection: 0,
          trust: 0,
          energy: 0,
          openness: 0,
          dominance: 0,
        },
      };
    }
  }
}
