/**
 * 单文件离线站点测试：hash 路由到页面函数的映射、导出产物的自包含性，以及打包后站点的实际跳转行为。
 * 产物用法与边界见 docs/portable-file.md。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

import { getDb } from '../server/db.js';
import { parseHash, queryOf, renderPage } from '../public/portable-app.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function exportSample() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-portable-'));
  const out = path.join(dir, 'index.html');
  execFileSync(process.execPath, ['scripts/export-portable.js'], {
    cwd: ROOT,
    env: { ...process.env, PORTABLE_OUT: out, PORTABLE_DOCS: 'civil-code', PORTABLE_SKIP_CASES: '1' },
    stdio: 'pipe',
  });
  return fs.readFileSync(out, 'utf8');
}

test('hash 路由覆盖首页、条文、检索与 404', () => {
  const db = getDb();

  assert.equal(parseHash('#/d/civil-code/585').pathname, '/d/civil-code/585');
  assert.equal(parseHash('#/d/civil-code/585#toc').fragment, 'toc');
  assert.equal(parseHash('#/search?q=x').search, '?q=x');
  assert.deepEqual(queryOf('?scope=civil&scope=social&q=x'), { scope: ['civil', 'social'], q: 'x' });

  assert.match(renderPage(db, '#/').html, /法律学习平台/);
  assert.match(renderPage(db, '#/d/civil-code/585').html, /第五百八十五条/);
  assert.match(renderPage(db, '#/search?q=' + encodeURIComponent('违约金')).html, /违约金/);
  assert.equal(renderPage(db, '#/missing').status, 404);
});

test('单文件导出内联全部资源并带上可解压的数据', () => {
  const html = exportSample();
  const head = html.slice(0, html.indexOf('<body'));
  assert.match(html, /<style>/);
  assert.match(html, /id="db-data" type="application\/gzip-base64"/);
  assert.doesNotMatch(head, /<link[^>]+stylesheet/);
  assert.doesNotMatch(head, /<script src=/);
  assert.match(html, /__req\("public\/portable-app"\)\.boot\(\)/);
  assert.match(html, /class="portable-boot" role="status" aria-live="polite"/, '装载页应带品牌化的状态提示');
  assert.match(html, /正在准备离线站点/, '装载文案应说明正在准备离线站点');
  assert.match(html, /class="boot-type">法律学习平台</, '标题应逐字出现');
  assert.match(html, /@keyframes boot-type \{ from \{ clip-path: inset\(0 100% 0 0\);/, '标题应做打字机式揭示');
  assert.match(html, /class="boot-caret"/, '标题后应有闪烁光标');
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/, '装载动画应尊重减少动态偏好');
  assert.match(html, /dsh:rendered/, '渲染完成后应通知前端挂接动画');
  assert.match(html, /animationName === 'boot-type'/, '打包逻辑应等待标题打字动画播完再替换页面');
  assert.match(html, /prefers-reduced-motion: reduce/, '减少动态时不应强行等待');
  assert.match(html, /hero-stats \.stat-value/, '内联脚本应包含首页计数动画');

  const encoded = html.match(/id="db-data"[^>]*>([\s\S]*?)<\/script>/)[1].trim();
  const sources = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  assert.deepEqual(sources.docs.map((doc) => doc.id), ['civil-code']);
  assert.equal(sources['cases/guiding.json'], null);
  assert.ok(sources['catalog.json'].length > 0);
});

test('打包后的站点在 hash 改变时重新渲染', async () => {
  const html = exportSample();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const bundle = scripts[scripts.length - 1];
  const encoded = html.match(/id="db-data"[^>]*>([\s\S]*?)<\/script>/)[1].trim();

  let body = '';
  const docListeners = {};
  const winListeners = {};
  const location = { hash: '#/' };
  const document = {
    title: '',
    location,
    getElementById(id) {
      return id === 'db-data' ? { textContent: encoded } : null;
    },
    addEventListener(type, fn) {
      (docListeners[type] ||= []).push(fn);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    body: {
      get innerHTML() {
        return body;
      },
      set innerHTML(value) {
        body = value;
      },
    },
  };
  const window = {
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(type, fn) {
      (winListeners[type] ||= []).push(fn);
    },
    dispatchEvent() {},
  };
  class DOMParserFake {
    parseFromString(source) {
      const title = /<title>([\s\S]*?)<\/title>/.exec(source);
      const match = /<body[^>]*>([\s\S]*)<\/body>/.exec(source);
      return { title: title ? title[1] : '', body: { innerHTML: match ? match[1] : '' } };
    }
  }

  const run = new Function(
    'document', 'DOMParser', 'atob', 'Blob', 'DecompressionStream', 'Response', 'window', 'location',
    bundle,
  );
  run(document, DOMParserFake, atob, Blob, DecompressionStream, Response, window, location);
  await new Promise((resolve) => setTimeout(resolve, 800));

  assert.match(body, /法律学习平台/, '首屏没有渲染');
  assert.equal((docListeners.hashchange || []).length, 0, 'hashchange 应监听在 window 上');
  assert.ok((winListeners.hashchange || []).length > 0, '没有监听 window 的 hashchange');

  location.hash = '#/d/civil-code/585';
  for (const listener of winListeners.hashchange) listener();
  assert.match(body, /第五百八十五条/);

  location.hash = '#/search?q=' + encodeURIComponent('违约金');
  for (const listener of winListeners.hashchange) listener();
  assert.match(body, /违约金/);
});
