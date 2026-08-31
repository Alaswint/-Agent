import { Tool } from "./types";

export const weatherTool: Tool = {
  schema: {
    name: "get_weather",
    description: "获取指定城市的当前天气信息。当用户询问天气时使用。",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，例如：北京、上海、广州",
        },
      },
      required: ["city"],
    },
  },
  handler: async (args: Record<string, any>) => {
    const { city } = args;
    try {
      // 使用免费的 wttr.in API
      const res = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=%C|%t|%h|%w|%p&lang=zh`,
        { headers: { "User-Agent": "curl/7.68.0" } }
      );
      if (!res.ok) throw new Error(`天气服务返回 ${res.status}`);
      const text = await res.text();
      const [condition, temp, humidity, wind, precip] = text.split("|");
      return `城市：${city}\n天气：${condition.trim()}\n温度：${temp.trim()}\n湿度：${humidity.trim()}\n风力：${wind.trim()}${precip && precip.trim() ? `\n降水：${precip.trim()}` : ""}`;
    } catch (err: any) {
      // 查询失败时如实告知，不编造数据误导用户
      return `天气查询失败：${err.message || "天气服务暂时不可用"}。请稍后再试。`;
    }
  },
};
