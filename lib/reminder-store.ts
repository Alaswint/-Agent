import * as fs from "fs";
import * as path from "path";

/**
 * 提醒存储 + 调度器
 * 提醒持久化到 data/reminders.json，服务端每 15 秒扫描一次，
 * 到期的提醒标记为 triggered，由前端轮询 /api/reminders 拉取并弹出通知。
 */

export interface Reminder {
  id: string;
  content: string;
  /** 原始时间描述（如"明天下午3点"） */
  timeText: string;
  /** 到期时间 ISO 字符串 */
  dueAt: string;
  createdAt: number;
  /** 关联角色（可选） */
  characterId?: string;
  /** 触发时间戳（毫秒），未触发为空 */
  triggeredAt?: number;
  /** 前端已确认知晓（可删除） */
  acked?: boolean;
}

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
const REMINDERS_FILE = path.join(PROJECT_ROOT, "data", "reminders.json");
/** 已触发未确认的提醒保留时长：7 天后自动清理 */
const TRIGGERED_TTL_MS = 7 * 24 * 3600 * 1000;

class ReminderStore {
  private reminders: Reminder[] = [];
  private loaded = false;

  private ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(REMINDERS_FILE)) {
        const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, "utf-8"));
        if (Array.isArray(data)) this.reminders = data;
      }
    } catch (err) {
      console.error("提醒数据加载失败，将使用空列表:", err);
      this.reminders = [];
    }
  }

  private save() {
    try {
      const dir = path.dirname(REMINDERS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = REMINDERS_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.reminders, null, 2), "utf-8");
      fs.renameSync(tmp, REMINDERS_FILE);
    } catch (err) {
      console.error("提醒数据保存失败:", err);
    }
  }

  add(input: { content: string; timeText: string; dueAt: string; characterId?: string }): Reminder {
    this.ensureLoaded();
    const reminder: Reminder = {
      id: `reminder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: input.content,
      timeText: input.timeText,
      dueAt: input.dueAt,
      createdAt: Date.now(),
      characterId: input.characterId,
    };
    this.reminders.push(reminder);
    this.save();
    return reminder;
  }

  remove(id: string): boolean {
    this.ensureLoaded();
    const before = this.reminders.length;
    this.reminders = this.reminders.filter((r) => r.id !== id);
    const removed = this.reminders.length < before;
    if (removed) this.save();
    return removed;
  }

  /** 未触发的提醒，按到期时间排序 */
  listUpcoming(characterId?: string): Reminder[] {
    this.ensureLoaded();
    return this.reminders
      .filter((r) => !r.triggeredAt)
      .filter((r) => !characterId || !r.characterId || r.characterId === characterId)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  /** 已触发且未确认的提醒 */
  listTriggered(): Reminder[] {
    this.ensureLoaded();
    return this.reminders
      .filter((r) => r.triggeredAt && !r.acked)
      .sort((a, b) => (a.triggeredAt || 0) - (b.triggeredAt || 0));
  }

  /** 调度器心跳：标记到期提醒，清理过期已触发项 */
  tick(now: number = Date.now()): number {
    this.ensureLoaded();
    let newlyTriggered = 0;
    for (const r of this.reminders) {
      if (!r.triggeredAt && new Date(r.dueAt).getTime() <= now) {
        r.triggeredAt = now;
        newlyTriggered++;
      }
    }
    // 清理触发超过 7 天仍未确认的提醒
    const before = this.reminders.length;
    this.reminders = this.reminders.filter(
      (r) => !(r.triggeredAt && now - r.triggeredAt > TRIGGERED_TTL_MS)
    );
    if (newlyTriggered > 0 || this.reminders.length !== before) {
      this.save();
    }
    return newlyTriggered;
  }
}

/** 全局单例（Next.js dev 模式下模块可能被多次加载，挂到 globalThis 防止重复） */
const globalAny = globalThis as any;
export const reminderStore: ReminderStore =
  globalAny.__roleplayReminderStore || (globalAny.__roleplayReminderStore = new ReminderStore());

let schedulerStarted = false;

/** 启动调度器（幂等），在每个提醒相关 API 入口调用 */
export function ensureReminderScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // 先立即检查一次（补偿服务停止期间到期的提醒）
  try {
    reminderStore.tick();
  } catch (err) {
    console.error("提醒调度首次检查失败:", err);
  }
  const timer = setInterval(() => {
    try {
      const n = reminderStore.tick();
      if (n > 0) console.log(`[reminders] ${n} 条提醒到期`);
    } catch (err) {
      console.error("提醒调度检查失败:", err);
    }
  }, 15 * 1000);
  // 不阻止进程退出
  if (typeof timer.unref === "function") timer.unref();
}
