/** 法条文本清洗：统一空白、剥离混入正文的编/章/节标题。规则见 docs/pipeline.md。 */

const RE_PART_HEADING = /^[一二三四五六七八九十]+、[^\n。；：，]{2,22}$/;
const RE_CHAPTER_HEADING = /^第[一二三四五六七八九十]+[编章节]\s*[^\n]{0,40}$/;
const RE_HZ_HEADING = /^[（(][一二三四五六七八九十]+[)）][^\n。；：，]{2,22}$/;

function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0|\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();
}

export function isHeadingLine(line) {
  const t = line.trim();
  if (!t || t.length > 40) return false;
  if (RE_PART_HEADING.test(t) || RE_CHAPTER_HEADING.test(t) || RE_HZ_HEADING.test(t)) return true;
  return false;
}

export function cleanArticleText(raw) {
  let text = normalizeText(raw);
  const trailingHeadings = [];

  for (let guard = 0; guard < 4; guard++) {
    const lines = text.split('\n');
    const last = lines[lines.length - 1];
    if (lines.length > 1 && isHeadingLine(last)) {
      trailingHeadings.unshift(last.trim());
      text = lines.slice(0, -1).join('\n').trim();
      continue;
    }
    break;
  }

  return { text, trailingHeadings };
}

export function splitParagraphs(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

export { normalizeText, RE_PART_HEADING, RE_CHAPTER_HEADING };
