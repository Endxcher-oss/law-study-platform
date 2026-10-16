/**
 * JSON API：与网页共用同一套数据层，便于后期做前端增强、批量导出或对接其他端。
 * 全部为只读接口。
 */

import { search as runSearch, directHit, suggest } from './search.js';

function paginate(list, page = 1, size = 50) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(500, Math.max(1, Number(size) || 50));
  return { total: list.length, page: p, pageSize: s, items: list.slice((p - 1) * s, p * s) };
}

const stripArticle = (a) => ({
  id: a.id,
  docId: a.docId,
  number: a.number,
  seq: a.seq || 0,
  slug: a.slug,
  displayNumber: a.displayNumber,
  path: a.path,
  text: a.text,
});

export function handleApi(db, pathname, query) {
  const p = pathname.replace(/^\/api/, '') || '/';

  if (p === '/' || p === '/meta') {
    return { status: 200, json: { ok: true, meta: db.meta, taxonomy: db.taxonomy, endpoints: ['/api/meta', '/api/taxonomy', '/api/catalog', '/api/docs/:id', '/api/docs/:id/articles/:number', '/api/articles/:articleId', '/api/search', '/api/annotations', '/api/cases', '/api/cases/:id', '/api/links', '/api/suggest', '/api/hot'] } };
  }

  if (p === '/taxonomy') return { status: 200, json: { ok: true, taxonomy: db.taxonomy, map: db.taxonomyMap } };

  if (p === '/catalog') {
    let list = db.catalog;
    if (query.division) list = list.filter((d) => d.division === query.division);
    if (query.domain) list = list.filter((d) => d.domain === query.domain);
    if (query.category) list = list.filter((d) => d.category === query.category);
    if (query.status) list = list.filter((d) => d.status === query.status);
    if (query.q) {
      const q = String(query.q);
      list = list.filter((d) => d.title.includes(q) || d.shortTitle.includes(q) || (d.aliases || []).some((a) => a.includes(q)));
    }
    return { status: 200, json: { ok: true, ...paginate(list, query.page, query.size) } };
  }

  let m = p.match(/^\/docs\/([^/]+)$/);
  if (m) {
    const doc = db.getDoc(decodeURIComponent(m[1]));
    if (!doc) return { status: 404, json: { ok: false, error: 'doc not found' } };
    const withLinks = query.links === '1';
    const payload = {
      ok: true,
      doc: { ...doc, articles: doc.articles.map(stripArticle) },
    };
    if (withLinks) {
      payload.related = {
        interpretations: db.interpretationsOfLaw(doc.id),
        coverage: db.coverageOf(doc.id),
        annotations: db.curatedAnnotations.filter((a) => a.lawId === doc.id).map((a) => a.id),
        cases: db.casesOfLaw(doc.id).map((c) => c.caseId),
      };
    }
    return { status: 200, json: payload };
  }

  m = p.match(/^\/docs\/([^/]+)\/articles\/(\d+)$/);
  if (m) {
    const doc = db.getDoc(decodeURIComponent(m[1]));
    if (!doc) return { status: 404, json: { ok: false, error: 'doc not found' } };
    const article = db.getArticle(doc.id, Number(m[2]));
    if (!article) return { status: 404, json: { ok: false, error: 'article not found' } };
    return { status: 200, json: { ok: true, doc: { id: doc.id, title: doc.title }, article: stripArticle(article) } };
  }

  m = p.match(/^\/articles\/([^/]+)$/);
  if (m) {
    const article = db.articles.get(decodeURIComponent(m[1]));
    if (!article) return { status: 404, json: { ok: false, error: 'article not found' } };
    const { curated, derived } = db.annotationsForArticle(article.id);
    return { status: 200, json: { ok: true, article: stripArticle(article), curated, derived } };
  }

  if (p === '/search') {
    const res = runSearch(db, {
      q: query.q || '',
      scope: query.scope || 'all',
      type: query.type || 'all',
      sort: query.sort || 'relevance',
      docId: query.doc || null,
      page: query.page,
      pageSize: query.size || query.pagesize,
      onlyAnnotated: query.annotated === '1',
    });
    return {
      status: 200,
      json: {
        ok: true,
        query: res.query,
        terms: res.terms,
        total: res.total,
        ms: res.ms,
        scanned: res.scanned,
        page: res.page,
        pageSize: res.pageSize,
        facets: res.facets,
        direct: res.query ? directHit(db, res.query) : null,
        items: res.items.map((r) => ({ ...r, snippet: r.snippet ? { ...r.snippet, html: undefined, text: r.snippet.html } : null })),
      },
    };
  }

  if (p === '/annotations') {
    let list = [...db.curatedAnnotations, ...db.derivedAnnotations];
    if (query.source) list = list.filter((a) => a.source === query.source);
    if (query.lawId) list = list.filter((a) => a.lawId === query.lawId);
    if (query.division) list = list.filter((a) => a.division === query.division);
    if (query.level) list = list.filter((a) => a.level === query.level);
    if (query.q) {
      const q = String(query.q);
      list = list.filter((a) => (a.topic || '').includes(q) || (a.question || '').includes(q) || (a.keywords || []).some((k) => k.includes(q)));
    }
    return { status: 200, json: { ok: true, ...paginate(list, query.page, query.size) } };
  }

  m = p.match(/^\/annotations\/([^/]+)$/);
  if (m) {
    const a = db.annotationById.get(decodeURIComponent(m[1]));
    if (!a) return { status: 404, json: { ok: false, error: 'annotation not found' } };
    return { status: 200, json: { ok: true, annotation: a } };
  }

  if (p === '/cases') {
    let list = db.cases;
    if (query.lawId) list = list.filter((c) => c.related.some((r) => r.lawId === query.lawId));
    if (query.articleId) list = list.filter((c) => c.related.some((r) => r.articleId === query.articleId));
    if (query.q) {
      const q = String(query.q);
      list = list.filter((c) => c.title.includes(q) || (c.keywords || []).some((k) => k.includes(q)));
    }
    return {
      status: 200,
      json: {
        ok: true,
        ...paginate(
          list.map((c) => ({ id: c.id, number: c.number, title: c.title, keywords: c.keywords, publishedAt: c.publishedAt, lawCount: new Set(c.related.map((r) => r.lawId)).size })),
          query.page,
          query.size,
        ),
      },
    };
  }

  m = p.match(/^\/cases\/([^/]+)$/);
  if (m) {
    const c = db.caseById.get(decodeURIComponent(m[1]));
    if (!c) return { status: 404, json: { ok: false, error: 'case not found' } };
    return { status: 200, json: { ok: true, case: c } };
  }

  if (p === '/links') {
    const articleId = query.articleId || query.id;
    if (!articleId) return { status: 400, json: { ok: false, error: 'articleId required' } };
    return {
      status: 200,
      json: {
        ok: true,
        incoming: db.interpretationsOfArticle(articleId),
        outgoing: db.outgoingOfArticle(articleId),
        cases: db.casesOfArticle(articleId),
      },
    };
  }

  if (p === '/suggest') return { status: 200, json: { ok: true, ...suggest(db, query.q || '', Number(query.size) || 8) } };

  if (p === '/hot') {
    return {
      status: 200,
      json: {
        ok: true,
        items: db
          .hotArticles(Math.min(100, Number(query.size || query.limit) || 20), { division: query.division })
          .map((h) => ({
            docId: h.doc.id,
            articleNumber: h.article.number,
            articleSlug: h.article.slug,
            displayNumber: h.article.displayNumber,
            docShortTitle: h.doc.shortTitle,
            interpCount: h.interpCount,
            linkCount: h.linkCount,
          })),
      },
    };
  }

  return { status: 404, json: { ok: false, error: `unknown endpoint: ${pathname}` } };
}
