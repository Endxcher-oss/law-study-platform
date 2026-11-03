/**
 * 页面渲染：把 db.js / search.js 的数据变成 HTML。
 * 每个导出函数返回完整页面（layout 已包裹）。
 */

import { getDb, CONFIDENCE } from './db.js';
import {
  esc, layout, categoryBadge, levelBadge, confBadge, crumbs, articleUrl, docUrl, caseUrl, gazetteUrl,
  classificationUrl, searchUrl, pagination, statCard, emptyState, articleCard, articleIdUrl, sectionTitle, docHitList,
} from './html.js';
import { search as runSearch, directHit, nameMatches, splitList } from './search.js';

const SORTS = [
  ['relevance', '相关度'],
  ['date_desc', '颁布时间：新 → 旧'],
  ['date_asc', '颁布时间：旧 → 新'],
  ['hierarchy', '法律位阶（宪法 → 司法解释）'],
  ['annot', '注解优先'],
  ['order', '按法律名称 + 条号'],
];

export function textToHtml(text) {
  const lines = String(text || '').split('\n').filter((l) => l.trim().length);
  return lines.map((l) => `<p class="para">${esc(l)}</p>`).join('');
}

function metaFromDb(db) {
  return {
    ...db.meta,
    sourceName: db.meta.source?.repo?.name,
    sourceTitle: db.meta.source?.title,
    sourceUrl: db.meta.source?.repo?.url,
    license: db.meta.source?.license,
  };
}

export function homePage(db) {
  const meta = metaFromDb(db);
  const c = db.meta.counts;
  const quick = [
    ['constitution', '宪法'],
    ['criminal-law', '刑法'],
    ['civil-code', '民法典'],
    ['criminal-procedure-law', '刑事诉讼法'],
    ['civil-procedure-law', '民事诉讼法'],
    ['company-law', '公司法'],
    ['securities-law', '证券法'],
    ['enterprise-bankruptcy-law', '企业破产法'],
  ]
    .filter(([id]) => db.docs.has(id))
    .map(([id, label]) => {
      const d = db.catalogById.get(id);
      return `<a class="quick-link" href="${docUrl(id)}"><strong>${esc(label)}</strong><span>${d.articleCount} 条</span></a>`;
    })
    .join('');

  const hot = db
    .hotArticles(10)
    .map((h) => `<li>
      <a href="${articleUrl(h.doc.id, h.article.slug)}">${esc(h.doc.shortTitle)} <strong>${esc(h.article.displayNumber)}</strong></a>
      <span class="hot-count">${h.interpCount} 件司法解释引用</span>
      <span class="hot-text">${esc((h.article.text || '').slice(0, 42))}…</span>
    </li>`)
    .join('');

  const latest = [...db.catalog]
    .filter((d) => d.promulgationDate)
    .sort((a, b) => b.promulgationDate.localeCompare(a.promulgationDate))
    .slice(0, 8)
    .map((d) => `<li>${categoryBadge(d.category)} <a href="${docUrl(d.id)}">${esc(d.shortTitle)}</a><span class="muted">${esc(d.promulgationDate)}</span></li>`)
    .join('');

  const notes = db.curatedAnnotations
    .slice(0, 6)
    .map(
      (a) => `<li><a href="${articleIdUrl(a.articleId)}">${esc(a.lawShortTitle)} ${esc(a.displayNumber)}</a>
      <span class="muted">${esc(a.topic)}</span></li>`,
    )
    .join('');

  const body = `
<section class="hero">
  <h1>法律学习平台</h1>
  <p class="hero-sub">条文、司法解释、疑难注解与指导性案例的关联检索，另有《最高人民法院公报》裁判文书全文</p>
  ${searchForm(db, { big: true })}
  <div class="hero-stats">
    ${statCard('收录文件', c.documents, '法律 / 行政法规 / 司法解释')}
    ${statCard('法条条文', c.articles, '逐条结构化')}
    ${statCard('条文级关联', c.links, c.linkMentions ? `合计 ${c.linkMentions} 处提及` : '法条 ↔ 司法解释')}
    ${statCard('疑难注解', c.annotations, '人工撰写')}
    ${statCard('指导性案例', c.cases, '裁判要点与关联法条')}
    ${statCard('裁判文书', c.gazette, '《最高人民法院公报》，独立收录')}
  </div>
</section>

<div class="two-col">
  <section class="block">
    <h2 class="block-title">常用法律</h2>
    <div class="quick-grid">${quick}</div>
  </section>
  <section class="block">
    <h2 class="block-title">疑难注解精选</h2>
    <ul class="link-list">${notes}</ul>
  </section>
</div>

<div class="two-col">
  <section class="block">
    <h2 class="block-title">被司法解释引用最多的条文</h2>
    <ul class="hot-list">${hot}</ul>
  </section>
  <section class="block">
    <h2 class="block-title">最新颁布</h2>
    <ul class="link-list">${latest}</ul>
  </section>
</div>
`;
  return layout({ title: '首页', body, meta, activeNav: 'home' });
}

function searchForm(db, { big = false, opts = {} } = {}) {
  const sortOpts = SORTS.map(([v, l]) => `<option value="${v}"${opts.sort === v ? ' selected' : ''}>${l}</option>`).join('');
  const off = opts.gazetteOnly ? ' disabled' : '';
  const scopes = splitList(opts.scope);
  const categoryName = new Map(db.taxonomy.categories.map((c) => [c.id, c.name]));
  const joined = (ids, nameOf, empty) => (ids.length ? ids.map(nameOf).join('、') : empty);
  const dropdown = (summary, options, label) => `<details class="multi-select" name="search-filter" data-label="${esc(label)}">
    <summary><span class="multi-summary-text">${esc(summary)}</span></summary>
    <div class="multi-panel">${options}</div>
  </details>`;
  const scopeBox = dropdown(
    `分类：${joined(scopes, (id) => categoryName.get(id) || id, '全部')}`,
    db.taxonomy.categories
      .filter((c) => (db.meta.categories[c.id]?.documents || 0) > 0)
      .map((c) => {
        const count = db.meta.categories[c.id];
        return `<label class="check"><input type="checkbox" name="scope" value="${c.id}" data-name="${esc(c.name)}"${scopes.includes(c.id) ? ' checked' : ''}${off}> ${esc(c.name)}<em>${c.kind === 'case' ? `${count.documents} 件` : `${count.articles} 条`}</em></label>`;
      })
      .join(''),
    '分类：',
  );
  return `<form class="search-form${big ? ' is-big' : ''}" action="/search" method="get" role="search">
  <div class="search-row">
    <input type="search" name="q" value="${esc(opts.q || '')}" placeholder="输入关键词，或“民法典 585”“违约金 调整”" autocomplete="off" aria-label="检索关键词">
    <button type="submit">检索</button>
  </div>
  <div class="search-filters">
    ${scopeBox}
    <label>排序 <select name="sort">${sortOpts}</select></label>
    <label class="check"><input type="checkbox" name="annotated" value="1"${opts.onlyAnnotated ? ' checked' : ''}${off}> 只看有注解的条文</label>
    <label class="check"><input type="checkbox" name="gazette" value="1"${opts.gazetteOnly ? ' checked' : ''}> 只搜索裁判文书</label>
    ${opts.docId ? `<input type="hidden" name="doc" value="${esc(opts.docId)}">` : ''}
  </div>
</form>`;
}

export function classificationsPage(db) {
  const meta = metaFromDb(db);
  const body = db.taxonomy.categories
    .map((category) => {
      const stats = db.meta.categories[category.id] || { documents: 0, articles: 0 };
      const unit = category.kind === 'case' ? '件' : '部';
      const href = category.kind === 'case' ? '/cases' : classificationUrl(category.id);
      return `<section class="block">
    <h2 class="block-title"><a href="${href}">${esc(category.name)}</a> <span class="muted">${stats.documents} ${unit}${category.kind === 'case' ? '' : ` / ${stats.articles} 条`}</span></h2>
    ${category.description ? `<p class="muted">${esc(category.description)}</p>` : ''}
  </section>`;
    })
    .join('');
  return layout({ title: '分类', body, meta, activeNav: 'classifications' });
}

export function classificationPage(db, categoryId) {
  const meta = metaFromDb(db);
  const category = db.categoryById.get(categoryId);
  if (!category) return notFoundPage(db, `未知的分类：${categoryId}`);
  if (category.kind === 'case') return casesPage(db, {});

  const stats = db.meta.categories[category.id];
  const docs = db.catalog.filter((d) => d.division === category.id).sort(categoryThenTitle);
  const notes = db.curatedAnnotations.filter((a) => a.division === category.id);
  const hot = category.kind === 'department' ? db.hotArticles(12, { division: category.id }) : [];
  const countLabel = category.kind === 'department' ? '收录法律' : `收录${category.name}`;

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '分类', href: '/classifications' }, { label: category.name }])}
<section class="page-head">
  <h1>${esc(category.name)}</h1>
  ${category.description ? `<p class="muted">${esc(category.description)}</p>` : ''}
  <div class="page-stats">
    ${statCard(countLabel, stats.documents)}
    ${statCard('法条条文', stats.articles)}
    ${statCard('疑难注解', notes.length)}
  </div>
</section>
<section class="block">
  <ul class="doc-list">${docs
    .map(
      (d) => `<li>
    ${categoryBadge(d.category)}
    <a href="${docUrl(d.id)}">${esc(d.shortTitle)}</a>
    <span class="muted">${d.articleCount} 条${d.promulgationDate ? ` · ${esc(d.promulgationDate)}` : ''}</span>
    ${statInline(db, d.id)}
  </li>`,
    )
    .join('')}</ul>
</section>
${
  hot.length
    ? `<section class="block"><h2 class="block-title">本类被司法解释引用最多的条文</h2><ul class="hot-list">${hot
        .map(
          (h) => `<li><a href="${articleUrl(h.doc.id, h.article.slug)}">${esc(h.doc.shortTitle)} <strong>${esc(h.article.displayNumber)}</strong></a>
    <span class="hot-count">${h.interpCount} 件司法解释引用</span><span class="hot-text">${esc((h.article.text || '').slice(0, 42))}…</span></li>`,
        )
        .join('')}</ul></section>`
    : ''
}
${notes.length ? `<section class="block"><h2 class="block-title">本类疑难注解</h2><ul class="link-list">${notes
      .map((a) => `<li><a href="${articleIdUrl(a.articleId)}">${esc(a.lawShortTitle)} ${esc(a.displayNumber)} · ${esc(a.topic)}</a></li>`)
      .join('')}</ul></section>` : ''}
`;
  return layout({ title: category.name, body, meta, activeNav: 'classifications' });
}

function statInline(db, docId) {
  const cov = db.coverageOf(docId);
  if (!cov) return '';
  const parts = [];
  if (cov.interpCount) parts.push(`司法解释 ${cov.interpCount} 件`);
  if (cov.linkedArticles) parts.push(`被解释条文 ${cov.linkedArticles}`);
  if (cov.annotations.curated) parts.push(`疑难注解 ${cov.annotations.curated}`);
  if (!parts.length) return '';
  return `<span class="inline-stat">${parts.map(esc).join(' · ')}</span>`;
}

const CATEGORY_RANK = { 宪法: 0, 法律: 1, 行政法规: 2, 司法解释: 3 };
function categoryThenTitle(a, b) {
  return (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9) || a.shortTitle.localeCompare(b.shortTitle, 'zh');
}

const TAG_PREVIEW = 8;

function tagChip(db, tag) {
  const note = tag.note || '';
  if (tag.kind === 'article') {
    const law = db.getDoc(tag.lawId);
    const article = db.getArticle(tag.articleId);
    const label = article ? article.displayNumber : tag.number ? `第 ${tag.number} 条` : '';
    if (!label) return '';
    const title = [law?.shortTitle, label, tag.mentions > 1 ? `引用 ${tag.mentions} 处` : '', note].filter(Boolean).join(' · ');
    return article
      ? `<a class="chip" href="${articleUrl(tag.lawId, article.slug)}" title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</a>`
      : `<span class="chip is-static" title="${esc(title)}">${esc(label)}</span>`;
  }
  const doc = tag.lawId ? db.getDoc(tag.lawId) : null;
  const successor = tag.successorId ? db.getDoc(tag.successorId) : null;
  const targetId = doc ? doc.id : successor ? successor.id : null;
  const name = doc?.shortTitle || String(tag.lawName || '').replace(/^中华人民共和国/, '');
  if (!name) return '';
  const state = successor ? '<span class="chip-state">已废止</span>' : '';
  const title = [name, successor ? '已废止' : '', note].filter(Boolean).join(' · ');
  if (!targetId) return `<span class="chip is-law is-static" title="${esc(title)}">${esc(name)}</span>`;
  return `<a class="chip is-law${successor ? ' is-superseded' : ''}" href="${docUrl(targetId)}" title="${esc(title)}" aria-label="${esc(title)}">${esc(name)}${state}</a>`;
}

function tagsBlock(db, tags) {
  if (!tags || !tags.length) return '';
  const groups = new Map();
  for (const tag of tags) {
    const key = tag.lawId || tag.lawName;
    const group = groups.get(key) || { lawId: tag.lawId || null, lawName: tag.lawName, lawTag: null, articles: [], mentions: 0 };
    if (tag.kind === 'article') group.articles.push(tag);
    else group.lawTag = tag;
    group.mentions = Math.max(group.mentions, tag.mentions || 0);
    groups.set(key, group);
  }
  const list = [...groups.values()].sort((a, b) => b.mentions - a.mentions);
  const rows = list.map((group) => {
    const lawChip = tagChip(db, group.lawTag || { kind: 'law', lawId: group.lawId, lawName: group.lawName });
    if (!group.articles.length) return `<div class="tag-group">${lawChip}</div>`;
    const chips = [...group.articles]
      .sort((a, b) => (b.mentions || 0) - (a.mentions || 0) || String(a.number).localeCompare(String(b.number), undefined, { numeric: true }))
      .map((tag) => tagChip(db, tag))
      .filter(Boolean);
    const rest = chips.slice(TAG_PREVIEW);
    const more = rest.length ? `<details class="tag-more"><summary>另 ${rest.length} 条</summary><div class="tag-more-list">${rest.join('')}</div></details>` : '';
    return `<div class="tag-group">${lawChip}${chips.slice(0, TAG_PREVIEW).join('')}${more}</div>`;
  });
  return `<div class="tag-groups">${rows.join('')}</div>`;
}

export function docPage(db, docId, query = {}) {
  const meta = metaFromDb(db);
  const doc = db.getDoc(docId);
  if (!doc) return notFoundPage(db, `未收录该文件：${docId}`);
  const cov = db.coverageOf(docId);
  const interps = db.interpretationsOfLaw(docId);
  const cases = db.casesOfLaw(docId);
  const curated = db.curatedAnnotations.filter((a) => a.lawId === docId);

  const step = 100;
  const from = Math.max(1, Number(query.from) || 1);
  const keyword = String(query.q || '').trim();
  const matched = keyword
    ? doc.articles.filter((a) => a.text.includes(keyword) || a.displayNumber.includes(keyword))
    : doc.articles;
  const windowArticles = matched.slice(from - 1, from - 1 + step);

  const toc = buildToc(db, doc, {
    matched,
    from,
    step,
    keyword,
  });
  const loose = db.looseBySource.get(doc.id) || [];
  const isInterp = doc.category === '司法解释';
  const hasCoverage = !!(cov && (cov.interpCount || cov.annotations.curated || cov.cited?.links));
  const docTags = doc.category === '司法解释' || doc.category === '行政法规' ? db.tagsByDoc.get(doc.id) || [] : [];
  const interpreted = isInterp && doc.interpretationOf ? db.getDoc(doc.interpretationOf) : null;

  const windowHasPath = windowArticles.some((a) => (a.path || []).length);
  const mapPath = (p) => (p.length || !windowHasPath ? p : [NO_SECTION_LABEL]);
  const rows = [];
  let prevPath = null;
  windowArticles.forEach((a, i) => {
    const own = a.path || [];
    const path = own.length || !windowHasPath ? own : [NO_SECTION_LABEL];
    let start = 0;
    if (prevPath) while (start < path.length && start < prevPath.length && path[start] === prevPath[start]) start++;
    const prevDocPath = !(i > 0 || from > 1) ? [] : mapPath(doc.articles[from - 1 + i - 1]?.path || []);
    for (let k = start; k < path.length; k++) {
      const cont = prevDocPath.length > k && prevDocPath[k] === path[k];
      rows.push(
        `<li class="toc-sep is-${sepKind(path[k], k + 1)}"><span class="toc-sep-text">${sepLabel(path[k])}</span>${
          cont ? '<span class="toc-sep-cont">续</span>' : ''
        }</li>`,
      );
    }
    prevPath = path;

    const hit = db.linksByTarget.get(a.id) || [];
    const interpCount = new Set(hit.filter((l) => l.td && l.td !== l.sd).map((l) => l.sd)).size;
    const note = db.curatedByArticle.get(a.id);
    rows.push(`<li class="toc-article" id="a${a.slug}" data-idx="${from - 1 + i}">
    <a class="toc-article-link" href="${articleUrl(doc.id, a.slug)}">
      <span class="toc-num">${esc(a.displayNumber)}</span>
      ${db.rubricByArticle.has(a.id) ? `<span class="toc-rubric" title="${esc(db.rubricByArticle.get(a.id))}">【${esc(db.rubricByArticle.get(a.id))}】</span>` : ''}
      <span class="toc-text">${esc((a.text || '').replace(/\n/g, ' ').slice(0, 70))}${a.text.length > 70 ? '…' : ''}</span>
    </a>
    <span class="toc-tags">${note ? levelBadge(note.level) : ''}${interpCount ? `<span class="badge conf-mid">${interpCount} 件司法解释</span>` : ''}</span>
  </li>`);
  });
  const articleList = rows.join('');

  const pager = pagination({
    page: Math.floor((from - 1) / step) + 1,
    pageSize: step,
    total: matched.length,
    makeUrl: (p) => `${docUrl(doc.id)}?from=${(p - 1) * step + 1}${keyword ? `&q=${encodeURIComponent(keyword)}` : ''}#toc`,
  });

  const jumpNav = (() => {
    const items = [
      docTags.length ? ['#sec-tags', `关联法条 ${docTags.length}`] : null,
      curated.length ? ['#sec-notes', `疑难注解 ${curated.length}`] : null,
      !isInterp && interps.length ? ['#sec-interps', `关联司法解释 ${interps.length}`] : null,
      isInterp && hasCoverage ? ['#sec-coverage', '引用概览'] : null,
      cases.length ? ['#sec-cases', `关联指导性案例 ${cases.length}`] : null,
      loose.length ? ['#sec-data', '数据说明'] : null,
    ].filter(Boolean);
    if (!items.length) return '';
    return `<nav class="toc-jump"><span class="toc-jump-title">跳转到</span>${items
      .map(([href, label]) => `<a href="${href}">${esc(label)}</a>`)
      .join('')}</nav>`;
  })();

  const body = `
${crumbs(breadcrumbTrail(db, doc))}
<section class="page-head doc-head">
  <div>
    <h1>${esc(doc.title)}</h1>
    <p class="doc-meta">
      ${categoryBadge(doc.category)}
      <span class="meta">${esc(db.categoryById.get(doc.division)?.name || '')}</span>
      ${doc.promulgationDate ? `<span class="meta">颁布 ${esc(doc.promulgationDate)}</span>` : ''}
      ${doc.effectiveDate ? `<span class="meta">施行 ${esc(doc.effectiveDate)}</span>` : ''}
      ${doc.authority ? `<span class="meta">${esc(doc.authority)}</span>` : ''}
      <span class="meta">共 ${doc.articleCount} 条</span>
    </p>
  </div>
  <div class="doc-actions">
    <a class="btn" href="${searchUrl({ doc: doc.id, q: '', sort: 'hierarchy' })}">在本书内检索</a>
    ${interpreted ? `<a class="btn" href="${docUrl(interpreted.id)}">查看《${esc(interpreted.shortTitle)}》</a>` : ''}
  </div>
</section>

<div class="doc-body" id="toc">
  <aside class="toc-panel">
    <details class="toc-fold" open>
      <summary class="toc-fold-head"><h3>目录</h3></summary>
      ${jumpNav}
      ${toc}
      ${
        keyword
          ? `<p class="muted small toc-filter-hint">筛选“${esc(keyword)}”后，目录只列出命中条文所在的章节，其余章节已隐藏（共命中 ${matched.length} 条）。</p>`
          : ''
      }
    </details>
  </aside>
  <section class="article-window">
    <h3>条文（${matched.length ? `${from} – ${Math.min(from + step - 1, matched.length)} / ${matched.length}` : '0'}）${
      keyword ? `　<span class="muted">筛选：“${esc(keyword)}” <a href="${docUrl(doc.id)}#toc">清除</a></span>` : ''
    }</h3>
    ${keyword && !matched.length ? `<p class="muted">本文档没有包含“${esc(keyword)}”的条文。<a href="/search?q=${encodeURIComponent(keyword)}">改为全库检索</a></p>` : ''}
    <ul class="toc-article-list">${articleList}</ul>
    ${pager}
  </section>
</div>

<div class="doc-assoc">
${
  docTags.length
    ? `<section class="block" id="sec-tags"><h3>关联法条</h3>${tagsBlock(db, docTags)}</section>`
    : ''
}

${
  curated.length
    ? `<section class="block" id="sec-notes"><h3>本书的疑难注解（${curated.length} 条）</h3><ul class="note-list">${curated
        .map(
          (a) => `<li>${levelBadge(a.level)} <a href="${articleIdUrl(a.articleId)}">${esc(a.displayNumber)} · ${esc(a.topic)}</a>
    <div class="muted">${esc((a.analysis[0] || '').slice(0, 120))}…</div></li>`,
        )
        .join('')}</ul></section>`
    : ''
}

${
  !isInterp && interps.length
    ? `<section class="block" id="sec-interps">
  <h3>关联司法解释（${interps.length} 件）</h3>
  <ul class="doc-list">${interps
    .slice(0, 80)
    .map(
      (i) => `<li><a href="${docUrl(i.docId)}">${esc(i.shortTitle)}</a>
    <span class="muted">关联条文 ${i.articleCount} 条 · ${i.count} 处引用 ${confBadge(i.best)}</span></li>`,
    )
    .join('')}</ul>
  ${interps.length > 80 ? `<p class="muted">…共 ${interps.length} 件，先列出前 80 件。</p>` : ''}
</section>`
    : ''
}

${
  isInterp && hasCoverage
    ? `<section class="block coverage" id="sec-coverage">
  <h3>引用概览</h3>
  <div class="page-stats">${[
    statCard('涉及法律', cov.cited.docs, '部'),
    statCard('引用条文', cov.cited.articles, '条'),
    statCard('条文级关联', cov.cited.links, '处'),
    statCard('疑难注解', cov.annotations.curated, '人工撰写'),
    statCard('指导性案例', cov.cases, '件'),
  ].join('')}</div>
  ${cov.cited.interpLinks ? `<p class="muted">除法律法规外，另有 ${cov.cited.interpLinks} 处引用其他司法解释。</p>` : ''}
</section>`
    : ''
}

${
  cases.length
    ? `<section class="block" id="sec-cases"><h3>关联指导性案例（${cases.length} 件）</h3><ul class="link-list">${cases
        .slice(0, 30)
        .map((c) => `<li><a href="${caseUrl(c.caseId)}">指导案例 ${c.caseNumber} 号 · ${esc(c.caseTitle)}</a></li>`)
        .join('')}</ul></section>`
    : ''
}

${
  loose.length
    ? `<section class="block" id="sec-data"><details class="loose-list"><summary>数据说明：本文件有 ${loose.length} 处条号引用未建立关联</summary>
  <p class="muted">这些位置只写了条号（如“第五十七条”）而没有指明法律名称，或者该条号不在本平台收录范围内（常见于旧版条号、已废止法律）。本平台不做推测，因此未建立关联——原文未改动，可回到正文核对。</p>
  <ul class="doc-list muted">${loose
    .slice(0, 40)
    .map((l) => {
      const src = db.getArticle(l.s);
      return `<li>${esc(src ? src.displayNumber : '')} → ${esc(l.raw)}${l.name ? `（${esc(l.name)}）` : ''}${l.note ? ` <span class="muted">${esc(l.note)}</span>` : ''}</li>`;
    })
    .join('')}</ul>
  ${loose.length > 40 ? `<p class="muted">…共 ${loose.length} 处</p>` : ''}
</details></section>`
    : ''
}
<p class="assoc-back"><a href="#toc">↑ 回到条文目录</a></p>
</div>
`;
  return layout({ title: doc.shortTitle, body, meta, activeNav: '' });
}

function breadcrumbTrail(db, doc) {
  const category = db.categoryById.get(doc.division);
  return [
    { label: '首页', href: '/' },
    { label: '分类', href: '/classifications' },
    { label: category?.name || '未分类', href: classificationUrl(doc.division) },
    { label: doc.shortTitle },
  ];
}

const NO_SECTION_LABEL = '其他条文';

const CN_NUM_RE = '第[〇零一二三四五六七八九十百千]+';

function sepKind(text, depth) {
  if (new RegExp(`^${CN_NUM_RE}分编`).test(text)) return 'subpart';
  if (new RegExp(`^${CN_NUM_RE}编`).test(text)) return 'part';
  if (new RegExp(`^${CN_NUM_RE}章`).test(text)) return 'chapter';
  if (new RegExp(`^${CN_NUM_RE}节`).test(text)) return 'section';
  return depth <= 1 ? 'chapter' : 'section';
}

function sepLabel(text) {
  const m = new RegExp(`^(${CN_NUM_RE}(?:分)?[编章节])(.+)$`).exec(text);
  return m ? `<span class="toc-sep-kind">${esc(m[1])}</span>${esc(m[2])}` : esc(text);
}

function buildToc(db, doc, ctx) {
  if (!ctx.matched.length) return '<p class="muted small">当前筛选下没有可展开的条文。</p>';
  const root = { depth: 0, children: new Map(), leaves: [], idx: 0, count: 0 };
  ctx.matched.forEach((a, i) => {
    const levels = (a.path || []).filter(Boolean);
    let node = root;
    for (const title of levels.length ? levels : [NO_SECTION_LABEL]) {
      if (!node.children.has(title)) {
        node.children.set(title, {
          title,
          slug: a.slug,
          depth: node.depth + 1,
          children: new Map(),
          leaves: [],
          idx: i,
          count: 0,
        });
      }
      node = node.children.get(title);
    }
    node.leaves.push({ idx: i, slug: a.slug, number: a.displayNumber, text: a.text || '' });
  });
  countTree(root);
  const curIdx = ctx.from - 1;
  const top = [...root.children.values()];
  const flat = top.length === 1 && top[0].title === NO_SECTION_LABEL ? top[0] : null;
  if (flat) {
    return `<ul class="section-tree is-flat">${flat.leaves.map((l) => tocLeaf(doc, l, ctx, curIdx)).join('')}</ul>`;
  }
  const chain = chainAt(root, curIdx);
  return `<ul class="section-tree">${top.map((n) => tocBranch(doc, n, ctx, chain)).join('')}</ul>`;
}

function chainAt(root, idx) {
  const chain = [];
  let node = root;
  for (;;) {
    let next = null;
    for (const child of node.children.values()) {
      if (child.idx <= idx && idx < child.idx + child.count) {
        next = child;
        break;
      }
    }
    if (!next) return chain;
    chain.push(next);
    node = next;
  }
}

function countTree(node) {
  node.count = node.leaves.length;
  for (const child of node.children.values()) node.count += countTree(child);
  return node.count;
}

function tocBranch(doc, node, ctx, chain) {
  const onPath = chain.includes(node);
  const isCurrent = chain[chain.length - 1] === node;
  const children = [...node.children.values()];
  const cls = isCurrent ? ' class="is-current"' : onPath ? ' class="is-on-path"' : '';
  const row = (extra) =>
    `<a href="${tocHref(doc, node.slug, node.idx, ctx)}"${cls}${extra}><span class="toc-label">${esc(
      sectionTitle(node.title),
    )}</span><span class="toc-count">${node.count}</span>${tocPageHint(node.idx, ctx)}</a>`;
  if (!children.length) {
    const elsewhere = inTocWindow(node.idx, ctx) ? '' : ' data-elsewhere="1"';
    return `<li class="toc-end lvl-${node.depth}" data-idx="${node.idx}" data-count="${node.count}">${row(
      elsewhere,
    )}</li>`;
  }
  return `<li class="toc-branch lvl-${node.depth}" data-idx="${node.idx}" data-count="${node.count}">
  <details${onPath ? ' open' : ''}>
    <summary>${row('')}</summary>
    <ul class="toc-children">${children.map((c) => tocBranch(doc, c, ctx, chain)).join('')}</ul>
  </details>
</li>`;
}

function tocLeaf(doc, leaf, ctx, curIdx) {
  const isCurrent = leaf.idx === curIdx;
  const elsewhere = !inTocWindow(leaf.idx, ctx) ? ' data-elsewhere="1"' : '';
  return `<li class="toc-leaf" data-idx="${leaf.idx}" data-count="1"><a href="${tocHref(
    doc,
    leaf.slug,
    leaf.idx,
    ctx,
  )}"${isCurrent ? ' class="is-current"' : ''}${elsewhere} title="${esc(
    leaf.text.replace(/\n/g, ' ').slice(0, 60),
  )}">${esc(leaf.number)}</a></li>`;
}

function inTocWindow(idx, ctx) {
  return idx >= ctx.from - 1 && idx < ctx.from - 1 + ctx.step;
}

function tocPageHint(idx, ctx) {
  if (inTocWindow(idx, ctx)) return '';
  return `<span class="toc-page">第 ${Math.floor(idx / ctx.step) + 1} 页</span>`;
}

function tocHref(doc, slug, idx, ctx) {
  if (inTocWindow(idx, ctx)) return `#a${slug}`;
  return `${docUrl(doc.id)}?from=${idx + 1}${ctx.keyword ? `&q=${encodeURIComponent(ctx.keyword)}` : ''}#a${slug}`;
}

export function articlePage(db, docId, number) {
  const meta = metaFromDb(db);
  const doc = db.getDoc(docId);
  if (!doc) return notFoundPage(db, `未收录该文件：${docId}`);
  const article = db.getArticle(docId, number);
  if (!article) {
    const base = Number(String(number).split('-')[0]);
    const near = doc.articles.filter((a) => Number.isFinite(base) && Math.abs(a.number - base) <= 3).slice(0, 6);
    return notFoundPage(
      db,
      `${doc.shortTitle} 第 ${number} 条不在库中（本书共 ${doc.articleCount} 条）`,
      near.map((a) => ({ href: articleUrl(docId, a.slug), label: `${a.displayNumber} ${(a.text || '').slice(0, 40)}…` })),
    );
  }

  const sib = db.siblings(article);
  const { curated } = db.annotationsForArticle(article.id);
  const rubric = db.rubricByArticle.get(article.id);
  const interps = db.interpretationsOfArticle(article.id);
  const outgoing = db.outgoingOfArticle(article.id);
  const cases = db.casesOfArticle(article.id);

  const path = (article.path || []).filter(Boolean);
  const sameChapter = doc.articles.filter((a) => JSON.stringify(a.path || []) === JSON.stringify(article.path || []));
  let chapterIndex = [];
  if (sameChapter.length) {
    const self = article.number * 10 + (article.seq || 0);
    const at = sameChapter.findIndex((a) => a.number * 10 + (a.seq || 0) >= self);
    const start = Math.max(0, (at < 0 ? sameChapter.length : at) - 4);
    chapterIndex = sameChapter.slice(start, start + 9);
  }

  const body = `
${crumbs([...breadcrumbTrail(db, doc), { label: article.displayNumber }])}

<div class="article-layout">
  <article class="article-main">
    <header class="article-head">
      <h1>
        <span class="article-doc"><a href="${docUrl(doc.id)}">${esc(doc.shortTitle)}</a></span>
        <span class="article-num">${esc(article.displayNumber)}</span>
        ${rubric ? `<span class="article-rubric">【${esc(rubric)}】</span>` : ''}
      </h1>
      <p class="doc-meta">
        ${categoryBadge(doc.category)}
        ${path.map((p) => `<span class="meta">${esc(sectionTitle(p))}</span>`).join('')}
        <span class="meta">${sib.index} / ${sib.total}</span>
        ${curated ? levelBadge(curated.level) : ''}
      </p>
    </header>

    <div class="article-body" id="article-text">${textToHtml(article.text)}</div>
    <div class="article-tools">
      <button class="btn js-copy" data-target="#article-text">复制条文</button>
      <a class="btn" href="${searchUrl({ q: `"${(article.text || '').slice(0, 12)}"` })}">检索相似表述</a>
      ${sib.prev ? `<a class="btn" href="${articleUrl(doc.id, sib.prev.slug)}">← ${esc(sib.prev.displayNumber)}</a>` : ''}
      ${sib.next ? `<a class="btn" href="${articleUrl(doc.id, sib.next.slug)}">${esc(sib.next.displayNumber)} →</a>` : ''}
      <a class="btn" href="${docUrl(doc.id)}">回到目录</a>
    </div>

    ${
      curated
        ? `<section class="block annotation curated-annotation" id="sec-notes">
      <div class="annotation-head">
        <h2>疑难注解</h2>
        ${levelBadge(curated.level)}
        <span class="badge badge-source">人工撰写</span>
      </div>
      <h3 class="annotation-topic">${esc(curated.topic)}</h3>
      ${curated.question ? `<p class="annotation-question"><strong>问题</strong>${esc(curated.question)}</p>` : ''}
      <div class="annotation-analysis">${curated.analysis.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      ${
        curated.points?.length
          ? `<h3 class="sub-title">要点</h3><ul class="points">${curated.points
              .map((p) => `<li><strong>${esc(p.title)}</strong>${esc(p.text)}</li>`)
              .join('')}</ul>`
          : ''
      }
      ${
        curated.pitfalls?.length
          ? `<h3 class="sub-title">易错点</h3><ul class="pitfalls">${curated.pitfalls.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
          : ''
      }
      ${
        curated.references?.length
          ? `<h3 class="sub-title">其他参考</h3><ul class="link-list">${curated.references
              .map((r) => `<li>${esc(r.text)}<span class="muted">${esc(r.note || '')}</span></li>`)
              .join('')}</ul>`
          : ''
      }
      ${
        curated.keywords?.length
          ? `<div class="keywords">${curated.keywords.map((k) => `<a class="chip" href="${searchUrl({ q: k })}">${esc(k)}</a>`).join('')}</div>`
          : ''
      }
    </section>`
        : ''
    }

    ${interps.length ? interpBlock(db, article, interps) : ''}
    ${cases.length ? caseStrip(cases) : ''}
    ${outgoing.length ? outgoingBlock(db, outgoing) : ''}
    ${!curated && !interps.length && !outgoing.length && !cases.length ? emptyState('本条暂无关联的司法解释与注解。', '可在检索框中搜索本条的关键词，查看在其他法律或案例中的对应规则。') : ''}
  </article>

  <aside class="article-side">
    <div class="side-block user-tags" id="user-tags" hidden data-article-id="${esc(article.id)}" data-doc-id="${esc(doc.id)}" data-law="${esc(doc.shortTitle)}" data-number="${esc(article.displayNumber)}" data-slug="${esc(article.slug)}" data-date="${esc(doc.promulgationDate || '')}" data-category="${esc(doc.category || '')}">
      <h3>标签</h3>
      <div class="tag-chips" data-tag-chips></div>
      <button type="button" class="tag-add" data-tag-add>＋ 添加标签</button>
    </div>
    ${
      chapterIndex.length
        ? `<div class="side-block"><h3>邻近条文</h3><ul class="side-list">${chapterIndex
            .map(
              (a) =>
                `<li><a href="${articleUrl(doc.id, a.slug)}" class="${a.id === article.id ? 'is-current' : ''}">${esc(a.displayNumber)}</a>
        <span>${esc((a.text || '').slice(0, 24))}</span></li>`,
            )
            .join('')}</ul></div>`
        : ''
    }
  </aside>
</div>
`;
  return layout({ title: `${doc.shortTitle} ${article.displayNumber}`, body, meta });
}


function interpBlock(db, article, interps) {
  const mentionTotal = interps.reduce((n, i) => n + (i.mentions || 1), 0);
  const byDoc = new Map();
  for (const i of interps) {
    if (!byDoc.has(i.docId)) byDoc.set(i.docId, []);
    byDoc.get(i.docId).push(i);
  }
  const legend = `<ul class="legend">${Object.entries(CONFIDENCE)
    .map(([k, v]) => `<li>${confBadge(k)}<span>${esc(v.hint)}</span></li>`)
    .join('')}</ul>`;
  return `<section class="block interp-block" id="sec-interps">
  <h2>关联的司法解释（${byDoc.size} 件 / ${mentionTotal} 处）</h2>
  ${legend}
  <ul class="interp-groups">${[...byDoc.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([docId, list]) => `<li class="interp-group">
    <h3><a href="${docUrl(docId)}">${esc(list[0].docShortTitle)}</a></h3>
    <ul class="interp-articles">${list
      .map(
        (i) => `<li><a href="${articleIdUrl(i.articleId)}">${esc(i.displayNumber)}</a>${confBadge(i.confidence)}<span class="muted small">${i.mentions > 1 ? `${i.mentions} 处提及` : '1 处提及'}</span></li>`,
      )
      .join('')}</ul>
  </li>`,
    )
    .join('')}</ul>
</section>`;
}

function caseStrip(cases) {
  return `<section class="block" id="sec-cases">
  <h2>关联的指导性案例（${cases.length} 件）</h2>
  <ul class="link-list">${cases
    .map((c) => `<li><a href="${caseUrl(c.caseId)}">指导案例 ${c.caseNumber} 号 · ${esc(c.caseTitle)}</a></li>`)
    .join('')}</ul>
</section>`;
}

function outgoingBlock(db, outgoing) {
  return `<section class="block" id="sec-outgoing">
  <h2>本条引用的其他条文（${outgoing.length}）</h2>
  <ul class="cite-list">${outgoing
    .map(
      (o) => `<li>
    <span class="cite-raw">${esc(o.raw)}</span>${o.mentions > 1 ? `<span class="muted small">（${o.mentions} 处）</span>` : ''}
    ${
      o.resolved
        ? `<a href="${articleUrl(o.docId, o.targetSlug ?? o.targetNumber)}">${esc(o.docShortTitle)} ${esc(o.targetDisplay)}</a>`
        : `<span class="muted">${esc(o.link?.name || o.docShortTitle)} ${esc(o.targetDisplay)}（本平台未定位到原文）</span>`
    }
    ${confBadge(o.confidence)}
    ${o.link?.note ? `<div class="muted">${esc(o.link.note)}</div>` : ''}
    ${o.articleText ? `<div class="cite-text">${esc(o.articleText.slice(0, 160))}${o.articleText.length > 160 ? '…' : ''}</div>` : ''}
  </li>`,
    )
    .join('')}</ul>
</section>`;
}

export function searchPage(db, query) {
  const meta = metaFromDb(db);
  const q = query.q || '';
  const opts = {
    q,
    scope: splitList(query.scope),
    sort: query.sort || 'relevance',
    docId: query.doc || null,
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Number(query.pagesize || query.size) || 20,
    onlyAnnotated: query.annotated === '1',
    gazetteOnly: query.gazette === '1',
  };
  if (opts.gazetteOnly) opts.scope = [];
  const res = runSearch(db, opts);
  const doc = opts.docId ? db.getDoc(opts.docId) : null;
  const params = { q, scope: opts.scope, sort: opts.sort, doc: opts.docId, annotated: opts.onlyAnnotated ? 1 : '', gazette: opts.gazetteOnly ? 1 : '' };
  const dh = q && !opts.gazetteOnly ? directHit(db, q) : null;
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


  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '检索' }])}
<section class="page-head search-head">
  <h1>全库检索</h1>
  <p class="muted">可指定分类、排序方式；输入“民法典 585”可直接定位条文。勾选“只搜索裁判文书”则只在《最高人民法院公报》裁判文书里检索。</p>
  ${searchForm(db, { opts })}
  ${doc ? `<p class="muted">当前限定在《${esc(doc.title)}》内检索　<a href="${searchUrl({ ...params, doc: '' })}">取消限定</a></p>` : ''}
</section>
${direct}
${docHitList(res.docHits)}
${
  q
    ? `<div class="result-meta">“${esc(q)}” 命中 <strong>${res.total}</strong> ${opts.gazetteOnly ? '篇裁判文书' : '条结果'}（扫描耗时 ${res.ms} ms）${opts.gazetteOnly ? ' · 仅裁判文书' : opts.onlyAnnotated ? ' · 仅看有注解条文' : ''}</div>`
    : ''
}
<section class="results">
  ${res.items.length ? res.items.map((r) => articleCard(r, { snippet: r.snippet })).join('') : emptyState('没有命中结果。', opts.gazetteOnly ? '裁判文书里没有命中，换个更短的关键词试试。' : '试试更短的关键词，或切换分类；也可以直接输入“法律名 + 条号”。')}
</section>
${pagination({
  page: res.page,
  pageSize: res.pageSize,
  total: res.total,
  makeUrl: (p) => searchUrl({ ...params, page: p }),
})}
`;
  return layout({ title: q ? `检索：${q}` : '检索', body, meta, activeNav: 'search' });
}

export function notesPage(db, query) {
  const meta = metaFromDb(db);
  const division = query.division || 'all';
  const level = query.level || 'all';
  let list = db.curatedAnnotations;
  if (division !== 'all') list = list.filter((a) => a.division === division);
  if (level !== 'all') list = list.filter((a) => a.level === level);

  const byDivision = db.taxonomy.categories
    .map((d) => ({ d, n: db.curatedAnnotations.filter((a) => a.division === d.id).length }))
    .filter((x) => x.n > 0);

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '疑难注解' }])}
<section class="page-head">
  <h1>疑难条文注解</h1>
  <p class="muted">人工撰写的注解共 ${db.curatedAnnotations.length} 条：说明疑难所在、给出适用要点与易错点，并逐条附上作为依据的司法解释原文（引文与库中条文逐一比对）。</p>
  <div class="domain-nav">
    <a class="chip${division === 'all' ? ' is-active' : ''}" href="/notes">全部 <em>${db.curatedAnnotations.length}</em></a>
    ${byDivision.map(({ d, n }) => `<a class="chip${division === d.id ? ' is-active' : ''}" href="/notes?division=${d.id}">${esc(d.name)} <em>${n}</em></a>`).join('')}
    <a class="chip${level === 'key' ? ' is-active' : ''}" href="/notes?level=key">重点条文</a>
    <a class="chip${level === 'warning' ? ' is-active' : ''}" href="/notes?level=warning">易错条文</a>
  </div>
</section>
<section class="block">
  <ul class="note-list">
    ${list
      .map(
        (a) => `<li>
      <div class="note-head">
        ${levelBadge(a.level)}
        <a href="${articleIdUrl(a.articleId)}" class="note-title">${esc(a.lawShortTitle)} ${esc(a.displayNumber)} · ${esc(a.topic)}</a>
        <span class="muted small">依据 ${a.basis.length} 条 · 案例 ${a.cases.length} 件</span>
      </div>
      <p class="note-question">${esc(a.question || '')}</p>
      <ul class="points">${(a.points || [])
        .slice(0, 3)
        .map((p) => `<li><strong>${esc(p.title)}</strong>${esc(p.text)}</li>`)
        .join('')}</ul>
      <div class="keywords">${(a.keywords || []).map((k) => `<a class="chip" href="${searchUrl({ q: k })}">${esc(k)}</a>`).join('')}</div>
    </li>`,
      )
      .join('') || ''}
  </ul>
  ${list.length ? '' : emptyState('该筛选条件下没有注解。')}
</section>
`;
  return layout({ title: '疑难注解', body, meta, activeNav: 'notes' });
}

export function casesPage(db, query) {
  const meta = metaFromDb(db);
  const q = (query.q || '').trim();
  let list = db.cases;
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter((c) => {
      const hay = [c.title, ...(c.keywords || []), ...(c.gist || []), c.number].join(' ');
      return terms.every((t) => hay.includes(t));
    });
  }
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 20;
  const total = list.length;
  const items = list.slice((page - 1) * pageSize, page * pageSize);

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '指导性案例' }])}
<section class="page-head">
  <h1>最高人民法院指导性案例</h1>
  <p class="muted">共 ${db.cases.length} 件。每件案例标注了关联法条，可从条文进入案例，也可从案例回到条文。</p>
  <form class="search-form" action="/cases" method="get" role="search">
    <div class="search-row"><input type="search" name="q" value="${esc(q)}" placeholder="按标题、关键词、裁判要点检索…"><button type="submit">检索</button></div>
  </form>
</section>
<section class="results">
  ${items
    .map(
      (c) => `<article class="result">
    <div class="result-head">
      <span class="badge cat-case">指导案例 ${c.number} 号</span>
      <h3><a href="${caseUrl(c.id)}">${esc(c.title)}</a></h3>
    </div>
    <p class="result-text">${esc((c.gist?.[0] || '').slice(0, 180))}…</p>
    <div class="result-foot">${(c.keywords || []).slice(0, 6).map((k) => `<span class="meta">${esc(k)}</span>`).join('')}
      <span class="meta">关联法条 ${c.related.length}</span></div>
  </article>`,
    )
    .join('') || emptyState('没有命中案例。')}
</section>
${pagination({ page, pageSize, total, makeUrl: (p) => `/cases?${new URLSearchParams({ q, page: String(p) })}` })}
`;
  return layout({ title: '指导性案例', body, meta, activeNav: 'cases' });
}

export function casePage(db, id) {
  const meta = metaFromDb(db);
  const c = db.caseById.get(id);
  if (!c) return notFoundPage(db, `未收录该案例：${id}`);

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '指导性案例', href: '/cases' }, { label: `${c.number} 号` }])}
<section class="page-head">
  <h1>指导案例 ${c.number} 号<br>${esc(c.title)}</h1>
  <p class="doc-meta">${esc(c.issuedLine || '')}${c.publishedAt ? ` · 发布于 ${esc(c.publishedAt)}` : ''}</p>
  <div class="keywords">${(c.keywords || []).map((k) => `<a class="chip" href="/cases?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</div>
</section>
<div class="two-col case-grid">
  <section class="block">
    <h2>裁判要点</h2>
    ${textToHtml((c.gist || []).join('\n'))}
    <h2>基本案情</h2>
    ${textToHtml((c.facts || []).join('\n'))}
    <h2>裁判结果</h2>
    ${textToHtml((c.result || []).join('\n'))}
    <h2>裁判理由</h2>
    ${textToHtml((c.reasoning || []).join('\n'))}
  </section>
  <aside class="block case-side">
    <h2>关联法条</h2>
    ${tagsBlock(db, db.tagsByCase.get(c.id) || [])}
    ${c.sourceUrl ? `<p class="muted small">原始来源：<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(c.sourceUrl)}</a></p>` : ''}
  </aside>
</div>
`;
  return layout({ title: `指导案例 ${c.number} 号`, body, meta, activeNav: 'cases' });
}

export function gazettesPage(db, query) {
  const meta = metaFromDb(db);
  const q = (query.q || '').trim();
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 20;
  const all = db.gazettes;
  let list = all;
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean);
    list = all.filter((g) => {
      const hay = [g.title, g.caseNumber, g.court, g.docType, ...(g.summary || []), ...(g.body || [])].join(' ');
      return terms.every((t) => hay.includes(t));
    });
  }
  const years = [...db.gazetteByYear.keys()].sort((a, b) => b - a);
  const items = list.slice((page - 1) * pageSize, page * pageSize);

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '裁判文书' }])}
<section class="page-head">
  <h1>《最高人民法院公报》裁判文书</h1>
  <p class="muted">共 ${all.length} 件（${years[years.length - 1]}–${years[0]} 年），含裁判摘要与文书全文，来源于最高人民法院公报官网。本页只收文书正文与客观元数据，<strong>不与法条建立条文级关联</strong>：需要按法条检索请用<a href="/search">全库检索</a>。</p>
  <form class="search-form" action="/search" method="get" role="search">
    <input type="hidden" name="gazette" value="1">
    <div class="search-row"><input type="search" name="q" value="${esc(q)}" placeholder="在裁判文书里检索（标题、案号、法院、裁判摘要与全文）…"><button type="submit">检索裁判文书</button></div>
  </form>
  <div class="domain-nav">${years
    .map((y) => `<span class="chip is-static">${y} 年 <em>${db.gazetteByYear.get(y)}</em></span>`)
    .join('')}</div>
</section>
<section class="results">
  ${items
    .map(
      (g) => `<article class="result">
    <div class="result-head">
      <span class="badge cat-gazette">${esc(g.docType || '裁判文书')}</span>
      <h3><a href="${gazetteUrl(g.id)}">${esc(g.title)}</a></h3>
    </div>
    ${g.summary?.length ? `<p class="result-text">${esc(g.summary[0].slice(0, 180))}${g.summary[0].length > 180 ? '…' : ''}</p>` : '<p class="result-text muted">（该期未收录裁判摘要）</p>'}
    <div class="result-foot">
      ${g.caseNumber ? `<span class="meta">${esc(g.caseNumber)}</span>` : ''}
      <span class="meta">${esc(g.court)}</span>
      <span class="meta">公报 ${g.issueYear} 年第 ${g.issueNo} 期</span>
      <span class="meta">全文 ${g.body.length} 段</span>
    </div>
  </article>`,
    )
    .join('') || emptyState('没有命中裁判文书。')}
</section>
${pagination({ page, pageSize, total: list.length, makeUrl: (p) => `/gazettes?page=${p}` })}
`;
  return layout({ title: '裁判文书', body, meta, activeNav: 'gazettes' });
}

export function gazettePage(db, id) {
  const meta = metaFromDb(db);
  const g = db.gazetteById.get(id);
  if (!g) return notFoundPage(db, `未收录该裁判文书：${id}`, [{ href: '/gazettes', label: '回到裁判文书列表' }]);

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '裁判文书', href: '/gazettes' }, { label: `${g.issueYear} 年第 ${g.issueNo} 期` }])}
<article class="article-main gazette-main">
  <header class="article-head">
    <h1>${esc(g.title)}</h1>
    <p class="doc-meta">
      ${categoryBadge('裁判文书')}
      <span class="meta">${esc(g.docType || '裁判文书')}</span>
      ${g.caseNumber ? `<span class="meta">${esc(g.caseNumber)}</span>` : ''}
      <span class="meta">${esc(g.court)}</span>
      <span class="meta">《最高人民法院公报》${g.issueYear} 年第 ${g.issueNo} 期</span>
    </p>
  </header>

  ${
    g.summary?.length
      ? `<section class="block annotation"><div class="annotation-head"><h2>裁判摘要</h2><span class="badge badge-source">公报原文</span></div>
    <div class="annotation-analysis">${g.summary.map((t) => `<p>${esc(t)}</p>`).join('')}</div></section>`
      : `<section class="block"><p class="muted">该期公报未收录裁判摘要。</p></section>`
  }

  <section class="block">
    <h2>文书全文</h2>
    <div class="article-body" id="gazette-text">${textToHtml((g.body || []).join('\n'))}</div>
    <div class="article-tools">
      <button class="btn js-copy" data-target="#gazette-text">复制全文</button>
      ${g.sourceUrl ? `<a class="btn" href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">公报原文</a>` : ''}
      <a class="btn" href="/gazettes">回到列表</a>
    </div>
  </section>

  <section class="block">
    <p class="muted">本文书收录的是裁判文书正文与客观元数据（案号、审理法院、文书类型、公报期号），编辑加工的评述未收录。本平台<strong>不与法条建立条文级关联</strong>；文书里引用的法条请以原文为准，需要按条文查看请用<a href="/search">全库检索</a>。</p>
  </section>
</article>
`;
  return layout({ title: g.title, body, meta, activeNav: 'gazettes' });
}

export function aboutPage(db) {
  const meta = metaFromDb(db);
  const c = db.meta.counts;
  const divRows = db.taxonomy.categories
    .map((category) => {
      const stats = db.meta.categories[category.id];
      const unit = category.kind === 'case' ? '件' : '部';
      return `<tr><td>${esc(category.name)}</td><td>${esc(category.kind === 'department' ? '法律部门' : '文件类别')}</td><td>${stats.documents} ${unit}</td><td>${stats.articles}</td></tr>`;
    })
    .join('');

  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '关于数据' }])}
<section class="page-head"><h1>关于数据与方法</h1></section>

<section class="block prose">
  <h2>1. 数据来源</h2>
  <p>条文正文取自 <a href="https://flk.npc.gov.cn/" target="_blank" rel="noopener">国家法律法规数据库</a> 的公开文本，经 <code>chinese-law-corpus</code>（CC0-1.0）项目整理为逐条结构化语料；司法解释与指导性案例来自最高人民法院公开发布。本平台不修改条文正文，仅做结构化、分类与关联。</p>
  <p>收录情况：${c.documents} 部文件（法律与宪法 ${c.codes} 部、行政法规 ${c.regulations} 部、司法解释 ${c.interpretations} 部），共 ${c.articles} 条条文；构建 ${c.links} 条条文级关联、${c.annotations} 条注解、${c.cases} 件指导性案例${c.rubrics ? `，另有 ${c.rubrics} 条人工撰写的条文主旨` : ''}。</p>
  <p>另独立收录《最高人民法院公报》裁判文书 ${c.gazette} 件（2003 年以来，含裁判摘要与文书全文，见<a href="/gazettes">裁判文书</a>）。这批文书只保留客观元数据与正文，<strong>不与法条建立条文级关联</strong>，也不参与默认的条文检索（检索页勾选“只搜索裁判文书”时可全文检索）。</p>
  <p>本平台源码以 MIT 许可发布（见页脚“源码”链接），静态站点由 GitHub Actions 构建并发布到 Pages。</p>

  <h2>2. 分类体系</h2>
  <p>法律按八个法律部门归类：宪法相关法、刑法、民法商法、行政法、经济法、社会法、生态环境法、诉讼与非诉讼程序法；司法解释、行政法规、指导性案例按文件类别各自成类。每部法律归入哪个部门，以 <code>data/taxonomy/departments.json</code> 的逐篇映射为准；分类名称与顺序见 <code>scripts/lib/taxonomy.js</code>。</p>
  <table class="table"><thead><tr><th>分类</th><th>类型</th><th>文件</th><th>条文</th></tr></thead><tbody>${divRows}</tbody></table>

  <h2>3. 司法解释如何关联到法条</h2>
  <p>构建脚本逐条扫描司法解释（并包括法律、行政法规）的正文，识别三种引用形态并给出可靠性分级：</p>
  <ul>
    <li>${confBadge('explicit')} 法名与条号紧邻出现，如“民法典第五百七十七条”。</li>
    <li>${confBadge('list')} 与上一条引用构成并列，如“第五百七十七条、第五百八十四条”，继承前一条的法律归属。</li>
    <li>${confBadge('contextual')} 同一句内 60 字以内的最近法名，如“本解释……依照民法典的规定”后接条号。</li>
  </ul>
  <p>带“之”的条号（如“第十七条之一”）、款/项（“第二款”“第（二）项”）都会被保留为附加信息；条文内部“本法”“本解释”指示的自引用单独标记，不计入“被司法解释引用”。</p>

  <h2>4. 疑难注解</h2>
  <p>注解全部由人工撰写（<code>data/annotations/curated.mjs</code>）：说明疑难点、给出要点与易错点，并逐条附上依据的司法解释原文。构建时会校验引文是否为库中条文的原文子串，避免转述失真。</p>

  <h2>5. 检索</h2>
  <p>中文按二元组（bigram）切分、英文与数字按词元切分，配合覆盖率阈值、连续短语加权与字段权重（标题 &gt; 注解 &gt; 正文）排序；支持按分类、单部法律限定范围，支持相关度、颁布时间、法律位阶、注解优先等排序方式。不引入分词与检索引擎依赖，语料规模下线性扫描即可在毫秒级返回。</p>

  <h2>6. 已知局限</h2>
  <ul>
    <li>条文级关联由规则抽取，个别“同句推断”的关联可能张冠李戴，条文页已用标签区分，请以原文为准。</li>
    <li>仅收录公开文本，不含地方性法规、部门规章与本平台之外的司法文件（如《关于依法适用正当防卫制度的指导意见》）。</li>
    <li>人工注解覆盖范围有限（当前 ${db.curatedAnnotations.length} 条），其余条文以原文与关联的司法解释为主。</li>
    <li>本平台为学习工具，内容不构成法律意见，引用请以官方发布文本为准。</li>
  </ul>

  <h2>7. 本地运行</h2>
  <pre class="code">npm run build   # 重建 db/（读取 data/raw，生成结构化数据库与关联图）
npm start       # 启动本地服务，默认 http://localhost:3000
npm run verify  # 校验 db/ 完整性
npm test        # 运行检索与关联的单元测试</pre>
</section>
`;
  return layout({ title: '关于数据', body, meta, activeNav: 'about' });
}

export function tagsPage(db) {
  const meta = metaFromDb(db);
  const categories = {};
  for (const d of db.docs.values()) categories[d.id] = d.category;
  const body = `
${crumbs([{ href: '/', label: '首页' }, { href: '/tags', label: '标签' }])}
<section class="page-head">
  <h1>标签</h1>
</section>

<section class="block tag-page" data-tags-page data-categories="${esc(JSON.stringify(categories))}">
  <div class="tag-cloud" data-tag-cloud></div>
  <p class="empty" data-tag-empty hidden>还没有标签。在任一条文页右侧点“添加标签”即可创建。</p>
  <div class="tag-list-head">
    <span class="muted" data-tag-count></span>
    <label class="sort-control">排序
      <select data-tag-sort>
        <option value="count" selected>标签数</option>
        <option value="recent">最近添加</option>
        <option value="date">颁布时间</option>
        <option value="title">标题</option>
      </select>
    </label>
  </div>
  <ul class="tag-articles" data-tag-articles></ul>
</section>
`;
  return layout({ title: '标签', body, meta, activeNav: 'tags' });
}

export function notFoundPage(db, message, links = []) {
  const meta = metaFromDb(db);
  const body = `
${crumbs([{ label: '首页', href: '/' }, { label: '未找到' }])}
<section class="page-head"><h1>未找到</h1><p class="muted">${esc(message)}</p></section>
<section class="block">
  ${links.length ? `<ul class="link-list">${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>` : ''}
  <p><a class="btn" href="/search">去检索</a> <a class="btn" href="/">回首页</a></p>
</section>`;
  return { status: 404, html: layout({ title: '未找到', body, meta }) };
}
