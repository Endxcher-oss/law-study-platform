#!/usr/bin/env node
/**
 * 构建 db/：读取 data/raw 语料与 data/annotations 人工内容，产出结构化数据库与构建报告。
 * 输入输出清单、引用抽取分级见 docs/pipeline.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanArticleText, isHeadingLine, normalizeText } from './lib/clean.js';
import { buildNameIndex, extractArticleRefs, extractQuotedRefs, lawIdFromTitle, SHORT_ALIASES } from './lib/refs.js';
import { buildCuratedIndex, classify, taxonomyObject, DIVISIONS, DOMAINS } from './lib/taxonomy.js';
import { intToCn, parseDisplayNumber, suffixSeq, slugOf } from './lib/cn-num.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_LAWS = path.join(ROOT, 'data/raw/laws');
const RAW_CASES = path.join(ROOT, 'data/raw/guiding-cases');
const DB = path.join(ROOT, 'db');

const log = (...a) => console.log('[build-db]', ...a);

function writeJson(file, data, { pretty = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function shortTitleOf(title) {
  let t = String(title).replace(/[〈《]([^》〉]*)[》〉]/g, '$1');
  t = t.replace(/^最高人民法院关于/, '').replace(/^最高人民检察院/, '');
  t = t.replace(/^中华人民共和国/, '');
  t = t.replace(/（\d{4}年修正文本）|（\d{4}年修正）|（试行）$/g, '');
  return t;
}

const SHORT_TITLE_OVERRIDES = {
  'sfjs-mfd-hetong': '民法典合同编通则解释',
  'sfjs-mfd-zongze': '民法典总则编解释',
  'sfjs-mfd-wuquan': '民法典物权编解释（一）',
  'sfjs-mfd-hunyin-1': '民法典婚姻家庭编解释（一）',
  'sfjs-mfd-hunyin-2': '民法典婚姻家庭编解释（二）',
  'sfjs-mfd-jicheng': '民法典继承编解释（一）',
  'sfjs-mfd-qinquan': '民法典侵权责任编解释（一）',
  'sfjs-mfd-shijian': '民法典时间效力规定',
  'sfjs-maimai': '买卖合同解释',
  'sfjs-shangpinfang': '商品房买卖合同解释',
  'sfjs-jianshe': '建设工程施工合同解释（一）',
  'sfjs-renshen': '人身损害赔偿解释',
  'sfjs-zhengju': '民事诉讼证据规定',
  'sfjs-minsusong': '民事诉讼法解释',
  'sfjs-laodong-1': '劳动争议解释（一）',
  'sfjs-laodong-2': '劳动争议解释（二）',
  'sfjs-danbao': '担保制度解释',
  'sfjs-jiedai': '民间借贷规定',
  'sfjs-gongsifa-3': '公司法解释（三）',
  'sfjs-gongsifa-5': '公司法解释（五）',
};

function categoryDir(category) {
  if (category === '司法解释') return 'interpretations';
  if (category === '行政法规') return 'regulations';
  return 'codes';
}

function loadRawLaws() {
  const files = fs.readdirSync(RAW_LAWS).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const docs = [];
  for (const f of files) {
    const d = readJson(path.join(RAW_LAWS, f));
    if (!d || !Array.isArray(d.articles)) continue;
    docs.push(d);
  }
  return docs;
}

function cleanDoc(raw) {
  const articles = [];
  const extractedHeadings = [];
  let pendingPart = null;

  const sorted = [...raw.articles].sort(
    (a, b) => (a.order ?? a.articleNumber ?? 0) - (b.order ?? b.articleNumber ?? 0),
  );

  for (const a of sorted) {
    const { text, trailingHeadings } = cleanArticleText(a.text);
    const articlePath = Array.isArray(a.path) ? a.path.filter(Boolean) : [];

    for (const h of trailingHeadings) extractedHeadings.push({ after: a.articleNumber, title: h });

    const parsed = parseDisplayNumber(a.displayNumber);
    const number = parsed ? parsed.number : a.articleNumber;
    const seq = parsed ? parsed.seq : suffixSeq(a.suffix);
    const suffix = parsed ? parsed.suffix : a.suffix ?? null;

    articles.push({
      id: a.id,
      number,
      seq,
      suffix,
      slug: seq ? `${number}-${seq}` : String(number),
      displayNumber: a.displayNumber || `第${intToCn(number)}条${suffix || ''}`,
      order: a.order ?? null,
      path: articlePath,
      text: normalizeText(text),
      paragraphs: text.split('\n').filter(Boolean).length,
      chars: text.replace(/\s/g, '').length,
      partHeading: pendingPart || null,
    });

    if (trailingHeadings.length) pendingPart = trailingHeadings[trailingHeadings.length - 1];
  }

  for (const a of articles) {
    if (a.path.length) continue;
    const lines = a.text.split('\n').filter((l) => isHeadingLine(l));
    for (const h of lines) if (!extractedHeadings.some((x) => x.title === h)) extractedHeadings.push({ after: a.number, title: h });
  }

  if (!articles.some((a) => a.path.length)) {
    for (const a of articles) if (!a.path.length && a.partHeading) a.path = [a.partHeading];
  }

  let sections = (raw.sections || []).map((s) => ({
    id: s.id,
    title: s.title,
    level: s.level ?? 1,
    path: s.path || [],
  }));
  if (!sections.length) {
    const seen = new Set();
    sections = [];
    for (const a of articles) {
      const p = a.path[0];
      if (!p || seen.has(p)) continue;
      seen.add(p);
      sections.push({ id: `${raw.id}-sec-${sections.length + 1}`, title: p, level: 1, path: [] });
    }
  }

  return { articles, sections, extractedHeadings };
}

function main() {
  const started = Date.now();
  log('读取原始语料…');
  const rawDocs = loadRawLaws();
  log(`  共 ${rawDocs.length} 部文档`);

  const nameDocs = rawDocs.map((d) => ({ id: d.id, title: d.title, category: d.category }));
  const nameIndex = buildNameIndex(nameDocs);
  const curatedIndex = buildCuratedIndex();

  const catalog = [];
  const docById = new Map();
  const articlesById = new Map();
  const articleBySlug = new Map();
  let linkRecords = [];
  const unresolved = new Map();
  const attribution = { explicit: 0, list: 0, contextual: 0, unresolved: 0, self: 0 };
  const extractedHeadingLog = [];

  for (const raw of rawDocs) {
    const { articles, sections, extractedHeadings } = cleanDoc(raw);
    const cls = classify(raw, curatedIndex);
    if (extractedHeadings.length) {
      extractedHeadingLog.push({ docId: raw.id, headings: extractedHeadings.slice(0, 12) });
    }

    const interpretationOf = raw.category === '司法解释' ? lawIdFromTitle(raw.title, nameIndex) : null;

    const record = {
      id: raw.id,
      title: raw.title,
      shortTitle: SHORT_TITLE_OVERRIDES[raw.id] || shortTitleOf(raw.title),
      category: raw.category,
      division: cls.division,
      domain: cls.domain,
      authority: raw.issuingAuthority || '',
      promulgationDate: raw.promulgationDate || null,
      effectiveDate: raw.effectiveDate || null,
      status: raw.status || 'effective',
      interpretationOf,
      articleCount: articles.length,
      sections,
      articles,
    };

    docById.set(raw.id, record);

    for (const a of articles) {
      articlesById.set(a.id, { article: a, docId: raw.id });
      articleBySlug.set(`${raw.id}#${a.slug}`, a.id);
    }

    catalog.push({
      id: record.id,
      title: record.title,
      shortTitle: record.shortTitle,
      category: record.category,
      division: record.division,
      domain: record.domain,
      status: record.status,
      promulgationDate: record.promulgationDate,
      effectiveDate: record.effectiveDate,
      authority: record.authority,
      articleCount: record.articleCount,
      interpretationOf,
      sectionCount: sections.length,
    });
  }

  log('抽取条文引用（法条 ↔ 司法解释）…');
  for (const doc of docById.values()) {
    for (const a of doc.articles) {
      const refs = extractArticleRefs(a.text, { docId: doc.id, nameIndex, window: 60 });
      for (const r of refs) {
        if (r.self) {
          attribution.self += 1;
          continue;
        }
        let targetArticleId = null;
        let targetDocId = r.targetDocId;
        if (targetDocId) {
          if (r.articleNumber != null) {
            targetArticleId = articleBySlug.get(`${targetDocId}#${slugOf(r.articleNumber)}${suffixSeq(r.suffix) ? `-${suffixSeq(r.suffix)}` : ''}`) || null;
            if (!targetArticleId && !docById.has(targetDocId)) targetDocId = null;
          }
        }
        if (!targetDocId || (r.articleNumber != null && !targetArticleId && targetDocId === doc.id)) {
          const key = `${doc.id}|${r.mentionName || ''}|${r.raw}`;
          const cur = unresolved.get(key) || { docId: doc.id, name: r.mentionName || '(未识别法名)', raw: r.raw, count: 0 };
          cur.count += 1;
          unresolved.set(key, cur);
          attribution.unresolved += 1;
        }
        let confidence = r.confidence;
        let note = r.note || null;
        if (!targetArticleId) {
          if (targetDocId) {
            note = `《${docById.get(targetDocId)?.shortTitle || targetDocId}》第${r.articleNumber}条未在本库收录的条文中找到（可能为已废止或旧版条号）`;
          }
          confidence = 'document';
        }
        if (confidence in attribution) attribution[confidence] += 1;
        else attribution.document = (attribution.document || 0) + 1;
        linkRecords.push({
          s: a.id,
          sd: doc.id,
          t: targetArticleId,
          td: targetDocId || null,
          tn: r.articleNumber ?? null,
          ts: targetArticleId ? articlesById.get(targetArticleId).article.slug : null,
          c: confidence,
          raw: r.raw,
          name: r.mentionName || null,
          note,
        });
      }
    }
  }
  log(`  抽取到 ${linkRecords.length} 处引用提及（explicit ${attribution.explicit} / list ${attribution.list} / contextual ${attribution.contextual} / 未解析 ${attribution.unresolved}）`);
  linkRecords = mergeLinkRecords(linkRecords);
  const mentionTotal = linkRecords.reduce((n, l) => n + l.mentions, 0);
  log(`  去重后 ${linkRecords.length} 条关联（合计 ${mentionTotal} 处提及）`);

  log('处理指导性案例…');
  let cases = [];
  if (fs.existsSync(RAW_CASES)) {
    const caseFiles = fs.readdirSync(RAW_CASES).filter((f) => /^guiding-\d+\.json$/.test(f));
    for (const f of caseFiles) {
      const c = readJson(path.join(RAW_CASES, f));
      const related = [];
      for (const line of c.relatedLaws || []) {
        const quotedName = ([...String(line).matchAll(/[〈《]([^》〉]+)[》〉]/g)][0] || [])[1] || null;
        for (const r of extractQuotedRefs(line, { docId: c.id, nameIndex })) {
          const targetArticleId = r.targetDocId ? articleBySlug.get(`${r.targetDocId}#${slugOf(r.articleNumber)}${suffixSeq(r.suffix) ? `-${suffixSeq(r.suffix)}` : ''}`) || null : null;
          related.push({
            lawId: r.targetDocId || null,
            lawName: r.mentionName || quotedName || null,
            articleId: targetArticleId,
            articleNumber: r.articleNumber ?? null,
            articleSlug: targetArticleId ? articlesById.get(targetArticleId).article.slug : null,
            raw: r.raw,
            note: r.note || null,
            source: line,
          });
        }
      }
      cases.push({
        id: c.id,
        number: c.number,
        title: c.title,
        issuedLine: c.issuedLine || '',
        publishedAt: c.publishedAt || null,
        keywords: c.keywords || [],
        gist: c.gist || [],
        facts: c.facts || [],
        result: c.result || [],
        reasoning: c.reasoning || [],
        relatedLaws: c.relatedLaws || [],
        related,
        sourceUrl: c.sourceUrl || '',
      });
    }
    cases.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }

  log('写出 db/ …');
  fs.rmSync(path.join(DB, 'codes'), { recursive: true, force: true });
  fs.rmSync(path.join(DB, 'interpretations'), { recursive: true, force: true });
  fs.rmSync(path.join(DB, 'regulations'), { recursive: true, force: true });

  for (const doc of docById.values()) {
    writeJson(path.join(DB, categoryDir(doc.category), `${doc.id}.json`), doc);
  }

  const taxonomyMap = {};
  for (const d of catalog) taxonomyMap[d.id] = { division: d.division, domain: d.domain };
  writeJson(path.join(DB, 'taxonomy.json'), taxonomyObject(), { pretty: true });
  writeJson(path.join(DB, 'taxonomy.map.json'), taxonomyMap, { pretty: true });
  const aliasByDoc = new Map();
  for (const [alias, docId] of Object.entries(SHORT_ALIASES)) {
    if (!docId || !docById.has(docId)) continue;
    if (!aliasByDoc.has(docId)) aliasByDoc.set(docId, new Set());
    aliasByDoc.get(docId).add(alias);
  }
  for (const d of catalog) {
    const set = aliasByDoc.get(d.id) || new Set();
    const bare = String(d.title || '').replace(/[《》〈〉]/g, '').replace(/^中华人民共和国/, '').replace(/^最高人民法院关于/, '');
    if (bare.length >= 3) set.add(bare);
    for (const a of [...set]) if (a === d.shortTitle || a.length < 2) set.delete(a);
    if (set.size) d.aliases = [...set].sort((a, b) => a.length - b.length).slice(0, 6);
  }

  writeJson(path.join(DB, 'catalog.json'), catalog);

  const validLinks = linkRecords.filter((l) => l.td || l.confidence !== 'explicit' || l.t);
  const recordAttribution = {};
  for (const l of validLinks) recordAttribution[l.c] = (recordAttribution[l.c] || 0) + 1;
  const linkMentions = validLinks.reduce((n, l) => n + l.mentions, 0);
  writeJson(path.join(DB, 'links.json'), {
    schemaVersion: 1,
    note: '每条记录 = 一个去重后的关联；mentions 是该写法在来源条文里出现的次数（“处”）。',
    stats: { total: validLinks.length, mentions: linkMentions, attribution: recordAttribution },
    links: validLinks,
  });

  writeJson(path.join(DB, 'cases', 'guiding.json'), { schemaVersion: 1, count: cases.length, cases });
  writeJson(
    path.join(DB, 'cases', 'manifest.json'),
    cases.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      publishedAt: c.publishedAt,
      keywords: c.keywords,
      lawIds: [...new Set(c.related.map((r) => r.lawId).filter(Boolean))],
      articleIds: [...new Set(c.related.map((r) => r.articleId).filter(Boolean))],
    })),
  );

  const divisionStats = {};
  for (const div of DIVISIONS) {
    const docs = catalog.filter((d) => d.division === div.id);
    divisionStats[div.id] = {
      name: div.name,
      status: div.status,
      documents: docs.length,
      articles: docs.reduce((n, d) => n + d.articleCount, 0),
      domains: (DOMAINS[div.id] || []).map((dom) => ({
        id: dom.id,
        name: dom.name,
        documents: docs.filter((d) => d.domain === dom.id).length,
        articles: docs.filter((d) => d.domain === dom.id).reduce((n, d) => n + d.articleCount, 0),
      })),
    };
  }

  const meta = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    generator: 'scripts/build-db.js',
    source: {
      name: 'chinese-law-corpus（中国法律法规与案例结构化语料库）',
      upstream: 'https://github.com/lttxzmj/chinese-law-corpus',
      legalSource: '国家法律法规数据库 https://flk.npc.gov.cn/（正文经 Word 原文抽取，未经模型改写）',
      license: 'CC0-1.0',
      syncedAt: '2026-10-15',
    },
    counts: {
      documents: catalog.length,
      codes: catalog.filter((d) => d.category === '法律' || d.category === '宪法').length,
      interpretations: catalog.filter((d) => d.category === '司法解释').length,
      regulations: catalog.filter((d) => d.category === '行政法规').length,
      articles: catalog.reduce((n, d) => n + d.articleCount, 0),
      links: validLinks.length,
      linkMentions,
      cases: cases.length,
    },
    divisions: divisionStats,
  };
  writeJson(path.join(DB, 'meta.json'), meta, { pretty: true });

  log('生成注解…');
  const warningList = [];
  const curatedAnnotations = buildCuratedAnnotations({ docById, articlesById, articleBySlug, cases, warningList });
  const derivedAnnotations = buildDerivedAnnotations({ docById, articlesById, linkRecords, catalog });
  const rubrics = buildRubrics({ docById, articlesById, articleBySlug, warningList });

  writeJson(path.join(DB, 'annotations', 'curated.json'), {
    schemaVersion: 1,
    generatedAt: meta.builtAt,
    source: 'data/annotations/curated.mjs',
    count: curatedAnnotations.length,
    annotations: curatedAnnotations,
  });
  writeJson(path.join(DB, 'annotations', 'derived.json'), {
    schemaVersion: 1,
    generatedAt: meta.builtAt,
    note: '依据 db/links.json 的条文级关联自动生成的适用规则摘要，非人工意见。',
    count: derivedAnnotations.length,
    annotations: derivedAnnotations,
  });
  writeJson(path.join(DB, 'rubrics.json'), {
    schemaVersion: 1,
    generatedAt: meta.builtAt,
    source: 'data/annotations/rubrics.mjs',
    note: '人工撰写的条文主旨（条旨），教材上写作【…】的那一截；属于编辑层，非官方正文。',
    count: rubrics.length,
    rubrics,
  });
  writeJson(
    path.join(DB, 'annotations', 'index.json'),
    [...curatedAnnotations, ...derivedAnnotations].map((a) => ({
      id: a.id,
      lawId: a.lawId,
      articleNumber: a.articleNumber,
      articleId: a.articleId,
      displayNumber: a.displayNumber,
      source: a.source,
      level: a.level,
      topic: a.topic,
      chips: a.chips,
      keywords: a.keywords,
      basisCount: a.basis.length,
    })),
  );

  meta.counts.annotations = curatedAnnotations.length + derivedAnnotations.length;
  meta.counts.rubrics = rubrics.length;
  const catalogById = new Map(catalog.map((d) => [d.id, d]));
  const lawArticleIds = new Set();
  for (const d of docById.values()) {
    if (d.category === '司法解释') continue;
    for (const a of d.articles) lawArticleIds.add(a.id);
  }
  meta.coverage = {
    lawArticles: catalog.filter((d) => d.category !== '司法解释').reduce((n, d) => n + d.articleCount, 0),
    interpretationArticles: catalog.filter((d) => d.category === '司法解释').reduce((n, d) => n + d.articleCount, 0),
    lawArticlesWithLinks: new Set(linkRecords.filter((l) => l.t && lawArticleIds.has(l.t)).map((l) => l.t)).size,
    lawArticlesWithAnnotations: new Set(
      derivedAnnotations.map((a) => a.articleId).filter((id) => lawArticleIds.has(id)),
    ).size,
    interpretationLinks: linkRecords.filter((l) => {
      const sd = catalogById.get(l.sd);
      return sd && sd.category === '司法解释';
    }).length,
  };
  writeJson(path.join(DB, 'meta.json'), meta, { pretty: true });
  log(`  人工注解 ${curatedAnnotations.length} 条 / 自动派生 ${derivedAnnotations.length} 条 / 条旨 ${rubrics.length} 条 / 校验告警 ${warningList.length} 条`);

  const report = {
    generatedAt: meta.builtAt,
    durationMs: Date.now() - started,
    counts: meta.counts,
    coverage: meta.coverage,
    linkAttribution: attribution,
    annotationWarnings: warningList,
    extractedHeadings: extractedHeadingLog,
    unresolvedTop: [...unresolved.values()].sort((a, b) => b.count - a.count).slice(0, 80),
    unclassifiedDocs: catalog.filter((d) => d.division === 'other').map((d) => ({ id: d.id, category: d.category, title: d.title })),
    classificationSource: catalog.reduce((acc, d) => {
      const src = curatedIndex.has(d.id) ? 'curated-id' : 'rule-or-fallback';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {}),
  };
  writeJson(path.join(DB, 'reports', 'build-report.json'), report, { pretty: true });

  log(`完成：${meta.counts.documents} 部文档 / ${meta.counts.articles} 条条文 / ${meta.counts.links} 条关联 / ${meta.counts.cases} 件案例 / ${meta.counts.annotations} 条注解，用时 ${Date.now() - started}ms`);
}

function squeeze(s) {
  return String(s).replace(/[\s\u3000]/g, '');
}

async function loadCuratedAnnotationsModule() {
  const file = path.join(ROOT, 'data/annotations/curated.mjs');
  if (!fs.existsSync(file)) return [];
  const mod = await import(`file://${file}?v=${Date.now()}`);
  return mod.annotations || [];
}

function buildCuratedAnnotations({ docById, articlesById, articleBySlug, cases, warningList }) {
  const out = [];
  const seen = new Set();
  for (const raw of curatedModule) {
    const law = docById.get(raw.lawId);
    if (!law) {
      warningList.push({ level: 'error', where: raw.id, message: `lawId 不存在：${raw.lawId}` });
      continue;
    }
    const articleId = articleBySlug.get(`${raw.lawId}#${slugOf(raw.articleNumber)}`);
    if (!articleId) {
      warningList.push({ level: 'error', where: raw.id, message: `${law.shortTitle} 第${raw.articleNumber}条 不存在` });
      continue;
    }
    const lawArticle = articlesById.get(articleId).article;
    if (seen.has(articleId)) warningList.push({ level: 'warn', where: raw.id, message: `重复注解：${articleId}` });
    seen.add(articleId);

    const basis = [];
    for (const b of raw.bases || []) {
      const doc = docById.get(b.docId);
      if (!doc) {
        warningList.push({ level: 'error', where: raw.id, message: `依据文档不存在：${b.docId}` });
        continue;
      }
      const targetId = articleBySlug.get(`${b.docId}#${slugOf(b.articleNumber)}`);
      if (!targetId) {
        warningList.push({ level: 'error', where: raw.id, message: `依据条文不存在：${b.docId} 第${b.articleNumber}条` });
        continue;
      }
      const target = articlesById.get(targetId).article;
      if (b.quote && !squeeze(target.text).includes(squeeze(b.quote))) {
        warningList.push({
          level: 'error',
          where: raw.id,
          message: `引文与原文不一致：${b.docId} 第${b.articleNumber}条\n  引文：${squeeze(b.quote).slice(0, 60)}\n  原文：${squeeze(target.text).slice(0, 60)}`,
        });
      }
      basis.push({
        docId: b.docId,
        docTitle: doc.title,
        docShortTitle: doc.shortTitle,
        category: doc.category,
        division: doc.division,
        domain: doc.domain,
        articleNumber: b.articleNumber,
        articleId: targetId,
        displayNumber: target.displayNumber,
        path: target.path,
        relation: b.relation || '依据',
        relevance: b.relevance || 'primary',
        note: b.note || '',
        quote: b.quote || '',
        excerpt: target.text.slice(0, 240),
      });
    }

    const caseRefs = [];
    for (const c of raw.cases || []) {
      const found = cases.find((x) => x.number === c.number);
      if (!found) {
        warningList.push({ level: 'warn', where: raw.id, message: `指导性案例不存在：${c.number}` });
        continue;
      }
      caseRefs.push({ caseId: found.id, number: found.number, title: found.title, relation: c.relation || '' });
    }

    out.push({
      id: raw.id,
      source: 'curated',
      lawId: raw.lawId,
      lawTitle: law.title,
      lawShortTitle: law.shortTitle,
      division: law.division,
      domain: law.domain,
      articleNumber: raw.articleNumber,
      articleId,
      displayNumber: lawArticle.displayNumber,
      path: lawArticle.path,
      articleText: lawArticle.text,
      level: raw.level || 'standard',
      topic: raw.topic,
      question: raw.question || '',
      analysis: raw.analysis || [],
      points: raw.points || [],
      pitfalls: raw.pitfalls || [],
      keywords: raw.keywords || [],
      references: raw.references || [],
      chips: (raw.points || []).slice(0, 3).map((p) => p.title),
      basis,
      cases: caseRefs,
    });
  }
  return out;
}

function mergeLinkRecords(records) {
  const merged = new Map();
  for (const l of records) {
    const key = [l.s, l.t || '', l.td || '', l.tn ?? '', l.ts || '', l.c, l.raw || '', l.name || '', l.note || ''].join('\u0001');
    const hit = merged.get(key);
    if (hit) hit.mentions += 1;
    else merged.set(key, { ...l, mentions: 1 });
  }
  return [...merged.values()];
}

function buildDerivedAnnotations({ docById, articlesById, linkRecords, catalog }) {
  const inbound = new Map();
  for (const l of linkRecords) {
    if (!l.t) continue;
    if (!inbound.has(l.t)) inbound.set(l.t, []);
    inbound.get(l.t).push(l);
  }

  const out = [];
  for (const [targetId, links] of inbound) {
    const target = articlesById.get(targetId);
    if (!target) continue;
    const law = docById.get(target.docId);
    const external = links.filter((l) => l.sd !== target.docId);
    if (!external.length) continue;

    const byDoc = new Map();
    for (const l of external) {
      if (!byDoc.has(l.sd)) byDoc.set(l.sd, []);
      byDoc.get(l.sd).push(l);
    }

    const basis = [];
    for (const [docId, ls] of [...byDoc.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const doc = docById.get(docId);
      if (!doc) continue;
      const byArticle = new Map();
      for (const l of ls) {
        if (!byArticle.has(l.s)) byArticle.set(l.s, []);
        byArticle.get(l.s).push(l);
      }
      for (const group of [...byArticle.values()].slice(0, 4)) {
        const src = articlesById.get(group[0].s);
        if (!src) continue;
        const rank = { explicit: 3, list: 2, contextual: 1, document: 0 };
        const best = [...group].sort((a, b) => (rank[b.c] || 0) - (rank[a.c] || 0))[0];
        const readings = [...new Set(group.map((l) => l.raw).filter(Boolean))];
        basis.push({
          docId,
          docTitle: doc.title,
          docShortTitle: doc.shortTitle,
          category: doc.category,
          division: doc.division,
          domain: doc.domain,
          articleNumber: src.article.number,
          articleId: group[0].s,
          displayNumber: src.article.displayNumber,
          relation: '依据',
          confidence: best.c,
          asMentioned: readings.join(' / '),
          mentions: group.reduce((n, l) => n + (l.mentions || 1), 0),
          excerpt: src.article.text.slice(0, 220),
        });
      }
    }
    if (!basis.length) continue;
    basis.sort((a, b) => (a.category === '司法解释' ? -1 : 1) - (b.category === '司法解释' ? -1 : 1));

    const interpDocs = [...byDoc.keys()].filter((id) => docById.get(id)?.category === '司法解释');
    const article = target.article;
    out.push({
      id: `dev-${targetId}`,
      source: 'derived',
      lawId: target.docId,
      lawTitle: law.title,
      lawShortTitle: law.shortTitle,
      division: law.division,
      domain: law.domain,
      articleNumber: article.number,
      articleId: targetId,
      displayNumber: article.displayNumber,
      path: article.path,
      articleText: article.text,
      level: interpDocs.length >= 5 ? 'key' : interpDocs.length >= 2 ? 'standard' : 'note',
      topic: `${interpDocs.length} 件司法解释的条文引用了本条`,
      question: '',
      analysis: [
        `机器抽取结果：本库中有 ${interpDocs.length} 件司法解释、共 ${basis.length} 个条文引用了${law.shortTitle}${article.displayNumber}。下方“依据条文”已按关联强度排序。`,
      ],
      points: [],
      pitfalls: [],
      keywords: [],
      chips: basis.slice(0, 3).map((b) => b.docShortTitle),
      basis,
      cases: [],
      machineGenerated: true,
    });
  }
  out.sort((a, b) => b.basis.length - a.basis.length || a.articleId.localeCompare(b.articleId));
  return out;
}

const curatedModule = await loadCuratedAnnotationsModule();
const rubricsModule = await loadRubricsModule();
main();

async function loadRubricsModule() {
  const file = path.join(ROOT, 'data/annotations/rubrics.mjs');
  if (!fs.existsSync(file)) return [];
  const mod = await import(`file://${file}?v=${Date.now()}`);
  return mod.rubrics || [];
}

function buildRubrics({ docById, articlesById, articleBySlug, warningList }) {
  const out = [];
  const seen = new Set();
  for (const raw of rubricsModule) {
    const where = `rubric:${raw.docId}#${raw.slug}`;
    const law = docById.get(raw.docId);
    if (!law) {
      warningList.push({ level: 'error', where, message: `文档不存在：${raw.docId}` });
      continue;
    }
    const articleId = articleBySlug.get(`${raw.docId}#${raw.slug}`);
    if (!articleId) {
      warningList.push({ level: 'error', where, message: `${law.shortTitle} 条文不存在：${raw.slug}` });
      continue;
    }
    const text = String(raw.text || '').trim();
    if (!text) {
      warningList.push({ level: 'error', where, message: '条旨为空' });
      continue;
    }
    if (/[【】]/.test(text)) warningList.push({ level: 'warn', where, message: `条旨里不要写【】：${text}` });
    const badChars = [...new Set(text.replace(/[\u4e00-\u9fa5A-Za-z0-9 、]/g, '').split(''))];
    if (badChars.length) {
      warningList.push({ level: 'error', where, message: `条旨不得含标点/特殊符号“${badChars.join('')}”：${text}` });
    }
    if (text.length > 16) warningList.push({ level: 'warn', where, message: `条旨偏长（${text.length} 字）：${text}` });
    if (seen.has(articleId)) warningList.push({ level: 'warn', where, message: `同一条文重复撰写条旨：${articleId}` });
    seen.add(articleId);

    const { article } = articlesById.get(articleId);
    out.push({
      docId: raw.docId,
      articleId,
      slug: article.slug,
      displayNumber: article.displayNumber,
      text,
    });
  }
  out.sort(
    (a, b) =>
      a.docId.localeCompare(b.docId) ||
      (articlesById.get(a.articleId).article.order ?? 0) - (articlesById.get(b.articleId).article.order ?? 0),
  );
  return out;
}
