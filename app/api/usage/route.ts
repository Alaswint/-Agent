import { NextRequest, NextResponse } from "next/server";
import { getUsage, resetUsage } from "@/lib/usage";

// GET /api/usage —— 累计 token 用量统计
export async function GET() {
  return NextResponse.json(getUsage());
}

// POST /api/usage —— 重置统计
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("action") === "reset") {
    resetUsage();
    return NextResponse.json(getUsage());
  }
  return NextResponse.json({ error: "不支持该操作" }, { status: 400 });
}
