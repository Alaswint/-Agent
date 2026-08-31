import { test } from "node:test";
import assert from "node:assert/strict";
import { VectorDB } from "../lib/vector-db.ts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// 每个测试用独立的临时数据库文件，避免相互干扰
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "roleplay-test-"));
let counter = 0;
function freshDb() {
  counter++;
  return new VectorDB(path.join(tmpDir, `vectors-${counter}.json`));
}

function makeEntry(id: string, content: string) {
  return {
    id,
    content,
    summary: content.slice(0, 10),
    timestamp: Date.now(),
    importance: 1,
    tags: [],
  } as any;
}

test("向量库：插入与检索", async () => {
  const db = freshDb();

  await db.upsert("a", [1, 0, 0], makeEntry("a", "记忆A"));
  await db.upsert("b", [0, 1, 0], makeEntry("b", "记忆B"));

  const results = await db.search([1, 0.1, 0], 2);
  assert.equal(results.length, 2);
  // 查询向量更接近 e1，记忆A 应排第一
  assert.equal(results[0].entry.id, "a");
  assert.ok(results[0].score > results[1].score);
});

test("向量库：upsert 覆盖同 id", async () => {
  const db = freshDb();
  await db.upsert("a", [1, 0, 0], makeEntry("a", "旧记忆"));
  await db.upsert("a", [0, 1, 0], makeEntry("a", "新记忆"));
  const all = await db.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].content, "新记忆");
});

test("向量库：持久化到磁盘并重新加载", async () => {
  const dbPath = path.join(tmpDir, `persist-${++counter}.json`);
  const db = new VectorDB(dbPath);
  await db.upsert("c", [1, 1, 1], makeEntry("c", "持久化记忆"));

  const db2 = new VectorDB(dbPath);
  const all = await db2.getAll();
  assert.ok(all.some((m: any) => m.content === "持久化记忆"));
});

test("向量库：删除", async () => {
  const db = freshDb();
  await db.upsert("c", [1, 1, 1], makeEntry("c", "待删除"));
  await db.delete("c");
  const all = await db.getAll();
  assert.ok(!all.some((m: any) => m.id === "c"));
});

// 测试全部结束后清理临时目录
process.on("exit", () => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});
