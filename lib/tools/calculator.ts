import { Tool } from "./types";

export const calculatorTool: Tool = {
  schema: {
    name: "calculate",
    description: "执行数学计算。当用户需要进行数值计算、单位换算、百分比计算等时使用。",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，例如：15% of 200, (100 + 50) * 0.8, sqrt(16)",
        },
      },
      required: ["expression"],
    },
  },
  handler: async (args: Record<string, any>) => {
    const { expression } = args;
    try {
      // 预处理表达式
      let expr = expression
        .replace(/of/gi, "*")
        .replace(/%/g, "/100")
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/[,，]/g, "");

      // 支持 sqrt
      expr = expr.replace(/sqrt\(([^)]+)\)/g, "Math.sqrt($1)");

      // 安全检查：只允许数字、运算符、括号和 Math 函数
      if (!/^[\d\s\+\-\*\/\(\)\.Mathsqrt]+$/.test(expr.replace(/Math\.sqrt/g, ""))) {
        return `表达式 "${expression}" 包含不支持的字符，只支持基本数学运算。`;
      }

      // 使用 Function 安全求值
      const result = new Function(`return (${expr})`)();

      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        // 格式化结果
        const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(4).replace(/\.?0+$/, "");
        return `计算：${expression}\n结果：${formatted}`;
      }
      return `无法计算 "${expression}"，请检查表达式是否正确。`;
    } catch (err: any) {
      return `计算 "${expression}" 时出错：${err.message || "表达式无效"}`;
    }
  },
};
