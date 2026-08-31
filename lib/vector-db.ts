import { MemoryEntry } from "@/lib/types";
import * as fs from "fs";
import * as path from "path";

interface VectorRecord {
  id: string;
  embedding: number[];
  entry: MemoryEntry;
}

export class VectorDB {
  private records: VectorRecord[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  async upsert(id: string, embedding: number[], entry: MemoryEntry) {
    // 删除旧的
    this.records = this.records.filter((r) => r.id !== id);
    this.records.push({ id, embedding, entry });
    await this.save();
  }

  async search(queryEmbedding: number[], topK: number): Promise<{ entry: MemoryEntry; score: number }[]> {
    if (this.records.length === 0) return [];

    const scored = this.records.map((r) => ({
      entry: r.entry,
      score: cosineSimilarity(queryEmbedding, r.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async getAll(): Promise<MemoryEntry[]> {
    return this.records.map((r) => r.entry);
  }

  async delete(id: string) {
    this.records = this.records.filter((r) => r.id !== id);
    await this.save();
  }

  private async save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = this.filePath + ".tmp";
    try {
      fs.writeFileSync(tempFile, JSON.stringify(this.records, null, 2));
      try {
        fs.renameSync(tempFile, this.filePath);
      } catch {
        fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
        try { fs.unlinkSync(tempFile); } catch {}
      }
    } catch {
      fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
    }
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        this.records = data || [];
      } catch {
        this.records = [];
      }
    }
  }
}

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
