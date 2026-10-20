/**
 * 检索层：中文二元组 + 英文词元，线性扫描打分、分面、快照高亮。
 * 为什么不用倒排索引、排序与参数口径见 docs/search.md。
 */

import { cnToInt, suffixSeq } from '../scripts/lib/cn-num.js';

const FULLWIDTH_OFFSET = 0xfee0;

export function normalizeQuery(input) {
  let s = String(input || '');
  s = s.replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - FULLWIDTH_OFFSET));
  s = s.replace(/\u3000/g, ' ');
  return s.trim();
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

export function tokenize(query) {
  const phrases = [];
  let q = normalizeQuery(query);
  const quoted = [];
  q = q.replace(/["“”'‘’]([^"“”'‘’]{2,})["“”'‘’]/g, (_, p) => {
    quoted.push(p);
    return ` ${p} `;
  });

  const terms = new Map();
  const addTerm = (t, weight = 1) => {
    if (!t) return;
    if (t.length < 1) return;
    if (/^[\s的了吗呢和与及或是在有为之了]+$/.test(t)) return;
    const prev = terms.get(t);
    if (!prev || prev.weight < weight) terms.set(t, { term: t, weight });
  };

  const tokens = q.match(/[A-Za-z0-9_.\-+#]+|[\u3400-\u4dbf\u4e00-\u9fff]+|[\s\S]/g) || [];
  for (const tk of tokens) {
    if (/^[A-Za-z0-9_.\-+#]+$/.test(tk)) {
      addTerm(tk.toLowerCase(), 1.4);
    } else if (CJK.test(tk)) {
      if (tk.length === 1) addTerm(tk, 1);
      else for (let i = 0; i < tk.length - 1; i++) addTerm(tk.slice(i, i + 2), 1);
    }
  }
  for (const p of quoted) phrases.push(p.toLowerCase());
  return { terms: [...terms.values()], phrases, raw: normalizeQuery(query) };
}

export function directHit(db, query) {
  const q = normalizeQuery(query);
  if (!q) return null;

  const idPattern = q.match(/^([a-z][a-z0-9-]*)\s*[#/\s]\s*(\d+)(?:\s*条)?$/i);
  if (idPattern && db.docs.has(idPattern[1])) {
    return { docId: idPattern[1], number: Number(idPattern[2]), seq: 0, slug: String(Number(idPattern[2])) };
  }

  const m =
    q.match(/^(.*?)\s*第\s*([0-9]+|[一二三四五六七八九十百千零〇两]+)\s*条(?:之([一二三四五六七八九十]+))?\s*$/) ||
    q.match(/^(\D+?)\s*([0-9]+)\s*条?\s*$/);
  if (!m) return null;
  const number = /^\d+$/.test(m[2]) ? Number(m[2]) : cnToInt(m[2]);
  if (!number) return null;
  const seq = m[3] ? suffixSeq(`之${m[3]}`) : 0;
  const slug = seq ? `${number}-${seq}` : String(number);
  const namePart = m[1].replace(/[《》〈〉"'“”]/g, '').trim();
  if (!namePart) return { docId: null, number, seq, slug };
  const hits = nameMatches(db, namePart);
  if (!hits.length) return null;
  const withArticle = hits.find((d) => db.getArticle(d.id, slug));
  const doc = withArticle || hits[0];
  return { docId: doc.id, number, seq, slug, suffix: m[3] || null, ambiguous: hits.length > 1 ? hits.map((d) => d.id) : null };
}

function compactName(s) {
  return normalizeQuery(s).replace(/[（(].*?[)）]/g, '').replace(/[《》〈〉\s]/g, '');
}

export function documentMatches(db, name, limit = Infinity) {
  const n = compactName(name);
  if (!n) return [];
  const score = new Map();
  const note = (id, s) => {
    const cur = score.get(id);
    if (cur === undefined || s < cur) score.set(id, s);
  };
  for (const id of db.aliasIndex?.get(n) || []) note(id, 0);
  for (const d of db.catalog) {
    const compact = compactName(d.title);
    const short = compactName(d.shortTitle);
    const aliases = (d.aliases || []).map(compactName);
    if (short === n || compact === n || aliases.includes(n)) note(d.id, 0);
    else if (short.startsWith(n) || compact.startsWith(n) || aliases.some((a) => a.startsWith(n))) note(d.id, 1);
    else if (compact.includes(n) || (short.length >= 2 && n.includes(short)) || aliases.some((a) => n.includes(a))) note(d.id, 2);
  }
  const catRank = (x) => (x.category === '宪法' ? 0 : x.category === '法律' ? 1 : x.category === '行政法规' ? 2 : 3);
  return [...score.entries()]
    .map(([id, s]) => ({ doc: db.catalogById.get(id), level: s }))
    .filter((x) => x.doc)
    .sort((a, b) => a.level - b.level || catRank(a.doc) - catRank(b.doc) || a.doc.shortTitle.length - b.doc.shortTitle.length)
    .slice(0, limit);
}

export function nameMatches(db, name) {
  return documentMatches(db, name).map((x) => x.doc);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlight(text, terms) {
  if (!text) return '';
  const list = [
    ...new Set(
      (Array.isArray(terms) ? terms : [])
        .map((t) => (typeof t === 'string' ? t : t && t.term))
        .filter((t) => t && t.length),
    ),
  ]
    .sort((a, b) => b.length - a.length)
    .slice(0, 40);
  let html = escapeHtml(text);
  if (!list.length) return html;
  const re = new RegExp(list.map(escapeRe).join('|'), 'gi');
  html = html.replace(re, (m) => `\u0001${m}\u0002`);
  return html.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
}

const FIELD_WEIGHT = { title: 6, rubric: 5, annot: 4, text: 2.5 };

function countOccurrences(hay, term, cap = 6) {
  if (!hay) return 0;
  let idx = hay.indexOf(term);
  let n = 0;
  while (idx !== -1 && n < cap) {
    n += 1;
    idx = hay.indexOf(term, idx + term.length);
  }
  return n;
}

const CATEGORY_RANK = { 宪法: 0, 法律: 1, 行政法规: 2, 司法解释: 3, 指导性案例: 2 };

export function search(db, opts = {}) {
  const { q, scope = 'all', type = 'all', docId = null, sort = 'relevance', page = 1, pageSize = 20, onlyAnnotated = false, gazetteOnly = false } = opts;
  const { terms, phrases, raw } = tokenize(q);
  const hasQuery = terms.length > 0;

  const namedDocs = hasQuery && !gazetteOnly ? documentMatches(db, raw) : [];
  const exactDocs = new Set(namedDocs.filter((x) => x.level === 0).map((x) => x.doc.id));

  let pool = gazetteOnly ? db.corpus.filter((r) => r.kind === 'gazette') : db.corpus.filter((r) => r.kind !== 'gazette');
  if (docId) pool = pool.filter((r) => r.docId === docId);
  if (!gazetteOnly) {
    if (scope && scope !== 'all') pool = pool.filter((r) => r.division === scope);
    if (type && type !== 'all') pool = pool.filter((r) => r.category === type);
    if (onlyAnnotated) pool = pool.filter((r) => r.hasAnnotation);
  }

  const results = [];
  let scanned = 0;
  const scanStart = performance.now();

  for (const rec of pool) {
    scanned += 1;
    if (!hasQuery) {
      results.push({ rec, score: 0, hits: [] });
      continue;
    }
    const fields = [
      { name: 'title', weight: FIELD_WEIGHT.title, hay: rec.titleTextLower ?? rec.titleText ?? '' },
      { name: 'rubric', weight: FIELD_WEIGHT.rubric, hay: rec.rubricTextLower ?? (rec.rubricText || '').toLowerCase() },
      { name: 'text', weight: FIELD_WEIGHT.text, hay: rec.textLower ?? rec.text ?? '' },
      { name: 'annot', weight: FIELD_WEIGHT.annot, hay: rec.annotTextLower ?? rec.annotText ?? '' },
    ];
    let score = 0;
    let coverage = 0;
    const matched = new Set();
    for (const t of terms) {
      let termScore = 0;
      for (const f of fields) {
        const n = countOccurrences(f.hay, t.term);
        if (n) {
          matched.add(t.term);
          termScore += (1 + Math.log2(n)) * f.weight * t.weight;
        }
      }
      if (termScore > 0) {
        coverage += 1;
        score += termScore;
      }
    }
    if (!score) continue;

    const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);
    if (coverage < need) continue;

    score *= 0.6 + 0.4 * (coverage / terms.length);

    const lowerText = rec.textLower ?? (rec.text || '').toLowerCase();
    const lowerTitle = rec.titleTextLower ?? (rec.titleText || '').toLowerCase();
    for (const p of [...phrases, raw.toLowerCase()].filter((x) => x && x.length >= 3)) {
      if (lowerText.includes(p)) score += 12;
      else if (lowerTitle.includes(p)) score += 20;
    }

    const numHit = raw.match(/第?\s*(\d+)\s*条/);
    if (numHit && rec.displayNumber && rec.displayNumber.includes(`第${numHit[1]}条`)) score += 30;

    results.push({ rec, score, hits: [...matched], tier: exactDocs.has(rec.docId) ? 0 : 1 });
  }
  const ms = Math.round((performance.now() - scanStart) * 10) / 10;

  const cmp = {
    relevance: (a, b) => a.tier - b.tier || b.score - a.score || (CATEGORY_RANK[a.rec.category] ?? 9) - (CATEGORY_RANK[b.rec.category] ?? 9) || (b.rec.promulgationDate || '').localeCompare(a.rec.promulgationDate || ''),
    date_desc: (a, b) => (b.rec.promulgationDate || '').localeCompare(a.rec.promulgationDate || '') || b.score - a.score,
    date_asc: (a, b) => (a.rec.promulgationDate || 'zzz').localeCompare(b.rec.promulgationDate || 'zzz') || b.score - a.score,
    hierarchy: (a, b) => (CATEGORY_RANK[a.rec.category] ?? 9) - (CATEGORY_RANK[b.rec.category] ?? 9) || (a.rec.docShortTitle || '').localeCompare(b.rec.docShortTitle || '') || (a.rec.number - b.rec.number) || ((a.rec.seq || 0) - (b.rec.seq || 0)),
    order: (a, b) => (a.rec.docShortTitle || '').localeCompare(b.rec.docShortTitle || '') || (a.rec.number - b.rec.number) || ((a.rec.seq || 0) - (b.rec.seq || 0)),
    annot: (a, b) => (b.rec.hasAnnotation ? 1 : 0) - (a.rec.hasAnnotation ? 1 : 0) || b.score - a.score,
  }[sort] || ((a, b) => b.score - a.score);

  const sorted = hasQuery ? results.sort(cmp) : results;

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize).map((r) => ({
    ...r.rec,
    score: Math.round(r.score * 10) / 10,
    hits: r.hits,
    snippet: hasQuery ? buildSnippet(r.rec, terms.map((t) => t.term), r.hits) : null,
  }));

  const facets = {
    category: {},
    division: {},
  };
  for (const r of results) {
    facets.category[r.rec.category] = (facets.category[r.rec.category] || 0) + 1;
    facets.division[r.rec.division] = (facets.division[r.rec.division] || 0) + 1;
  }

  const docHits = docId
    ? []
    : namedDocs
        .filter((x) => x.level <= 1)
        .slice(0, 5)
        .map(({ doc, level }) => ({
          id: doc.id,
          title: doc.title,
          shortTitle: doc.shortTitle,
          category: doc.category,
          division: doc.division,
          articleCount: doc.articleCount,
          promulgationDate: doc.promulgationDate,
          level,
        }));

  return { query: raw, terms: terms.map((t) => t.term), total, page, pageSize, scanned, ms, items: pageItems, facets, docHits, sort, scope, type, docId, onlyAnnotated, gazetteOnly };
}

function buildSnippet(rec, terms, matched) {
  const candidates = [
    { field: 'text', hay: rec.text, weight: 2.5, label: null },
    { field: 'title', hay: rec.titleText, weight: 1.5, label: '标题' },
    { field: 'rubric', hay: rec.rubricText, weight: 5, label: '条旨' },
    { field: 'annot', hay: rec.annotText, weight: 4, label: '注解' },
  ].filter((c) => c.hay);

  let best = null;
  for (const c of candidates) {
    let occ = 0;
    let covered = 0;
    for (const t of terms) {
      const n = countOccurrences(c.hay, t, 4);
      if (n) covered += 1;
      occ += n;
    }
    if (!occ) continue;
    const score = covered * c.weight + Math.min(occ, 4) * 0.5;
    if (!best || score > best.score) best = { ...c, score, occ };
  }
  if (!best) return { field: null, html: escapeHtml((rec.text || '').slice(0, 160)), truncated: (rec.text || '').length > 160 };

  const hay = best.hay;
  const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
  let pos = -1;
  let used = '';
  for (const t of sortedTerms) {
    const i = hay.indexOf(t);
    if (i !== -1) {
      pos = i;
      used = t;
      break;
    }
  }
  if (pos === -1) return { field: best.field, html: escapeHtml(hay.slice(0, 160)), truncated: hay.length > 160 };

  const before = 60;
  const after = 130;
  const start = Math.max(0, pos - before);
  const end = Math.min(hay.length, pos + after);
  let slice = hay.slice(start, end);
  const html = `${start > 0 ? '…' : ''}${highlight(slice, terms)}${end < hay.length ? '…' : ''}`;
  return { field: best.field, label: best.label, html, truncated: start > 0 || end < hay.length, matchedTerm: used };
}

export function suggest(db, q, limit = 8) {
  const nq = normalizeQuery(q);
  if (!nq) return { docs: [], articles: [] };

  const dir = directHit(db, nq);
  const docs = nameMatches(db, nq).slice(0, limit).map((d) => ({
    id: d.id,
    title: d.title,
    shortTitle: d.shortTitle,
    category: d.category,
    division: d.division,
    articleCount: d.articleCount,
  }));

  const res = search(db, { q: nq, pageSize: limit });
  const articles = res.items.slice(0, limit).map((r) => ({
    docId: r.docId,
    articleId: r.id,
    docShortTitle: r.docShortTitle,
    displayNumber: r.displayNumber,
    snippet: r.snippet ? r.snippet.html.replace(/<[^>]+>/g, '') : (r.text || '').slice(0, 80),
    kind: r.kind,
  }));

  return { direct: dir, docs, articles, total: res.total };
}
