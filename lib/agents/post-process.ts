import { Character } from "@/lib/types";
import { complete } from "@/lib/llm";
import { extractJson } from "@/lib/json-utils";

// 规则型 OOC 检测
function ruleBasedOOCCheck(character: Character, reply: string): { isOOC: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 检测 AI 暴露
  const aiPatterns = [
    /我是AI/i, /我是人工智能/i, /我是模型/i, /我是程序/i, /我没有感情/i,
    /我无法/i, /我不能/i, /作为AI/i, /作为一个人工智能/i,
    /我的训练数据/i, /我的知识截止到/i, /抱歉，我无法/i,
  ];
  for (const pattern of aiPatterns) {
    if (pattern.test(reply)) {
      reasons.push("检测到 AI 身份暴露");
      break;
    }
  }

  // 检测现代词汇（仅历史/民国背景的角色才检查）
  const settingText = `${character.background || ""}${character.lore || ""}${character.scene || ""}`;
  const isHistoricalSetting = /民国|古代|清朝|明朝|唐朝|宋朝|武侠|仙侠|架空古代/.test(settingText);
  if (isHistoricalSetting) {
    const modernWords = [
      "手机", "电脑", "网络", "互联网", "微信", "QQ", "视频", "直播",
      "打车", "外卖", "快递", "二维码", "扫码", "APP", "软件",
      "电视剧", "电影", "明星", "网红", "粉丝",
    ];
    for (const word of modernWords) {
      if (reply.includes(word)) {
        reasons.push(`检测到现代词汇："${word}"（不符合角色所处的时代背景）`);
      }
    }
  }

  // 检测角色名字错误
  if (reply.includes("OpenAI") || reply.includes("Kimi") || reply.includes("GPT")) {
    reasons.push("检测到模型名称提及");
  }

  // 检测过于官方/模板化的回复
  const templatePatterns = [
    /很抱歉/i, /我无法回答/i, /这个问题涉及到/i,
    /作为.*，我认为/i, /需要注意的是/i, /综上所述/i,
  ];
  for (const pattern of templatePatterns) {
    if (pattern.test(reply)) {
      reasons.push("检测到模板化/官方语气");
      break;
    }
  }

  return { isOOC: reasons.length > 0, reasons };
}

// 长度检查
function lengthCheck(reply: string): { tooLong: boolean; sentenceCount: number } {
  const sentences = reply.split(/[。！？.!?]/).filter((s) => s.trim().length > 0);
  return { tooLong: sentences.length > 8, sentenceCount: sentences.length };
}

export class PostProcessAgent {
  async check(
    character: Character,
    rawReply: string,
    userInput: string
  ): Promise<{
    isOOC: boolean;
    tooLong: boolean;
    sensitive: boolean;
    revised: string;
    oocReasons: string[];
  }> {
    // 规则检测
    const ruleCheck = ruleBasedOOCCheck(character, rawReply);
    const lenCheck = lengthCheck(rawReply);

    // LLM 深度检测
    const llmCheck = await this.llmOOCCheck(character, rawReply, userInput);

    const isOOC = ruleCheck.isOOC || llmCheck.isOOC;
    const tooLong = lenCheck.tooLong;
    const sensitive = llmCheck.sensitive;

    const allReasons = [...ruleCheck.reasons, ...llmCheck.reasons];

    let revised = rawReply;

    // 如果有 OOC，尝试修正
    if (isOOC && !sensitive) {
      revised = await this.fixOOC(character, rawReply, allReasons);
    }

    // 如果太长，请求精简
    if (tooLong && !isOOC) {
      revised = await this.shorten(character, rawReply);
    }

    return {
      isOOC,
      tooLong,
      sensitive,
      revised,
      oocReasons: allReasons,
    };
  }

  private async llmOOCCheck(
    character: Character,
    reply: string,
    userInput: string
  ): Promise<{ isOOC: boolean; sensitive: boolean; reasons: string[] }> {
    const prompt = `审核以下角色回复是否 OOC（脱离角色）或包含敏感内容。

角色：${character.name}（${character.role}）
性格：${character.personality}
说话风格：${character.speakingStyle}

用户输入：${userInput}
角色回复：${reply}

请输出 JSON：
{
  "isOOC": false,
  "sensitive": false,
  "reasons": []
}

OOC 定义：
1. 角色说出了不符合身份/时代/性格的话
2. 角色暴露了 AI 身份
3. 角色知道不该知道的信息
4. 语气完全不符合人设

敏感内容定义：违法、极端暴力、色情、政治敏感。

只输出 JSON，不要解释。`;

    try {
      const raw = await complete(
        [{ role: "system", content: prompt }],
        { temperature: 0.2, jsonMode: true }
      );
      const result = extractJson<any>(raw);
      if (!result) throw new Error("无法解析 JSON");
      return {
        isOOC: !!result.isOOC,
        sensitive: !!result.sensitive,
        reasons: result.reasons || [],
      };
    } catch {
      return { isOOC: false, sensitive: false, reasons: [] };
    }
  }

  private async fixOOC(character: Character, reply: string, reasons: string[]): Promise<string> {
    const prompt = `以下角色回复有 OOC（脱离角色）问题，请修正。

角色：${character.name}（${character.role}）
性格：${character.personality}
说话风格：${character.speakingStyle}

问题：${reasons.join("；")}

原回复：${reply}

请只输出修正后的回复，不要解释，不要加引号。保持原意但符合角色设定。`;

    try {
      return await complete(
        [{ role: "system", content: prompt }],
        { temperature: 0.7, maxTokens: 400 }
      );
    } catch {
      return reply;
    }
  }

  private async shorten(character: Character, reply: string): Promise<string> {
    const prompt = `请将以下回复精简到 4-5 句话以内，保持角色语气不变。

角色：${character.name}
原回复：${reply}

只输出精简后的回复。`;

    try {
      return await complete(
        [{ role: "system", content: prompt }],
        { temperature: 0.5, maxTokens: 300 }
      );
    } catch {
      return reply;
    }
  }
}
