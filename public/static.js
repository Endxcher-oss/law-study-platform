/**
 * 静态站点（GitHub Pages）的检索增强：按 URL 参数重放服务端检索，并替换首屏的服务端渲染结果。
 * 打分与摘要复用 server/search.js，条文语料来自 assets/index.json；只在导出物里加载。见 docs/deploy.md。
 */

import { esc, articleCard, pagination, emptyState, searchUrl, articleUrl, docHitList } from '../server/html.js';
import { search as runSearch, directHit } from '../server/search.js';
import { rebaseHtml } from './static-url.js';

const BASE = document.body.dataset.base || '';
const PAGE_SIZE = 20;
const SCOPES = ['q', 'page', 'scope', 'type', 'sort', 'doc', 'annotated', 'gazette'];

const metaEl = document.querySelector('.result-meta');
const resultsEl = document.querySelector('.results');
let cache = null;
let gazetteCache = null;

function init() {
  const sp = new URLSearchParams(location.search);
  if (!SCOPES.some((k) => sp.has(k))) return;
  const p = readParams();
  syncForm(p);
  run(p);
}

function syncForm(p) {
  for (const box of document.querySelectorAll('input[name=q]')) box.value = p.q;
  const scopes = p.gazette ? [] : p.scope;
  const types = p.gazette ? [] : p.type;
  for (const el of document.querySelectorAll('.search-form input[name=scope]')) el.checked = scopes.includes(el.value);
  for (const el of document.querySelectorAll('.search-form input[name=type]')) el.checked = types.includes(el.value);
  const set = (name, value) => {
    const el = document.querySelector(`.search-form [name=${name}]`);
    if (el) el.value = value;
  };
  set('sort', p.sort);
  const check = (name, on) => {
    const el = document.querySelector(`.search-form input[name=${name}]`);
    if (el) el.checked = on;
  };
  check('annotated', p.annotated);
  check('gazette', p.gazette);
  if (p.gazette) {
    for (const el of document.querySelectorAll('.search-form input[name=scope], .search-form input[name=type], .search-form input[name=annotated]')) el.disabled = true;
  }
}

function readParams() {
  const sp = new URLSearchParams(location.search);
  const list = (name) =>
    sp.getAll(name)
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter((v) => v && v !== 'all');
  return {
    q: sp.get('q') || '',
    scope: list('scope'),
    type: list('type'),
    sort: sp.get('sort') || 'relevance',
    doc: sp.get('doc') || null,
    page: Math.max(1, Number(sp.get('page')) || 1),
    annotated: sp.get('annotated') === '1',
    gazette: sp.get('gazette') === '1',
  };
}

function loadDb() {
  if (!cache) cache = buildDb().catch((err) => { cache = null; throw err; });
  return cache;
}

function loadGazettes() {
  if (!gazetteCache) gazetteCache = fetchJson('gazette-index.json').then(lowerize).catch((err) => { gazetteCache = null; throw err; });
  return gazetteCache;
}

function lowerize(records) {
  for (const rec of records) {
    rec.textLower = (rec.text || '').toLowerCase();
    rec.titleTextLower = (rec.titleText || '').toLowerCase();
    rec.annotTextLower = (rec.annotText || '').toLowerCase();
    rec.rubricTextLower = (rec.rubricText || '').toLowerCase();
  }
  return records;
}

async function buildDb() {
  const [corpus, catalog, taxonomy] = await Promise.all([
    fetchJson('index.json'),
    fetchJson('catalog.json'),
    fetchJson('taxonomy.json'),
  ]);
  lowerize(corpus);
  const byKey = new Map(corpus.map((r) => [`${r.docId}|${r.slug}`, r]));
  const catalogById = new Map(catalog.map((d) => [d.id, d]));
  const aliasIndex = new Map();
  const addAlias = (name, id) => {
    const n = String(name || '').trim();
    if (n.length < 2) return;
    if (!aliasIndex.has(n)) aliasIndex.set(n, []);
    const list = aliasIndex.get(n);
    if (!list.includes(id)) list.push(id);
  };
  for (const d of catalog) {
    addAlias(d.shortTitle, d.id);
    for (const a of d.aliases || []) addAlias(a, d.id);
  }
  return {
    corpus,
    catalog,
    catalogById,
    taxonomy,
    aliasIndex,
    docs: { has: (id) => catalogById.has(id) },
    getDoc: (id) => catalogById.get(id) || null,
    getArticle: (docId, slug) => byKey.get(`${docId}|${slug}`) || null,
  };
}

function fetchJson(name) {
  return fetch(`${BASE}/assets/${name}`, { credentials: 'same-origin' }).then((res) => {
    if (!res.ok) throw new Error(`索引装载失败：${name}（HTTP ${res.status}）`);
    return res.json();
  });
}

function slot() {
  let el = document.getElementById('search-dynamic');
  if (!el) {
    el = document.createElement('div');
    el.id = 'search-dynamic';
    metaEl.before(el);
    for (const node of [metaEl, resultsEl, document.querySelector('.pager')]) node?.remove();
  }
  return el;
}

async function run(p) {
  slot().innerHTML = `<div class="result-meta">正在装载${p.gazette ? '裁判文书' : '检索'}索引（首次约 ${p.gazette ? '2' : '5'} MB，之后走浏览器缓存）…</div>`;
  let db;
  try {
    db = await loadDb();
    if (p.gazette) db = { ...db, corpus: await loadGazettes() };
  } catch (err) {
    slot().innerHTML = `<div class="result-meta">${esc(err.message)}</div>`;
    return;
  }
  const scopes = p.gazette ? [] : p.scope;
  const types = p.gazette ? [] : p.type;
  const res = runSearch(db, {
    q: p.q,
    scope: scopes,
    type: types,
    sort: p.sort,
    docId: p.doc,
    page: p.page,
    pageSize: PAGE_SIZE,
    onlyAnnotated: p.annotated,
    gazetteOnly: p.gazette,
  });
  const doc = !p.gazette && p.doc ? db.catalogById.get(p.doc) : null;
  const dh = p.q && !p.gazette ? directHit(db, p.q) : null;
  const altDocs = dh?.ambiguous
    ? dh.ambiguous
        .filter((id) => id !== dh.docId)
        .slice(0, 6)
        .map((id) => db.getDoc(id))
        .filter((d) => d && db.getArticle(d.id, dh.slug))
    : [];
  const direct = dh && dh.docId && db.getArticle(dh.docId, dh.slug)
    ? `<div class="callout direct-hit">直接定位：<a href="${articleUrl(dh.docId, dh.slug)}">${esc(db.catalogById.get(dh.docId).shortTitle)} ${esc(db.getArticle(dh.docId, dh.slug).displayNumber)}</a>${
        altDocs.length
          ? `<div class="muted">名称不唯一，也可能指向：${altDocs.map((d) => `<a href="${articleUrl(d.id, dh.slug)}">${esc(d.shortTitle)} ${esc(db.getArticle(d.id, dh.slug).displayNumber)}</a>`).join('、')}</div>`
          : ''
      }</div>`
    : '';

  const params = { q: p.q, scope: scopes, type: types, sort: p.sort, doc: p.doc, annotated: p.annotated ? 1 : '', gazette: p.gazette ? 1 : '' };
  const url = (patch) => searchUrl({ ...params, page: 1, ...patch });
  const html = `
${direct}
${docHitList(res.docHits)}
<div class="result-meta">${
    p.q
      ? `“${esc(p.q)}” 命中 <strong>${res.total}</strong> ${p.gazette ? '篇裁判文书' : '条结果'}（浏览器内检索，索引 ${res.scanned} 条）${p.gazette ? ' · 仅裁判文书' : p.annotated ? ' · 仅看有注解条文' : ''}`
      : `按当前范围浏览：<strong>${res.total}</strong> ${p.gazette ? '篇裁判文书' : '条'}`
  }</div>
${doc ? `<p class="muted">当前限定在《${esc(doc.title)}》内检索　<a href="${url({ doc: '' })}">取消限定</a></p>` : ''}
<section class="results">
  ${res.items.length ? res.items.map((r) => articleCard(r, { snippet: r.snippet })).join('') : emptyState('没有命中结果。', '试试更短的关键词，或切换范围/类型；也可以直接输入“法律名 + 条号”。')}
</section>
${pagination({ page: res.page, pageSize: res.pageSize, total: res.total, makeUrl: (n) => searchUrl({ ...params, page: n }) })}
`;
  slot().innerHTML = rebaseHtml(html, BASE);
}

if (metaEl && resultsEl) init();
