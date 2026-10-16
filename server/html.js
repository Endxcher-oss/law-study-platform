/**
 * HTML 渲染基元：转义、页面骨架、徽章、卡片。
 * 不引入模板引擎，全部用模板字符串 + 显式转义，避免注入。
 */

import { CONFIDENCE } from './constants.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function articleUrl(docId, slug) {
  return `/d/${encodeURIComponent(docId)}/${slug}`;
}

export function articleIdUrl(articleId) {
  const m = String(articleId).match(/^(.*)-(\d{3,})(?:-(\d+))?$/);
  if (m) return `/d/${encodeURIComponent(m[1])}/${m[3] ? `${Number(m[2])}-${m[3]}` : Number(m[2])}`;
  return `/search?q=${encodeURIComponent(articleId)}`;
}

export const docUrl = (id) => `/d/${encodeURIComponent(id)}`;
export const caseUrl = (id) => `/case/${encodeURIComponent(id)}`;
export const divisionUrl = (id) => `/division/${encodeURIComponent(id)}`;
export const domainUrl = (id) => `/domain/${encodeURIComponent(id)}`;
export const searchUrl = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  return `/search?${sp.toString()}`;
};

const CATEGORY_CLASS = {
  宪法: 'cat-constitution',
  法律: 'cat-law',
  行政法规: 'cat-regulation',
  司法解释: 'cat-interpretation',
  指导性案例: 'cat-case',
};

export function categoryBadge(category) {
  return `<span class="badge ${CATEGORY_CLASS[category] || 'cat-other'}">${esc(category)}</span>`;
}

export function levelBadge(level) {
  if (level === 'key') return `<span class="badge lv-key" title="重点条文">重点</span>`;
  if (level === 'warning') return `<span class="badge lv-warning" title="易错条文">易错</span>`;
  if (level === 'standard') return `<span class="badge lv-standard" title="一般注解">一般</span>`;
  return '';
}

export function confBadge(conf) {
  const c = CONFIDENCE[conf] || CONFIDENCE.contextual;
  return `<span class="badge conf-${c.color}" title="${esc(c.hint)}">${esc(c.label)}</span>`;
}

export function crumbs(items) {
  const parts = items.map((it, i) => {
    const label = esc(it.label);
    const last = i === items.length - 1;
    if (last || !it.href) return `<span class="crumb-current">${label}</span>`;
    return `<a class="crumb" href="${esc(it.href)}">${label}</a><span class="crumb-sep">/</span>`;
  });
  return `<nav class="crumbs">${parts.join('')}</nav>`;
}

export function layout({ title, body, meta = {}, searchBar = null, breadcrumbs = null, activeNav = '' }) {
  const nav = [
    { href: '/', label: '首页', key: 'home' },
    { href: '/divisions', label: '编 / 门类', key: 'divisions' },
    { href: '/notes', label: '疑难注解', key: 'notes' },
    { href: '/cases', label: '指导性案例', key: 'cases' },
    { href: '/about', label: '关于数据', key: 'about' },
  ]
    .map((n) => `<a href="${n.href}" class="nav-link${activeNav === n.key ? ' is-active' : ''}">${n.label}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · 法条学习平台</title>
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#8a1f1f"/><text x="16" y="23" font-size="18" text-anchor="middle" fill="#fff" font-family="serif">法</text></svg>')}">
</head>
<body>
<header class="site-header" id="top">
  <div class="wrap header-inner">
    <a class="brand" href="/">
      <span class="brand-mark">法</span>
      <span class="brand-text"><strong>法条学习平台</strong></span>
    </a>
    <nav class="site-nav">${nav}</nav>
    ${searchBar === null ? defaultSearchBar(meta) : searchBar}
  </div>
</header>
${breadcrumbs ? `<div class="wrap">${breadcrumbs}</div>` : ''}
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p><strong>数据来源</strong>：${esc(meta.sourceName || '')}（${esc(meta.license || '')}）· 条文来自 <a href="https://flk.npc.gov.cn/" target="_blank" rel="noopener">国家法律法规数据库</a> 公开文本，司法解释、指导性案例来自最高人民法院公开发布。本库为学习工具，内容不作裁判依据，以官方发布文本为准。</p>
    <p class="muted">数据库构建于 ${esc((meta.builtAt || '').slice(0, 10))} · 收录 ${esc(meta.counts?.documents ?? '')} 部文件 / ${esc(meta.counts?.articles ?? '')} 条条文 / ${esc(meta.counts?.links ?? '')} 条关联 / ${esc(meta.counts?.annotations ?? '')} 条注解</p>
  </div>
</footer>
<script src="/assets/app.js" defer></script>
<a class="to-top" href="#top" title="回到顶部" aria-label="回到顶部"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19.5V6.2M5.7 12.5 12 6l6.3 6.5"/></svg></a>
</body>
</html>`;
}

function defaultSearchBar(meta) {
  return `<form class="header-search" action="/search" method="get" role="search">
    <input type="search" name="q" placeholder="搜索条文、司法解释…（如：违约金 585）" autocomplete="off" aria-label="站内检索">
    <button type="submit">检索</button>
  </form>`;
}

export function articleCard(rec, { highlightTerms = [], snippet = null, showDoc = true } = {}) {
  const path = (rec.path || []).filter(Boolean);
  const docTitle = esc(rec.docShortTitle || rec.docTitle);
  const num = esc(rec.displayNumber || '');
  if (rec.kind === 'case') {
    return `<article class="result">
  <div class="result-head">
    ${categoryBadge(rec.category)}
    <h3><a href="${caseUrl(rec.id)}" class="result-num">指导案例 ${esc(String(rec.number))} 号</a></h3>
  </div>
  <p class="result-case-title"><a href="${caseUrl(rec.id)}">${esc(rec.caseTitle || rec.docTitle || '')}</a></p>
  ${snippet ? `<p class="result-snippet">${snippet.html}</p>` : `<p class="result-text">${esc((rec.text || '').slice(0, 220))}${(rec.text || '').length > 220 ? '…' : ''}</p>`}
  <div class="result-foot"><span class="meta">指导性案例</span></div>
</article>`;
  }
  return `<article class="result">
  <div class="result-head">
    ${categoryBadge(rec.category)}
    ${rec.annotLevel ? levelBadge(rec.annotLevel) : ''}
    <h3>
      ${showDoc ? `<a href="${docUrl(rec.docId)}" class="result-doc">${docTitle}</a>` : ''}
      <a href="${articleUrl(rec.docId, rec.slug || rec.number)}" class="result-num">${num}</a>
    </h3>
    ${path.length ? `<span class="result-path">${path.map(esc).join(' · ')}</span>` : ''}
  </div>
  ${snippet ? `<p class="result-snippet">${snippet.html}</p>` : `<p class="result-text">${esc((rec.text || '').slice(0, 220))}${(rec.text || '').length > 220 ? '…' : ''}</p>`}
  <div class="result-foot">
    ${rec.promulgationDate ? `<span class="meta">颁布 ${esc(rec.promulgationDate)}</span>` : ''}
    ${rec.kind === 'case' ? `<span class="meta">指导性案例</span>` : ''}
    ${rec.hasAnnotation ? `<span class="meta meta-note">已有疑难注解</span>` : ''}
  </div>
</article>`;
}

export function pagination({ page, pageSize, total, makeUrl }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return '';
  const windowed = [];
  const push = (p) => windowed.push(p);
  push(1);
  for (let p = page - 2; p <= page + 2; p++) if (p > 1 && p < pages) push(p);
  if (pages > 1) push(pages);
  const uniq = [...new Set(windowed)].sort((a, b) => a - b);
  let html = '<nav class="pager">';
  html += page > 1 ? `<a href="${esc(makeUrl(page - 1))}" class="pager-btn">上一页</a>` : `<span class="pager-btn is-disabled">上一页</span>`;
  let prev = 0;
  for (const p of uniq) {
    if (prev && p - prev > 1) html += '<span class="pager-gap">…</span>';
    html += p === page ? `<span class="pager-btn is-current">${p}</span>` : `<a href="${esc(makeUrl(p))}" class="pager-btn">${p}</a>`;
    prev = p;
  }
  html += page < pages ? `<a href="${esc(makeUrl(page + 1))}" class="pager-btn">下一页</a>` : `<span class="pager-btn is-disabled">下一页</span>`;
  html += '</nav>';
  return html;
}

export function statCard(label, value, hint = '') {
  return `<div class="stat"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div>${hint ? `<div class="stat-hint">${esc(hint)}</div>` : ''}</div>`;
}

export function emptyState(text, hint = '') {
  return `<div class="empty"><p>${esc(text)}</p>${hint ? `<p class="muted">${esc(hint)}</p>` : ''}</div>`;
}
