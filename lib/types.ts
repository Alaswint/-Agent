export interface Character {
  name: string;
  role: string;
  personality: string;
  background: string;
  speakingStyle: string;
  scene: string;
  initialState: AgentState;
  rules: string[];
  lore: string[];
  avatar?: string;
  colorTheme?: string;
}

export interface AgentState {
  mood: number;
  affection: number;
  trust: number;
  plotStage: string;
  // 新增维度
  energy: number;       // 精力 (-100 ~ 100)
  openness: number;     // 开放度 (-100 ~ 100)
  dominance: number;    // 主导性 (-100 ~ 100)
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface UnderstandingResult {
  emotion: string;
  intent: string;
  keywords: string[];
  triggerPlot: boolean;
  impact: Partial<AgentState>;
  urgency: number;      // 紧急程度 (0 ~ 10)
}

export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: number;
  importance: number;
  summary?: string;
  tags?: string[];
}

export interface ChatResponse {
  reply: string;
  state: AgentState;
  understanding: UnderstandingResult;
  plotEvent?: PlotEvent;
  toolResults?: any[];
  /** 本轮因等待工具审批而暂停 */
  pendingApproval?: boolean;
  /** 累计 token 用量 */
  usage?: { promptTokens: number; completionTokens: number; calls: number };
}

// 剧情系统
export interface PlotNode {
  id: string;
  name: string;
  description: string;
  triggerCondition: string;
  requiredState?: Partial<AgentState>;
  effects: Partial<AgentState>;
  dialogueHint?: string;
}

export interface PlotEvent {
  triggered: boolean;
  node?: PlotNode;
  effects?: Partial<AgentState>;
  message?: string;
}

export interface PlotSystem {
  currentStage: string;
  activeNodes: PlotNode[];
  completedNodes: string[];
}

// 流式输出
export interface StreamChunk {
  type:
    | "token"
    | "state"
    | "understanding"
    | "plot"
    | "done"
    | "error"
    | "tool_call"
    | "tool_approval"
    | "revision";
  data: any;
}
