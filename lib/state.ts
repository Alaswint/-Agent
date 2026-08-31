import { AgentState } from "@/lib/types";

const DEFAULT_STATE: AgentState = {
  mood: 0,
  affection: 0,
  trust: 0,
  plotStage: "初识",
  energy: 50,
  openness: 0,
  dominance: 0,
};

export class StateManager {
  private state: AgentState;
  private stateHistory: AgentState[] = [];
  private maxHistory = 50;

  constructor(initial: AgentState) {
    this.state = { ...DEFAULT_STATE, ...initial };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getStateHistory(): AgentState[] {
    return [...this.stateHistory];
  }

  update(impact: Partial<AgentState>) {
    // 保存历史
    this.stateHistory.push({ ...this.state });
    if (this.stateHistory.length > this.maxHistory) {
      this.stateHistory.shift();
    }

    // 数值型状态更新
    if (impact.mood !== undefined) {
      this.state.mood = this.applyDecay(this.state.mood, impact.mood, 0.9);
    }
    if (impact.affection !== undefined) {
      this.state.affection = this.applyDecay(this.state.affection, impact.affection, 0.85);
    }
    if (impact.trust !== undefined) {
      this.state.trust = this.applyDecay(this.state.trust, impact.trust, 0.8);
    }
    if (impact.energy !== undefined) {
      this.state.energy = clamp(this.state.energy + impact.energy, -100, 100);
    }
    if (impact.openness !== undefined) {
      this.state.openness = clamp(this.state.openness + impact.openness, -100, 100);
    }
    if (impact.dominance !== undefined) {
      this.state.dominance = clamp(this.state.dominance + impact.dominance, -100, 100);
    }

    // 剧情阶段更新
    if (impact.plotStage !== undefined) {
      this.state.plotStage = impact.plotStage;
    }

    // 自然衰减
    this.naturalDecay();
  }

  // 带衰减的累加：新值影响随时间递减
  private applyDecay(current: number, delta: number, factor: number): number {
    const effectiveDelta = delta * factor;
    return clamp(current + effectiveDelta, -100, 100);
  }

  // 自然衰减：精力、心情会缓慢回归自然水平
  private naturalDecay() {
    // 精力向 0 衰减
    if (this.state.energy > 0) this.state.energy = Math.max(0, this.state.energy - 0.5);
    if (this.state.energy < 0) this.state.energy = Math.min(0, this.state.energy + 0.3);

    // 心情向 0 衰减（更慢）
    if (this.state.mood > 0) this.state.mood = Math.max(0, this.state.mood - 0.2);
    if (this.state.mood < 0) this.state.mood = Math.min(0, this.state.mood + 0.2);
  }

  // 获取状态变化趋势
  getTrend(): { moodTrend: "up" | "down" | "stable"; affectionTrend: "up" | "down" | "stable" } {
    if (this.stateHistory.length < 3) return { moodTrend: "stable", affectionTrend: "stable" };

    const recent = this.stateHistory.slice(-3);
    const moodDiff = recent[recent.length - 1].mood - recent[0].mood;
    const affectionDiff = recent[recent.length - 1].affection - recent[0].affection;

    return {
      moodTrend: moodDiff > 5 ? "up" : moodDiff < -5 ? "down" : "stable",
      affectionTrend: affectionDiff > 5 ? "up" : affectionDiff < -5 ? "down" : "stable",
    };
  }

  // 获取状态描述
  getStateDescription(): string {
    const s = this.state;
    const parts: string[] = [];

    if (s.mood > 50) parts.push("心情极好");
    else if (s.mood > 20) parts.push("心情不错");
    else if (s.mood < -50) parts.push("心情极差");
    else if (s.mood < -20) parts.push("心情低落");

    if (s.affection > 50) parts.push("非常喜欢你");
    else if (s.affection > 20) parts.push("对你有好感");
    else if (s.affection < -50) parts.push("很讨厌你");
    else if (s.affection < -20) parts.push("对你冷淡");

    if (s.trust > 50) parts.push("完全信任你");
    else if (s.trust > 20) parts.push("开始信任你");
    else if (s.trust < -50) parts.push("完全不信任你");

    if (s.energy < -30) parts.push("疲惫不堪");
    else if (s.energy > 50) parts.push("精力充沛");

    return parts.join("，") || "状态平稳";
  }

  reset(initial: AgentState) {
    this.state = { ...DEFAULT_STATE, ...initial };
    this.stateHistory = [];
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
