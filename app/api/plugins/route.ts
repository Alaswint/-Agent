import { NextResponse } from "next/server";
import { loadPlugins, pluginsDir } from "@/lib/plugins/loader";
import { isToolEnabled } from "@/lib/tools/tool-settings";

export const dynamic = "force-dynamic";

// GET /api/plugins —— 已安装插件及其工具
export async function GET() {
  const { plugins, errors } = loadPlugins();
  return NextResponse.json({
    dir: pluginsDir(),
    plugins: plugins.map((p) => ({
      name: p.plugin,
      displayName: p.displayName,
      description: p.description,
      version: p.version,
      tools: p.tools.map((t) => ({
        name: t.schema.name,
        description: t.schema.description,
        enabled: isToolEnabled(t.schema.name),
      })),
    })),
    errors,
  });
}
