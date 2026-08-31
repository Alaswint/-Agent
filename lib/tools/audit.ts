// 工具执行审计日志：JSONL 追加写入 data/audit.log
// 记录每次工具执行的名称、参数、结果摘要与是否经人工批准，便于事后追溯。
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
const AUDIT_FILE = path.join(PROJECT_ROOT, "data", "audit.log");
const MAX_LOG_SIZE = 1024 * 1024; // 1MB，超过则轮转为 audit.log.old

export interface AuditEntry {
  timestamp: number;
  tool: string;
  args: Record<string, any>;
  /** 结果摘要（截断） */
  resultSummary?: string;
  error?: string;
  /** 是否经过人工批准执行（auto 模式为 false） */
  approved: boolean;
  characterId?: string;
}

export function logToolExecution(entry: AuditEntry): void {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 简单轮转
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const size = fs.statSync(AUDIT_FILE).size;
        if (size > MAX_LOG_SIZE) {
          const old = AUDIT_FILE + ".old";
          try {
            if (fs.existsSync(old)) fs.unlinkSync(old);
          } catch {}
          fs.renameSync(AUDIT_FILE, old);
        }
      }
    } catch {
      // 轮转失败不影响写入
    }

    const line = JSON.stringify({
      ...entry,
      resultSummary: entry.resultSummary?.substring(0, 500),
    });
    fs.appendFileSync(AUDIT_FILE, line + "\n", "utf-8");
  } catch {
    // 审计失败不影响主流程
  }
}

/** 读取最近的审计记录（默认最近 100 条） */
export function readAuditTrail(limit = 100): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as AuditEntry[];
  } catch {
    return [];
  }
}
