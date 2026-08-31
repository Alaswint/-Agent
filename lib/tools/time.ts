import { Tool } from "./types";

export const timeTool: Tool = {
  schema: {
    name: "get_current_time",
    description: "获取当前日期和时间。当用户询问现在几点、今天日期、星期几等时间相关信息时使用。",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "时区，可选。例如：Asia/Shanghai、UTC。默认为本地时区。",
        },
      },
    },
  },
  handler: async (args: Record<string, any>) => {
    const now = new Date();
    const timezone = args.timezone || "Asia/Shanghai";

    try {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const parts = formatter.formatToParts(now);
      const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

      const dateStr = `${getPart("year")}年${getPart("month")}${getPart("day")}`;
      const weekday = getPart("weekday");
      const timeStr = `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;

      return `当前时间（${timezone}）：\n${dateStr} ${weekday}\n${timeStr}`;
    } catch {
      // 降级到本地时间
      return `当前时间：\n${now.toLocaleString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`;
    }
  },
};
