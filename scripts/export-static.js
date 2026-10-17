/**
 * 静态站点导出：把服务端渲染的每个页面落成可直接上传 GitHub Pages 的 dist/。
 * 部署前缀、查询参数到路径的改写、静态检索的数据文件与自检规则见 docs/deploy.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from '../server/db.js';
import * as pages from '../server/pages.js';
import { rebaseHtml } from '../public/static-url.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'dist');
const BASE = normBase(process.env.BASE_PATH ?? '/law-study-platform');
const SAMPLE = Number(process.env.EXPORT_SAMPLE || 0);
const ONLY_DOCS = (process.env.EXPORT_DOCS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SUBSET = SAMPLE > 0 || ONLY_DOCS.length > 0;
const DOC_STEP = 100;
const CASE_PAGE_SIZE = 20;
const LEVELS = ['all', 'key', 'warning'];
const SEARCH_FIELDS = ['kind', 'id', 'docId', 'docTitle', 'docShortTitle', 'category', 'division', 'domain', 'promulgationDate', 'effectiveDate', 'status', 'number', 'seq', 'slug', 'displayNumber', 'path', 'text', 'titleText', 'annotText', 'hasAnnotation', 'annotLevel', 'caseTitle', 'caseNumber'];
const COPY = [
  ['public/style.css', 'assets/style.css'],
  ['public/app.js', 'assets/app.js'],
  ['public/static.js', 'assets/public/static.js'],
  ['public/static-url.js', 'assets/public/static-url.js'],
  ['server/html.js', 'assets/server/html.js'],
  ['server/constants.js', 'assets/server/constants.js'],
  ['server/search.js', 'assets/server/search.js'],
  ['scripts/lib/cn-num.js', 'assets/scripts/lib/cn-num.js'],
  ['db/catalog.json', 'assets/catalog.json'],
  ['db/taxonomy.json', 'assets/taxonomy.json'],
];
const CASE_FORM = '<form class="search-form" action="/cases" method="get" role="search">';
const CASE_FORM_FIXED = '<form class="search-form" action="/search" method="get" role="search"><input type="hidden" name="type" value="指导性案例">';
const STATIC_SEARCH_SCRIPT = '<script type="module" src="/assets/public/static.js"></script>\n</body>';

function normBase(value) {
  const s = String(value || '').trim().replace(/\/+$/, '');
  if (!s || s === '/') return '';
  return s.startsWith('/') ? s : `/${s}`;
}

function urlToFile(urlPath) {
  const clean = String(urlPath).replace(/^\//, '').replace(/\/+$/, '');
  if (!clean) return 'index.html';
  const last = clean.slice(clean.lastIndexOf('/') + 1);
  return last.includes('.') ? clean : `${clean}/index.html`;
}

function notesRoute(division, level) {
  const parts = [];
  if (division !== 'all') parts.push('d', division);
  if (level !== 'all') parts.push('l', level);
  return parts.length ? `/notes/${parts.join('/')}` : '/notes';
}

const casesRoute = (page) => (page > 1 ? `/cases/page/${page}` : '/cases');
const docRoute = (docId, from) => (from > 1 ? `/d/${encodeURIComponent(docId)}/from/${from}` : `/d/${encodeURIComponent(docId)}`);
const articleRoute = (docId, slug) => `/d/${encodeURIComponent(docId)}/${slug}`;

function canonical(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

function buildQueryMap(db) {
  const notes = new Map();
  for (const division of ['all', ...db.taxonomy.divisions.map((d) => d.id)]) {
    for (const level of LEVELS) notes.set(canonical({ division, level }), notesRoute(division, level));
  }

  const cases = new Map();
  const casePages = Math.max(1, Math.ceil(db.cases.length / CASE_PAGE_SIZE));
  for (let page = 1; page <= casePages; page++) cases.set(canonical({ q: '', page }), casesRoute(page));

  const windows = new Map();
  for (const doc of db.docs.values()) {
    const count = Math.max(1, Math.ceil(doc.articles.length / DOC_STEP));
    for (let w = 0; w < count; w++) {
      const from = w * DOC_STEP + 1;
      windows.set(canonical({ doc: doc.id, from }), docRoute(doc.id, from));
    }
  }

  return function mapQuery(route, params) {
    if (route === '/notes') return notes.get(canonical({ division: params.get('division') || 'all', level: params.get('level') || 'all' })) || null;
    if (route === '/cases') {
      const q = params.get('q');
      if (q) return `/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent('指导性案例')}`;
      return cases.get(canonical({ q: '', page: Number(params.get('page')) || 1 })) || null;
    }
    const m = route.match(/^\/d\/([^/]+)$/);
    if (m) {
      if (params.get('q')) return null;
      const from = Math.max(1, Number(params.get('from')) || 1);
      const start = Math.floor((from - 1) / DOC_STEP) * DOC_STEP + 1;
      return windows.get(canonical({ doc: decodeURIComponent(m[1]), from: start })) || null;
    }
    return null;
  };
}

function rewriteQueryUrls(html, mapQuery) {
  return html.replace(/\b(href|action)="(\/[^"]*)"/g, (whole, attr, url) => {
    if (url.startsWith('//')) return whole;
    const hashAt = url.indexOf('#');
    const hash = hashAt === -1 ? '' : url.slice(hashAt);
    const core = hashAt === -1 ? url : url.slice(0, hashAt);
    const qAt = core.indexOf('?');
    if (qAt === -1) return whole;
    const query = core.slice(qAt + 1).replace(/&amp;/g, '&');
    const mapped = mapQuery(core.slice(0, qAt), new URLSearchParams(query));
    return mapped ? `${attr}="${mapped.replace(/&/g, '&amp;')}${hash}"` : whole;
  });
}

function projectCorpus(corpus, docIds) {
  return corpus
    .filter((rec) => !docIds || rec.kind !== 'article' || docIds.has(rec.docId))
    .map((rec) => {
      const out = {};
      for (const key of SEARCH_FIELDS) {
        const value = rec[key];
        if (value === undefined || value === null || value === '') continue;
        out[key] = value;
      }
      return out;
    });
}

function sampledDocs(db) {
  const all = [...db.docs.values()];
  const picked = ONLY_DOCS.length ? all.filter((d) => ONLY_DOCS.includes(d.id)) : SAMPLE ? all.slice(0, SAMPLE) : all;
  return { docs: picked, ids: picked.length === all.length ? null : new Set(picked.map((d) => d.id)) };
}

function collectRoutes(db) {
  const mapQuery = buildQueryMap(db);
  const routes = [];
  const missing = [];
  let caseForms = 0;
  const add = (route, raw) => {
    const out = typeof raw === 'string' ? { status: 200, html: raw } : raw;
    if (!out || typeof out.html !== 'string') throw new Error(`${route} 没有渲染出 HTML`);
    if (out.status && out.status >= 400) missing.push(route);
    let html = out.html;
    if (html.includes(CASE_FORM)) {
      caseForms += html.split(CASE_FORM).length - 1;
      html = html.split(CASE_FORM).join(CASE_FORM_FIXED);
    }
    if (route === '/search') html = html.replace('</body>', STATIC_SEARCH_SCRIPT);
    routes.push({ route, html: rebaseHtml(rewriteQueryUrls(html, mapQuery), BASE) });
  };

  add('/', pages.homePage(db));
  add('/divisions', pages.divisionsPage(db));
  add('/about', pages.aboutPage(db));
  for (const div of db.taxonomy.divisions) add(`/division/${div.id}`, pages.divisionPage(db, div.id));
  for (const dom of db.taxonomy.divisions.flatMap((d) => d.domains)) add(`/domain/${dom.id}`, pages.domainPage(db, dom.id));
  for (const item of db.cases) add(`/case/${item.id}`, pages.casePage(db, item.id));

  for (const division of ['all', ...db.taxonomy.divisions.map((d) => d.id)]) {
    for (const level of LEVELS) add(notesRoute(division, level), pages.notesPage(db, { division, level }));
  }

  const casePages = Math.max(1, Math.ceil(db.cases.length / CASE_PAGE_SIZE));
  for (let page = 1; page <= casePages; page++) add(casesRoute(page), pages.casesPage(db, { page: String(page) }));

  for (const doc of sampledDocs(db).docs) {
    const count = Math.max(1, Math.ceil(doc.articles.length / DOC_STEP));
    for (let w = 0; w < count; w++) {
      const from = w * DOC_STEP + 1;
      add(docRoute(doc.id, from), pages.docPage(db, doc.id, { from: String(from) }));
    }
    for (const article of doc.articles) add(articleRoute(doc.id, article.slug), pages.articlePage(db, doc.id, article.slug));
  }

  add('/search', pages.searchPage(db, {}));
  return { routes, caseForms, casePages, missing };
}

function checkQueryRewrite(routes) {
  const bad = [];
  for (const { route, html } of routes) {
    for (const m of html.matchAll(/\b(?:href|action)="([^"]*\?[^"]*)"/g)) {
      const url = m[1];
      if (url.startsWith('/search') || url.startsWith(`${BASE}/search`)) continue;
      bad.push(`${route} → ${url}`);
    }
  }
  return bad;
}

function checkLinks(routes, written) {
  const bad = [];
  let checked = 0;
  const known = (url) => written.has(urlToFile(url));
  for (const { route, html } of routes) {
    for (const m of html.matchAll(/\bhref="(\/[^"]*)"/g)) {
      let url = m[1];
      if (url.startsWith('//')) continue;
      const cut = Math.min(...[url.indexOf('#'), url.indexOf('?')].filter((i) => i !== -1), Infinity);
      if (cut !== Infinity) url = url.slice(0, cut);
      if (url === BASE) url = '/';
      if (!url.startsWith(BASE ? `${BASE}/` : '/')) continue;
      const rel = BASE ? url.slice(BASE.length) : url;
      checked += 1;
      if (!known(rel)) bad.push(`${route} → ${m[1]}`);
    }
  }
  return { checked, bad };
}

function main() {
  const started = Date.now();
  const db = getDb();
  fs.rmSync(OUT, { recursive: true, force: true });

  const written = new Set();
  let bytes = 0;
  const write = (rel, content) => {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    written.add(rel);
    bytes += Buffer.byteLength(content);
  };

  const { routes, caseForms, casePages, missing } = collectRoutes(db);
  for (const { route, html } of routes) write(urlToFile(route), html);
  write('.nojekyll', '');
  const notFound = pages.notFoundPage(db, '找不到这个页面（本站为静态站点，没有服务端路由）');
  write('404.html', rebaseHtml(typeof notFound === 'string' ? notFound : notFound.html, BASE));
  write('assets/index.json', JSON.stringify(projectCorpus(db.corpus, sampledDocs(db).ids)));

  const assets = [];
  for (const [from, to] of COPY) {
    const source = path.join(ROOT, from);
    const target = path.join(OUT, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    written.add(to);
    const size = fs.statSync(source).size;
    bytes += size;
    assets.push({ to, size });
  }

  const report = {
    base: BASE,
    pages: routes.length,
    assets: assets.length,
    megabytes: Math.round(bytes / 1024 / 1024),
    seconds: Math.round((Date.now() - started) / 1000),
    subset: SUBSET ? { sample: SAMPLE || null, docs: ONLY_DOCS.length ? ONLY_DOCS : null } : null,
  };

  if (!SUBSET) {
    const { checked, bad } = checkLinks(routes, written);
    report.linksChecked = checked;
    report.brokenLinks = bad.length;
    if (bad.length) {
      console.error(`发现 ${bad.length} 条站内链接没有对应页面：`);
      for (const line of bad.slice(0, 20)) console.error(`  ${line}`);
      process.exitCode = 1;
    }
    const unmapped = checkQueryRewrite(routes);
    report.unmappedQueries = unmapped.length;
    if (unmapped.length) {
      console.error(`发现 ${unmapped.length} 条查询串链接没有被改写成静态路径（静态主机不处理查询串）：`);
      for (const line of unmapped.slice(0, 20)) console.error(`  ${line}`);
      process.exitCode = 1;
    }
  }
  if (missing.length) {
    console.error(`有 ${missing.length} 个页面渲染成 404：${missing.slice(0, 5).join('、')}`);
    process.exitCode = 1;
  }
  if (caseForms !== casePages) {
    console.error(`案例页检索表单改写数量不符：期望 ${casePages}，实际 ${caseForms}`);
    process.exitCode = 1;
  }

  console.log(`静态站点已导出到 ${path.relative(ROOT, OUT)}/（部署前缀 ${BASE || '/'}）`);
  console.log(`  页面 ${report.pages} 个 · 资源 ${assets.length} 个 · 合计 ${report.megabytes} MB · 耗时 ${report.seconds}s`);
  if (SUBSET) console.log(`  子集模式：${ONLY_DOCS.length ? `只渲染 ${ONLY_DOCS.join('、')}` : `只渲染前 ${SAMPLE} 部文档`}，跳过链接与查询串自检`);
  else console.log(`  链接自检：${report.linksChecked} 条站内链接，未找到对应页面 ${report.brokenLinks} 条；未改写的查询串链接 ${report.unmappedQueries} 条`);
}

main();
