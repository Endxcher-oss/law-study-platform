/** 中文数字与条号解析：汉字条号 ⇄ 数字（含“之一”这类插入条）。用法见 docs/pipeline.md。 */

// 注意：○（U+25CB）不是合法标识符字符，键名必须加引号。

const DIGITS = {
  零: 0, 〇: 0, '○': 0, '一': 1, '二': 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

const UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

const CN_CHARS = '零〇○一二三四五六七八九十百千万两';

export function cnToInt(str) {
  if (str == null) return NaN;
  const s = String(str).trim();
  if (!s) return NaN;
  if (/^\d+$/.test(s)) return Number(s);

  let total = 0;
  let section = 0;
  let current = 0;
  let seen = false;

  for (const ch of s) {
    if (ch in DIGITS) {
      current = DIGITS[ch];
      seen = true;
      continue;
    }
    const unit = UNITS[ch];
    if (!unit) continue;
    seen = true;
    if (unit === 10000) {
      section = (section + (current || 0)) * unit;
      total += section;
      section = 0;
      current = 0;
    } else {
      section += (current || 1) * unit;
      current = 0;
    }
  }
  if (!seen) return NaN;
  return total + section + current;
}

export function intToCn(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return String(num ?? '');
  const digits = '零一二三四五六七八九';
  const units = ['', '十', '百', '千'];
  const str = String(n);
  if (n >= 10000) return String(n);
  let out = '';
  const len = str.length;
  let pendingZero = false;
  for (let i = 0; i < len; i++) {
    const d = Number(str[i]);
    const pos = len - i - 1;
    if (d === 0) {
      if (out && pos > 0) pendingZero = true;
      continue;
    }
    if (pendingZero) { out += '零'; pendingZero = false; }
    out += (d === 1 && pos === 1 && i === 0) ? '' : digits[d];
    out += units[pos] ?? '';
  }
  return out || '零';
}

const CN_NUM = `[${CN_CHARS}]+`;

const RE_ARTICLE = new RegExp(String.raw`第(${CN_NUM})条(?:之(${CN_NUM}))?`, 'g');
const RE_ARTICLE_NUM = new RegExp(String.raw`(?:第)?(\d+)条(?:之(${CN_NUM}))?`, 'g');
const RE_KUAN = new RegExp(String.raw`第(${CN_NUM}|\d+)款`, 'g');
const RE_XIANG = new RegExp(String.raw`第(${CN_NUM}|\d+|[（(][一二三四五六七八九十\d]+[)）])项`, 'g');

export function findArticleRefs(text) {
  const out = [];
  if (!text) return out;
  RE_ARTICLE.lastIndex = 0;
  let m;
  while ((m = RE_ARTICLE.exec(text)) !== null) {
    const number = cnToInt(m[1]);
    if (!Number.isFinite(number)) continue;
    out.push({
      index: m.index,
      endIndex: m.index + m[0].length,
      raw: m[0],
      number,
      suffix: m[2] ? `之${m[2]}` : null,
    });
  }
  RE_ARTICLE_NUM.lastIndex = 0;
  while ((m = RE_ARTICLE_NUM.exec(text)) !== null) {
    out.push({
      index: m.index,
      endIndex: m.index + m[0].length,
      raw: m[0],
      number: Number(m[1]),
      suffix: m[2] ? `之${m[2]}` : null,
    });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

export function findGranularity(text, fromIndex) {
  const tail = text.slice(fromIndex, fromIndex + 40);
  let kuan = null;
  let xiang = null;
  const mk = new RegExp(String.raw`^第(${CN_NUM}|\d+)款`).exec(tail);
  if (mk) kuan = /^\d+$/.test(mk[1]) ? Number(mk[1]) : cnToInt(mk[1]);
  const mx = new RegExp(String.raw`^第[（(]?(${CN_NUM}|\d+)[)）]?项`).exec(tail);
  if (mx) xiang = /^\d+$/.test(mx[1]) ? Number(mx[1]) : cnToInt(mx[1]);
  return { kuan, xiang };
}

export function suffixSeq(suffix) {
  if (!suffix) return 0;
  const m = String(suffix).match(/^(?:之)?(.+)$/);
  if (!m) return 0;
  const n = cnToInt(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseDisplayNumber(input) {
  const s = String(input ?? '').replace(/\s/g, '');
  const m = s.match(new RegExp(String.raw`^第(${CN_NUM}|\d+)条(?:之(${CN_NUM}|\d+))?$`));
  if (!m) return null;
  const number = /^\d+$/.test(m[1]) ? Number(m[1]) : cnToInt(m[1]);
  if (!Number.isFinite(number) || number <= 0) return null;
  const seq = m[2] ? suffixSeq(`之${m[2]}`) : 0;
  const suffix = m[2] ? `之${intToCn(suffixSeq(`之${m[2]}`))}` : null;
  return { number, suffix, seq, slug: seq ? `${number}-${seq}` : String(number) };
}

export function articleSortKey(number, seq) {
  return Number(number) * 10 + (Number(seq) || 0);
}

export function slugOf(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const simple = s.match(/^(\d+)(?:-(\d+))?$/);
  if (simple) return Number(simple[2]) > 0 ? `${Number(simple[1])}-${Number(simple[2])}` : String(Number(simple[1]));
  const parsed = parseDisplayNumber(s);
  return parsed ? parsed.slug : null;
}

export function parseArticleNumber(input) {
  if (input == null) return NaN;
  const s = String(input).trim();
  const m = new RegExp(String.raw`第?(${CN_NUM}|\d+)条?`).exec(s);
  if (!m) return NaN;
  if (/^\d+$/.test(m[1])) return Number(m[1]);
  return cnToInt(m[1]);
}

export default { cnToInt, intToCn, findArticleRefs, findGranularity, parseArticleNumber, parseDisplayNumber, suffixSeq, articleSortKey, slugOf };
