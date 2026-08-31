import { MemoryEntry } from "@/lib/types";
import { getEmbedding, complete } from "@/lib/llm";
import { VectorDB } from "@/lib/vector-db";
import * as path from "path";
import * as fs from "fs";

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

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MemoryStore {
  private shortTerm: MemoryEntry[] = [];
  private maxShortTerm = 20;
  private vectorDB: VectorDB;
  private characterId: string;

  constructor(characterId: string, vectorDB?: VectorDB) {
    this.characterId = characterId;
    const memoryPath = path.join(PROJECT_ROOT, "data", `memories_${characterId}.json`);
    this.vectorDB = vectorDB || new VectorDB(memoryPath);
  }

  addShortTerm(content: string, importance = 1) {
    this.shortTerm.push({
      id: Math.random().toString(36).slice(2),
      content,
      timestamp: Date.now(),
      importance,
      tags: this.extractTags(content),
    });
    if (this.shortTerm.length > this.maxShortTerm) {
      const removed = this.shortTerm.shift()!;
      // 重要的短期记忆提升到长期
      if (removed.importance >= 2) {
        this.addLongTerm(removed.content, removed.importance).catch(console.error);
      }
    }
  }

  async addLongTerm(content: string, importance = 1, summary?: string) {
    const embedding = await getEmbedding(content);
    // 没有可用的 embedding 模型时，跳过长期记忆存储（降级，不崩溃）
    if (!embedding) return;
    const entry: MemoryEntry = {
      id: Math.random().toString(36).slice(2),
      content,
      summary: summary || await this.summarize(content),
      timestamp: Date.now(),
      importance,
      tags: this.extractTags(content),
    };
    await this.vectorDB.upsert(entry.id, embedding, entry);
  }

  getShortTerm(): MemoryEntry[] {
    return [...this.shortTerm];
  }

  async retrieveRelevant(query: string, topK = 3): Promise<MemoryEntry[]> {
    const queryEmbedding = await getEmbedding(query);
    // 没有可用的 embedding 模型时，直接返回空（只用短期记忆，不崩溃）
    if (!queryEmbedding) return [];
    const results = await this.vectorDB.search(queryEmbedding, topK * 2); // 多取一些过滤

    // 按时间衰减 + 重要性排序
    const now = Date.now();
    const scored = results.map((r) => {
      const age = (now - r.entry.timestamp) / (1000 * 60 * 60 * 24); // 天数
      const recencyScore = Math.exp(-age / 30); // 30天衰减一半
      const importanceScore = r.entry.importance / 3;
      return {
        ...r.entry,
        combinedScore: r.score * 0.6 + recencyScore * 0.25 + importanceScore * 0.15,
      };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    return scored.slice(0, topK);
  }

  async getAllLongTerm(): Promise<MemoryEntry[]> {
    return this.vectorDB.getAll();
  }

  // 短期记忆摘要：当短期记忆过多时，生成摘要存入长期
  async summarizeShortTerm(): Promise<string> {
    if (this.shortTerm.length < 5) return "";
    const contents = this.shortTerm.map((m) => m.content).join("\n");
    // 简单摘要：取关键词组合（实际可用 LLM 生成）
    return `近期对话摘要：${contents.slice(0, 200)}...`;
  }

  // 提取关键词标签
  private extractTags(content: string): string[] {
    const keywords = ["喜欢", "讨厌", "记得", "秘密", "家人", "朋友", "过去", "未来", "害怕", "开心", "难过", "生气"];
    return keywords.filter((k) => content.includes(k));
  }

  private async summarize(content: string): Promise<string> {
    // 优先用 LLM 生成摘要；模型不可用时降级为截取前 50 字
    try {
      const summary = await complete(
        [
          {
            role: "system",
            content: "你是一个记忆摘要助手。用一句不超过 30 字的话概括下面这段对话记忆的核心事实，直接输出摘要内容，不要任何前缀或解释。",
          },
          { role: "user", content: content.slice(0, 800) },
        ],
        { temperature: 0.3, maxTokens: 60 }
      );
      const text = summary.trim();
      if (text) return text;
    } catch {
      // 模型未配置或调用失败 → 降级
    }
    return content.length > 50 ? content.slice(0, 50) + "..." : content;
  }
}
