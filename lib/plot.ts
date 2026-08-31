import { PlotNode, PlotEvent, AgentState } from "@/lib/types";

const DEFAULT_PLOTS: PlotNode[] = [
  {
    id: "first_meeting",
    name: "初次相遇",
    description: "用户第一次走进茶馆，林婉礼貌接待",
    triggerCondition: "turnCount <= 3",
    effects: { plotStage: "初识" },
    dialogueHint: "保持礼貌疏离，观察对方",
  },
  {
    id: "tea_talk",
    name: "品茶闲谈",
    description: "聊了几句后，氛围放松下来",
    triggerCondition: "turnCount > 3 && affection > 10",
    effects: { openness: 10 },
    dialogueHint: "可以稍微放松，分享一些茶馆琐事",
  },
  {
    id: "secret_hint",
    name: "秘密暗示",
    description: "用户表现出对古董的兴趣，林婉试探",
    triggerCondition: "keywords.includes('古董') || keywords.includes('宝贝')",
    requiredState: { trust: 20 },
    effects: { plotStage: "试探" },
    dialogueHint: "眼神闪烁，欲言又止，试探对方来意",
  },
  {
    id: "open_heart",
    name: "敞开心扉",
    description: "好感度和信任度都足够高，林婉愿意分享往事",
    triggerCondition: "affection > 50 && trust > 50",
    effects: { plotStage: "深交", openness: 20 },
    dialogueHint: "语气柔和，愿意分享过去的伤痛",
  },
  {
    id: "angry_conflict",
    name: "冲突爆发",
    description: "用户说了冒犯的话，林婉生气",
    triggerCondition: "mood < -40 || intent === '挑衅'",
    effects: { affection: -20, trust: -15 },
    dialogueHint: "语气变冷，放下茶盏，不再客气",
  },
];

export class PlotSystem {
  private plots: PlotNode[];
  private completedPlots: Set<string> = new Set();
  private currentPlot: PlotNode | null = null;
  private turnCount = 0;

  constructor(customPlots?: PlotNode[]) {
    this.plots = customPlots || DEFAULT_PLOTS;
  }

  checkTrigger(
    state: AgentState,
    understanding: {
      keywords: string[];
      intent: string;
      triggerPlot: boolean;
    },
    turnCount: number
  ): PlotEvent {
    this.turnCount = turnCount;

    // 检查每个未完成的剧情
    for (const plot of this.plots) {
      if (this.completedPlots.has(plot.id)) continue;

      if (this.matchesCondition(plot, state, understanding)) {
        this.completedPlots.add(plot.id);
        this.currentPlot = plot;

        return {
          triggered: true,
          node: plot,
          effects: plot.effects,
          message: `剧情触发：${plot.name} - ${plot.description}`,
        };
      }
    }

    return { triggered: false };
  }

  getCurrentPlot(): PlotNode | null {
    return this.currentPlot;
  }

  getPlotHint(): string {
    return this.currentPlot?.dialogueHint || "";
  }

  private matchesCondition(
    plot: PlotNode,
    state: AgentState,
    understanding: { keywords: string[]; intent: string; triggerPlot: boolean }
  ): boolean {
    // 检查状态要求
    if (plot.requiredState) {
      for (const [key, value] of Object.entries(plot.requiredState)) {
        const stateValue = (state as any)[key];
        if (stateValue === undefined || stateValue < value!) return false;
      }
    }

    // 解析触发条件
    const condition = plot.triggerCondition;

    // 关键词检查
    if (condition.includes("keywords.includes")) {
      const match = condition.match(/keywords\.includes\('(.+?)'\)/g);
      if (match) {
        const requiredKeywords = match.map((m) => m.match(/'(.+?)'/)![1]);
        const hasKeyword = requiredKeywords.some((k) => understanding.keywords.includes(k));
        if (!hasKeyword) return false;
      }
    }

    // 意图检查
    if (condition.includes("intent ===")) {
      const match = condition.match(/intent === '(.+?)'/);
      if (match && understanding.intent !== match[1]) return false;
    }

    // 数值检查
    if (condition.includes("mood <")) {
      const match = condition.match(/mood < (-?\d+)/);
      if (match && state.mood >= parseInt(match[1])) return false;
    }

    if (condition.includes("affection >")) {
      const match = condition.match(/affection > (\d+)/);
      if (match && state.affection <= parseInt(match[1])) return false;
    }

    if (condition.includes("trust >")) {
      const match = condition.match(/trust > (\d+)/);
      if (match && state.trust <= parseInt(match[1])) return false;
    }

    // 轮数检查
    if (condition.includes("turnCount <=")) {
      const match = condition.match(/turnCount <= (\d+)/);
      if (match && this.turnCount > parseInt(match[1])) return false;
    }

    if (condition.includes("turnCount >")) {
      const match = condition.match(/turnCount > (\d+)/);
      if (match && this.turnCount <= parseInt(match[1])) return false;
    }

    return true;
  }
}
