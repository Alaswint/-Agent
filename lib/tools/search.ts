import { Tool } from "./types";

export const searchTool: Tool = {
  schema: {
    name: "web_search",
    description: "搜索网络信息。当用户询问时事、新闻、知识或需要查找外部信息时使用。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
      },
      required: ["query"],
    },
  },
  handler: async (args: Record<string, any>) => {
    const { query } = args;
    try {
      // 使用 DuckDuckGo 的 HTML 版本进行简单搜索
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
      );
      if (!res.ok) throw new Error("搜索服务暂时不可用");
      const html = await res.text();

      // 简单提取搜索结果标题和摘要
      const results: string[] = [];
      const titleMatches = html.matchAll(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/g);
      const snippetMatches = html.matchAll(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g);

      const titles = Array.from(titleMatches).map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      const snippets = Array.from(snippetMatches).map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );

      for (let i = 0; i < Math.min(3, titles.length); i++) {
        if (titles[i]) {
          results.push(`${i + 1}. ${titles[i]}${snippets[i] ? " - " + snippets[i] : ""}`);
        }
      }

      if (results.length === 0) {
        return `搜索 "${query}" 未找到相关结果。`;
      }

      return `搜索 "${query}" 的结果：\n${results.join("\n")}`;
    } catch (err: any) {
      return `搜索服务暂时不可用。关于 "${query}"，我的知识可能有限，建议用户自行搜索确认。`;
    }
  },
};
