// Token 用量统计：按模型累计 prompt/completion tokens，持久化到 data/usage.json
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

const PROJECT_ROOT = getProjectRoot();
const USAGE_FILE = path.join(PROJECT_ROOT, "data", "usage.json");

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

export interface UsageStats {
  byModel: Record<string, ModelUsage>;
  lastUpdated: number;
}

const globalAny = globalThis as any;
const stats: UsageStats =
  globalAny.__roleplayUsage ||
  (globalAny.__roleplayUsage = loadFromDisk());

function loadFromDisk(): UsageStats {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
      if (data && typeof data.byModel === "object") {
        return { byModel: data.byModel, lastUpdated: data.lastUpdated || 0 };
      }
    }
  } catch {
    // ignore
  }
  return { byModel: {}, lastUpdated: 0 };
}

function persist() {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2), "utf-8");
  } catch {
    // 统计失败不影响主流程
  }
}

export function recordUsage(
  modelName: string,
  usage: { promptTokens?: number; completionTokens?: number } | undefined
) {
  if (!usage) return;
  const key = modelName || "unknown";
  if (!stats.byModel[key]) {
    stats.byModel[key] = { promptTokens: 0, completionTokens: 0, calls: 0 };
  }
  stats.byModel[key].promptTokens += usage.promptTokens || 0;
  stats.byModel[key].completionTokens += usage.completionTokens || 0;
  stats.byModel[key].calls += 1;
  stats.lastUpdated = Date.now();
  persist();
}

export function getUsage(): UsageStats & { total: ModelUsage } {
  const total: ModelUsage = { promptTokens: 0, completionTokens: 0, calls: 0 };
  for (const m of Object.values(stats.byModel)) {
    total.promptTokens += m.promptTokens;
    total.completionTokens += m.completionTokens;
    total.calls += m.calls;
  }
  return { ...stats, total };
}

export function resetUsage(): void {
  stats.byModel = {};
  stats.lastUpdated = Date.now();
  persist();
}
