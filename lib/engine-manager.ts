import { RoleplayEngine } from "@/lib/engine";
import { loadCharacter } from "@/lib/character";

/**
 * 对话引擎缓存管理。
 * Next.js dev 模式下模块可能被重复加载，挂到 globalThis 保证全进程唯一；
 * 角色 POST/DELETE 时调用 invalidateEngine 让改动立即生效。
 */
const globalAny = globalThis as any;
const engines: Map<string, RoleplayEngine> =
  globalAny.__roleplayEngines || (globalAny.__roleplayEngines = new Map());

export function getEngine(characterId: string): RoleplayEngine {
  if (!engines.has(characterId)) {
    const character = loadCharacter(characterId);
    engines.set(characterId, new RoleplayEngine(character, characterId));
  }
  return engines.get(characterId)!;
}

/** 使指定角色的引擎缓存失效；不传 id 则清空全部 */
export function invalidateEngine(characterId?: string) {
  if (characterId === undefined) {
    engines.clear();
  } else {
    engines.delete(characterId);
  }
}
