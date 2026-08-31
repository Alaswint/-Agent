import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../lib/json-utils.ts";

test("extractJson：直接 JSON", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("extractJson：markdown 围栏", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('```\n{"a":1}\n```'), { a: 1 });
});

test("extractJson：前后带解释文字", () => {
  assert.deepEqual(extractJson('好的，以下是结果：{"a":1} 希望有帮助'), { a: 1 });
});

test("extractJson：嵌套对象", () => {
  assert.deepEqual(extractJson('```json\n{"impact":{"mood":5},"emotion":"开心"}\n```'), {
    impact: { mood: 5 },
    emotion: "开心",
  });
});

test("extractJson：数组", () => {
  assert.deepEqual(extractJson('[1,2,3]'), [1, 2, 3]);
});

test("extractJson：非法输入返回 null", () => {
  assert.equal(extractJson("完全不是 JSON"), null);
  assert.equal(extractJson(""), null);
  assert.equal(extractJson(null as any), null);
});
