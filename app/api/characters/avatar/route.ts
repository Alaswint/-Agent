import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

// 头像存储目录
function getAvatarDir(): string {
  if (process.env.PROJECT_ROOT) {
    return path.join(process.env.PROJECT_ROOT, "public", "avatars");
  }
  let current = process.cwd();
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return path.join(current, "public", "avatars");
    }
    current = path.dirname(current);
  }
  return path.join(process.cwd(), "public", "avatars");
}

// POST /api/characters/avatar - 上传头像
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const characterId = formData.get("characterId") as string | null;

    if (!file || !characterId) {
      return NextResponse.json({ error: "缺少文件或角色ID" }, { status: 400 });
    }

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "只允许上传图片文件" }, { status: 400 });
    }

    // 限制文件大小（2MB）
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "图片大小不能超过 2MB" }, { status: 400 });
    }

    // 读取文件数据
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 确定文件扩展名
    const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    const filename = `${characterId}.${ext}`;

    // 确保目录存在
    const avatarDir = getAvatarDir();
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }

    // 删除该角色旧头像（如果有）
    const oldFiles = fs.readdirSync(avatarDir).filter((f) => f.startsWith(`${characterId}.`));
    for (const oldFile of oldFiles) {
      try {
        fs.unlinkSync(path.join(avatarDir, oldFile));
      } catch {}
    }

    // 保存新头像
    const filePath = path.join(avatarDir, filename);
    fs.writeFileSync(filePath, buffer);

    // 返回可访问的 URL
    const avatarUrl = `/avatars/${filename}`;

    return NextResponse.json({ success: true, avatarUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
