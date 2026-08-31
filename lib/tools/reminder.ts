import { Tool } from "./types";
import { parseTimeExpression } from "@/lib/reminder-time";
import { reminderStore } from "@/lib/reminder-store";

export const reminderTool: Tool = {
  schema: {
    name: "set_reminder",
    description: `设置提醒。当用户要求记住某事、设置提醒、定时提醒时使用。支持相对时间描述，如"明天下午3点"、"10分钟后"、"1小时后"、"2026-08-30 15:00"。到设定时间后会自动弹窗通知用户。`,
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "提醒内容",
        },
        time: {
          type: "string",
          description: "提醒时间描述，例如：明天下午3点、10分钟后、1小时后、2026-08-23 15:00",
        },
      },
      required: ["content", "time"],
    },
  },
  handler: async (args: Record<string, any>) => {
    const { content, time } = args;
    if (!content || !time) {
      return "设置提醒失败：需要提供提醒内容和时间。";
    }

    const dueAt = parseTimeExpression(time);
    if (!dueAt) {
      return `设置提醒失败：无法理解时间描述"${time}"。请使用更明确的表达，例如"10分钟后"、"明天下午3点"、"2026-08-30 15:00"。`;
    }

    if (dueAt.getTime() <= Date.now()) {
      return `设置提醒失败：时间"${time}"（${dueAt.toLocaleString("zh-CN")}）已经过去，请设置一个未来时间。`;
    }

    const reminder = reminderStore.add({
      content,
      timeText: time,
      dueAt: dueAt.toISOString(),
    });

    return `已设置提醒："${content}"\n时间：${time}（${dueAt.toLocaleString("zh-CN")}）\n到时会自动弹出通知。`;
  },
};

export function getReminders() {
  return reminderStore.listUpcoming();
}

export function removeReminder(id: string) {
  return reminderStore.remove(id);
}
