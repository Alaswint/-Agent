import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

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

// 危险命令黑名单
const DANGEROUS_COMMANDS = [
  /rm\s+-rf\s+[/\\]/i,
  /rm\s+-rf\s+["']?C:\\/i,
  /rm\s+-rf\s+["']?.*[\w]/i,
  /format\s+/i,
  /shutdown\s+\/s/i,
  /shutdown\s+-h/i,
  /shutdown\s+\/?s/i,
  /shutdown\s+-r/i,
  /reg\s+delete/i,
  /del\s+.*C:\\Windows/i,
  /rd\s+\/s\s+.*C:\\Windows/i,
  /rmdir\s+\/s\s+.*C:\\Windows/i,
  /rmdir\s+\/s\s+\/q/i,
  /rd\s+\/s\s+\/q/i,
  /deltree/i,
  /fdisk/i,
  /diskpart/i,
  /mkfs/i,
  /dd\s+if=/i,
  />.*\.sys/i,
  />.*C:\\Windows/i,
  /:\\Windows\\System32/i,
  /:\\Program\sFiles/i,
  /powershell.*-EncodedCommand/i,
  /powershell.*DownloadString/i,
  /powershell.*Invoke-Expression/i,
  /powershell.*IEX/i,
  /certutil.*-urlcache/i,
  /bitsadmin/i,
  /takeown/i,
  /icacls.*\/deny/i,
  /icacls.*\/remove/i,
  /robocopy.*\/mir/i,
  /xcopy.*\/e.*\/h/i,
  /curl.*\|/i,
  /wget.*\|/i,
  /invoke-webrequest/i,
  /net\s+user.*\/add/i,
  /net\s+localgroup.*\/add/i,
];

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command));
}

export { isDangerousCommand };

// ==================== 命令白名单模式 ====================
// 默认只允许执行白名单内的安全命令（查看类、开发工具类）。
// 设置环境变量 ROLEPLAY_ALLOW_ANY_COMMAND=1 可解除白名单限制
// （危险命令黑名单仍然生效）。

const COMMAND_ALLOWLIST = new Set([
  // 查看 / 信息类
  "ls", "dir", "cat", "type", "pwd", "cd", "echo", "whoami", "hostname",
  "date", "cal", "tree", "find", "where", "which", "wc", "head", "tail",
  "tasklist", "ipconfig", "ping", "tracert", "nslookup", "netstat",
  "systeminfo", "wmic", "df", "du", "uname", "env",
  // 开发工具类
  "node", "npm", "npx", "yarn", "pnpm", "deno", "bun",
  "git", "python", "python3", "pip", "pip3",
  "java", "javac", "mvn", "gradle", "go", "cargo", "rustc",
  "gcc", "g++", "cl", "make", "cmake", "dotnet",
  "tsc", "eslint", "prettier", "vitest", "jest",
  // 文件操作类（受限范围）
  "mkdir", "cp", "copy", "mv", "move", "touch", "ren", "rename",
  "tar", "zip", "unzip", "gzip", "7z",
  // 网络查看类
  "curl", "wget",
]);

/** 允许执行任意命令（白名单关闭） */
export function isAllowAnyCommandMode(): boolean {
  return process.env.ROLEPLAY_ALLOW_ANY_COMMAND === "1";
}

/** 提取命令段的首个可执行名（处理引号与 Windows 路径） */
function getExecutableName(segment: string): string | null {
  let s = segment.trim().replace(/^[a-zA-Z]:/, ""); // 去掉盘符前缀
  // 去掉环境变量赋值前缀（FOO=bar cmd）
  s = s.replace(/^[\w.]+=[^\s]*\s+/g, "");
  // 带引号的路径
  const quoted = s.match(/^"([^"]+)"/);
  if (quoted) s = quoted[1];
  else {
    const first = s.match(/^[^\s|&;<>()]+/);
    if (!first) return null;
    s = first[0];
  }
  // 取 basename（Windows 路径可能带引号内空格）
  const name = s.split(/[\\/]/).pop() || s;
  // 去掉 .exe / .cmd / .bat 等后缀
  const bare = name.replace(/\.(exe|cmd|bat|com|ps1)$/i, "");
  return bare.toLowerCase();
}

/** 白名单校验：所有命令段（含管道两侧）的首命令都必须在白名单内 */
export function isAllowedCommand(command: string): boolean {
  // 禁止命令替换、后台执行、反引号
  if (/`|\$\(|\bdel\b|\berase\b|\brd\b|\brmdir\b|\bshutdown\b|\blogoff\b/i.test(command)) {
    return false;
  }

  // 按管道与顺序执行符拆分段（含单个 & 后台执行符）
  const segments = command
    .split(/\|\||&&|[|;&]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return false;

  for (const segment of segments) {
    // 去掉重定向目标（> file、< file）后再提取命令
    const cmdPart = segment.replace(/[<>]{1,2}\s*[^\s]+/g, " ").trim();
    const exe = getExecutableName(cmdPart);
    if (!exe || !COMMAND_ALLOWLIST.has(exe)) {
      return false;
    }
  }
  return true;
}

// 安全路径检查
export function isSafePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const lower = resolved.toLowerCase();

  const blockedPrefixes = [
    "c:\\windows",
    "c:\\program files",
    "c:\\program files (x86)",
    "c:\\programdata",
    "c:\\system volume information",
    "c:\\$recycle.bin",
  ];
  const blockedFragments = [
    "\\.ssh\\",
    "\\.aws\\",
    "\\.gnupg\\",
    "\\.kube\\",
  ];

  for (const b of blockedPrefixes) {
    if (lower.startsWith(b)) return false;
  }
  for (const b of blockedFragments) {
    if (lower.includes(b)) return false;
  }

  // 凭据文件名（如 C:\Users\x\.ssh\id_rsa、任何位置的 credentials.json）
  const sensitiveFiles = [
    "id_rsa", "id_ed25519", "id_ecdsa", "authorized_keys", "known_hosts",
    "credentials.json", "secrets.json", ".npmrc", ".netrc", ".pypirc",
    "wallet.dat",
  ];
  const base = lower.split(/[\\/]/).pop() || "";
  if (sensitiveFiles.includes(base)) return false;

  // .env 类文件不允许 AI 直接读写（防止泄露 API Key）
  if (/^\.env(\..+)?$/.test(base)) return false;

  if (lower.includes("system32") || lower.includes("syswow64")) {
    return false;
  }

  return true;
}

// 执行命令
export async function runCommand(command: string, timeout = 30000): Promise<string> {
  if (isDangerousCommand(command)) {
    return `安全拦截：该命令被判定为危险操作，已拒绝执行。命令：${command}`;
  }

  // 白名单模式：非白名单命令直接拒绝（可用环境变量 ROLEPLAY_ALLOW_ANY_COMMAND=1 关闭）
  if (!isAllowAnyCommandMode() && !isAllowedCommand(command)) {
    return `安全拦截：命令"${command}"不在允许执行的命令白名单内。当前仅允许常用查看与开发工具命令（如 node、npm、git、python、ls、tasklist 等）。如需解锁，请在启动服务前设置环境变量 ROLEPLAY_ALLOW_ANY_COMMAND=1（风险自负）。`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, { timeout, windowsHide: true });
    const output = stdout || stderr || "（命令执行完成，无输出）";
    return output.substring(0, 5000);
  } catch (err: any) {
    if (err.killed) return "命令执行超时（30秒）";
    const msg = `命令执行失败：${err.message}\n${err.stderr || ""}`;
    return msg.substring(0, 3000);
  }
}

// 读取文件
export async function readFile(filePath: string): Promise<string> {
  if (!isSafePath(filePath)) {
    return `安全拦截：禁止操作系统目录或系统文件。路径：${filePath}`;
  }

  try {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return `文件不存在：${resolved}`;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return `这是一个目录，不是文件。请使用 list_directory 工具查看目录内容。`;
    }
    if (stat.size > 1024 * 1024) {
      return `文件过大（${(stat.size / 1024 / 1024).toFixed(2)} MB），无法读取完整内容。请使用 run_command 工具查看部分内容。`;
    }
    const content = fs.readFileSync(resolved, "utf-8");
    return content.substring(0, 10000);
  } catch (err: any) {
    return `读取文件失败：${err.message}`;
  }
}

// 写入文件
export async function writeFile(filePath: string, content: string): Promise<string> {
  if (!isSafePath(filePath)) {
    return `安全拦截：禁止操作系统目录或系统文件。路径：${filePath}`;
  }

  try {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, "utf-8");
    return `文件已写入：${resolved}`;
  } catch (err: any) {
    return `写入文件失败：${err.message}`;
  }
}

// 列出目录
export async function listDirectory(dirPath: string): Promise<string> {
  if (!isSafePath(dirPath)) {
    return `安全拦截：禁止操作系统目录。路径：${dirPath}`;
  }

  try {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      return `目录不存在：${resolved}`;
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return `这不是一个目录：${resolved}`;
    }

    const items = fs.readdirSync(resolved);
    const details = items.map((item) => {
      const itemPath = path.join(resolved, item);
      try {
        const s = fs.statSync(itemPath);
        const type = s.isDirectory() ? "[DIR]" : "[FILE]";
        const size = s.isFile() ? ` ${(s.size / 1024).toFixed(1)} KB` : "";
        return `${type} ${item}${size}`;
      } catch {
        return `[?] ${item}`;
      }
    });

    return details.join("\n");
  } catch (err: any) {
    return `列出目录失败：${err.message}`;
  }
}

// 打开应用
export async function openApplication(appName: string): Promise<string> {
  // 安全检查：禁止包含 & | ; $ ` 等 shell 注入字符
  const forbiddenChars = /[&|;$`<>]/;
  if (forbiddenChars.test(appName)) {
    return `安全拦截：应用名称包含非法字符，已拒绝执行。名称：${appName}`;
  }

  try {
    const command = `start "" "${appName}"`;
    await execAsync(command, { timeout: 10000, windowsHide: true });
    return `已尝试打开应用：${appName}`;
  } catch (err: any) {
    return `打开应用失败：${err.message}`;
  }
}

// 系统信息
export async function getSystemInfo(): Promise<string> {
  try {
    const os = require("os");
    const platform = process.platform;
    const arch = process.arch;
    const nodeVersion = process.version;
    const cpus = os.cpus();
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const hostname = os.hostname();
    const uptime = (os.uptime() / 3600).toFixed(2);

    let cpuName = "";
    try {
      const { stdout } = await execAsync("wmic cpu get Name /value", { timeout: 10000, windowsHide: true });
      cpuName = stdout.replace(/Name=/, "").trim();
    } catch {
      // ignore
    }

    return [
      `操作系统：${platform} (${arch})`,
      `主机名：${hostname}`,
      `CPU：${cpuName || cpus[0]?.model || "Unknown"} (${cpus.length} 核)`,
      `内存：总计 ${totalMem} GB，可用 ${freeMem} GB`,
      `Node.js：${nodeVersion}`,
      `运行时间：${uptime} 小时`,
    ].join("\n");
  } catch (err: any) {
    return `获取系统信息失败：${err.message}`;
  }
}

// 桌面截图
export async function takeDesktopScreenshot(): Promise<{ success: boolean; screenshotPath?: string; error?: string }> {
  try {
    const screenshotsDir = path.join(PROJECT_ROOT, "public", "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `desktop_${timestamp}.png`;
    const outputPath = path.join(screenshotsDir, filename);

    // 使用 screenshot-desktop 包截取桌面（可选依赖）
    let screenshot: (opts: { filename: string }) => Promise<string | Buffer>;
    try {
      screenshot = require("screenshot-desktop");
    } catch {
      return {
        success: false,
        error: "桌面截图不可用：未安装 screenshot-desktop（可选依赖）。请运行 npm install screenshot-desktop 后重试。",
      };
    }
    await screenshot({ filename: outputPath });

    if (fs.existsSync(outputPath)) {
      return { success: true, screenshotPath: `/screenshots/${filename}` };
    } else {
      return { success: false, error: "截图文件未生成" };
    }
  } catch (err: any) {
    return { success: false, error: `截图失败：${err.message}` };
  }
}

// 列出进程
export async function listProcesses(): Promise<string> {
  try {
    const { stdout } = await execAsync("tasklist /fo csv /nh", { timeout: 15000, windowsHide: true });
    const lines = stdout.split("\n").filter((l) => l.trim());
    const processes = lines.slice(0, 50).map((line) => {
      const cols = line.split('","');
      if (cols.length >= 2) {
        return `${cols[0].replace(/^"/, "")} (PID: ${cols[1]})`;
      }
      return line;
    });
    return processes.join("\n");
  } catch (err: any) {
    return `列出进程失败：${err.message}`;
  }
}
