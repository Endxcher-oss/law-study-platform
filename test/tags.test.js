import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(path.join(ROOT, 'public', 'tags.js'), 'utf8');

function makeApi() {
  const data = new Map();
  const window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    },
  };
  const sandbox = { window, localStorage: window.localStorage, console };
  vm.runInNewContext(SOURCE, sandbox);
  return { api: window.LawTags, data };
}

const meta = (n) => ({
  id: `civil-code-${n}`,
  docId: 'civil-code',
  law: '民法典',
  number: `第五百${n}条`,
  slug: String(n),
  date: '2020-05-28',
});

test('标签名：去首尾空格、按字符截到 15 个、空名返回空串', () => {
  const { api } = makeApi();
  assert.equal(api.normalize('  违约金  '), '违约金');
  assert.equal(api.normalize('   '), '');
  assert.equal(api.normalize(null), '');
  assert.equal(api.normalize('一二三四五六七八九十一二三四五六七'), '一二三四五六七八九十一二三四五');
  assert.equal(Array.from(api.normalize('一二三四五六七八九十一二三四五六七')).length, 15);
});

test('添加、去除、改名：同一标签在一篇条文内去重，删空后条目消失', () => {
  const { api } = makeApi();
  const store = api.load();
  assert.equal(api.addTag(store, meta(585), ' 违约金 '), true);
  assert.equal(api.addTag(store, meta(585), '违约金'), false);
  assert.equal(api.addTag(store, meta(585), ''), false);
  assert.equal(api.addTag(store, meta(585), '合同'), true);
  assert.equal(store.articles['civil-code-585'].tags.length, 2);

  const again = api.load();
  assert.equal(again.articles['civil-code-585'].tags.length, 2, '应持久化到 localStorage');

  assert.equal(api.renameTag(again, 'civil-code-585', '合同', '合同纠纷'), true);
  assert.equal(JSON.stringify(again.articles['civil-code-585'].tags.map((t) => t.name).sort()), JSON.stringify(['合同纠纷', '违约金'].sort()));

  assert.equal(api.removeTag(again, 'civil-code-585', '违约金'), true);
  assert.equal(api.removeTag(again, 'civil-code-585', '合同纠纷'), true);
  assert.equal(again.articles['civil-code-585'], undefined, '没有标签后不再保留空条目');
});

test('条目快照保存类别，最近修改时间按本地时间格式化', () => {
  const { api } = makeApi();
  const store = api.load();
  api.addTag(store, { ...meta(1), category: '法律' }, 'x');
  assert.equal(store.articles['civil-code-1'].category, '法律');
  assert.match(api.formatTime(store.articles['civil-code-1'].updatedAt), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(api.formatTime(0), '');
});

test('多选标签取交集，未选中时返回全部', () => {
  const { api } = makeApi();
  const store = api.load();
  api.addTag(store, meta(1), '违约金');
  api.addTag(store, meta(1), '合同');
  api.addTag(store, meta(2), '违约金');
  api.addTag(store, meta(3), '定金');

  assert.equal(api.filterEntries(store, []).length, 3);
  assert.equal(JSON.stringify(api.filterEntries(store, ['违约金']).map((e) => e.number)), JSON.stringify(['第五百1条', '第五百2条']));
  assert.equal(JSON.stringify(api.filterEntries(store, ['违约金', '合同']).map((e) => e.number)), JSON.stringify(['第五百1条']));
  assert.equal(api.filterEntries(store, ['违约金', '定金']).length, 0);
});

test('排序：默认按标签数，最近添加按更新时间，标题按法名+条号', () => {
  const { api } = makeApi();
  const store = api.load();
  api.addTag(store, meta(1), 'a');
  store.articles['civil-code-1'].updatedAt = 100;
  api.addTag(store, meta(2), 'a');
  api.addTag(store, meta(2), 'b');
  store.articles['civil-code-2'].updatedAt = 200;
  api.addTag(store, meta(3), 'a');
  api.addTag(store, meta(3), 'b');
  api.addTag(store, meta(3), 'c');
  store.articles['civil-code-3'].updatedAt = 50;

  assert.equal(JSON.stringify(api.sortEntries(api.entries(store), 'count').map((e) => e.number)), JSON.stringify(['第五百3条', '第五百2条', '第五百1条']));
  assert.equal(JSON.stringify(api.sortEntries(api.entries(store), 'recent').map((e) => e.number)), JSON.stringify(['第五百2条', '第五百1条', '第五百3条']));
  assert.equal(JSON.stringify(api.sortEntries(api.entries(store), 'title').map((e) => e.number)), JSON.stringify(['第五百1条', '第五百2条', '第五百3条']));
});
