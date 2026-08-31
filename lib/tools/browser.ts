// playwright 为可选依赖：运行时动态加载，未安装时返回友好提示。
// 为避免未安装时类型检查失败，Browser/Page 使用 any（实际类型来自 playwright）。
type Browser = any;
type Page = any;

import * as fs from "fs";
import * as path from "path";

const PLAYWRIGHT_NOT_INSTALLED =
  "浏览器工具不可用：未安装 playwright（可选依赖）。请运行 npm install playwright 后重试。";

function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

// 常见浏览器路径（按优先级排列），探测到哪个用哪个
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function findBrowserPath(): string | null {
  for (const p of BROWSER_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

let browserInstance: Browser | null = null;
let browserLock = false;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && !browserInstance.isConnected()) {
    browserInstance = null;
  }
  if (!browserInstance) {
    let chromium: any;
    try {
      // @ts-ignore playwright 为可选依赖，未安装时走 catch 分支
      ({ chromium } = await import("playwright"));
    } catch {
      throw new Error(PLAYWRIGHT_NOT_INSTALLED);
    }
    const executablePath = findBrowserPath();
    // 找不到系统浏览器时回退到 Playwright 自带的 Chromium（需 npx playwright install chromium）
    browserInstance = await chromium.launch(
      executablePath
        ? {
            executablePath,
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          }
        : {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          }
    );
  }
  return browserInstance as Browser;
}

/**
 * 获取网页内容
 */
export async function browseWebpage(url: string): Promise<{
  title: string;
  content: string;
  url: string;
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const title = await page.title();

    // 提取页面主要文本内容
    const content = await page.evaluate(() => {
      // 移除脚本、样式、导航等无关元素
      const scripts = document.querySelectorAll("script, style, nav, header, footer, iframe, aside");
      scripts.forEach((el) => el.remove());

      // 获取正文内容
      const article = document.querySelector("article, main, [role='main']");
      if (article) {
        return article.textContent?.trim().substring(0, 8000) || "";
      }

      // 尝试获取 body 内容
      const body = document.body;
      return body.textContent?.trim().substring(0, 8000) || "";
    });

    return { title, content, url: page.url() };
  } finally {
    await page.close();
  }
}

/**
 * 在网页中搜索特定内容
 */
export async function searchInWebpage(
  url: string,
  query: string
): Promise<{
  found: boolean;
  snippets: string[];
  url: string;
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const result = await page.evaluate((searchQuery: string) => {
      const text = document.body.innerText;
      const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
      const snippets: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(searchQuery.toLowerCase())) {
          // 收集上下文（前后各1行）
          const context: string[] = [];
          if (i > 0) context.push(lines[i - 1]);
          context.push(lines[i]);
          if (i < lines.length - 1) context.push(lines[i + 1]);
          snippets.push(context.join("\n"));
          if (snippets.length >= 3) break;
        }
      }

      return { found: snippets.length > 0, snippets };
    }, query);

    return { ...result, url: page.url() };
  } finally {
    await page.close();
  }
}

/**
 * 截图网页
 */
export async function screenshotWebpage(
  url: string,
  options?: { fullPage?: boolean; selector?: string }
): Promise<{
  screenshotPath: string;
  url: string;
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // 保存到 public/screenshots 目录
    const fs = await import("fs");
    const path = await import("path");

    const screenshotsDir = path.join(getProjectRoot(), "public", "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filename = `screenshot_${Date.now()}.png`;
    const screenshotPath = path.join(screenshotsDir, filename);

    if (options?.selector) {
      const element = await page.locator(options.selector).first();
      await element.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({
        path: screenshotPath,
        fullPage: options?.fullPage ?? true,
      });
    }

    return {
      screenshotPath: `/screenshots/${filename}`,
      url: page.url(),
    };
  } finally {
    await page.close();
  }
}

/**
 * 关闭浏览器（清理资源）
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
