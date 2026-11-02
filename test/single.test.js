/**
 * 单文件离线站点测试：hash 路由到页面函数的映射，以及导出产物的自包含性。
 * 产物用法与边界见 docs/single-file.md。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

import { getDb } from '../server/db.js';
import { parseHash, queryOf, renderPage } from '../public/single-app.js';

const ROOT = path.resolve(import.meta.dirname, '..');

test('hash 路由覆盖首页、条文、检索与 404', () => {
  const db = getDb();

  assert.equal(parseHash('#/d/civil-code/585').pathname, '/d/civil-code/585');
  assert.equal(parseHash('#/search?q=x').search, '?q=x');
  assert.deepEqual(queryOf('?scope=civil&scope=social&q=x'), { scope: ['civil', 'social'], q: 'x' });

  assert.match(renderPage(db, '#/').html, /法律学习平台/);
  assert.match(renderPage(db, '#/d/civil-code/585').html, /第五百八十五条/);
  assert.match(renderPage(db, '#/search?q=' + encodeURIComponent('违约金')).html, /违约金/);
  assert.equal(renderPage(db, '#/missing').status, 404);
});

test('单文件导出内联全部资源并带上可解压的数据', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'law-single-'));
  const out = path.join(dir, 'index.html');
  execFileSync(process.execPath, ['scripts/export-single.js'], {
    cwd: ROOT,
    env: { ...process.env, SINGLE_OUT: out, SINGLE_DOCS: 'civil-code', SINGLE_SKIP_CASES: '1' },
    stdio: 'pipe',
  });

  const html = fs.readFileSync(out, 'utf8');
  const head = html.slice(0, html.indexOf('<body'));
  assert.match(html, /<style>/);
  assert.match(html, /id="db-data" type="application\/gzip-base64"/);
  assert.doesNotMatch(head, /<link[^>]+stylesheet/);
  assert.doesNotMatch(head, /<script src=/);
  assert.match(html, /__req\("public\/single-app"\)\.boot\(\)/);

  const encoded = html.match(/id="db-data"[^>]*>([\s\S]*?)<\/script>/)[1].trim();
  const sources = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
  assert.deepEqual(sources.docs.map((doc) => doc.id), ['civil-code']);
  assert.equal(sources['cases/guiding.json'], null);
  assert.ok(sources['catalog.json'].length > 0);
});
