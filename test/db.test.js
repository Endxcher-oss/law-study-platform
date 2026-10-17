/**
 * 数据库结构与内容不变式测试（直接读 db/，需要先 npm run build）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, DB } from '../server/db.js';

const db = getDb();
const rawLinks = JSON.parse(fs.readFileSync(path.join(DB, 'links.json'), 'utf8'));
const norm = (s) => String(s || '').replace(/\s+/g, '');

test('目录与条文规模合理', () => {
  assert.ok(db.catalog.length >= 500, `文档数偏少：${db.catalog.length}`);
  assert.ok(db.articles.size >= 25000, `条文数偏少：${db.articles.size}`);
  assert.equal(db.docs.size, db.catalog.length);
});

test('catalog 字段完整，且每部文档至少有 1 条条文', () => {
  for (const d of db.catalog) {
    assert.ok(d.id && d.title && d.shortTitle, `${d.id} 缺少标题`);
    assert.ok(['宪法', '法律', '行政法规', '司法解释'].includes(d.category), `${d.id} 类别非法：${d.category}`);
    assert.ok(d.division && d.domain, `${d.id} 缺少编/门类`);
    assert.equal(d.articleCount, d.articles?.length ?? db.getDoc(d.id).articles.length, `${d.id} 条文数不一致`);
    assert.ok(d.articleCount >= 1, `${d.id} 没有条文`);
    assert.ok(db.domainById.has(d.domain), `${d.id} 的门类 ${d.domain} 不在 taxonomy 中`);
  }
});

test('条文 id / 条号 / 条文字段自洽', () => {
  for (const a of db.articles.values()) {
    assert.ok(a.id.startsWith(`${a.docId}-`), `${a.id} 与 docId 不一致`);
    assert.ok(Number.isInteger(a.number) && a.number >= 0, `${a.id} 条号非法`);
    assert.ok(a.displayNumber, `${a.id} 缺少 displayNumber`);
    assert.ok(typeof a.text === 'string' && a.text.length > 0, `${a.id} 条文为空`);
    assert.ok(Array.isArray(a.path), `${a.id} path 非数组`);
  }
});

test('条文可反查：id ⇄ (docId, slug) 双形式都能取到', () => {
  const samples = ['civil-code', 'criminal-law', 'civil-procedure-law', 'company-law'];
  for (const docId of samples) {
    const doc = db.getDoc(docId);
    for (const a of doc.articles.slice(0, 20)) {
      assert.equal(db.getArticle(docId, a.slug)?.id, a.id, `getArticle(${docId}, ${a.slug}) 取不到`);
      assert.equal(db.getArticle(a.id)?.id, a.id, `getArticle(${a.id}) 取不到`);
      if (!a.seq) assert.equal(db.getArticle(docId, a.number)?.id, a.id, '普通条文用条号即可定位');
    }
  }
  const base = db.getArticle('criminal-law', 17);
  const plus = db.getArticle('criminal-law', '17-1');
  assert.equal(base.displayNumber, '第十七条');
  assert.equal(plus.displayNumber, '第十七条之一');
  assert.notEqual(base.id, plus.id);
});

test('关联不变式：t 为空 ⇔ confidence 为 document；有 t 必须有 td', () => {
  for (const l of rawLinks.links) {
    if (l.t === null) assert.equal(l.c, 'document', `${l.s} ${l.raw} 无目标却不是 document`);
    if (l.t) {
      assert.ok(l.td, `${l.t} 缺少 td`);
      assert.ok(db.articles.has(l.t), `${l.t} 不在条文表中`);
      assert.equal(db.articles.get(l.t).docId, l.td, `${l.t} 的 docId 与 td 不符`);
    }
    if (l.td) assert.ok(db.catalogById.has(l.td), `td ${l.td} 不在目录中`);
    assert.ok(l.s && db.articles.has(l.s), `来源条文 ${l.s} 不存在`);
    assert.ok(l.tn > 0, `${l.s} 的条号非法`);
  }
});

test('link 双向索引一致', () => {
  assert.equal(db.links.length, rawLinks.links.filter((l) => l.t || l.td).length);
  const withT = db.links.filter((l) => l.t).length;
  let targetTotal = 0;
  for (const list of db.linksByTarget.values()) targetTotal += list.length;
  let sourceTotal = 0;
  for (const list of db.linksBySource.values()) sourceTotal += list.length;
  assert.equal(targetTotal, withT, '被引用索引条数应与有目标条文的关联数一致');
  assert.equal(sourceTotal, db.links.length, '来源索引应覆盖全部关联（含文档级）');
});

test('未定位引用（looseLinks）不含任何可定位的关联', () => {
  assert.ok(db.looseLinks.length > 0);
  for (const l of db.looseLinks) {
    assert.equal(l.t, null);
    assert.equal(l.td, null);
    assert.equal(l.c, 'document');
  }
  const looseSum = [...db.looseBySource.values()].reduce((n, x) => n + x.length, 0);
  assert.equal(looseSum, db.looseLinks.length);
});

test('司法解释关联覆盖：民法典/刑法/民诉法都有大量条文级关联', () => {
  for (const [lawId, min] of [
    ['civil-code', 150],
    ['criminal-law', 60],
    ['civil-procedure-law', 100],
  ]) {
    const interps = db.interpretationsOfLaw(lawId);
    assert.ok(interps.length >= 5, `${lawId} 关联的司法解释过少`);
    const linkedArticles = db.getDoc(lawId).articles.filter((a) => db.interpretationsOfArticle(a.id).length).length;
    assert.ok(linkedArticles >= min, `${lawId} 被解释条文过少：${linkedArticles} < ${min}`);
  }
});

test('被废止法律没有被错误映射到继受法条号', () => {
  const bad = rawLinks.links.filter((l) => l.note && /废止/.test(l.note) && l.t);
  assert.deepEqual(bad, [], '存在把已废止法条号挂到继受法上的脏关联');
});

test('人工注解：引文必须逐字出现在被引条文里', () => {
  assert.equal(db.curatedAnnotations.length, 20);
  for (const a of db.curatedAnnotations) {
    const target = db.getArticle(a.lawId, a.articleNumber);
    assert.ok(target, `${a.id} 指向不存在的条文 ${a.lawId}#${a.articleNumber}`);
    assert.equal(a.articleId, target.id, `${a.id} 的 articleId 与条号不符`);
    assert.equal(norm(a.articleText), norm(target.text), `${a.id} 的 articleText 与库中条文不一致`);
    assert.ok(['key', 'warning', 'standard'].includes(a.level), `${a.id} 等级非法：${a.level}`);
    assert.ok(a.topic && a.question && a.analysis.length, `${a.id} 缺少 topic/question/analysis`);
    assert.ok(a.basis.every((b) => b.docId && db.catalogById.has(b.docId)), `${a.id} 的依据文档不存在`);
  }
});

test('人工注解的依据引文逐字可核（若给出 quote）', () => {
  let checked = 0;
  for (const a of db.curatedAnnotations) {
    for (const b of a.basis) {
      if (!b.quote) continue;
      const src = db.getArticle(b.articleId) || db.getArticle(b.docId, b.articleNumber);
      assert.ok(src, `${a.id} 的依据 ${b.docId}#${b.articleNumber} 不存在`);
      assert.ok(norm(src.text).includes(norm(b.quote)), `${a.id} 的引文不在 ${src.id} 中：${b.quote}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 15, `实际核对到的引文过少：${checked}`);
});

test('自动派生注解：只挂真实条文，且有依据', () => {
  assert.ok(db.derivedAnnotations.length > 800);
  for (const a of db.derivedAnnotations.slice(0, 400)) {
    assert.equal(a.source, 'derived');
    assert.ok(db.articles.has(a.articleId), `${a.id} 的条文不存在`);
    assert.ok(a.basis.length >= 1, `${a.id} 没有依据`);
    assert.ok(a.basis.every((b) => db.articles.has(b.articleId)), `${a.id} 的依据条文不存在`);
  }
});

test('注解统计与索引一致', () => {
  const total = db.curatedAnnotations.length + db.derivedAnnotations.length;
  assert.equal(db.annotationById.size, total);
  for (const [articleId, a] of db.curatedByArticle) {
    assert.ok(db.articles.has(articleId));
    assert.equal(a.source, 'curated');
  }
  for (const [articleId, a] of db.derivedByArticle) {
    assert.ok(db.articles.has(articleId));
    assert.equal(a.source, 'derived');
  }
});

test('指导性案例：结构完整，关联法律/条文可解析', () => {
  assert.equal(db.cases.length, 278);
  let unresolved = 0;
  for (const c of db.cases) {
    assert.ok(c.id && c.number && c.title, '案例缺少标识');
    assert.ok(c.id.startsWith('guiding-'), `${c.id} 编号异常`);
    assert.ok(c.related.length >= 1, `${c.id} 没有关联法条`);
    for (const r of c.related) {
      if (!r.lawId) {
        unresolved += 1;
        assert.ok(r.lawName, `${c.id} 缺少法律名`);
        continue;
      }
      assert.ok(db.catalogById.has(r.lawId), `${c.id} 关联了不存在的法律 ${r.lawId}`);
      if (r.articleId) {
        const art = db.getArticle(r.articleId);
        assert.ok(art, `${c.id} 的条文 ${r.articleId} 不存在`);
        assert.equal(art.docId, r.lawId);
      }
    }
  }
  assert.ok(unresolved < 200, `无法解析的案例关联过多：${unresolved}`);
  const missingName = db.cases.flatMap((c) => c.related.filter((r) => !r.lawId && !r.lawName).map(() => c.id));
  assert.deepEqual(missingName, [], '存在既无 lawId 也无 lawName 的关联');
});

test('案例索引可反查（按法律 / 按条文）', () => {
  let checked = 0;
  for (const c of db.cases) {
    const r = c.related.find((x) => x.lawId && x.articleId);
    if (!r) continue;
    assert.ok(db.casesOfLaw(r.lawId).some((x) => x.caseId === c.id), `${c.id} 未进入 ${r.lawId} 的案例索引`);
    assert.ok(db.casesOfArticle(r.articleId).some((x) => x.caseId === c.id), `${c.id} 未进入 ${r.articleId} 的案例索引`);
    checked += 1;
    if (checked >= 30) break;
  }
  assert.ok(checked >= 10, `可核对的案例过少：${checked}`);
});

test('覆盖度元数据与实际数据一致', () => {
  const lawArticles = db.catalog.filter((d) => d.category !== '司法解释').reduce((n, d) => n + d.articleCount, 0);
  assert.equal(db.meta.coverage.lawArticles, lawArticles);
  assert.equal(
    db.meta.coverage.interpretationArticles,
    db.catalog.filter((d) => d.category === '司法解释').reduce((n, d) => n + d.articleCount, 0),
  );
  const isLawArticle = (id) => {
    const a = db.articles.get(id);
    const d = a && db.docs.get(a.docId);
    return !!d && d.category !== '司法解释';
  };
  const linked = new Set(rawLinks.links.filter((l) => l.t && isLawArticle(l.t)).map((l) => l.t));
  assert.equal(db.meta.coverage.lawArticlesWithLinks, linked.size);
  const fromInterp = new Set(db.catalog.filter((d) => d.category === '司法解释').map((d) => d.id));
  assert.equal(db.meta.coverage.interpretationLinks, rawLinks.links.filter((l) => fromInterp.has(l.sd)).length);
  assert.ok(db.meta.coverage.lawArticlesWithAnnotations <= linked.size);
  assert.ok(db.meta.counts.links === rawLinks.links.length);
});

test('“之一”条文：slug/排序/取条都按插入顺序，不落到法条末尾', () => {
  const doc = db.getDoc('criminal-law');
  assert.ok(doc, '应收录刑法');
  const display = doc.articles.map((a) => a.displayNumber);
  const at17 = display.indexOf('第十七条');
  assert.ok(at17 >= 0, '刑法应有第十七条');
  assert.equal(display[at17 + 1], '第十七条之一', '“第十七条之一”必须紧跟“第十七条”');
  const plus = doc.articles[at17 + 1];
  assert.equal(plus.slug, '17-1');
  assert.equal(plus.number, 17);
  assert.equal(plus.seq, 1);
  assert.equal(db.getArticle('criminal-law', '17-1').id, plus.id, 'getArticle 应接受 slug');
  assert.equal(db.getArticle('criminal-law', 17).displayNumber, '第十七条');
  const slugs = doc.articles.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slug 必须唯一');
  for (const d of db.docs.values()) {
    for (const a of d.articles) assert.ok(a.number <= 3000, `${d.id} 条号异常：${a.displayNumber}`);
  }
});

test('条旨（db/rubrics.json）：人工编辑层，逐条指向真实条文，正文不含【】', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(DB, 'rubrics.json'), 'utf8'));
  assert.equal(raw.count, raw.rubrics.length, 'count 应与数组长度一致');
  assert.ok(raw.rubrics.length >= 21, `条旨数偏少：${raw.rubrics.length}`);
  const seen = new Set();
  for (const r of raw.rubrics) {
    const art = db.getArticle(r.docId, r.slug);
    assert.ok(art, `条旨指向的条文不存在：${r.docId}#${r.slug}`);
    assert.equal(art.id, r.articleId, `${r.docId}#${r.slug} 的 articleId 不一致`);
    assert.equal(art.displayNumber, r.displayNumber, `${r.docId}#${r.slug} 的条号不一致`);
    assert.ok(r.text && r.text.trim(), '条旨不能为空');
    assert.match(r.text, /^[\u4e00-\u9fa5A-Za-z0-9 、（）]+$/, `条旨只能用汉字/字母/数字/顿号，官方罪名里的全角括号除外：${r.text}`);
    assert.ok(!seen.has(r.articleId), `同一条文重复撰写条旨：${r.articleId}`);
    seen.add(r.articleId);
  }
  const doc = db.getDoc('criminal-law');
  const rubricable = doc.articles.filter((a) => !(a.text || '').trim().startsWith('（删去）'));
  const general = rubricable.filter((a) => (a.path || [])[0] === '第一编总则');
  const specific = rubricable.filter((a) => (a.path || [])[0] === '第二编分则');
  assert.ok(general.length >= 101, `刑法总则条文数偏少：${general.length}`);
  assert.ok(specific.length >= 400, `刑法分则条文数偏少：${specific.length}`);
  assert.ok(raw.rubrics.length >= rubricable.length, `另有条文未撰写条旨：${rubricable.length - raw.rubrics.length} 条`);
  for (const art of [...general, ...specific]) {
    assert.ok(db.rubricByArticle.get(art.id), `刑法 ${art.displayNumber} 缺条旨`);
  }
  for (const a of db.articles.values()) {
    assert.ok(!(a.text || '').includes('【'), `${a.docId} ${a.displayNumber} 正文含【】`);
  }
});

test('同一条文多处提及同一目标时只列一行（提及次数记在 mentions 上）', () => {
  const art = db.getArticle('criminal-law', '10');
  const interp = db.interpretationsOfArticle(art.id);
  assert.equal(interp.length, 1, '被引用列表只应有一行');
  assert.equal(interp[0].mentions, 2, '两次提及应合并为 mentions=2');
  assert.equal(db.derivedByArticle.get(art.id).basis.length, 1, '派生注解的依据条文也不应重复');
  assert.match(db.derivedByArticle.get(art.id).analysis[0], /共 1 个条文引用了/, '摘要里的条文数应为去重后的条数');

  for (const [id, ls] of db.linksByTarget) {
    if (!ls.some((l) => l.td && l.td !== l.sd)) continue;
    const rows = db.interpretationsOfArticle(id);
    const keys = rows.map((r) => r.articleId);
    assert.equal(new Set(keys).size, keys.length, `${id} 的被引用列表存在重复行`);
  }
  for (const id of db.linksBySource.keys()) {
    const rows = db.outgoingOfArticle(id);
    const keys = rows.map((r) => (r.resolved ? r.targetId : `${r.docId}#${r.targetNumber}#${r.targetSlug || ''}`));
    assert.equal(new Set(keys).size, keys.length, `${id} 的引用列表存在重复行`);
  }
});

test('公报裁判文书：独立收录，不带任何条文关联字段', () => {
  const counts = db.meta.counts;
  assert.equal(db.gazettes.length, counts.gazette, '装载的裁判文书数应与 meta.counts.gazette 一致');
  assert.equal(db.gazetteById.size, db.gazettes.length, 'id 不应重复');
  assert.ok(db.gazettes.length >= 400, `裁判文书偏少：${db.gazettes.length}`);
  const bad = db.gazettes.filter(
    (g) => !g.title || !g.caseNumber || !g.court || !g.docType || !g.issueYear || !g.issueNo || !(g.body || []).length,
  );
  assert.deepEqual(bad.map((g) => g.id).slice(0, 5), [], '每件都应有标题 / 案号 / 法院 / 文书类型 / 期号 / 正文');
  const linked = db.gazettes.filter((g) => 'related' in g || 'articleId' in g || 'lawId' in g);
  assert.deepEqual(linked.map((g) => g.id).slice(0, 5), [], '裁判文书不与条文建立条文级关联');
  assert.equal(db.gazetteByYear.size, new Set(db.gazettes.map((g) => g.issueYear)).size, '年份索引应覆盖所有期号年份');
});

test('检索语料：条文 / 指导性案例 / 裁判文书三类齐备', () => {
  const kinds = {};
  for (const rec of db.corpus) kinds[rec.kind] = (kinds[rec.kind] || 0) + 1;
  assert.equal(kinds.article, db.articles.size);
  assert.equal(kinds.case, db.cases.length);
  assert.equal(kinds.gazette, db.gazettes.length);
});
