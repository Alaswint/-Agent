import { Tool } from "./types";
import { browseWebpage, searchInWebpage, screenshotWebpage } from "./browser";

export const BROWSER_TOOLS: Tool[] = [
  {
    schema: {
      name: "browse_webpage",
      description:
        "打开指定网页并获取其文本内容。当用户提到某个网站、要求查看网页内容、或需要获取网页信息时使用。支持任意有效URL。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要打开的网页URL，必须是完整的URL（包含http://或https://）",
          },
        },
        required: ["url"],
      },
    },
    handler: async (args: Record<string, any>) => {
      const result = await browseWebpage(args.url);
      return JSON.stringify({
        success: true,
        title: result.title,
        content: result.content.substring(0, 4000),
        url: result.url,
      });
    },
  },
  {
    schema: {
      name: "search_webpage",
      description:
        "在指定网页中搜索特定关键词，返回包含该关键词的文本片段。当用户要求在某个网页中查找特定信息时使用。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要搜索的网页URL",
          },
          query: {
            type: "string",
            description: "要搜索的关键词",
          },
        },
        required: ["url", "query"],
      },
    },
    handler: async (args: Record<string, any>) => {
      const result = await searchInWebpage(args.url, args.query);
      return JSON.stringify({
        success: true,
        found: result.found,
        snippets: result.snippets,
        url: result.url,
      });
    },
  },
  {
    schema: {
      name: "screenshot_webpage",
      description:
        "对指定网页进行截图。当用户要求截图某个网页、保存网页画面、或需要查看网页视觉内容时使用。截图会保存到服务器并可查看。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要截图的网页URL",
          },
          fullPage: {
            type: "boolean",
            description: "是否截取整个页面（true）或仅可见区域（false），默认true",
          },
        },
        required: ["url"],
      },
    },
    handler: async (args: Record<string, any>) => {
      const result = await screenshotWebpage(args.url, { fullPage: args.fullPage });
      return JSON.stringify({
        success: true,
        screenshotUrl: result.screenshotPath,
        url: result.url,
      });
    },
  },
];
