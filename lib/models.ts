import * as fs from "fs";
import * as path from "path";
import { encrypt, decrypt } from "@/lib/crypto";

export interface ModelConfig {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  embeddingModel?: string;
  apiKey: string;
}

interface ModelsFile {
  models: ModelConfig[];
  current: string;
}

// 使用环境变量或默认路径来确定项目根目录
// 生产模式下 process.cwd() 可能是 .next，需要指向正确的位置
function getProjectRoot(): string {
  // 如果设置了环境变量，使用它
  if (process.env.PROJECT_ROOT) {
    return process.env.PROJECT_ROOT;
  }

  // 尝试找到包含 package.json 的目录
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    current = path.dirname(current);
  }

  // 回退到 cwd
  return process.cwd();
}

const PROJECT_ROOT = getProjectRoot();
const MODELS_FILE = path.join(PROJECT_ROOT, "data", "models.json");

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "moonshot",
    name: "Kimi (Moonshot)",
    baseURL: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    embeddingModel: "moonshot-v1-embedding",
    apiKey: "",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "",
  },
  {
    id: "qwen",
    name: "通义千问",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    embeddingModel: "text-embedding-v2",
    apiKey: "",
  },
];

function ensureDir() {
  const dir = path.dirname(MODELS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFile(): ModelsFile {
  ensureDir();
  if (fs.existsSync(MODELS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MODELS_FILE, "utf-8"));
      // models 数组存在即为有效（包括空列表：用户删光所有模型是合法状态，不能重置）
      if (data && Array.isArray(data.models)) {
        // 解密 API Keys（向后兼容：明文 key 也能正常读取）
        const decryptedModels = data.models.map((m: ModelConfig) => ({
          ...m,
          apiKey: decrypt(m.apiKey),
        }));
        return { ...data, models: decryptedModels };
      }
    } catch {
      // 解析失败则使用默认
    }
  }
  // 首次使用（文件不存在或损坏），写入默认配置
  const initial: ModelsFile = { models: DEFAULT_MODELS, current: DEFAULT_MODELS[0].id };
  saveFile(initial);
  return initial;
}

function saveFile(data: ModelsFile) {
  ensureDir();
  // 加密 API Keys 后保存
  const encryptedData = {
    ...data,
    models: data.models.map((m) => ({
      ...m,
      apiKey: encrypt(m.apiKey),
    })),
  };

  // 使用原子写入：先写入临时文件，再重命名
  // 这样可以避免文件被占用时写入失败
  const tempFile = MODELS_FILE + ".tmp";
  try {
    fs.writeFileSync(tempFile, JSON.stringify(encryptedData, null, 2), "utf-8");
    // 尝试重命名，如果失败则直接写入原文件
    try {
      fs.renameSync(tempFile, MODELS_FILE);
    } catch {
      // 重命名失败（可能是 Windows 权限问题），直接写入
      fs.writeFileSync(MODELS_FILE, JSON.stringify(encryptedData, null, 2), "utf-8");
      // 清理临时文件
      try {
        fs.unlinkSync(tempFile);
      } catch {}
    }
  } catch (err) {
    // 临时文件也失败，尝试直接写入
    fs.writeFileSync(MODELS_FILE, JSON.stringify(encryptedData, null, 2), "utf-8");
  }
}

export function listModels(): ModelConfig[] {
  return loadFile().models;
}

export function getCurrentModel(): ModelConfig {
  const file = loadFile();
  const model = file.models.find((m) => m.id === file.current);
  return model || file.models[0] || DEFAULT_MODELS[0];
}

export function setCurrentModel(id: string): boolean {
  const file = loadFile();
  if (!file.models.find((m) => m.id === id)) return false;
  file.current = id;
  saveFile(file);
  return true;
}

export function addModel(model: Omit<ModelConfig, "id">): ModelConfig {
  const file = loadFile();
  const id = model.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "") + "-" + Date.now().toString(36);
  const newModel: ModelConfig = { ...model, id };
  file.models.push(newModel);
  saveFile(file);
  return newModel;
}

export function updateModel(id: string, updates: Partial<Omit<ModelConfig, "id">>): boolean {
  const file = loadFile();
  const idx = file.models.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  // 如果 apiKey 留空，保留原有 Key（避免编辑其他字段时误清空 Key）
  const merged: ModelConfig = { ...file.models[idx], ...updates };
  if (!updates.apiKey) {
    merged.apiKey = file.models[idx].apiKey;
  }
  file.models[idx] = merged;
  saveFile(file);
  return true;
}

export function deleteModel(id: string): boolean {
  const file = loadFile();
  const idx = file.models.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  file.models.splice(idx, 1);
  // 如果删除的是当前选中的，切换到第一个
  if (file.current === id && file.models.length > 0) {
    file.current = file.models[0].id;
  }
  saveFile(file);
  return true;
}

export function getModelById(id: string): ModelConfig | undefined {
  return loadFile().models.find((m) => m.id === id);
}
