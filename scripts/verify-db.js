#!/usr/bin/env node
/**
 * 数据完整性校验（只读，退出码 0 = 通过 / 1 = 有 error）。
 * 校验项清单见 docs/quality.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'db');

const argv = new Set(process.argv.slice(2));
const STRICT = argv.has('--strict');
const QUIET = argv.has('--quiet');
const MAX_PRINT = 25;

const errors = [];
const warnings = [];
const notes = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => notes.push(m);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(ROOT, p);
const squash = (s) => String(s || '').replace(/[\s\u3000`*_"']/g, '');

const REQUIRED = [
  'meta.json',
  'catalog.json',
  'links.json',
  'taxonomy.json',
  'taxonomy.map.json',
  'annotations/index.json',
  'annotations/curated.json',
  'annotations/derived.json',
  'cases/guiding.json',
  'cases/manifest.json',
];
for (const f of REQUIRED) if (!exists(path.join(DB, f))) err(`缺少数据库文件：db/${f}`);
if (errors.length) {
  report();
  process.exit(1);
}

const meta = readJson(path.join(DB, 'meta.json'));
const catalog = readJson(path.join(DB, 'catalog.json'));
const links = (readJson(path.join(DB, 'links.json')).links) || [];
const taxonomy = readJson(path.join(DB, 'taxonomy.json'));
const taxMap = readJson(path.join(DB, 'taxonomy.map.json'));
const annIndex = readJson(path.join(DB, 'annotations/index.json'));
const curated = readJson(path.join(DB, 'annotations/curated.json')).annotations || [];
const derived = readJson(path.join(DB, 'annotations/derived.json')).annotations || [];
const guiding = readJson(path.join(DB, 'cases/guiding.json'));
const caseManifest = readJson(path.join(DB, 'cases/manifest.json'));

const DIR_OF_CATEGORY = { 法律: 'codes', 宪法: 'codes', 司法解释: 'interpretations', 行政法规: 'regulations' };
const docById = new Map();
const articlesByDoc = new Map();
const articleById = new Map();
let articleTotal = 0;

for (const entry of catalog) {
  if (docById.has(entry.id)) err(`catalog.json 中 id 重复：${entry.id}`);
  docById.set(entry.id, entry);

  const dir = DIR_OF_CATEGORY[entry.category];
  if (!dir) {
    err(`catalog 中出现未知类别「${entry.category}」（${entry.id}）`);
    continue;
  }
  const file = path.join(DB, dir, `${entry.id}.json`);
  if (!exists(file)) {
    err(`catalog 声明了 ${entry.id}（${entry.category}），但 db/${dir}/${entry.id}.json 不存在`);
    continue;
  }
  const doc = readJson(file);
  if (doc.id !== entry.id) err(`${rel(file)} 的 id（${doc.id}）与 catalog（${entry.id}）不一致`);
  if (doc.category !== entry.category) warn(`${entry.id} 类别不一致：文件 ${doc.category} / catalog ${entry.category}`);
  if (doc.division !== entry.division) warn(`${entry.id} 编不一致：文件 ${doc.division} / catalog ${entry.division}`);
  if (doc.domain !== entry.domain) warn(`${entry.id} 门类不一致：文件 ${doc.domain} / catalog ${entry.domain}`);

  const arts = doc.articles || [];
  articlesByDoc.set(entry.id, arts);
  articleTotal += arts.length;

  const whole = arts.filter((a) => a.number === 0);
  if (whole.length && whole.length === arts.length && arts.length > 1) warn(`${entry.id} 全部条文 number=0`);

  let prev = 0;
  const seen = new Set();
  const gaps = [];
  let suffixCount = 0;
  for (const [i, a] of arts.entries()) {
    if (a.id && articleById.has(a.id)) err(`条文 id 重复：${a.id}`);
    if (a.id) articleById.set(a.id, { ...a, docId: entry.id, category: entry.category });
    if (!a.text || !a.text.trim()) err(`${entry.id} 第 ${a.displayNumber || a.number} 条正文为空`);
    if (a.docId && a.docId !== entry.id) err(`${a.id} 的 docId（${a.docId}）与所属文件不符`);
    if (a.number > 0 && !a.displayNumber) warn(`${a.id} 缺少 displayNumber`);

    const expectSlug = a.seq > 0 ? `${a.number}-${a.seq}` : String(a.number);
    if (!a.slug) err(`${entry.id} 第 ${i + 1} 个条文缺少 slug`);
    else if (a.slug !== expectSlug) err(`${a.id} 的 slug（${a.slug}）与条号不符（应为 ${expectSlug}）`);
    if (seen.has(a.slug)) err(`${entry.id} 条号重复：${a.displayNumber || a.slug}`);
    seen.add(a.slug);

    if (a.number < prev) err(`${entry.id} 第 ${i + 1} 个条文条号回退：${prev} → ${a.number}`);
    prev = Math.max(prev, a.number);

    if (a.number > 0 && a.seq > 0) {
      const p = arts[i - 1];
      if (!p || p.number !== a.number || p.seq !== a.seq - 1) {
        err(`${entry.id} ${a.displayNumber || a.slug} 未紧跟其基础条文（上一条为 ${p ? p.displayNumber || p.slug : '无'}）`);
      }
      suffixCount += 1;
    } else if (a.number > 0 && a.number !== i + 1 - suffixCount) {
      gaps.push(`${i + 1}→${a.number}`);
    }
  }
  if (gaps.length) {
    warn(`${entry.id} 条号与位置不符（源语料如此，非构建错误）：${gaps.slice(0, 4).join('、')}${gaps.length > 4 ? ' …' : ''}`);
  }
  if (suffixCount) notes.push(`${entry.id} 含 ${suffixCount} 条“之一/之二…”插入条文（已按基础条号归位）`);

  if (entry.articleCount !== arts.length) err(`${entry.id} articleCount=${entry.articleCount}，实际条文 ${arts.length}`);
}

const byCategory = (c) => catalog.filter((d) => d.category === c).length;
const lawLikeArticles = catalog.filter((d) => d.category !== '司法解释').reduce((n, d) => n + (articlesByDoc.get(d.id) || []).length, 0);
const isLawArticle = (id) => {
  const a = articleById.get(id);
  const d = a && docById.get(a.docId);
  return !!d && d.category !== '司法解释';
};
const linkedTargets = new Set(links.filter((l) => l.t && isLawArticle(l.t)).map((l) => l.t));

const expect = {
  documents: catalog.length,
  codes: byCategory('法律') + byCategory('宪法'),
  interpretations: byCategory('司法解释'),
  regulations: byCategory('行政法规'),
  articles: articleTotal,
  links: links.length,
  cases: guiding.cases?.length ?? guiding.count,
  annotations: curated.length + derived.length,
};
for (const [k, v] of Object.entries(expect)) {
  if (meta.counts[k] !== v) err(`meta.counts.${k}=${meta.counts[k]}，实际 ${v}`);
}
if (guiding.count !== guiding.cases?.length) err(`cases/guiding.json count=${guiding.count}，实际 ${guiding.cases?.length} 条`);
if (caseManifest.length !== expect.cases) err(`cases/manifest.json ${caseManifest.length} 条，实际案例 ${expect.cases} 条`);

const diskFiles = ['codes', 'interpretations', 'regulations'].reduce(
  (n, d) => n + fs.readdirSync(path.join(DB, d)).filter((f) => f.endsWith('.json')).length,
  0,
);
note(`磁盘文件：法律/宪法/解释/法规 ${diskFiles} 个 + 案例 2 个；catalog 收录 ${catalog.length} 部`);

const divisionIds = new Set(taxonomy.divisions.map((d) => d.id));
const domainIds = new Set(taxonomy.divisions.flatMap((d) => (d.domains || []).map((x) => x.id)));
if (divisionIds.size !== taxonomy.divisions.length) err('taxonomy.json 中编 id 重复');
if (domainIds.size !== taxonomy.divisions.flatMap((d) => d.domains || []).length) err('taxonomy.json 中门类 id 重复');

for (const [docId, cls] of Object.entries(taxMap)) {
  if (!docById.has(docId)) {
    err(`taxonomy.map.json 中的 ${docId} 在 catalog 中不存在`);
    continue;
  }
  if (!divisionIds.has(cls.division)) err(`${docId} 的编「${cls.division}」不在 taxonomy.json 中`);
  if (cls.domain && !domainIds.has(cls.domain)) err(`${docId} 的门类「${cls.domain}」不在 taxonomy.json 中`);
  const entry = docById.get(docId);
  if (entry.division !== cls.division) err(`${docId} 编不一致：catalog ${entry.division} / map ${cls.division}`);
  if (cls.domain && entry.domain !== cls.domain) err(`${docId} 门类不一致：catalog ${entry.domain} / map ${cls.domain}`);
}
for (const entry of catalog) if (!taxMap[entry.id]) warn(`catalog 中的 ${entry.id} 没有 taxonomy 归类`);

for (const div of taxonomy.divisions) {
  const docs = catalog.filter((d) => d.division === div.id);
  const stats = meta.divisions?.[div.id];
  if (!stats) {
    warn(`meta.divisions 缺少 ${div.id}`);
    continue;
  }
  if (stats.documents !== docs.length) err(`meta.divisions.${div.id}.documents=${stats.documents}，实际 ${docs.length}`);
  const arts = docs.reduce((n, d) => n + (articlesByDoc.get(d.id) || []).length, 0);
  if (stats.articles !== arts) err(`meta.divisions.${div.id}.articles=${stats.articles}，实际 ${arts}`);
  const sumDomains = (div.domains || []).reduce((n, x) => n + (x.articles || 0), 0);
  if (sumDomains && sumDomains !== stats.articles) {
    warn(`${div.id} 门类条文合计 ${sumDomains} ≠ 编条文 ${stats.articles}`);
  }
}

const CONF = new Set(['explicit', 'list', 'contextual', 'document']);
const seenLinks = new Set();
let docLinks = 0;
let mentionTotal = 0;
const linkAttribution = {};
const mergeKeyOf = (l) =>
  [l.s, l.t || '', l.td || '', l.tn ?? '', l.ts || '', l.c, l.raw || '', l.name || '', l.note || ''].join('>');
for (const [i, l] of links.entries()) {
  const at = `links[${i}]`;
  if (!l.s) err(`${at} 缺少源条文 s`);
  if (!l.sd) err(`${at} 缺少源文件 sd`);
  if (!CONF.has(l.c)) err(`${at} confidence 非法：${l.c}`);
  if (!allExists(l.s)) err(`${at} 源条文不存在：${l.s}`);
  if (!docById.has(l.sd)) err(`${at} 源文件不存在：${l.sd}`);
  if (l.c === 'document') {
    docLinks++;
    if (!l.tn) err(`${at} document 级关联缺少条号 tn`);
    if (l.td && !docById.has(l.td)) err(`${at} 目标文件不存在：${l.td}`);
  } else {
    if (!l.t) err(`${at} 缺少目标条文 t`);

    if (!allExists(l.t)) err(`${at} 目标条文不存在：${l.t}`);
    if (!docById.has(l.td)) err(`${at} 目标文件不存在：${l.td}`);
  }
  if (l.s === l.t) err(`${at} 指向自身：${l.s}`);
  if (!Number.isInteger(l.mentions) || l.mentions < 1)
    err(`${at} mentions 必须是 ≥1 的整数（“处”数），实际：${l.mentions}`);
  mentionTotal += l.mentions || 0;
  const key = mergeKeyOf(l);
  if (seenLinks.has(key))
    err(`${at} 与另一条关联完全重复（同源、同目标、同写法），应在构建时合并为一条并用 mentions 计数`);
  seenLinks.add(key);
  linkAttribution[l.c] = (linkAttribution[l.c] || 0) + 1;
}
function allExists(id) {
  return !!id && articleById.has(id);
}
note(`关联：${Object.entries(linkAttribution).map(([k, v]) => `${k} ${v}`).join(' / ')}（其中 document 级 ${docLinks} 条指明条号但未定位到具体条文）`);
note(`关联去重：${links.length} 条关联记录（已按“同源 + 同目标 + 同写法”合并），合计 ${mentionTotal} 处提及`);
if (meta.counts?.linkMentions !== undefined && meta.counts.linkMentions !== mentionTotal) {
  err(`meta.counts.linkMentions ${meta.counts.linkMentions} ≠ links 的 mentions 总和 ${mentionTotal}`);
}

const LEVELS = new Set(['key', 'warning', 'standard']);
const annById = new Map();
const checkAnnotation = (a, kind) => {
  const at = `${kind} 注解 ${a.id || '(无 id)'}`;
  if (!a.id) return err(`${at} 缺少 id`);
  if (annById.has(a.id)) err(`注解 id 重复：${a.id}`);
  annById.set(a.id, a);
  if (a.source !== kind) err(`${at} source=${a.source}，与所在文件不符（应为 ${kind}）`);
  if (!a.topic) err(`${at} 缺少 topic`);
  if (!docById.has(a.lawId)) err(`${at} lawId 不存在：${a.lawId}`);
  const art = articlesByDoc.get(a.lawId) || [];
  if (a.articleNumber !== undefined && a.articleNumber !== null && a.articleNumber > 0) {
    const max = Math.max(...art.map((x) => x.number || 0), 0);
    const base = Number(String(a.articleNumber).split('-')[0]);
    if (Number.isFinite(base) && base > max) err(`${at} 条号 ${a.articleNumber} 超出 ${a.lawId} 的最大条号 ${max}`);
  }
  if (!a.articleId) err(`${at} 缺少 articleId`);
  else if (!articleById.has(a.articleId)) err(`${at} articleId 不存在：${a.articleId}`);
  else if (articleById.get(a.articleId).docId !== a.lawId) err(`${at} articleId 与 lawId 不符：${a.articleId} / ${a.lawId}`);

  if (kind === 'curated') {
    if (!a.question) err(`${at} 缺少 question`);
    if (!Array.isArray(a.analysis) || !a.analysis.length) err(`${at} 缺少 analysis`);
    if (!LEVELS.has(a.level)) err(`${at} level 非法：${a.level}`);
    if (!Array.isArray(a.basis) || !a.basis.length) {
      if (!Array.isArray(a.references) || !a.references.length) {
        err(`${at} 既无 basis（依据条文）也无 references（外部依据说明）`);
      } else {
        note(`${at} 无库内依据条文，已用 references 说明外部依据（${a.references.length} 条）`);
      }
    }
    for (const b of a.basis || []) {
      if (!b.articleId) err(`${at} basis 缺少 articleId`);
      else if (!articleById.has(b.articleId)) err(`${at} basis 指向不存在的条文：${b.articleId}`);
      if (!b.quote) warn(`${at} basis ${b.articleId} 没有引文 quote`);
      if (!b.docId) warn(`${at} basis ${b.articleId} 没有 docId`);
      if (b.docId && !docById.has(b.docId)) err(`${at} basis.docId 不存在：${b.docId}`);
      if (b.docId && !docById.has(b.docId)) err(`${at} basis.docId 不存在：${b.docId}`);
    }
  } else {
    if (!Array.isArray(a.basis) || !a.basis.length) warn(`${at} 缺少 basis`);
    for (const b of a.basis || []) {
      if (b.articleId && !articleById.has(b.articleId)) err(`${at} basis 指向不存在的条文：${b.articleId}`);
    }
  }
};
for (const a of curated) checkAnnotation(a, 'curated');
for (const a of derived) checkAnnotation(a, 'derived');

if (annIndex.length !== curated.length + derived.length) {
  err(`annotations/index.json ${annIndex.length} 条 ≠ 人工 ${curated.length} + 派生 ${derived.length}`);
}
const indexIds = new Set(annIndex.map((x) => x.id));
for (const a of [...curated, ...derived]) if (!indexIds.has(a.id)) err(`annotations/index.json 缺少 ${a.id}`);
note(`注解：人工 ${curated.length} 条（重点 ${curated.filter((a) => a.level === 'key').length}）/ 自动派生 ${derived.length} 条`);

{
  const rubricsFile = path.join(DB, 'rubrics.json');
  if (!exists(rubricsFile)) {
    warn('缺少 db/rubrics.json（条旨表）；跑一次 npm run build 即可生成');
  } else {
    const doc = readJson(rubricsFile);
    const rubrics = doc.rubrics || [];
    if (doc.count !== rubrics.length) err(`rubrics.json count ${doc.count} ≠ 实际 ${rubrics.length}`);
    const seenRubric = new Set();
    for (const r of rubrics) {
      const key = `${r.docId}#${r.slug}`;
      const target = articleById.get(r.articleId);
      if (!target) {
        err(`条旨 ${key} 指向的条文不存在：${r.articleId}`);
        continue;
      }
      if (target.docId !== r.docId || target.slug !== r.slug)
        err(`条旨 ${key} 与实际条文（${target.docId}#${target.slug}）不一致`);
      if (seenRubric.has(r.articleId)) err(`条旨重复：${key}`);
      seenRubric.add(r.articleId);
      if (!String(r.text || '').trim()) err(`条旨 ${key} 为空`);
      const badChars = [...new Set(String(r.text || '').replace(/[\u4e00-\u9fa5A-Za-z0-9 、]/g, '').split(''))];
      if (badChars.length) err(`条旨 ${key} 含标点/特殊符号“${badChars.join('')}”：${r.text}`);
    }
    let bracketed = 0;
    for (const a of articleById.values()) if (String(a.text || '').includes('【')) bracketed++;
    if (bracketed) err(`有 ${bracketed} 条条文正文含【】，疑似把条旨混进了正文`);
    note(`条旨：${rubrics.length} 条（编辑层；条文正文仍为官方原文，不含【】）`);
  }
}

let quoteChecked = 0;
let quoteFailed = 0;
for (const a of curated) {
  for (const b of a.basis || []) {
    const target = articleById.get(b.articleId);
    if (!target || !b.quote) continue;
    quoteChecked++;
    const hay = squash(target.text);
    const pieces = String(b.quote)
      .split(/\n+/)
      .map((s) => squash(s).replace(/[…]+$/, ''))
      .filter((s) => s.length > 4);
    const ok = pieces.length ? pieces.every((p) => hay.includes(p)) : hay.includes(squash(b.quote));
    if (!ok) {
      quoteFailed++;
      err(`人工注解 ${a.id} 引文与 ${b.articleId} 原文不符：「${String(b.quote).slice(0, 36)}…」`);
    }
    if (target.docId !== b.docId) warn(`人工注解 ${a.id} 的 basis.docId（${b.docId}）与实际所属（${target.docId}）不一致`);
  }
}
if (quoteFailed === 0) note(`逐字核对人工注解引文 ${quoteChecked} 处，全部与原文一致`);

let caseRefs = 0;
const caseById = new Map();
for (const c of guiding.cases || []) {
  const at = `案例 ${c.id}`;
  const seenCaseRefs = new Set();
  if (caseById.has(c.id)) err(`${at} 与 ${caseById.get(c.id).id} 的 id 重复`);
  caseById.set(c.id, c);
  if (!c.title) err(`${at} 缺少标题`);
  if (!Array.isArray(c.related)) {
    warn(`${at} 缺少 related`);
    continue;
  }
  for (const r of c.related) {
    caseRefs++;
    if (r.lawId && !docById.has(r.lawId)) err(`${at} 关联的法不存在：${r.lawId}`);
    if (r.articleId && !articleById.has(r.articleId)) err(`${at} 关联的条文不存在：${r.articleId}`);
    if (r.articleId && r.lawId && articleById.get(r.articleId).docId !== r.lawId) {
      err(`${at} 关联条文与法不符：${r.articleId} / ${r.lawId}`);
    }
    if (r.articleNumber && r.lawId && (articlesByDoc.get(r.lawId) || []).length && r.articleNumber > articlesByDoc.get(r.lawId).length) {
      warn(`${at} 引 ${r.lawId} 第 ${r.articleNumber} 条超出该法条文数`);
    }
    const refKey = JSON.stringify(r);
    if (seenCaseRefs.has(refKey)) err(`${at} 有完全重复的关联条目（同法、同条、同写法）：${r.articleId || r.raw}`);
    seenCaseRefs.add(refKey);
  }
}
for (const m of caseManifest) {
  if (!caseById.has(m.id)) err(`cases/manifest.json 中的 ${m.id} 在 guiding.json 中不存在`);
  for (const aid of m.articleIds || []) if (!articleById.has(aid)) err(`manifest ${m.id} 的条文不存在：${aid}`);
}
note(`指导性案例 ${caseById.size} 件 / 关联引用 ${caseRefs} 处`);

if (meta.coverage) {
  if (meta.coverage.lawArticles !== lawLikeArticles) {
    err(`meta.coverage.lawArticles=${meta.coverage.lawArticles}，实际 ${lawLikeArticles}`);
  }
  if (meta.coverage.lawArticlesWithLinks !== linkedTargets.size) {
    err(`meta.coverage.lawArticlesWithLinks=${meta.coverage.lawArticlesWithLinks}，实际 ${linkedTargets.size}`);
  }
  const derivedTargets = new Set(derived.map((a) => a.articleId).filter(isLawArticle));
  if (meta.coverage.lawArticlesWithAnnotations !== derivedTargets.size) {
    err(`meta.coverage.lawArticlesWithAnnotations=${meta.coverage.lawArticlesWithAnnotations}，实际 ${derivedTargets.size}`);
  }
  const pct = ((linkedTargets.size / lawLikeArticles) * 100).toFixed(1);
  note(`覆盖度：${linkedTargets.size} / ${lawLikeArticles} 条法条被司法解释引用（${pct}%）；${derivedTargets.size} 条有自动派生注解`);
}

function printList(label, list, mark) {
  if (!list.length) return;
  console.log(`\n${label} ${list.length} 条：`);
  for (const item of list.slice(0, MAX_PRINT)) console.log(`  ${mark} ${item}`);
  if (list.length > MAX_PRINT) console.log(`  … 其余 ${list.length - MAX_PRINT} 条省略`);
}

function report() {
  const line = '─'.repeat(66);
  console.log(line);
  console.log('法条学习平台 · 数据库校验报告   db/');
  console.log(line);
  if (!QUIET) for (const n of notes) console.log(`  · ${n}`);
  printList('警告', warnings, '⚠');
  printList('错误', errors, '✗');
  if (!errors.length) console.log('\n✓ 无错误' + (warnings.length ? '' : '，无警告'));
  console.log(line);
  console.log(
    `文件 ${expect.documents} · 条文 ${expect.articles} · 关联 ${expect.links} · 案例 ${expect.cases} · 注解 ${expect.annotations}`,
  );
  console.log(line);
}

report();
process.exit(errors.length || (STRICT && warnings.length) ? 1 : 0);
