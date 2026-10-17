/**
 * 静态导出测试：条文 id → URL 的往返、链接前缀改写、样本导出的目录结构与浏览器资源可达性。
 * 规则与边界见 docs/deploy.md。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { getDb } from '../server/db.js';
import { articleIdUrl } from '../server/html.js';
import { rebaseHtml, rebaseUrl } from '../public/static-url.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function importsOf(file) {
  return [...fs.readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

test('条文 id 能还原成真实存在的条文页地址', () => {
  const db = getDb();
  const bad = [];
  let resolved = 0;
  let fallback = 0;
  for (const [id, article] of db.articles) {
    const url = articleIdUrl(id);
    if (url.startsWith('/d/')) {
      const expected = `/d/${encodeURIComponent(article.docId)}/${article.slug}`;
      if (url !== expected) bad.push(`${id} → ${url}（应为 ${expected}）`);
      resolved += 1;
      continue;
    }
    if (!/^\/search\?q=/.test(url)) bad.push(`${id} → ${url}`);
    fallback += 1;
  }
  assert.deepEqual(bad, [], `条文地址还原失败：\n${bad.slice(0, 10).join('\n')}`);
  assert.ok(resolved > 30000, `能还原的条文太少：${resolved}`);
  assert.ok(fallback < 100, `退化成检索链接的条文过多：${fallback}`);
});

test('链接改写只加前缀，外链 / 锚点 / 协议相对地址不动', () => {
  const html = '<body><a href="/d/x/1">a</a><a href="https://e.com/">b</a><a href="#top">c</a><a href="//cdn.example.com/x.js">d</a><link rel="stylesheet" href="/assets/style.css"></body>';
  const out = rebaseHtml(html, '/law-study-platform');
  assert.ok(out.includes('href="/law-study-platform/d/x/1"'), out);
  assert.ok(out.includes('href="/law-study-platform/assets/style.css"'), out);
  assert.ok(out.includes('href="https://e.com/"'), out);
  assert.ok(out.includes('href="#top"'), out);
  assert.ok(out.includes('href="//cdn.example.com/x.js"'), out);
  assert.ok(out.startsWith('<body data-base="/law-study-platform">'), out);
  assert.equal(rebaseHtml(html, ''), html);
  assert.equal(rebaseHtml('<body data-base="/law-study-platform">x</body>', '/law-study-platform'), '<body data-base="/law-study-platform">x</body>');
  assert.equal(rebaseUrl('/x', '/law-study-platform'), '/law-study-platform/x');
  assert.equal(rebaseUrl('https://e.com/x', '/law-study-platform'), 'https://e.com/x');
});

test('超过 100 条的文件的跨窗口目录项，落到包含该锚点的窗口页', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'law-study-platform-export-doc-'));
  execFileSync(process.execPath, ['scripts/export-static.js'], {
    cwd: ROOT,
    env: { ...process.env, OUT_DIR: out, EXPORT_DOCS: 'civil-code,criminal-law', BASE_PATH: '/law-study-platform' },
    stdio: 'pipe',
  });

  const tree = fs.readFileSync(path.join(out, 'd/criminal-law/index.html'), 'utf8');
  const links = [...tree.matchAll(/href="\/law-study-platform\/d\/criminal-law\/from\/(\d+)#(a[\w-]+)"/g)].map((m) => ({ from: Number(m[1]), anchor: m[2] }));
  assert.ok(links.length > 5, `跨窗口目录项太少：${links.length}`);
  assert.ok(links.every((l) => l.from > 1 && l.from % 100 === 1), '窗口页的 from 必须是 100 的整数倍加一');

  for (const link of links.slice(0, 12)) {
    const file = path.join(out, `d/criminal-law/from/${link.from}/index.html`);
    assert.ok(fs.existsSync(file), `窗口页不存在：from=${link.from}`);
    assert.ok(fs.readFileSync(file, 'utf8').includes(`id="${link.anchor}"`), `from=${link.from} 里没有锚点 ${link.anchor}`);
  }
});

test('样本导出：目录结构、部署前缀、查询参数改写与浏览器模块可达', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'law-study-platform-export-'));
  execFileSync(process.execPath, ['scripts/export-static.js'], {
    cwd: ROOT,
    env: { ...process.env, OUT_DIR: out, EXPORT_SAMPLE: '1', BASE_PATH: '/law-study-platform' },
    stdio: 'pipe',
  });

  const expected = [
    'index.html',
    '404.html',
    '.nojekyll',
    'search/index.html',
    'notes/index.html',
    'notes/d/civil/index.html',
    'notes/l/key/index.html',
    'cases/index.html',
    'cases/page/2/index.html',
    'divisions/index.html',
    'about/index.html',
    'assets/style.css',
    'assets/app.js',
    'assets/catalog.json',
    'assets/taxonomy.json',
    'assets/public/static.js',
  ];
  const missing = expected.filter((rel) => !fs.existsSync(path.join(out, rel)));
  assert.deepEqual(missing, [], `导出物缺少文件：${missing.join(', ')}`);

  const home = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(home.includes('<body data-base="/law-study-platform">'), '首页缺 data-base');
  assert.ok(home.includes('href="/law-study-platform/assets/style.css"'), '首页样式表未加前缀');
  assert.ok(!/href="\/(?!\/|law-study-platform\/)/.test(home), '首页仍有未加前缀的站内链接');

  const search = fs.readFileSync(path.join(out, 'search/index.html'), 'utf8');
  assert.ok(search.includes('src="/law-study-platform/assets/public/static.js"'), '检索页未加载静态检索脚本');
  assert.ok(search.includes('class="results"'), '检索页缺少首屏兜底结果');

  const notFound = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  assert.ok(notFound.startsWith('<!DOCTYPE html>'), `404.html 不是完整页面：${notFound.slice(0, 40)}`);
  assert.ok(notFound.includes('href="/law-study-platform/assets/style.css"'), '404.html 未加部署前缀');

  const cases = fs.readFileSync(path.join(out, 'cases/index.html'), 'utf8');
  assert.ok(cases.includes('action="/law-study-platform/search"'), '案例页检索表单未改接到全局检索');
  assert.ok(cases.includes('name="type" value="指导性案例"'), '案例页检索未限定类型');
  assert.ok(cases.includes('href="/law-study-platform/cases/page/2"'), '案例分页未改写成静态路径');

  const notes = fs.readFileSync(path.join(out, 'notes/index.html'), 'utf8');
  assert.ok(notes.includes('href="/law-study-platform/notes/d/civil"'), '注解筛选未改写成静态路径');
  assert.ok(notes.includes('href="/law-study-platform/notes/l/key"'), '注解等级筛选未改写成静态路径');

  const leftovers = [];
  for (const file of walk(out).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\b(?:href|action)="([^"]*\?[^"]*)"/g)) {
      if (/^\/law-study-platform\/search\?|^\/search\?/.test(m[1])) continue;
      leftovers.push(`${path.relative(out, file)} → ${m[1]}`);
    }
  }
  assert.deepEqual(leftovers.slice(0, 5), [], `非检索页不应残留查询串链接：\n${leftovers.slice(0, 5).join('\n')}`);

  const index = JSON.parse(fs.readFileSync(path.join(out, 'assets/index.json'), 'utf8'));
  assert.ok(index.length > 0 && index.length < 500, `样本模式的检索索引条数异常：${index.length}`);
  assert.ok(index.every((rec) => rec.id && rec.text !== undefined), '检索索引缺字段');

  const modules = walk(path.join(out, 'assets')).filter((f) => f.endsWith('.js'));  assert.ok(modules.length >= 6, `浏览器模块太少：${modules.length}`);
  for (const file of modules) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/from\s+'node:/.test(text), `${path.relative(out, file)} 依赖 Node 内置模块，浏览器无法加载`);
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) continue;
      const target = path.resolve(path.dirname(file), spec);
      assert.ok(fs.existsSync(target), `${path.relative(out, file)} 的 import ${spec} 在导出物里不存在`);
    }
  }
});
