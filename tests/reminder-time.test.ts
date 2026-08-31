import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeExpression, parseChineseNumber } from "../lib/reminder-time.ts";

// 固定基准时间：2026-08-28 10:00:00（周五）
const NOW = new Date(2026, 7, 28, 10, 0, 0);

function fmt(d: Date | null): string | null {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

test("中文数字解析", () => {
  assert.equal(parseChineseNumber("10"), 10);
  assert.equal(parseChineseNumber("三"), 3);
  assert.equal(parseChineseNumber("两"), 2);
  assert.equal(parseChineseNumber("十五"), 15);
  assert.equal(parseChineseNumber("二十"), 20);
  assert.equal(parseChineseNumber("二十五"), 25);
  assert.equal(parseChineseNumber("半小时"), null); // 非纯数字
});

test("相对时长：分钟后/小时后/秒后", () => {
  assert.equal(fmt(parseTimeExpression("10分钟后", NOW)), "2026-08-28 10:10");
  assert.equal(fmt(parseTimeExpression("半小时后", NOW)), "2026-08-28 10:30");
  assert.equal(fmt(parseTimeExpression("1小时后", NOW)), "2026-08-28 11:00");
  assert.equal(fmt(parseTimeExpression("两小时后", NOW)), "2026-08-28 12:00");
  assert.equal(fmt(parseTimeExpression("1小时30分钟后", NOW)), "2026-08-28 11:30");
  assert.equal(fmt(parseTimeExpression("45秒后", NOW)), "2026-08-28 10:00");
  assert.equal(fmt(parseTimeExpression("3天后", NOW)), "2026-08-31 10:00");
});

test("相对日期 + 时钟时间", () => {
  assert.equal(fmt(parseTimeExpression("明天下午3点", NOW)), "2026-08-29 15:00");
  assert.equal(fmt(parseTimeExpression("明天15:00", NOW)), "2026-08-29 15:00");
  assert.equal(fmt(parseTimeExpression("后天晚上8点半", NOW)), "2026-08-30 20:30");
  assert.equal(fmt(parseTimeExpression("今天上午10点半", NOW)), "2026-08-28 10:30");
  assert.equal(fmt(parseTimeExpression("今晚10点", NOW)), "2026-08-28 22:00");
  assert.equal(fmt(parseTimeExpression("明晚8点", NOW)), "2026-08-29 20:00");
  assert.equal(fmt(parseTimeExpression("明天上午9点15分", NOW)), "2026-08-29 09:15");
});

test("今天已过的时刻顺延到明天", () => {
  assert.equal(fmt(parseTimeExpression("今天下午3点", NOW)), "2026-08-28 15:00");
  // 今天上午8点已过 → 明天
  assert.equal(fmt(parseTimeExpression("今天上午8点", NOW)), "2026-08-29 08:00");
  // 纯时刻已过 → 明天
  assert.equal(fmt(parseTimeExpression("9:00", NOW)), "2026-08-29 09:00");
});

test("绝对日期时间", () => {
  assert.equal(fmt(parseTimeExpression("2026-08-30 15:00", NOW)), "2026-08-30 15:00");
  assert.equal(fmt(parseTimeExpression("2026/9/1 08:30", NOW)), "2026-09-01 08:30");
  assert.equal(fmt(parseTimeExpression("8月30日 15:00", NOW)), "2026-08-30 15:00");
  assert.equal(fmt(parseTimeExpression("8月30日下午3点", NOW)), "2026-08-30 15:00");
});

test("无法解析的表达式返回 null", () => {
  assert.equal(parseTimeExpression("随便写点什么", NOW), null);
  assert.equal(parseTimeExpression("", NOW), null);
  assert.equal(parseTimeExpression("今天", NOW), null); // 只有"今天"无时刻，信息不足
});

test("过去时间被解析但由调用方校验", () => {
  // "昨天下午3点" 是过去，解析器返回昨天的时间（调用方负责拒绝）
  const d = parseTimeExpression("昨天下午3点", NOW);
  assert.ok(d);
  assert.equal(fmt(d), "2026-08-27 15:00");
});
