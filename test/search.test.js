/**
 * 检索层测试：查询解析、直接定位、范围/类别/排序过滤、分页、高亮。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db.js';
import { search, directHit, nameMatches, tokenize, normalizeQuery, highlight, suggest } from '../server/search.js';

const db = getDb();

test('normalizeQuery / tokenize：全角与空白归一化', () => {
  assert.equal(normalizeQuery('  民法典（一） '), '民法典(一)');
  assert.equal(normalizeQuery(null), '');
  const t = tokenize('违约金');
  assert.ok(t.terms.some((x) => x.term === '违约'), '应切出“违约”');
  assert.equal(tokenize('').terms.length, 0);
});

test('直接定位：法名 + 条号（含简称、阿拉伯数字、省略“第”）', () => {
  assert.deepEqual(pick(directHit(db, '民法典第585条')), { docId: 'civil-code', number: 585 });
  assert.deepEqual(pick(directHit(db, '民法典 585')), { docId: 'civil-code', number: 585 });
  assert.deepEqual(pick(directHit(db, '民法典585条')), { docId: 'civil-code', number: 585 });
  assert.deepEqual(pick(directHit(db, '刑法第20条')), { docId: 'criminal-law', number: 20 });
  assert.deepEqual(pick(directHit(db, '刑诉法第5条')), { docId: 'criminal-procedure-law', number: 5 });
  assert.deepEqual(pick(directHit(db, '合同编通则解释第64条')), { docId: 'sfjs-mfd-hetong', number: 64 });
  const bare = directHit(db, '第585条');
  assert.equal(bare?.docId, null);
  assert.equal(bare?.number, 585);
  assert.equal(directHit(db, '违约金怎么算'), null);
  assert.equal(directHit(db, ''), null);
});

test('法名匹配：精确/别名优先于模糊包含', () => {
  const hits = nameMatches(db, '民法典');
  assert.equal(hits[0].id, 'civil-code', '“民法典”应优先指向民法典本身');
  assert.equal(nameMatches(db, '民诉法')[0].id, 'civil-procedure-law');
  assert.equal(nameMatches(db, '消法')[0].id, 'consumer-rights-protection-law');
  assert.equal(nameMatches(db, '').length, 0);
});

test('检索限定：范围（编）、类别、仅看有注解', () => {
  const all = search(db, { q: '违约金', pageSize: 50 });
  assert.ok(all.total > 10, `“违约金”命中过少：${all.total}`);
  assert.ok(all.items.every((i) => i.id && i.docId && i.displayNumber));

  const civil = search(db, { q: '违约金', scope: 'civil', pageSize: 50 });
  assert.ok(civil.items.every((i) => i.division === 'civil'));
  assert.ok(civil.total < all.total && civil.total > 0, '范围过滤应缩小结果集');

  const interp = search(db, { q: '违约金', type: '司法解释', pageSize: 50 });
  assert.ok(interp.items.every((i) => i.category === '司法解释'));

  const annotated = search(db, { q: '违约金', onlyAnnotated: true, pageSize: 50 });
  assert.ok(annotated.items.every((i) => i.hasAnnotation));

  const scoped = search(db, { q: '违约金', docId: 'civil-code', pageSize: 50 });
  assert.ok(scoped.items.every((i) => i.docId === 'civil-code'));
});

test('分面统计与结果一致', () => {
  const res = search(db, { q: '违约金', pageSize: 100 });
  const byCat = {};
  for (const i of res.items) byCat[i.category] = (byCat[i.category] || 0) + 1;
  for (const [cat, n] of Object.entries(byCat)) {
    assert.ok(res.facets.category[cat] >= n, `分面 ${cat} 少于当前页统计`);
  }
});

test('排序方式：层级、时间、命中数', () => {
  const hier = search(db, { q: '违约金', sort: 'hierarchy', pageSize: 30 });
  const rank = { 宪法: 0, 法律: 1, 行政法规: 2, 司法解释: 3 };
  const ranks = hier.items.map((i) => rank[i.category] ?? 4);
  for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i] >= ranks[i - 1], '层级排序应单调不减');

  const desc = search(db, { q: '违约金', sort: 'date_desc', pageSize: 30 });
  const dates = desc.items.map((i) => i.promulgationDate || '').filter(Boolean);
  for (let i = 1; i < dates.length; i += 1) assert.ok(dates[i] <= dates[i - 1], '时间倒序应单调不增');

  const asc = search(db, { q: '违约金', sort: 'date_asc', pageSize: 30 });
  const dates2 = asc.items.map((i) => i.promulgationDate || '').filter(Boolean);
  for (let i = 1; i < dates2.length; i += 1) assert.ok(dates2[i] >= dates2[i - 1], '时间正序应单调不减');
});

test('分页：不重不漏，越界返回空', () => {
  const page1 = search(db, { q: '违约金', pageSize: 10, page: 1 });
  const page2 = search(db, { q: '违约金', pageSize: 10, page: 2 });
  assert.equal(page1.items.length, 10);
  assert.ok(page2.items.length > 0);
  const ids1 = new Set(page1.items.map((i) => i.id));
  assert.ok(page2.items.every((i) => !ids1.has(i.id)), '第 2 页不应与第 1 页重复');
  const empty = search(db, { q: '违约金', pageSize: 10, page: 9999 });
  assert.deepEqual(empty.items, []);
});

test('无查询词时按排序浏览全库', () => {
  const res = search(db, { q: '', sort: 'hierarchy', pageSize: 5 });
  assert.ok(res.total > 1000, '空查询应能浏览整个语料');
  assert.equal(res.items.length, 5);
});

test('高亮把命中词包进 mark', () => {
  const html = highlight('约定的违约金过分高于造成的损失', [{ term: '违约金' }]);
  assert.ok(html.includes('<mark'), '应产生高亮标记');
  assert.ok(html.includes('违约金'));
});

test('条文正文里能检到具体条号文本', () => {
  const res = search(db, { q: '第五百八十五条', pageSize: 10 });
  assert.ok(res.items.some((i) => i.displayNumber === '第五百八十五条'), '按条号应能检索到条文');
});

test('suggest：文档名与条文双通道', () => {
  const s = suggest(db, '民法典', 5);
  assert.ok(s.docs.length >= 1);
  assert.equal(s.docs[0].id, 'civil-code');
  assert.ok(Array.isArray(s.articles));
  const s2 = suggest(db, '', 5);
  assert.deepEqual(s2.docs, []);
});

test('直接定位：法名 + “之X”条号落到插入条而不是基础条', () => {
  const dh = directHit(db, '刑法第17条之一');
  assert.equal(dh.docId, 'criminal-law');
  assert.equal(dh.number, 17);
  assert.equal(dh.seq, 1);
  assert.equal(dh.slug, '17-1');
  assert.equal(db.getArticle(dh.docId, dh.slug).displayNumber, '第十七条之一');
  const cn = directHit(db, '刑法第一百二十条之一');
  assert.equal(cn.slug, '120-1');
  assert.equal(directHit(db, '民法典第585条').slug, '585');
});

test('司法解释反查：本解释针对哪些法律（反向索引）', () => {
  const laws = db.lawsOfInterpretation('sfjs-mfd-hetong');
  assert.ok(laws.length >= 1, '民法典合同编通则解释应关联到被解释法律');
  assert.equal(laws[0].docId, 'civil-code');
  assert.ok(laws[0].articleCount >= 20, `被引条文数偏少：${laws[0].articleCount}`);
  const doc = db.getDoc('sfjs-mfd-hetong');
  assert.ok(laws[0].articleCount < doc.articleCount, '被引条文数不应超过解释自身条数');
  const cov = db.coverageOf('sfjs-mfd-hetong');
  assert.equal(cov.cited.docs, laws.length);
  assert.ok(cov.cited.links >= cov.cited.articles, '关联处数不少于去重后的条文数');
  const lawCov = db.coverageOf('civil-code');
  assert.ok(lawCov.interpCount >= 20, '民法典应列出大量关联司法解释');
  assert.equal(lawCov.cited.links, 0, '法律不应当有“引用法条”的反向统计');
});

test('检索耗时以毫秒上报（scanned 恒等于候选池大小，所以界面上改为显示 ms）', () => {
  const full = search(db, { q: '违约金' });
  assert.equal(typeof full.ms, 'number');
  assert.ok(Number.isFinite(full.ms) && full.ms >= 0, `ms 应为非负数，实际 ${full.ms}`);
  assert.equal(full.scanned, db.corpus.length - db.gazettes.length, '默认候选池不含裁判文书');
  assert.equal(search(db, { q: '违约金', gazetteOnly: true }).scanned, db.gazettes.length, '勾选后候选池只有裁判文书');
  const scoped = search(db, { q: '违约金', docId: 'civil-code' });
  assert.equal(scoped.scanned, db.getDoc('civil-code').articles.length);
  assert.ok(scoped.ms <= full.ms || scoped.ms < 5, '限定到单部法律后扫描量更小');
});

function pick(r) {
  return r ? { docId: r.docId, number: r.number } : null;
}

test('拉丁文检索大小写不敏感（DNA / Web / GB/T / HTTP）', () => {
  for (const [upper, lower] of [['DNA', 'dna'], ['Web', 'web'], ['GB/T', 'gb/t'], ['HTTP', 'http']]) {
    const a = search(db, { q: upper });
    const b = search(db, { q: lower });
    assert.equal(a.total, b.total, `${upper} 与 ${lower} 的结果数应一致`);
    assert.ok(a.total > 0, `${upper} 应能检到结果`);
    assert.deepEqual(
      a.items.map((x) => x.id),
      b.items.map((x) => x.id),
      `${upper} 与 ${lower} 的结果应完全相同`,
    );
  }
  const r = search(db, { q: 'web' });
  assert.ok(r.items.some((x) => x.kind === 'case'), 'Web 应命中指导性案例');
});

test('裁判文书检索：默认不含，勾选“只搜索裁判文书”后仅含裁判文书', () => {
  const normal = search(db, { q: '专利', pageSize: 10 });
  assert.ok(normal.total > 0);
  assert.ok(normal.items.every((r) => r.kind !== 'gazette'), '默认检索不应混入裁判文书');

  const only = search(db, { q: '专利', gazetteOnly: true, pageSize: 10 });
  assert.ok(only.total > 0, '裁判文书模式应能命中');
  assert.ok(only.items.every((r) => r.kind === 'gazette'), '勾选后只应有裁判文书');
  assert.ok(only.items.every((r) => r.caseNumber && r.court), '裁判文书结果应带案号与法院');
  assert.equal(only.facets.category['裁判文书'], only.total);

  assert.equal(search(db, { q: '', gazetteOnly: true, pageSize: 1 }).total, db.gazettes.length, '空关键词时应列出全部裁判文书');
  assert.equal(search(db, { q: '', pageSize: 1 }).total, db.corpus.length - db.gazettes.length, '默认模式的总数不含裁判文书');
  assert.equal(
    search(db, { q: '专利', gazetteOnly: true, onlyAnnotated: true, pageSize: 1 }).total,
    only.total,
    '裁判文书没有注解，“只看有注解”在裁判文书模式下不生效',
  );
});

test('裁判文书模式忽略“编 / 类型 / 注解”筛选（它们对裁判文书不适用）', () => {
  const base = search(db, { q: '专利', gazetteOnly: true, pageSize: 1 }).total;
  assert.ok(base > 0);
  assert.equal(search(db, { q: '专利', gazetteOnly: true, scope: 'civil', pageSize: 1 }).total, base);
  assert.equal(search(db, { q: '专利', gazetteOnly: true, type: '法律', pageSize: 1 }).total, base);
  assert.equal(search(db, { q: '专利', gazetteOnly: true, onlyAnnotated: true, pageSize: 1 }).total, base);
});

test('文件标题全名命中：书名号两种写法等价，且该文件的条文排在前面', () => {
  const q = '最高人民法院关于适用〈中华人民共和国民事诉讼法〉的解释';
  assert.equal(nameMatches(db, q)[0].id, 'sfjs-minsusong', '查询侧应同样去掉《》〈〉再比对');

  const res = search(db, { q, pageSize: 10 });
  assert.deepEqual(res.docHits.map((h) => h.id), ['sfjs-minsusong']);
  assert.equal(res.docHits[0].level, 0, '全名应算精确命中');
  assert.ok(res.items.every((i) => i.docId === 'sfjs-minsusong'), '标题全名命中时该文件的条文应占据前排');

  assert.equal(search(db, { q: '违约金' }).docHits.length, 0, '普通关键词不应给出文件命中');
  assert.deepEqual(search(db, { q: '违约金', gazetteOnly: true }).docHits, [], '裁判文书模式没有文件命中');
});

test('条旨在检索范围内：只写在条旨里的词能定位到该条', () => {
  const res = search(db, { q: '罪刑法定原则', pageSize: 5 });
  assert.equal(res.items[0].id, 'criminal-law-0003');
  assert.equal(res.items[0].snippet.field, 'rubric', '快照应取条旨字段');
  assert.equal(search(db, { q: '立法目的与根据' }).items[0].id, 'criminal-law-0001');
});

test('摘要优先取正文：命中词同时在标题行与正文里时，不把目录行当摘要', () => {
  const res = search(db, { q: '管辖', pageSize: 8 });
  assert.ok(res.items.length >= 5);
  assert.ok(res.items.every((i) => i.snippet.field !== 'title'), '“管辖”也出现在章节标题里，但正文有命中时摘要应取正文');
});

function allHits(q, opts = {}) {
  const first = search(db, { q, pageSize: 100, ...opts });
  const ids = first.items.map((x) => x.id);
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
    ids.push(...search(db, { q, page, pageSize: 100, ...opts }).items.map((x) => x.id));
  }
  return { ids, total: first.total };
}

test('布尔检索：OR 取并集，NOT 排除，空格 AND 优先', () => {
  const a = allHits('违约金');
  const b = allHits('定金');
  const or = allHits('违约金 OR 定金');
  assert.ok(a.total > 0 && b.total > 0);
  assert.equal(tokenize('违约金 OR 定金').boolean, true);
  assert.equal(tokenize('违约金 OR 定金').clauses.length, 2);
  assert.deepEqual(new Set(or.ids), new Set([...a.ids, ...b.ids]), 'OR 应是两侧结果的并集');
  assert.equal(or.total, new Set([...a.ids, ...b.ids]).size);

  const not = allHits('违约金 NOT 定金');
  assert.deepEqual(new Set(not.ids), new Set(a.ids.filter((id) => !b.ids.includes(id))), 'NOT 应排除命中右侧词的结果');
  assert.deepEqual(search(db, { q: '违约金 NOT 定金' }).terms, ['违约', '约金'], '排除词不进入高亮词表');

  const and = allHits('违约金 定金');
  const both = allHits('违约金 定金 OR 专利');
  assert.equal(tokenize('违约金 定金 OR 专利').clauses.length, 2);
  assert.deepEqual(new Set(both.ids), new Set([...and.ids, ...allHits('专利').ids]), '空格（AND）应比 OR 先结合');

  const onlyNot = search(db, { q: 'NOT 定金', pageSize: 1 });
  assert.equal(onlyNot.total, search(db, { q: '', pageSize: 1 }).total - b.total, '单独的 NOT 相当于浏览不含该词的全部条文');

  assert.ok(search(db, { q: '违约金 OR 定金', docId: 'civil-code' }).items.every((i) => i.docId === 'civil-code'));
  assert.deepEqual(search(db, { q: '违约金 OR 定金' }).docHits, [], '布尔查询不做文件标题精确命中');
});

test('布尔运算符必须大写且独立成词；中文“或”仍按普通停用字忽略', () => {
  assert.equal(tokenize('违约金 or 定金').boolean, false, '小写 or 不是运算符');
  assert.ok(tokenize('违约金 or 定金').terms.some((t) => t.term === 'or'));
  assert.equal(tokenize('"OR"').boolean, false, '引号内的 OR 是普通短语');
  assert.ok(tokenize('"OR"').terms.some((t) => t.term === 'or'));
  assert.equal(tokenize('违约金OR定金').boolean, false, '运算符两侧必须留空格');
  assert.equal(search(db, { q: '违约金 或 定金' }).total, search(db, { q: '违约金 定金' }).total, '中文“或”不是运算符');
});

test('多词检索是 AND：空格分隔的每个词都必须命中', () => {
  const res = search(db, { q: '学术 教育 处罚', pageSize: 50 });
  assert.ok(res.total > 0, '应至少有一条同时命中三个词的记录');
  for (const item of res.items) {
    const rec = db.corpus.find((r) => r.id === item.id);
    const hay = [rec.textLower, rec.titleTextLower, rec.rubricTextLower, rec.annotTextLower].join('\n');
    for (const word of ['学术', '教育', '处罚']) assert.ok(hay.includes(word), `${item.id} 缺少“${word}”`);
  }
});
