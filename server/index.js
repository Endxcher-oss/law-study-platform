#!/usr/bin/env node
/** HTTP 服务器（零依赖）：路由、静态资源、启动。路由清单见 docs/web-ui.md 与 docs/api.md。 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb } from './db.js';
import * as pages from './pages.js';
import { handleApi } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendHtml(res, out) {
  const status = typeof out === 'string' ? 200 : out.status || 200;
  const html = typeof out === 'string' ? out : out.html;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

function sendJson(res, out) {
  const body = JSON.stringify(out.json);
  res.writeHead(out.status || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/assets\//, ''));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('asset not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=60' });
  fs.createReadStream(file).pipe(res);
}

const db = getDb();

export function createServer() {
  return http.createServer((req, res) => {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const query = Object.fromEntries(url.searchParams.entries());
    for (const key of ['scope', 'type']) {
      const values = url.searchParams.getAll(key);
      if (values.length) query[key] = values;
    }

    if (pathname === '/search' && url.search === '?q=') {
      res.writeHead(302, { Location: '/search' });
      res.end();
      return;
    }

    try {
      if (pathname.startsWith('/assets/')) return serveStatic(res, url.pathname);
      if (pathname.startsWith('/api')) return sendJson(res, handleApi(db, pathname, query));

      let out;
      if (pathname === '/' || pathname === '') out = pages.homePage(db);
      else if (pathname === '/divisions') out = pages.divisionsPage(db);

      let m = pathname.match(/^\/division\/([^/]+)$/);
      if (m) out = pages.divisionPage(db, m[1]);
      m = pathname.match(/^\/domain\/([^/]+)$/);
      if (m) out = pages.domainPage(db, m[1]);

      m = pathname.match(/^\/d\/([^/]+)\/(\d+(?:-\d+)?)$/);
      if (m) out = pages.articlePage(db, m[1], m[2]);
      if (!out) {
        m = pathname.match(/^\/d\/([^/]+)$/);
        if (m) {
          out = query.a ? pages.articlePage(db, m[1], String(query.a)) : pages.docPage(db, m[1], query);
        }
      }

      if (pathname === '/search') out = pages.searchPage(db, query);
      if (pathname === '/notes') out = pages.notesPage(db, query);
      if (pathname === '/cases') out = pages.casesPage(db, query);
      m = pathname.match(/^\/case\/([^/]+)$/);
      if (m) out = pages.casePage(db, m[1]);
      if (pathname === '/gazettes') out = pages.gazettesPage(db, query);
      m = pathname.match(/^\/gazette\/([^/]+)$/);
      if (m) out = pages.gazettePage(db, m[1]);
      if (pathname === '/about') out = pages.aboutPage(db);
      if (pathname === '/health') return sendJson(res, { status: 200, json: { ok: true, docs: db.docs.size, articles: db.articles.size } });
      if (!out) out = pages.notFoundPage(db, `找不到路径：${pathname}`);

      sendHtml(res, out);
    } catch (err) {
      console.error('[error]', req.method, req.url, err);
      sendHtml(res, pages.notFoundPage(db, `服务器内部错误：${err.message}`));
    } finally {
      if (process.env.LOG !== '0') {
        console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
      }
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    const c = db.meta.counts;
    console.log(`法律学习平台已启动：http://${HOST}:${PORT}`);
    console.log(
      `  数据：${c.documents} 部文件 / ${c.articles} 条条文 / ${c.links} 条关联 / ${c.annotations} 条注解 / ${c.cases} 件指导性案例 / ${c.gazette} 件公报裁判文书`,
    );
  });
}
