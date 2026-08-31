// 工具配置：启用开关 / 审批模式 / Agent 参数，持久化到 data/tool-settings.json
import * as fs from "fs";
import * as path from "path";

function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

// 惰性解析：每次调用时确定，方便测试用 PROJECT_ROOT 指向临时目录
function settingsFile(): string {
  return path.join(getProjectRoot(), "data", "tool-settings.json");
}

/** 需要人工批准的高危工具 */
export const HIGH_RISK_TOOLS = new Set([
  "run_command",
  "write_file",
  "open_application",
  "take_desktop_screenshot",
]);

/** 工具分类（用于设置界面分组展示） */
export const TOOL_CATEGORIES: Record<string, string> = {
  get_weather: "实用",
  web_search: "实用",
  calculate: "实用",
  get_current_time: "实用",
  set_reminder: "实用",
  browse_webpage: "浏览器",
  search_webpage: "浏览器",
  screenshot_webpage: "浏览器",
  run_command: "系统",
  read_file: "系统",
  write_file: "系统",
  list_directory: "系统",
  open_application: "系统",
  system_info: "系统",
  take_desktop_screenshot: "系统",
  list_processes: "系统",
};

export interface ToolSettings {
  /** 工具名 → 是否启用（未记录的默认启用） */
  enabled: Record<string, boolean>;
  /** manual = 高危工具需人工批准；auto = 全部自动执行 */
  approvalMode: "auto" | "manual";
  /** Agent 循环最大轮数 */
  maxIterations: number;
  /** 生成回复的 max tokens */
  maxTokens: number;
  /** 单个工具执行超时（毫秒） */
  toolTimeoutMs: number;
}

const DEFAULT_SETTINGS: ToolSettings = {
  enabled: {},
  approvalMode: "manual",
  maxIterations: 5,
  maxTokens: 2048,
  toolTimeoutMs: 30000,
};

function ensureDir() {
  const dir = path.dirname(settingsFile());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getToolSettings(): ToolSettings {
  try {
    if (fs.existsSync(settingsFile())) {
      const data = JSON.parse(fs.readFileSync(settingsFile(), "utf-8"));
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch {
    // 损坏则回退默认
  }
  return { ...DEFAULT_SETTINGS, enabled: {} };
}

export function updateToolSettings(
  updates: Partial<Omit<ToolSettings, "enabled">> & {
    enabled?: Record<string, boolean>;
  }
): ToolSettings {
  const current = getToolSettings();
  const next: ToolSettings = {
    ...current,
    ...updates,
    enabled: { ...current.enabled, ...(updates.enabled || {}) },
    // 参数合法性钳制
    maxIterations: Math.max(1, Math.min(10, Number(updates.maxIterations ?? current.maxIterations) || current.maxIterations)),
    maxTokens: Math.max(200, Math.min(32000, Number(updates.maxTokens ?? current.maxTokens) || current.maxTokens)),
    toolTimeoutMs: Math.max(5000, Math.min(300000, Number(updates.toolTimeoutMs ?? current.toolTimeoutMs) || current.toolTimeoutMs)),
  };
  ensureDir();
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function isToolEnabled(name: string): boolean {
  const settings = getToolSettings();
  const v = settings.enabled[name];
  return v === undefined ? true : !!v;
}

/** 该工具在当前模式下是否需要人工批准 */
export function requiresApproval(name: string): boolean {
  const settings = getToolSettings();
  return settings.approvalMode === "manual" && HIGH_RISK_TOOLS.has(name);
}
