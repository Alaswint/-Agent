/**
 * 中文自然语言时间解析器
 * 将 "10分钟后"、"明天下午3点"、"2026-08-30 15:00" 等描述解析为具体时间。
 * 返回 null 表示无法解析。
 */

const CN_NUM: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 解析中文数字（支持 二十、十五、两百 等组合，最大到千级） */
export function parseChineseNumber(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);

  let total = 0;
  let current = 0;
  let matched = false;

  for (const ch of t) {
    if (ch in CN_NUM) {
      const v = CN_NUM[ch];
      if (v === 10) {
        current = current === 0 ? 10 : current * 10;
      } else {
        current = current >= 10 ? current + v : v;
      }
      matched = true;
    } else if (ch === "百") {
      current = (current || 1) * 100;
      total += current;
      current = 0;
      matched = true;
    } else if (ch === "千") {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
      matched = true;
    } else if (ch === "点" || ch === "分" || ch === "秒") {
      // 结束符
      break;
    } else {
      return null;
    }
  }
  if (!matched) return null;
  return total + current;
}

/** 时段（上下午）映射到小时偏移规则 */
interface Meridiem {
  name: string;
  /** 将 1-12 小时制的小时转换为 24 小时制 */
  convert: (hour: number) => number;
  /** 该时段默认小时（未写小时时使用），null 表示没有默认值 */
  defaultHour: number | null;
}

const MERIDIEMS: Array<{ pattern: RegExp; def: Meridiem }> = [
  { pattern: /凌晨|深夜|夜里|半夜/, def: { name: "凌晨", convert: (h) => (h === 12 ? 0 : h), defaultHour: 2 } },
  { pattern: /早上|早晨|清晨/, def: { name: "早上", convert: (h) => (h === 12 ? 12 : h), defaultHour: 8 } },
  { pattern: /上午|早上/, def: { name: "上午", convert: (h) => (h === 12 ? 12 : h), defaultHour: 10 } },
  { pattern: /中午|正午/, def: { name: "中午", convert: (h) => (h === 12 ? 12 : h), defaultHour: 12 } },
  { pattern: /下午|午后/, def: { name: "下午", convert: (h) => (h === 12 ? 12 : h + 12), defaultHour: 14 } },
  { pattern: /傍晚/, def: { name: "傍晚", convert: (h) => (h === 12 ? 12 : h + 12), defaultHour: 18 } },
  { pattern: /晚上|今晚|明晚|晚间/, def: { name: "晚上", convert: (h) => (h === 12 ? 24 : h + 12), defaultHour: 20 } },
];

function parseMeridiem(text: string): Meridiem | null {
  for (const m of MERIDIEMS) {
    if (m.pattern.test(text)) return m.def;
  }
  return null;
}

/** 解析 "3点"、"3:30"、"3点半"、"3点45分" 中的时分（1-12 或 0-23 小时制均可） */
function parseClockTime(text: string): { hour: number; minute: number; isChineseHour: boolean } | null {
  // HH:MM 或 HH：MM
  const hm = text.match(/(\d{1,2})[:：](\d{1,2})/);
  if (hm) {
    const hour = parseInt(hm[1], 10);
    const minute = parseInt(hm[2], 10);
    if (hour <= 24 && minute < 60) return { hour: hour % 24, minute, isChineseHour: false };
  }

  // X点Y分 / X点半 / X点一刻 / X点
  const clock = text.match(
    /(\d{1,2}|[零一二两三四五六七八九十])[点时]/
  );
  if (!clock) return null;

  const hourRaw = parseChineseNumber(clock[1]);
  if (hourRaw === null || hourRaw > 24) return null;
  const hour = hourRaw % 24;

  const rest = text.slice((clock.index ?? 0) + clock[0].length);

  // X点半
  if (/^半/.test(rest)) return { hour, minute: 30, isChineseHour: true };
  // X点一刻
  if (/^一刻/.test(rest)) return { hour, minute: 15, isChineseHour: true };
  // X点（三刻 = 45 分，较少用但顺手支持）
  if (/三刻/.test(rest)) return { hour, minute: 45, isChineseHour: true };

  // X点Y分
  const minMatch = rest.match(/^(\d{1,2}|[零一二两三四五六七八九十]+)分/);
  if (minMatch) {
    const minute = parseChineseNumber(minMatch[1]);
    if (minute !== null && minute < 60) return { hour, minute, isChineseHour: true };
  }

  return { hour, minute: 0, isChineseHour: true };
}

/** 解析 "明天"、"后天"、"大后天"、"3天后" 等日期偏移（返回天数偏移），无日期信息返回 null */
function parseDayOffset(text: string, now: Date): number | null {
  if (/大后天/.test(text)) return 3;
  if (/后天|后晚/.test(text)) return 2;
  if (/明天|明晚|明早|明晨|次日/.test(text)) return 1;
  if (/今天|今晚|当日/.test(text)) return 0;
  if (/大前天/.test(text)) return -3;
  if (/前天/.test(text)) return -2;
  if (/昨天/.test(text)) return -1;

  const relDay = text.match(/(\d+|[一二两三四五六七八九十]+)天[后前]/);
  if (relDay) {
    const n = parseChineseNumber(relDay[1]);
    if (n !== null) return relDay[0].includes("前") ? -n : n;
  }

  const relWeek = text.match(/(\d+|[一二两三四五六七八九十]+)[个周]?(?:星期|礼拜|周)[后前]/);
  if (relWeek) {
    const n = parseChineseNumber(relWeek[1]);
    if (n !== null) return (relWeek[0].includes("前") ? -n : n) * 7;
  }

  return null;
}

/** 解析绝对日期："2026-08-30"、"2026/8/30"、"8月30日"、"8-30" */
function parseAbsoluteDate(text: string, now: Date): { year: number; month: number; day: number } | null {
  // YYYY-MM-DD 或 YYYY/M/D
  const full = text.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})[日号]?/);
  if (full) {
    const year = parseInt(full[1], 10);
    const month = parseInt(full[2], 10);
    const day = parseInt(full[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }

  // M月D日 / M-D（沿用当前年份；若已过去则顺延到明年）
  const md = text.match(/(?:^|[^\d])(\d{1,2})[-/月.](\d{1,2})[日号]?/);
  if (md) {
    const month = parseInt(md[1], 10);
    const day = parseInt(md[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = now.getFullYear();
      const candidate = new Date(year, month - 1, day);
      // 若今年该日期已过，视为明年
      if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) year += 1;
      return { year, month, day };
    }
  }

  return null;
}

/** 解析相对时长："10分钟后"、"1小时后"、"两小时半后"、"X天后" */
function parseRelativeDuration(text: string): { seconds: number; dayOnly: boolean } | null {
  // X天(数)后 单独处理，因为可能与时钟时间组合（"3天后下午5点"少见，暂不支持组合，直接解析）
  const dayRel = text.match(/(\d+|[一二两三四五六七八九十]+)\s*天[后後]/);
  if (dayRel) {
    const n = parseChineseNumber(dayRel[1]);
    if (n !== null) return { seconds: n * 86400, dayOnly: true };
  }

  // 组合：X小时Y分（钟）后 / X小时半 / X分钟 / 半小时后 / X刻钟后
  let seconds = 0;
  let matched = false;

  const hours = text.match(/(\d+|[一二两三四五六七八九十]+)\s*(?:个)?(?:小时|钟头)/);
  if (hours) {
    const h = parseChineseNumber(hours[1]);
    if (h !== null) { seconds += h * 3600; matched = true; }
  }

  const halfHour = /半个?(?:小时|钟头)/.test(text);
  if (halfHour) { seconds += 1800; matched = true; }

  const quarter = /一刻钟/.test(text);
  if (quarter) { seconds += 900; matched = true; }

  const minutes = text.match(/(\d+|[一二两三四五六七八九十]+)\s*(?:个)?分(?:钟)?/);
  if (minutes) {
    const m = parseChineseNumber(minutes[1]);
    if (m !== null) { seconds += m * 60; matched = true; }
  }

  const secs = text.match(/(\d+|[一二两三四五六七八九十]+)\s*秒/);
  if (secs) {
    const s = parseChineseNumber(secs[1]);
    if (s !== null) { seconds += s; matched = true; }
  }

  if (!matched) return null;
  return { seconds, dayOnly: false };
}

/**
 * 主函数：解析时间描述为 Date。
 * @param input 时间描述文本
 * @param now 基准时间（默认当前时间）
 * @returns 解析出的时间；无法解析返回 null
 */
export function parseTimeExpression(input: string, now: Date = new Date()): Date | null {
  const text = input.trim().replace(/\s+/g, " ").replace(/[，。？！、\s]+$/, "");
  if (!text) return null;

  const base = new Date(now);
  base.setSeconds(0, 0);

  // 1. 相对时长（"10分钟后"等）
  const rel = parseRelativeDuration(text);
  if (rel && /后|後/.test(text) && !parseClockTime(text)) {
    return new Date(base.getTime() + rel.seconds * 1000);
  }

  // 2. 绝对日期（"2026-08-30 15:00"、"8月30日"）—— 优先于相对日期分支，
  //    避免 "8月30日 15:00" 里的 "15:00" 被当作今天的时刻
  const absDate = parseAbsoluteDate(text, now);
  if (absDate) {
    const date = new Date(absDate.year, absDate.month - 1, absDate.day, 0, 0, 0, 0);
    const absClock = parseClockTime(text);
    if (absClock) {
      let hour = absClock.hour;
      const absMeridiem = parseMeridiem(text);
      if (absMeridiem && absClock.hour >= 1 && absClock.hour <= 12) {
        hour = absMeridiem.convert(absClock.hour);
      }
      date.setHours(hour % 24, absClock.minute, 0, 0);
      if (hour >= 24) date.setDate(date.getDate() + 1);
    } else {
      date.setHours(9, 0, 0, 0); // 只有日期，默认 9 点
    }
    return date;
  }

  // 3. 相对天数 + 时钟时间（"明天下午3点"、"后天15:00"）
  const dayOffset = parseDayOffset(text, now);
  const clock = parseClockTime(text);
  const meridiem = parseMeridiem(text);

  if (dayOffset !== null || clock !== null) {
    const date = new Date(base);
    if (dayOffset !== null) {
      date.setDate(date.getDate() + dayOffset);
    }

    if (clock !== null) {
      let hour = clock.hour;
      if (meridiem && clock.hour >= 1 && clock.hour <= 12) {
        hour = meridiem.convert(clock.hour);
      }
      date.setHours(hour % 24, clock.minute, 0, 0);
      if (hour >= 24) date.setDate(date.getDate() + 1); // "晚上12点" 视为次日零点

      // 目标是今天（纯时刻或"今天X点"）：若已过，先尝试小时制换算，否则顺延到明天
      const isToday = dayOffset === null || dayOffset === 0;
      if (isToday && date.getTime() < base.getTime()) {
        // 裸的中文小时（无时段词，如"3点"）：可能是下午 3 点，先尝试 +12
        if (!meridiem && clock.isChineseHour && clock.hour >= 1 && clock.hour <= 11) {
          const alt = new Date(base);
          alt.setHours(clock.hour + 12, clock.minute, 0, 0);
          if (alt.getTime() >= base.getTime()) {
            return alt;
          }
        }
        date.setDate(date.getDate() + 1);
      }
      return date;
    }

    // 只有日期偏移、没有时刻（"明天"）：默认当天 09:00；今天则视为无效（需要更具体的时间）
    if (dayOffset !== null) {
      if (dayOffset === 0) return null; // "今天" 无时刻 → 信息不足
      date.setHours(9, 0, 0, 0);
      return date;
    }
  }

  // 4. 纯时段词 + 小时（"下午3点" 走过 clock 逻辑了）；纯时段（"明天晚上"）给默认值
  if (meridiem && meridiem.defaultHour !== null && dayOffset !== null) {
    const date = new Date(base);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(meridiem.defaultHour, 0, 0, 0);
    return date;
  }

  return null;
}
