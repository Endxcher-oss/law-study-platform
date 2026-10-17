/**
 * 数据层：把 db/ 下的文件装载成内存索引（只读视图 docs / articles / links / annotations / cases）。
 * 要点与索引结构见 docs/architecture.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HIERARCHY, CONFIDENCE } from './constants.js';

export { HIERARCHY, CONFIDENCE };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DB = path.join(ROOT, 'db');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

class Database {
  constructor() {
    this.meta = readJson(path.join(DB, 'meta.json'));
    this.taxonomy = readJson(path.join(DB, 'taxonomy.json'));
    this.taxonomyMap = readJson(path.join(DB, 'taxonomy.map.json'));
    this.catalog = readJson(path.join(DB, 'catalog.json'));

    this.docs = new Map();
    for (const dir of ['codes', 'interpretations', 'regulations']) {
      for (const file of listJson(path.join(DB, dir))) {
        const doc = readJson(file);
        this.docs.set(doc.id, doc);
      }
    }

    this.articles = new Map();
    for (const doc of this.docs.values()) {
      for (const a of doc.articles) {
        a.docId = doc.id;
        this.articles.set(a.id, a);
      }
    }

    this.catalogById = new Map(this.catalog.map((d) => [d.id, d]));
    this.aliasIndex = new Map();
    const addAlias = (name, id) => {
      const n = String(name || '').trim();
      if (n.length < 2) return;
      if (!this.aliasIndex.has(n)) this.aliasIndex.set(n, []);
      const list = this.aliasIndex.get(n);
      if (!list.includes(id)) list.push(id);
    };
    for (const d of this.catalog) {
      addAlias(d.shortTitle, d.id);
      for (const a of d.aliases || []) addAlias(a, d.id);
    }
    this.divisionById = new Map(this.taxonomy.divisions.map((d) => [d.id, d]));
    this.domainById = new Map();
    for (const div of this.taxonomy.divisions) {
      for (const dom of div.domains) this.domainById.set(dom.id, { ...dom, division: div.id, divisionName: div.name });
    }

    this._loadLinks();
    this._loadAnnotations();
    this._loadRubrics();
    this._loadCases();
    this._loadGazettes();
    this._buildSearchCorpus();
  }

  _loadLinks() {
    const raw = readJson(path.join(DB, 'links.json'));
    this.links = raw.links.filter((l) => l.td || l.t);
    this.looseLinks = raw.links.filter((l) => !l.t && !l.td);
    this.looseBySource = new Map();
    for (const l of this.looseLinks) {
      if (!this.looseBySource.has(l.sd)) this.looseBySource.set(l.sd, []);
      this.looseBySource.get(l.sd).push(l);
    }
    this.linkStats = raw.stats;

    this.linksByTarget = new Map();
    this.linksBySource = new Map();
    for (const l of this.links) {
      if (l.t) {
        if (!this.linksByTarget.has(l.t)) this.linksByTarget.set(l.t, []);
        this.linksByTarget.get(l.t).push(l);
      }
      if (!this.linksBySource.has(l.s)) this.linksBySource.set(l.s, []);
      this.linksBySource.get(l.s).push(l);
    }

    this.interpByLaw = new Map();
    this.lawByInterp = new Map();
    for (const l of this.links) {
      if (!l.t || !l.td || l.td === l.sd) continue;
      const src = this.catalogById.get(l.sd);
      const dst = this.catalogById.get(l.td);
      if (!src || !dst) continue;
      if (src.category === '司法解释' && dst.category !== '司法解释') {
        this._agg(this.interpByLaw, l.td, l.sd, l);
        this._agg(this.lawByInterp, l.sd, l.td, l, true);
      } else if (src.category !== '司法解释' && dst.category === '司法解释') {
        this._agg(this.lawByInterp, l.sd, l.td, l);
      }
    }
  }

  _agg(map, key, subKey, l, useTarget = false) {
    if (!map.has(key)) map.set(key, new Map());
    const inner = map.get(key);
    if (!inner.has(subKey)) inner.set(subKey, { count: 0, articles: new Set(), best: l.c });
    const rec = inner.get(subKey);
    rec.count += l.mentions || 1;
    rec.articles.add(useTarget ? l.t : l.s);
    const order = { explicit: 3, list: 2, contextual: 1, document: 0 };
    if ((order[l.c] || 0) > (order[rec.best] || 0)) rec.best = l.c;
  }

  interpretationsOfLaw(lawId) {
    const inner = this.interpByLaw.get(lawId);
    if (!inner) return [];
    return [...inner.entries()]
      .map(([docId, rec]) => {
        const doc = this.catalogById.get(docId) || {};
        return { docId, title: doc.title, shortTitle: doc.shortTitle, category: doc.category, count: rec.count, articleCount: rec.articles.size, best: rec.best };
      })
      .sort((a, b) => b.articleCount - a.articleCount || b.count - a.count);
  }

  lawsOfInterpretation(interpId) {
    const inner = this.lawByInterp.get(interpId);
    if (!inner) return [];
    return [...inner.entries()]
      .map(([docId, rec]) => {
        const doc = this.catalogById.get(docId) || {};
        return { docId, title: doc.title, shortTitle: doc.shortTitle, count: rec.count, articleCount: rec.articles.size };
      })
      .sort((a, b) => b.articleCount - a.articleCount);
  }

  interpretationsOfArticle(articleId) {
    const ls = this.linksByTarget.get(articleId) || [];
    const order = { explicit: 3, list: 2, contextual: 1, document: 0 };
    const groups = new Map();
    for (const l of ls) {
      if (!l.td || l.td === l.sd) continue;
      if (!groups.has(l.s)) groups.set(l.s, []);
      groups.get(l.s).push(l);
    }
    return [...groups.values()]
      .map((group) => {
        const l = [...group].sort((a, b) => (order[b.c] || 0) - (order[a.c] || 0))[0];
        const srcDoc = this.catalogById.get(l.sd) || {};
        const srcArticle = this.articles.get(l.s);
        return {
          link: l,
          docId: l.sd,
          docTitle: srcDoc.title,
          docShortTitle: srcDoc.shortTitle,
          category: srcDoc.category,
          division: srcDoc.division,
          articleId: l.s,
          articleNumber: srcArticle ? srcArticle.number : null,
          articleSlug: srcArticle ? srcArticle.slug : null,
          displayNumber: srcArticle ? srcArticle.displayNumber : '',
          articleText: srcArticle ? srcArticle.text : '',
          confidence: l.c,
          mentions: group.reduce((n, x) => n + (x.mentions || 1), 0),
          asMentioned: [...new Set(group.map((x) => x.raw).filter(Boolean))].join(' / '),
        };
      })
      .sort((a, b) => (order[b.confidence] - order[a.confidence]) || (a.docShortTitle || '').localeCompare(b.docShortTitle || '') || (a.articleNumber - b.articleNumber));
  }

  outgoingOfArticle(articleId) {
    const ls = this.linksBySource.get(articleId) || [];
    const order = { explicit: 3, list: 2, contextual: 1, document: 0 };
    const groups = new Map();
    for (const l of ls) {
      if (!l.td || l.sd === l.td) continue;
      const key = l.t ? `t:${l.t}` : `n:${l.td}#${l.tn}#${l.ts || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    return [...groups.values()]
      .map((group) => {
        const l = [...group].sort((a, b) => (order[b.c] || 0) - (order[a.c] || 0))[0];
        const dst = this.catalogById.get(l.td) || {};
        const dstArticle = l.t ? this.articles.get(l.t) : null;
        const readings = [...new Set(group.map((x) => x.raw).filter(Boolean))];
        return {
          link: l,
          docId: l.td,
          docTitle: dst.title,
          docShortTitle: dst.shortTitle,
          category: dst.category,
          division: dst.division,
          articleText: dstArticle ? dstArticle.text : null,
          targetId: l.t,
          targetNumber: l.tn,
          targetSlug: l.ts || (dstArticle ? dstArticle.slug : null),
          targetDisplay: dstArticle ? dstArticle.displayNumber : `第${l.tn}条`,
          raw: readings.join(' / ') || l.raw,
          mentions: group.reduce((n, x) => n + (x.mentions || 1), 0),
          resolved: Boolean(l.t),
          confidence: l.c,
        };
      })
      .sort((a, b) => a.docShortTitle.localeCompare(b.docShortTitle) || a.targetNumber - b.targetNumber);
  }

  _loadAnnotations() {
    const curated = readJson(path.join(DB, 'annotations', 'curated.json'));
    const derived = readJson(path.join(DB, 'annotations', 'derived.json'));
    this.curatedAnnotations = curated.annotations;
    this.derivedAnnotations = derived.annotations;
    this.annotationById = new Map([...this.curatedAnnotations, ...this.derivedAnnotations].map((a) => [a.id, a]));

    this.curatedByArticle = new Map();
    for (const a of this.curatedAnnotations) this.curatedByArticle.set(a.articleId, a);
    this.derivedByArticle = new Map();
    for (const a of this.derivedAnnotations) this.derivedByArticle.set(a.articleId, a);

    this.annotationStatsByLaw = new Map();
    for (const a of [...this.curatedAnnotations, ...this.derivedAnnotations]) {
      if (!this.annotationStatsByLaw.has(a.lawId)) this.annotationStatsByLaw.set(a.lawId, { curated: 0, derived: 0, key: 0 });
      const s = this.annotationStatsByLaw.get(a.lawId);
      if (a.source === 'curated') {
        s.curated += 1;
        if (a.level === 'key') s.key += 1;
      } else s.derived += 1;
    }
  }

  annotationsForArticle(articleId) {
    const curated = this.curatedByArticle.get(articleId) || null;
    const derived = this.derivedByArticle.get(articleId) || null;
    return { curated, derived };
  }

  _loadRubrics() {
    const file = path.join(DB, 'rubrics.json');
    this.rubrics = fs.existsSync(file) ? readJson(file).rubrics || [] : [];
    this.rubricByArticle = new Map(this.rubrics.map((r) => [r.articleId, r.text]));
  }

  _loadGazettes() {
    const file = path.join(DB, 'cases', 'gazette.json');
    this.gazettes = fs.existsSync(file) ? readJson(file).cases : [];
    this.gazetteById = new Map(this.gazettes.map((g) => [g.id, g]));
    this.gazetteByYear = new Map();
    for (const g of this.gazettes) {
      if (g.issueYear === null) continue;
      if (!this.gazetteByYear.has(g.issueYear)) this.gazetteByYear.set(g.issueYear, 0);
      this.gazetteByYear.set(g.issueYear, this.gazetteByYear.get(g.issueYear) + 1);
    }
  }

  _loadCases() {
    const file = path.join(DB, 'cases', 'guiding.json');
    this.cases = fs.existsSync(file) ? readJson(file).cases : [];
    this.caseById = new Map(this.cases.map((c) => [c.id, c]));
    this.casesByLaw = new Map();
    this.casesByArticle = new Map();
    for (const c of this.cases) {
      for (const r of c.related) {
        if (r.lawId) {
          if (!this.casesByLaw.has(r.lawId)) this.casesByLaw.set(r.lawId, []);
          this.casesByLaw.get(r.lawId).push({ ...r, caseId: c.id, caseNumber: c.number, caseTitle: c.title });
        }
        if (r.articleId) {
          if (!this.casesByArticle.has(r.articleId)) this.casesByArticle.set(r.articleId, []);
          this.casesByArticle.get(r.articleId).push({ ...r, caseId: c.id, caseNumber: c.number, caseTitle: c.title });
        }
      }
    }
  }

  casesOfArticle(articleId) {
    const map = new Map();
    for (const c of this.casesByArticle.get(articleId) || []) map.set(c.caseId, c);
    return [...map.values()];
  }

  casesOfLaw(lawId) {
    const map = new Map();
    for (const c of this.casesByLaw.get(lawId) || []) map.set(c.caseId, c);
    return [...map.values()].sort((a, b) => a.caseNumber - b.caseNumber);
  }

  _buildSearchCorpus() {
    const corpus = [];
    for (const doc of this.docs.values()) {
      const searchDocTitle = `${doc.title} ${doc.shortTitle}`;
      for (const a of doc.articles) {
        const annotation = this.curatedByArticle.get(a.id);
        corpus.push({
          kind: 'article',
          id: a.id,
          docId: doc.id,
          docTitle: doc.title,
          docShortTitle: doc.shortTitle,
          category: doc.category,
          division: doc.division,
          domain: doc.domain,
          promulgationDate: doc.promulgationDate,
          effectiveDate: doc.effectiveDate,
          status: doc.status,
          number: a.number,
          seq: a.seq || 0,
          slug: a.slug,
          displayNumber: a.displayNumber,
          path: a.path,
          text: a.text,
          titleText: `${searchDocTitle} ${a.displayNumber} ${(a.path || []).join(' ')}`,
          annotText: annotation ? annotationText(annotation) : '',
          textLower: (a.text || '').toLowerCase(),
          titleTextLower: `${searchDocTitle} ${a.displayNumber} ${(a.path || []).join(' ')}`.toLowerCase(),
          annotTextLower: (annotation ? annotationText(annotation) : '').toLowerCase(),
          hasAnnotation: Boolean(annotation),
          annotLevel: annotation ? annotation.level : null,
        });
      }
    }
    for (const c of this.cases) {
      corpus.push({
        kind: 'case',
        id: c.id,
        docId: c.id,
        caseTitle: c.title,
        caseNumber: c.number,
        docTitle: `${c.title}（${c.number}号）`,
        docShortTitle: `指导案例 ${c.number} 号`,
        category: '指导性案例',
        division: 'case',
        domain: 'case',
        promulgationDate: null,
        effectiveDate: null,
        number: c.number,
        displayNumber: `${c.number} 号`,
        path: [],
        text: [...(c.gist || []), ...(c.facts || []), ...(c.result || []), ...(c.reasoning || [])].join('\n'),
        titleText: `${c.title} ${(c.keywords || []).join(' ')} 指导案例${c.number}号`,
        annotText: '',
        textLower: [...(c.gist || []), ...(c.facts || []), ...(c.result || []), ...(c.reasoning || [])].join('\n').toLowerCase(),
        titleTextLower: `${c.title} ${(c.keywords || []).join(' ')} 指导案例${c.number}号`.toLowerCase(),
        annotTextLower: '',
        hasAnnotation: false,
        annotLevel: null,
      });
    }
    for (const g of this.gazettes) {
      const text = [...(g.summary || []), ...(g.body || [])].join('\n');
      const titleText = `${g.title} ${g.caseNumber} ${g.court} ${g.docType} 公报${g.issueYear}年第${g.issueNo}期`;
      corpus.push({
        kind: 'gazette',
        id: g.id,
        docId: g.id,
        docTitle: `${g.title}（${g.caseNumber}）`,
        docShortTitle: `公报 ${g.issueYear} 年第 ${g.issueNo} 期`,
        category: '裁判文书',
        division: 'gazette',
        domain: 'gazette',
        promulgationDate: null,
        effectiveDate: null,
        number: null,
        seq: 0,
        slug: null,
        displayNumber: g.docType || '裁判文书',
        path: [],
        text,
        titleText,
        annotText: '',
        textLower: text.toLowerCase(),
        titleTextLower: titleText.toLowerCase(),
        annotTextLower: '',
        hasAnnotation: false,
        annotLevel: null,
        caseTitle: g.title,
        caseNumber: g.caseNumber,
        court: g.court,
        docType: g.docType,
        issueYear: g.issueYear,
        issueNo: g.issueNo,
      });
    }
    this.corpus = corpus;

    this.articlesOfDoc = new Map();
    for (const doc of this.docs.values()) this.articlesOfDoc.set(doc.id, doc.articles);
  }

  getDoc(id) {
    return this.docs.get(id) || null;
  }

  getArticle(docId, number) {
    if (number === undefined) return this.articles.get(docId) || null;
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const m = String(number).trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const base = Number(m[1]);
    const seq = m[2] ? Number(m[2]) : 0;
    return doc.articles.find((a) => a.number === base && (a.seq || 0) === seq) || null;
  }

  siblings(article) {
    const list = this.articlesOfDoc.get(article.docId) || [];
    const i = list.findIndex((a) => a.id === article.id);
    return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, index: i + 1, total: list.length };
  }

  categoryOf(docIdOrArticle) {
    if (typeof docIdOrArticle === 'string') return this.catalogById.get(docIdOrArticle);
    return this.catalogById.get(docIdOrArticle.docId);
  }

  divisionStats() {
    return this.meta.divisions;
  }

  hotArticles(limit = 12, opts = {}) {
    let list = [...this.linksByTarget.entries()]
      .filter(([id]) => this.articles.has(id))
      .map(([id, ls]) => {
        const a = this.articles.get(id);
        const doc = this.catalogById.get(a.docId);
        const interp = new Set(ls.filter((l) => l.td && l.td !== l.sd).map((l) => l.sd));
        return { articleId: id, article: a, doc, interpCount: interp.size, linkCount: ls.reduce((n, l) => n + (l.mentions || 1), 0) };
      })
      .filter((x) => x.interpCount > 0);
    if (opts.division) list = list.filter((x) => x.doc.division === opts.division);
    list.sort((a, b) => b.interpCount - a.interpCount || b.linkCount - a.linkCount);
    return list.slice(0, limit);
  }

  coverageOf(docId) {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const interp = this.interpretationsOfLaw(docId);
    const annotated = doc.articles.filter((a) => (this.linksByTarget.get(a.id) || []).some((l) => l.td && l.td !== l.sd));
    const totalLinked = annotated.reduce((n, a) => n + (this.linksByTarget.get(a.id) || []).filter((l) => l.td && l.td !== l.sd).reduce((m, l) => m + (l.mentions || 1), 0), 0);
    let citedLinks = 0;
    let citedInterpLinks = 0;
    const citedArticles = new Set();
    const citedDocs = new Set();
    for (const a of doc.articles) {
      for (const l of this.linksBySource.get(a.id) || []) {
        if (!l.t || !l.td || l.td === l.sd) continue;
        const dst = this.catalogById.get(l.td);
        if (dst && dst.category === '司法解释') {
          citedInterpLinks += l.mentions || 1;
          continue;
        }
        citedLinks += l.mentions || 1;
        citedArticles.add(l.t);
        citedDocs.add(l.td);
      }
    }
    return {
      interpCount: interp.length,
      linkedArticles: annotated.length,
      totalArticles: doc.articles.length,
      linkCount: totalLinked,
      cited: { docs: citedDocs.size, articles: citedArticles.size, links: citedLinks, interpLinks: citedInterpLinks },
      annotations: this.annotationStatsByLaw.get(docId) || { curated: 0, derived: 0, key: 0 },
      cases: this.casesOfLaw(docId).length,
    };
  }
}

function annotationText(a) {
  const parts = [a.topic, a.question, ...(a.analysis || [])];
  for (const p of a.points || []) parts.push(`${p.title}：${p.text}`);
  for (const p of a.pitfalls || []) parts.push(p);
  for (const k of a.keywords || []) parts.push(k);
  for (const b of a.basis || []) parts.push(`${b.docShortTitle || ''}${b.displayNumber || ''} ${b.quote || b.excerpt || ''}`);
  return parts.filter(Boolean).join('\n');
}

let instance = null;
export function getDb() {
  if (!instance) instance = new Database();
  return instance;
}
export { annotationText };
