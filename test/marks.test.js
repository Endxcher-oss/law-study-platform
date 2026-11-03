import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(path.join(ROOT, 'public', 'marks.js'), 'utf8');

function makeApi() {
  const data = new Map();
  const window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    },
  };
  const sandbox = { window, localStorage: window.localStorage, console, Date, JSON, Math };
  vm.runInNewContext(SOURCE, sandbox);
  return { api: window.LawMarks, data };
}

const mark = (n, body, extra = {}) => ({
  id: `m${n}`, articleId: `civil-code-${n}`, docId: 'civil-code', law: '民法典',
  number: `第五百${n}条`, slug: String(n), category: '法律',
  quote: '违约金', prefix: '', suffix: '', start: 0, end: 3, body,
  updatedAt: n, ...extra,
});

test('Markdown 渲染：只放行白名单标签，链接限 http(s)', () => {
  const { api } = makeApi();
  assert.equal(api.mdToHtml('**加粗**'), '<p><strong>加粗</strong></p>');
  assert.equal(api.mdToHtml('# 标题'), '<h2>标题</h2>');
  assert.equal(api.mdToHtml('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(api.mdToHtml('`code` 与 [法条](https://example.com)'), '<p><code>code</code> 与 <a href="https://example.com" target="_blank" rel="noopener">法条</a></p>');
  assert.ok(api.mdToHtml('<script>alert(1)</script>').includes('&lt;script&gt;'), '应转义 HTML');
  assert.ok(!api.mdToHtml('[x](javascript:alert(1))').includes('<a '), '不生成 javascript 链接');
  assert.equal(api.mdToHtml('```\n<b>x</b>\n```'), '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
});

test('标注定位：优先用偏移，位置变了按前后文找回，找不到返回 null', () => {
  const { api } = makeApi();
  const m = { quote: '违约金', prefix: '约定', start: 2, end: 5 };
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(api.resolveAnchor('AA违约金BB', m)), { start: 2, end: 5 });
  assert.deepEqual(plain(api.resolveAnchor('约定违约金过高', { quote: '违约金', prefix: '约定', start: 9, end: 12 })), { start: 2, end: 5 });
  assert.deepEqual(plain(api.resolveAnchor('违约金', { quote: '违约金', start: 0, end: 3 })), { start: 0, end: 3 });
  assert.equal(api.resolveAnchor('没有这两个字', { quote: '违约金' }), null);
});

test('高亮区间：重叠合并为一整段并保留多个标注 id', () => {
  const { api } = makeApi();
  const merged = api.mergeSpans([
    { start: 5, end: 9, ids: ['a'] },
    { start: 2, end: 6, ids: ['b'] },
    { start: 11, end: 13, ids: ['c'] },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), [
    { start: 2, end: 9, ids: ['b', 'a'] },
    { start: 11, end: 13, ids: ['c'] },
  ]);
});

test('标注存储：增删、按条文汇总、按标注数与最近修改排序', () => {
  const { api } = makeApi();
  const store = api.load();
  api.put(store, mark(1, '甲'));
  api.put(store, mark(1, '乙', { id: 'm1b' }));
  api.put(store, mark(2, '丙'));
  const rows = api.groupMarks(store);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.articleId === 'civil-code-1').count, 2);
  const byCount = api.sortMarks(rows, 'count');
  assert.equal(byCount[0].articleId, 'civil-code-1');
  const byRecent = api.sortMarks(rows, 'recent');
  assert.equal(byRecent[0].articleId, 'civil-code-2');
  assert.equal(api.remove(store, 'm1'), true);
  assert.equal(api.remove(store, 'm1'), false);
  assert.equal(Object.keys(api.load().marks).length, 2);
});

test('标注汇总：残缺记录被清理，同一条文的标题从其他标注补齐', () => {
  const { api, data } = makeApi();
  const store = api.load();
  api.put(store, mark(1, '甲', { law: '', number: '', category: '' }));
  api.put(store, mark(1, '乙', { id: 'm1b' }));
  api.put(store, { id: 'bad', docId: '', law: '', number: '', slug: '', quote: 'x', body: '' });
  assert.equal(api.pruneMarks(api.load()), 1);
  assert.equal(Object.keys(api.load().marks).length, 2);
  assert.equal(data.has(api.KEY), true);
  const rows = api.groupMarks(api.load());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].law, '民法典');
  assert.equal(rows[0].count, 2);
});

test('工具栏状态：光标所在格式决定按钮高亮，代码块里的 code 不算行内代码', () => {
  const { api } = makeApi();
  const none = (cmd) => false;
  const fakeNode = (tags) => ({ closest: (sel) => (tags.includes(sel) ? {} : null) });
  assert.deepEqual(JSON.parse(JSON.stringify(api.toolFlags(fakeNode(['strong']), (cmd) => cmd === 'bold'))), {
    bold: true, italic: false, ul: false, ol: false, h2: false, quote: false, pre: false, code: false, link: false,
  });
  const pre = api.toolFlags(fakeNode(['pre', 'code']), none);
  assert.equal(pre.pre, true);
  assert.equal(pre.code, false);
  const quote = api.toolFlags(fakeNode(['blockquote']), none);
  assert.equal(quote.quote, true);
  const heading = api.toolFlags(fakeNode(['h2']), none);
  assert.equal(heading.h2, true);
  const code = api.toolFlags(fakeNode(['code']), none);
  assert.equal(code.code, true);
});
