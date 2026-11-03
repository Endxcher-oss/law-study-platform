/** 抓取《生态环境法典》全文并生成 data/raw/laws/ecological-environment-code.json。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/raw/laws/ecological-environment-code.json');
const DOC_ID = 'ecological-environment-code';
const URLS = [
  'https://www.mee.gov.cn/ywgz/fgbz/fl/202603/t20260313_1146496.shtml',
];

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function cnToInt(text) {
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of text) {
    if (ch in CN_DIGITS) {
      digit = CN_DIGITS[ch];
    } else if (ch === '十') {
      section += (digit || 1) * 10;
      digit = 0;
    } else if (ch === '百') {
      section += (digit || 1) * 100;
      digit = 0;
    } else if (ch === '千') {
      section += (digit || 1) * 1000;
      digit = 0;
    }
  }
  return section + digit;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function htmlToLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d|tr|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[\u00a0\u3000]/g, ' ').trim())
    .filter(Boolean);
}

async function download() {
  let lastError = null;
  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 law-study-platform fetch-eco-code' },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { url, html: await res.text() };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('下载失败');
}

const HEADING = [
  [/^第[零一二三四五六七八九十]+编\s*[^\s]/, 1],
  [/^第[零一二三四五六七八九十]+分编\s*[^\s]/, 2],
  [/^第[零一二三四五六七八九十]+章\s*[^\s]/, 3],
  [/^第[零一二三四五六七八九十]+节\s*[^\s]/, 4],
];
const ARTICLE = /^第([零一二三四五六七八九十百千]+)条\s*(\S[\s\S]*)$/;

function normalizeTitle(line) {
  return line.replace(/\s+/g, '');
}

function parse(lines) {
  const firstArticle = lines.findIndex((line) => ARTICLE.test(line));
  if (firstArticle < 0) throw new Error('没有找到条文');
  let start = firstArticle;
  for (let i = firstArticle - 1; i >= 0; i--) {
    if (HEADING[0][0].test(lines[i])) {
      start = i;
      break;
    }
  }

  const sections = [];
  const articles = [];
  const stack = [];
  let order = 0;
  let current = null;

  for (const line of lines.slice(start)) {
    if (/^(附件|扫一扫|相关阅读|相关推荐|版权所有|网站声明|分享到|打印本页|关闭窗口)/.test(line)) break;

    const heading = HEADING.find(([re]) => re.test(line));
    if (heading) {
      const level = heading[1];
      const title = normalizeTitle(line);
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack.map((item) => item.title);
      order += 1;
      sections.push({ id: `${DOC_ID}-section-${String(sections.length + 1).padStart(4, '0')}`, title, level, path: parent, order });
      stack.push({ level, title });
      current = null;
      continue;
    }

    const match = line.match(ARTICLE);
    if (match) {
      const number = cnToInt(match[1]);
      order += 1;
      current = {
        id: `${DOC_ID}-${String(number).padStart(4, '0')}`,
        articleNumber: number,
        displayNumber: `第${match[1]}条`,
        path: stack.map((item) => item.title),
        text: match[2].trim(),
        order,
      };
      articles.push(current);
      continue;
    }

    if (current) {
      current.text += `\n${line}`;
      order += 1;
      continue;
    }
  }

  return { sections, articles };
}

function validate({ sections, articles }) {
  const problems = [];
  if (articles.length < 1200) problems.push(`条文只有 ${articles.length} 条`);
  articles.forEach((article, index) => {
    if (article.articleNumber !== index + 1) problems.push(`条号不连续：${article.displayNumber} 位于第 ${index + 1} 位`);
    if (!article.text) problems.push(`${article.displayNumber} 没有正文`);
    if (!article.path.length) problems.push(`${article.displayNumber} 没有所属章节`);
    if (/(相关阅读|版权所有|京ICP|手机版|扫一扫)/.test(article.text)) problems.push(`${article.displayNumber} 混入网页尾栏`);
  });
  const levels = {};
  for (const section of sections) levels[section.level] = (levels[section.level] || 0) + 1;
  return { problems, levels };
}

async function main() {
  const { url, html } = await download();
  const lines = htmlToLines(html);
  const parsed = parse(lines);
  const { problems, levels } = validate(parsed);
  if (problems.length) {
    console.error(problems.slice(0, 20).join('\n'));
    process.exit(1);
  }

  const raw = {
    id: DOC_ID,
    officialId: '',
    title: '中华人民共和国生态环境法典',
    category: '法律',
    issuingAuthority: '全国人民代表大会',
    promulgationDate: '2026-03-12',
    effectiveDate: '2026-08-15',
    status: 'effective',
    source: { url, retrievedAt: new Date().toISOString(), note: '生态环境部网站全文，用于离线检索' },
    paragraphCount: parsed.articles.reduce((sum, article) => sum + article.text.split('\n').length, 0),
    sectionCount: parsed.sections.length,
    articleCount: parsed.articles.length,
    sections: parsed.sections,
    articles: parsed.articles,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(raw, null, 1)}\n`);
  const chapterCount = levels[3] || 0;
  console.log(`生态环境法典：${parsed.articles.length} 条，${parsed.sections.length} 个章节（编 ${levels[1] || 0} / 分编 ${levels[2] || 0} / 章 ${chapterCount} / 节 ${levels[4] || 0}）`);
  console.log(`已写入 ${path.relative(ROOT, OUT)}（来源 ${url}）`);
}

main();
