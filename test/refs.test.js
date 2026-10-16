/**
 * 条文引用抽取（scripts/lib/refs.js）的单元测试。
 * 用固定的假法名表，不依赖 db/，保证毫秒级运行。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNameIndex, extractArticleRefs, lawIdFromTitle, SUPERSEDED, SHORT_ALIASES } from '../scripts/lib/refs.js';

const DOCS = [
  { id: 'civil-code', title: '中华人民共和国民法典', category: '法律' },
  { id: 'criminal-law', title: '中华人民共和国刑法', category: '法律' },
  { id: 'civil-procedure-law', title: '中华人民共和国民事诉讼法', category: '法律' },
  { id: 'interp', title: '最高人民法院关于适用《中华人民共和国民法典》合同编通则若干问题的解释', category: '司法解释' },
  { id: 'interp2', title: '最高人民法院关于适用《中华人民共和国民法典》婚姻家庭编的解释（一）', category: '司法解释' },
];
const nameIndex = buildNameIndex(DOCS);

const pick = (refs, n) => refs.find((r) => r.articleNumber === n);

test('法名紧邻条号 => explicit，并归属正确文档', () => {
  const refs = extractArticleRefs('依照《中华人民共和国民法典》第五百八十五条的规定处理。', { docId: 'interp', nameIndex });
  assert.equal(refs.length, 1);
  assert.equal(refs[0].targetDocId, 'civil-code');
  assert.equal(refs[0].articleNumber, 585);
  assert.equal(refs[0].confidence, 'explicit');
  assert.equal(refs[0].self, false);
});

test('简称（民法典）也能识别', () => {
  const refs = extractArticleRefs('适用民法典第五百八十四条的规定。', { docId: 'interp', nameIndex });
  assert.equal(pick(refs, 584)?.targetDocId, 'civil-code');
});

test('本法/本解释 是自引用，且 self=true', () => {
  const a = extractArticleRefs('本法自公布之日起施行。本法第九十九条规定的情形除外。', { docId: 'civil-code', nameIndex });
  assert.equal(pick(a, 99)?.self, true);
  assert.equal(pick(a, 99)?.targetDocId, 'civil-code');
  const b = extractArticleRefs('本解释第三条规定的期间，不适用中断的规定。', { docId: 'interp', nameIndex });
  assert.equal(pick(b, 3)?.self, true);
  assert.equal(pick(b, 3)?.targetDocId, 'interp');
  const c = extractArticleRefs('本解释第三条规定的期间。', { docId: 'interp', nameIndex, includeSelf: false });
  assert.equal(c.length, 0);
});

test('并列列表继承前一条的法律归属（list）', () => {
  const head = extractArticleRefs('适用《中华人民共和国民法典》第一百四十一条、第一百四十二条的规定。', { docId: 'interp', nameIndex });
  assert.deepEqual(head.map((r) => r.articleNumber), [141, 142]);
  assert.equal(head[0].confidence, 'explicit');
  assert.equal(head[1].confidence, 'list');
  const refs = extractArticleRefs('适用民法典第一百四十一条、第一百四十二条、第一百四十八条的规定。', { docId: 'interp', nameIndex });
  assert.deepEqual(refs.map((r) => r.articleNumber), [141, 142, 148]);
  assert.ok(refs.every((r) => r.targetDocId === 'civil-code'), '后续条号应继承前一条的法名');
});

test('“之X”条号与款、项被保留为附加信息', () => {
  const refs = extractArticleRefs('民法典第一千零七十九条之一第二款第（二）项规定的情形。', { docId: 'interp', nameIndex });
  const r = pick(refs, 1079);
  assert.equal(r.suffix, '之一');
  assert.equal(r.kuan, 2);
});

test('同一句内较远的法名降级为 contextual', () => {
  const refs = extractArticleRefs('人民法院审理案件，应当依照法律的规定，结合案件的具体情况，妥善处理民法典第一百四十六条规定的情形。', {
    docId: 'interp',
    nameIndex,
  });
  assert.equal(pick(refs, 146)?.confidence, 'contextual');
});

test('已废止法律不映射到继受法的条号（避免张冠李戴）', () => {
  const refs = extractArticleRefs('依照《中华人民共和国合同法》第一百零七条处理。', { docId: 'interp', nameIndex });
  const r = refs.find((x) => x.articleNumber === 107);
  assert.ok(r, '应识别出条号');
  assert.equal(r.targetDocId, null, '不得挂到民法典第107条');
  assert.equal(r.confidence, 'document');  assert.match(r.note || '', /废止|承接/);
  assert.ok(Object.keys(SUPERSEDED).length > 0);
});

test('未指明法律名的条号 => document 且无目标', () => {
  const refs = extractArticleRefs('依照第五十七条的规定处理。', { docId: 'civil-procedure-law', nameIndex });
  const r = pick(refs, 57);
  assert.equal(r.targetDocId, null);
  assert.equal(r.confidence, 'document');
});

test('跨行不回溯法名（换行是硬边界）', () => {
  const refs = extractArticleRefs('适用民法典的规定。\n第五百八十五条另有规定的除外。', { docId: 'interp', nameIndex });
  assert.equal(pick(refs, 585)?.targetDocId, null);
});

test('lawIdFromTitle 从书名号内层取出被解释的法律', () => {
  assert.equal(lawIdFromTitle('最高人民法院关于适用《中华人民共和国民法典》合同编通则若干问题的解释', nameIndex), 'civil-code');
  assert.equal(lawIdFromTitle('不存在的解释', nameIndex), null);
});

test('别名表里的 id 都是非空字符串', () => {
  for (const [alias, id] of Object.entries(SHORT_ALIASES)) {
    assert.equal(typeof alias, 'string');
    assert.ok(alias.length >= 2, `${alias} 太短`);
    assert.ok(typeof id === 'string' && id.length > 0, `${alias} 的 id 非法`);
  }
});
