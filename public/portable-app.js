/**
 * 单文件离线站点的浏览器端：把 hash 路由映射到 pages.js 的页面函数。
 * 导出脚本会把本文件连同 server/ 一起拼接进 HTML，数据由脚本内嵌。
 */

import { Database } from '../server/db.js';
import * as pages from '../server/pages.js';

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const fragmentAt = raw.indexOf('#', 1);
  const route = fragmentAt < 0 ? raw : raw.slice(0, fragmentAt);
  const fragment = fragmentAt < 0 ? '' : raw.slice(fragmentAt + 1);
  const q = route.indexOf('?');
  const pathPart = q < 0 ? route : route.slice(0, q);
  let pathname = '/';
  try {
    pathname = decodeURIComponent(pathPart) || '/';
  } catch {
    pathname = pathPart || '/';
  }
  return { pathname, search: q < 0 ? '' : route.slice(q), fragment };
}

export function queryOf(search) {
  const params = new URLSearchParams(search || '');
  const query = {};
  for (const [key, value] of params) query[key] = value;
  for (const key of ['scope', 'type']) {
    const values = params.getAll(key);
    if (values.length) query[key] = values.flatMap((value) => value.split(','));
  }
  return query;
}

function pageOf(db, pathname, query) {
  if (pathname === '/' || pathname === '') return pages.homePage(db);
  if (pathname === '/classifications') return pages.classificationsPage(db);
  let m = pathname.match(/^\/classification\/([^/]+)$/);
  if (m) return pages.classificationPage(db, m[1]);
  m = pathname.match(/^\/d\/([^/]+)\/(\d+(?:-\d+)?)$/);
  if (m) return pages.articlePage(db, m[1], m[2]);
  m = pathname.match(/^\/d\/([^/]+)$/);
  if (m) {
    if (query.a) return pages.articlePage(db, m[1], String(query.a));
    return pages.docPage(db, m[1], query);
  }
  if (pathname === '/search') return pages.searchPage(db, query);
  if (pathname === '/notes') return pages.notesPage(db, query);
  if (pathname === '/cases') return pages.casesPage(db, query);
  m = pathname.match(/^\/case\/([^/]+)$/);
  if (m) return pages.casePage(db, m[1]);
  if (pathname === '/gazettes') return pages.gazettesPage(db, query);
  m = pathname.match(/^\/gazette\/([^/]+)$/);
  if (m) return pages.gazettePage(db, m[1]);
  if (pathname === '/about') return pages.aboutPage(db);
  return pages.notFoundPage(db, `找不到路径：${pathname}`);
}

export function renderPage(db, hash) {
  const { pathname, search } = parseHash(hash);
  const out = pageOf(db, pathname, queryOf(search));
  return typeof out === 'string' ? { html: out } : out;
}

function settleBootArt() {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return Promise.resolve();
  const title = document.querySelector('.boot-type');
  if (!title || typeof title.getAnimations !== 'function') return Promise.resolve();
  const typing = title.getAnimations().find((a) => a.animationName === 'boot-type');
  if (!typing || typing.playState === 'finished') return Promise.resolve();
  const finished = new Promise((resolve) => typing.addEventListener('finish', resolve, { once: true }));
  const timeout = new Promise((resolve) => setTimeout(resolve, 2400));
  return Promise.race([finished, timeout]).then(() => new Promise((resolve) => setTimeout(resolve, 160)));
}

async function decodeSources() {
  const script = document.getElementById('db-data');
  const binary = atob(script.textContent.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

function draw(db, hash) {
  const { html } = renderPage(db, hash);
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const body = parsed.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\bhref="\/(?!\/)/g, 'href="#/');
  document.title = parsed.title;
  document.body.innerHTML = body;
  window.dispatchEvent(new Event('dsh:rendered'));
  const { fragment } = parseHash(hash);
  if (fragment) {
    let target = null;
    try {
      target = document.getElementById(decodeURIComponent(fragment));
    } catch {
      target = document.getElementById(fragment);
    }
    if (target) {
      target.scrollIntoView();
      return;
    }
  }
  window.scrollTo(0, 0);
}

export async function boot() {
  if (typeof document === 'undefined') return;

  let db;
  try {
    db = new Database(await decodeSources());
  } catch (error) {
    document.body.innerHTML = `<p class="empty">数据装载失败：${error.message}</p>`;
    return;
  }

  await settleBootArt();
  const routeHash = () => (document.location.hash.startsWith('#/') ? document.location.hash : '#/');

  window.addEventListener('hashchange', () => {
    if (document.location.hash.startsWith('#/')) {
      try {
        draw(db, document.location.hash);
      } catch (error) {
        document.body.innerHTML = `<p class="empty">页面渲染失败：${error.message}</p>`;
      }
    }
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) params.append(name, value);
    const action = form.getAttribute('action') || '/search';
    const search = params.toString();
    const next = `#${action}${search ? `?${search}` : ''}`;
    if (document.location.hash === next) draw(db, next);
    else document.location.hash = next;
  });

  document.addEventListener('click', (event) => {
    const inside = event.target.closest('.multi-select');
    for (const details of document.querySelectorAll('.multi-select[open]')) {
      if (details !== inside) details.removeAttribute('open');
    }
    const top = event.target.closest('a[href="#top"]');
    if (top) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  try {
    draw(db, routeHash());
  } catch (error) {
    document.body.innerHTML = `<p class="empty">页面渲染失败：${error.message}</p>`;
  }
}
