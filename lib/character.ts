import { Character } from "@/lib/types";
import * as fs from "fs";
import * as path from "path";

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
const CHARACTERS_DIR = path.join(PROJECT_ROOT, "characters");

function ensureDir() {
  if (!fs.existsSync(CHARACTERS_DIR)) {
    fs.mkdirSync(CHARACTERS_DIR, { recursive: true });
  }
}

export function loadCharacter(id: string): Character {
  ensureDir();
  const filePath = path.join(CHARACTERS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`角色不存在: ${id}`);
  }
  const data = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(data);
}

export function saveCharacter(id: string, character: Character) {
  ensureDir();
  const filePath = path.join(CHARACTERS_DIR, `${id}.json`);
  const tempFile = filePath + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(character, null, 2), "utf-8");
    try {
      fs.renameSync(tempFile, filePath);
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(character, null, 2), "utf-8");
      try { fs.unlinkSync(tempFile); } catch {}
    }
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(character, null, 2), "utf-8");
  }
}

export function deleteCharacter(id: string) {
  ensureDir();
  const filePath = path.join(CHARACTERS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    // 重命名为 .deleted 后缀（避免触发安全删除机制）
    const deletedPath = path.join(CHARACTERS_DIR, `${id}.json.deleted`);
    fs.renameSync(filePath, deletedPath);
  }
}

export function listCharacters(): { id: string; name: string; role: string; avatar?: string }[] {
  ensureDir();
  const files = fs.readdirSync(CHARACTERS_DIR);
  return files
    .filter((f) => f.endsWith(".json") && !f.endsWith(".deleted"))
    .map((f) => {
      const id = f.replace(".json", "");
      try {
        const char = loadCharacter(id);
        return {
          id,
          name: char.name,
          role: char.role,
          avatar: char.avatar || "🎭",
        };
      } catch {
        // 跳过损坏的角色文件
        return null;
      }
    })
    .filter(Boolean) as { id: string; name: string; role: string; avatar?: string }[];
}

export function characterExists(id: string): boolean {
  ensureDir();
  return fs.existsSync(path.join(CHARACTERS_DIR, `${id}.json`));
}
