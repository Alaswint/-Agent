import * as fs from "fs";
import * as path from "path";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  characterId: string;
  characterName: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

// 使用环境变量或默认路径来确定项目根目录
function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

const PROJECT_ROOT = getProjectRoot();
const CHATS_DIR = path.join(PROJECT_ROOT, "data", "chats");

function ensureDir() {
  if (!fs.existsSync(CHATS_DIR)) {
    fs.mkdirSync(CHATS_DIR, { recursive: true });
  }
}

/**
 * 获取角色的对话文件路径
 */
function getChatFilePath(characterId: string): string {
  return path.join(CHATS_DIR, `${characterId}.json`);
}

/**
 * 保存对话历史
 */
export function saveChatHistory(characterId: string, characterName: string, messages: ChatMessage[]) {
  ensureDir();
  const session: ChatSession = {
    characterId,
    characterName,
    messages,
    lastUpdated: Date.now(),
  };
  const filePath = getChatFilePath(characterId);
  const tempFile = filePath + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(session, null, 2), "utf-8");
    try {
      fs.renameSync(tempFile, filePath);
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
      try { fs.unlinkSync(tempFile); } catch {}
    }
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  }
}

/**
 * 加载对话历史
 */
export function loadChatHistory(characterId: string): ChatSession | null {
  const filePath = getChatFilePath(characterId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return data;
  } catch {
    return null;
  }
}

/**
 * 删除对话历史
 */
export function deleteChatHistory(characterId: string) {
  const filePath = getChatFilePath(characterId);
  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, filePath + ".deleted");
  }
}

/**
 * 导出对话为 JSON 格式
 */
export function exportChatAsJson(characterId: string, characterName: string): string {
  const session = loadChatHistory(characterId);
  if (!session) {
    throw new Error("没有对话历史可导出");
  }

  const exportData = {
    version: "1.0",
    exportTime: new Date().toISOString(),
    character: {
      id: characterId,
      name: characterName,
    },
    messages: session.messages,
    messageCount: session.messages.length,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * 导出对话为 Markdown 格式
 */
export function exportChatAsMarkdown(characterId: string, characterName: string): string {
  const session = loadChatHistory(characterId);
  if (!session) {
    throw new Error("没有对话历史可导出");
  }

  const date = new Date().toLocaleString("zh-CN");
  let md = `# 与 ${characterName} 的对话记录\n\n`;
  md += `**导出时间:** ${date}\n\n`;
  md += `**消息总数:** ${session.messages.length}\n\n`;
  md += `---\n\n`;

  for (const msg of session.messages) {
    const time = new Date(msg.timestamp).toLocaleString("zh-CN");
    if (msg.role === "user") {
      md += `## 我 (${time})\n\n${msg.content}\n\n`;
    } else {
      md += `## ${characterName} (${time})\n\n${msg.content}\n\n`;
    }
  }

  md += `---\n\n*导出自 Roleplay Agent*`;
  return md;
}

/**
 * 导出所有角色的对话
 */
export function exportAllChats(): string {
  ensureDir();
  const files = fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".deleted"));

  const allChats: any[] = [];
  for (const file of files) {
    const filePath = path.join(CHATS_DIR, file);
    try {
      const session = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      allChats.push(session);
    } catch {
      // 跳过损坏的文件
    }
  }

  const exportData = {
    version: "1.0",
    exportTime: new Date().toISOString(),
    chatCount: allChats.length,
    chats: allChats,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * 从 JSON 导入对话
 */
export function importChatFromJson(jsonContent: string): { characterId: string; characterName: string; messages: ChatMessage[] } {
  try {
    const data = JSON.parse(jsonContent);

    // 检查格式
    if (data.chats && Array.isArray(data.chats)) {
      // 多角色导出格式
      throw new Error("请逐个导入角色对话，或使用「恢复所有对话」功能");
    }

    if (!data.character || !data.messages) {
      throw new Error("无效的文件格式");
    }

    const characterId = data.character.id;
    const characterName = data.character.name;
    const messages = data.messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || Date.now(),
    }));

    // 保存导入的对话
    saveChatHistory(characterId, characterName, messages);

    return { characterId, characterName, messages };
  } catch (err: any) {
    throw new Error(`导入失败: ${err.message}`);
  }
}

/**
 * 恢复所有对话（从完整备份）
 */
export function importAllChats(jsonContent: string): number {
  try {
    const data = JSON.parse(jsonContent);

    if (!data.chats || !Array.isArray(data.chats)) {
      throw new Error("无效的文件格式，需要包含 chats 数组");
    }

    let count = 0;
    for (const chat of data.chats) {
      if (chat.characterId && chat.messages) {
        saveChatHistory(chat.characterId, chat.characterName || "未知角色", chat.messages);
        count++;
      }
    }

    return count;
  } catch (err: any) {
    throw new Error(`恢复失败: ${err.message}`);
  }
}

/**
 * 列出所有有对话记录的角色
 */
export function listChatSessions(): { characterId: string; characterName: string; messageCount: number; lastUpdated: number }[] {
  ensureDir();
  const files = fs.readdirSync(CHATS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".deleted"));

  const sessions: { characterId: string; characterName: string; messageCount: number; lastUpdated: number }[] = [];

  for (const file of files) {
    const filePath = path.join(CHATS_DIR, file);
    try {
      const session = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      sessions.push({
        characterId: session.characterId,
        characterName: session.characterName,
        messageCount: session.messages?.length || 0,
        lastUpdated: session.lastUpdated,
      });
    } catch {
      // 跳过损坏的文件
    }
  }

  // 按最后更新时间排序
  sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);

  return sessions;
}
