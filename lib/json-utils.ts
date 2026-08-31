/**
 * 从 LLM 输出中提取 JSON 的容错解析。
 * 处理常见情况：
 * - ```json ... ``` / ``` ... ``` 代码围栏
 * - JSON 前后的解释文字（取第一个 { 到最后一个 }）
 * - 直接就是合法 JSON
 */
export function extractJson<T = any>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();

  // 剥掉代码围栏
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    text = fence[1].trim();
  }

  // 直接尝试
  try {
    return JSON.parse(text) as T;
  } catch {
    // 继续
  }

  // 取第一个 {/［ 到最后一个 }/］ 的片段
  const first = text.search(/[{[]/);
  const lastBrace = text.lastIndexOf("}");
  const lastBracket = text.lastIndexOf("]");
  const last = Math.max(lastBrace, lastBracket);
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1)) as T;
    } catch {
      // 继续
    }
  }

  return null;
}
