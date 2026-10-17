#!/usr/bin/env node
/**
 * 数据库统计报告（只读 db/，另写 db/reports/stats.json）。
 *   node scripts/stats.js [--json] [--top=20]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, HIERARCHY } from '../server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB = path.join(ROOT, 'db');

const args = process.argv.slice(2);
const ONLY_JSON = args.includes('--json');
const TOP = Number((args.find((a) => a.startsWith('--top=')) || '').split('=')[1]) || 20;

const db = getDb();

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const pad = (s, n, right = false) => {
  const str = String(s);
  const w = [...str].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  const fill = ' '.repeat(Math.max(0, n - w));
  return right ? fill + str : str + fill;
};
const table = (headers, rows, rightCols = []) =>
  [headers, ...rows]
    .map((r) => r.map((c, i) => pad(c, 16, rightCols.includes(i))).join(' '))
    .join('\n');

const counts = db.meta.counts;
const docs = [...db.docs.values()];
const articles = [...db.articles.values()];
const totalArticles = articles.length;

const byDivision = db.taxonomy.divisions.map((div) => {
  const list = docs.filter((d) => d.division === div.id);
  const arts = list.reduce((n, d) => n + d.articles.length, 0);
  const linked = arts
    ? list.reduce((n, d) => n + d.articles.filter((a) => (db.linksByTarget.get(a.id) || []).length).length, 0)
    : 0;
  const annotated = list.reduce(
    (n, d) => n + d.articles.filter((a) => (db.derivedByArticle?.get(a.id) || []).length || db.curatedByArticle?.has(a.id)).length,
    0,
  );
  const interps = new Set();
  for (const d of list) for (const i of db.interpretationsOfLaw(d.id)) interps.add(i.docId);
  return {
    id: div.id,
    name: div.name,
    status: div.status,
    documents: list.length,
    articles: arts,
    domains: (div.domains || []).length,
    interps: interps.size,
    linked,
    annotated,
    cases: list.reduce((n, d) => n + db.casesOfLaw(d.id).length, 0),
  };
});

const byCategory = HIERARCHY.concat('指导性案例').map((cat) => {
  const list = db.catalog.filter((d) => d.category === cat);
  return { category: cat, documents: list.length, articles: list.reduce((n, d) => n + d.articleCount, 0) };
});
if (counts.cases) byCategory.push({ category: '指导性案例（正文）', documents: counts.cases, articles: 0 });

const linkByConfidence = {};
for (const l of db.links) linkByConfidence[l.c] = (linkByConfidence[l.c] || 0) + 1;

const hot = db.hotArticles(TOP, {});
const topDocs = docs
  .map((doc) => {
    const interps = db.interpretationsOfLaw(doc.id);
    const arts = doc.articles.filter((a) => (db.linksByTarget.get(a.id) || []).length).length;
    return { id: doc.id, title: doc.title, category: doc.category, interps: interps.length, linked: arts, articles: doc.articles.length };
  })
  .filter((x) => x.interps)
  .sort((a, b) => b.interps - a.interps || b.linked - a.linked)
  .slice(0, TOP);

const topInterpretations = docs
  .filter((d) => d.category === '司法解释')
  .map((d) => {
    const laws = db.lawsOfInterpretation(d.id);
    return { id: d.id, title: d.title, articles: d.articles.length, laws: laws.length };
  })
  .sort((a, b) => b.laws - a.laws || b.articles - a.articles)
  .slice(0, TOP);

const curated = db.curatedAnnotations;
const derived = db.derivedAnnotations;
const curatedByLevel = curated.reduce((acc, a) => ({ ...acc, [a.level]: (acc[a.level] || 0) + 1 }), {});
const curatedByDivision = curated.reduce((acc, a) => ({ ...acc, [a.division]: (acc[a.division] || 0) + 1 }), {});
const basisCount = curated.reduce((n, a) => n + (a.basis || []).length, 0);

const cases = db.cases;
const caseKeywords = new Map();
for (const c of cases) for (const k of c.keywords || []) caseKeywords.set(k, (caseKeywords.get(k) || 0) + 1);
const topCaseKeywords = [...caseKeywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
const caseLawRefs = new Map();
for (const c of cases) for (const r of c.related || []) caseLawRefs.set(r.lawId, (caseLawRefs.get(r.lawId) || 0) + 1);
const topCaseLaws = [...caseLawRefs.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP)
  .map(([lawId, n]) => ({ lawId, title: db.catalogById.get(lawId)?.shortTitle || lawId, count: n }));

const yearHist = new Map();
for (const d of db.catalog) {
  const y = (d.promulgationDate || '').slice(0, 4);
  if (y) yearHist.set(y, (yearHist.get(y) || 0) + 1);
}
const years = [...yearHist.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const unclassified = db.catalog.filter((d) => d.division === 'other' || d.domain === 'other-all');
const noArticles = docs.filter((d) => !d.articles.length);
const buildReport = fs.existsSync(path.join(DB, 'reports/build-report.json'))
  ? JSON.parse(fs.readFileSync(path.join(DB, 'reports/build-report.json'), 'utf8'))
  : null;

const stats = {
  generatedAt: new Date().toISOString(),
  builtAt: db.meta.builtAt,
  counts,
  byCategory,
  byDivision,
  linkByConfidence,
  looseLinks: { total: db.looseLinks.length, documents: db.looseBySource.size },
  linkStats: db.linkStats,
  coverage: db.meta.coverage,
  annotations: {
    curated: curated.length,
    derived: derived.length,
    curatedByLevel,
    curatedByDivision,
    basisCount,
  },
  cases: cases.length,
  topCitedArticles: hot.map((h) => ({
    articleId: h.article.id,
    law: h.article.docTitle,
    number: h.article.displayNumber,
    interps: h.interpCount ?? h.count ?? null,
  })),
  topLawsByInterps: topDocs,
  topInterpretations,
  topCaseKeywords,
  topCaseLaws,
  unclassified: unclassified.map((d) => ({ id: d.id, title: d.title })),
  docsWithoutArticles: noArticles.map((d) => d.id),
};

if (ONLY_JSON) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  const line = '═'.repeat(78);
  const sub = '─'.repeat(78);
  console.log(line);
  console.log('法律学习平台 · 数据库统计');
  console.log(`构建时间 ${db.meta.builtAt}   语料来源 ${db.meta.source?.name || '—'}`);
  console.log(line);
  console.log(
    `文档 ${counts.documents}（法律 ${find('法律')} / 宪法 ${find('宪法')} / 司法解释 ${find('司法解释')} / 行政法规 ${find('行政法规')}）` +
      `   条文 ${counts.articles}   关联 ${counts.links}${counts.linkMentions ? `（${counts.linkMentions} 处提及）` : ''}   案例 ${counts.cases}   注解 ${counts.annotations}`,
  );
  console.log(sub);
  console.log('【各编分布】');
  console.log(table(['编', '名称', '状态', '文件', '条文', '门类', '司法解释', '被引条文', '覆盖率', '注解'], byDivision.map((d) => [d.id, d.name, d.status, d.documents, d.articles, d.domains, d.interps, d.linked, pct(d.linked, d.articles), d.annotated])));
  console.log(sub);
  console.log('【关联强度】', Object.entries(linkByConfidence).map(([k, v]) => `${k} ${v}`).join('   '));
  console.log(`   未定位引用（未指明法律名）${db.looseLinks.length} 处，涉及 ${db.looseBySource.size} 部文档`);
  console.log(`   法条被司法解释引用覆盖：${db.meta.coverage?.lawArticlesWithLinks ?? '—'} / ${db.meta.coverage?.lawArticles ?? '—'}（${pct(db.meta.coverage?.lawArticlesWithLinks, db.meta.coverage?.lawArticles)}）`);
  console.log(sub);
  console.log(`【被引用最多的法条 Top ${TOP}】`);
  console.log(table(['法条', '名称', '条号', '被引司法解释数'], hot.map((h) => [(h.article.docShortTitle || h.article.docId).slice(0, 14), (h.article.path || []).join('/').slice(0, 20), h.article.displayNumber, h.interpCount ?? h.count ?? ''])));
  console.log(sub);
  console.log(`【关联司法解释最多的法律 Top ${TOP}】`);
  console.log(table(['法律', '司法解释', '被引条文', '条文总数'], topDocs.map((d) => [d.title.slice(0, 24), d.interps, d.linked, d.articles])));
  console.log(sub);
  console.log(`【覆盖法律最多的司法解释 Top ${TOP}】`);
  console.log(table(['司法解释', '涉及法律', '条文数'], topInterpretations.map((d) => [d.title.slice(0, 34), d.laws, d.articles])));
  console.log(sub);
  console.log(`【注解】人工 ${curated.length} 条（依据条文 ${basisCount} 处，按等级 ${Object.entries(curatedByLevel).map(([k, v]) => `${k} ${v}`).join(' / ')}）+ 自动派生 ${derived.length} 条`);
  console.log(`   人工注解分布：${Object.entries(curatedByDivision).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
  console.log(sub);
  console.log(`【指导性案例】${cases.length} 件，关联法律 ${caseLawRefs.size} 部`);
  console.log(`   高频关键词：${topCaseKeywords.slice(0, 10).map(([k, v]) => `${k}(${v})`).join('、')}`);
  console.log(`   案例最多的法律：${topCaseLaws.slice(0, 8).map((x) => `${x.title}(${x.count})`).join('、')}`);
  console.log(sub);
  console.log(`【颁布年份分布】${years.length} 个年份，${years[0]?.[0]}–${years[years.length - 1]?.[0]}`);
  console.log(`  近十年：${years.slice(-5).map(([y, n]) => `${y} ${n}`).join('  ')}`);
  console.log(sub);
  console.log('【数据质量】');
  console.log(`   待归类文档：${unclassified.length} 部${unclassified.length ? '（' + unclassified.slice(0, 6).map((d) => d.title.slice(0, 18)).join('、') + (unclassified.length > 6 ? ' …' : '') + '）' : ''}`);
  console.log(`   无条文文档：${noArticles.length} 部${noArticles.length ? '（' + noArticles.slice(0, 4).map((d) => d.id).join('、') + '）' : ''}`);
  if (buildReport) {
    const un = buildReport.unresolvedTop || [];
    console.log(`   未能定位的引用 Top：${un.slice(0, 3).map((u) => `${u.name}${u.raw}×${u.count}`).join('、') || '无'}`);
    console.log(`   构建告警：${(buildReport.annotationWarnings || []).length} 条`);
  }
  console.log(line);
}

fs.mkdirSync(path.join(DB, 'reports'), { recursive: true });
fs.writeFileSync(path.join(DB, 'reports/stats.json'), JSON.stringify(stats, null, 2));
if (!ONLY_JSON) console.log(`统计已写入 db/reports/stats.json`);

function find(cat) {
  return byCategory.find((x) => x.category === cat)?.documents ?? 0;
}
