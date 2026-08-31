import { NextRequest, NextResponse } from "next/server";
import { reminderStore, ensureReminderScheduler } from "@/lib/reminder-store";

/**
 * 提醒 API：
 *  GET    /api/reminders?characterId=xxx  → { upcoming, triggered }
 *  DELETE /api/reminders?id=xxx           → 删除/确认单条提醒
 *  DELETE /api/reminders?all=true         → 清空全部提醒
 */
export async function GET(req: NextRequest) {
  ensureReminderScheduler();
  const characterId = req.nextUrl.searchParams.get("characterId") || undefined;
  const upcoming = reminderStore
    .listUpcoming(characterId)
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      content: r.content,
      timeText: r.timeText,
      dueAt: r.dueAt,
    }));
  const triggered = reminderStore.listTriggered().map((r) => ({
    id: r.id,
    content: r.content,
    timeText: r.timeText,
    dueAt: r.dueAt,
  }));
  return NextResponse.json({ upcoming, triggered });
}

export async function DELETE(req: NextRequest) {
  ensureReminderScheduler();
  const id = req.nextUrl.searchParams.get("id");
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true") {
    // 逐条删除（store 没有 clearAll，走 tick + remove）
    const allIds = [
      ...reminderStore.listUpcoming().map((r) => r.id),
      ...reminderStore.listTriggered().map((r) => r.id),
    ];
    for (const rid of allIds) reminderStore.remove(rid);
    return NextResponse.json({ success: true, removed: allIds.length });
  }

  if (!id) {
    return NextResponse.json({ error: "缺少提醒 id" }, { status: 400 });
  }

  const ok = reminderStore.remove(id);
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "提醒不存在或已删除" }, { status: 404 });
}
