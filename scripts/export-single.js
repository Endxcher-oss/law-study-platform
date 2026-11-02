/**
 * 单文件导出：把 db 数据、样式、脚本与页面渲染模块打成一份可双击打开的 HTML。
 * 用法与限制见 docs/single-file.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'db');
const OUT = path.resolve(process.env.SINGLE_OUT || path.join(ROOT, 'dist-single', 'index.html'));

const NODE_STUBS = {
  'node:fs': `var fail = function () { throw new Error('单文件版本不读取本地文件'); };
return { default: { existsSync: function () { return false; }, readFileSync: fail, readdirSync: fail, statSync: fail } };`,
  'node:path': `var path = {
  sep: '/',
  dirname: function (p) { var i = p.lastIndexOf('/'); return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i); },
  basename: function (p) { return p.slice(p.lastIndexOf('/') + 1); },
  resolve: function () {
    var out = '';
    for (var i = 0; i < arguments.length; i += 1) {
      var p = String(arguments[i] || '');
      out = p.charAt(0) === '/' ? p : out + '/' + p;
    }
    var parts = out.split('/');
    var stack = [];
    for (var j = 0; j < parts.length; j += 1) {
      var s = parts[j];
      if (!s || s === '.') continue;
      if (s === '..') stack.pop(); else stack.push(s);
    }
    return '/' + stack.join('/');
  }
};
path.join = function () {
  var parts = [];
  for (var i = 0; i < arguments.length; i += 1) if (arguments[i]) parts.push(String(arguments[i]));
  return path.resolve(parts.join('/'));
};
return { default: path, join: path.join, dirname: path.dirname, basename: path.basename, resolve: path.resolve, sep: '/' };`,
  'node:url': `return { fileURLToPath: function (url) { return String(url).replace(/^file:\\/\\//, ''); } };`,
};

function moduleKey(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/').replace(/\.js$/, '');
}

function resolveSpec(fromKey, spec) {
  if (spec.startsWith('node:')) return spec;
  const base = path.posix.dirname(`${fromKey}.js`);
  return path.posix.normalize(path.posix.join(base, spec)).replace(/\.js$/, '');
}

function transformModule(key, source) {
  const deps = [];
  const names = [];

  let body = source.replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';?/gm, (full, clause, spec) => {
    const dep = resolveSpec(key, spec);
    deps.push(dep);
    const text = clause.trim();
    if (text.startsWith('* as ')) return `const ${text.slice(5).trim()} = __req(${JSON.stringify(dep)});`;
    if (text.startsWith('{')) {
      const bindings = text
        .replace(/^\{|\}$/g, '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/\s+as\s+/, ': '));
      return `const { ${bindings.join(', ')} } = __req(${JSON.stringify(dep)});`;
    }
    return `const ${text} = __req(${JSON.stringify(dep)}).default;`;
  });

  body = body.replace(/^import\s+'([^']+)';?/gm, (full, spec) => {
    const dep = resolveSpec(key, spec);
    deps.push(dep);
    return `__req(${JSON.stringify(dep)});`;
  });

  const hadDefault = /^export\s+default\s+/m.test(body);
  body = body.replace(/^export\s+default\s+/gm, 'const __default = ');

  body = body.replace(/^export\s+(async\s+)?(function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (full, asyncWord, kind, name) => {
    names.push(name);
    return `${asyncWord || ''}${kind} ${name}`;
  });

  body = body.replace(/^export\s+class\s+([A-Za-z_$][\w$]*)/gm, (full, name) => {
    names.push(name);
    return `class ${name}`;
  });

  body = body.replace(/^export\s*\{([^}]*)\}\s*;?/gm, (full, inner) => {
    for (const part of inner.split(',')) {
      const item = part.trim();
      if (!item) continue;
      const m = item.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m) names.push(m[2] ? `${m[2]}: ${m[1]}` : m[1]);
    }
    return '';
  });

  body = body.replace(/import\.meta\.url/g, JSON.stringify('file:///law-study-platform/index.js'));

  const unique = [...new Set(names)];
  if (hadDefault) unique.push('default: __default');
  return { body, deps, exports: unique };
}

function buildBundle(entry) {
  const defs = [];
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith('node:')) {
      defs.push(`__def(${JSON.stringify(key)}, function () {\n${NODE_STUBS[key]}\n});`);
      continue;
    }
    const file = path.join(ROOT, `${key}.js`);
    const { body, deps, exports } = transformModule(key, fs.readFileSync(file, 'utf8'));
    for (const dep of deps) if (!seen.has(dep)) queue.push(dep);
    defs.push(`__def(${JSON.stringify(key)}, function () {\n${body}\nreturn { ${exports.join(', ')} };\n});`);
  }
  return `(function () {
"use strict";
var __defs = {};
var __cache = {};
function __def(key, factory) { __defs[key] = factory; }
function __req(key) {
  if (!(key in __cache)) {
    if (!__defs[key]) throw new Error('缺少模块：' + key);
    __cache[key] = __defs[key]();
  }
  return __cache[key];
}
${defs.join('\n')}
__req(${JSON.stringify(entry)}).boot();
})();`;
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(DB, rel), 'utf8'));
}

function listDocs() {
  const docs = [];
  for (const dir of ['codes', 'interpretations', 'regulations']) {
    const full = path.join(DB, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full).filter((file) => file.endsWith('.json')).sort()) {
      docs.push(JSON.parse(fs.readFileSync(path.join(full, name), 'utf8')));
    }
  }
  return docs;
}

function buildSources() {
  const only = (process.env.SINGLE_DOCS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  let docs = listDocs();
  if (only.length) docs = docs.filter((doc) => only.includes(doc.id));
  const skipCases = process.env.SINGLE_SKIP_CASES === '1';
  return {
    'meta.json': readJson('meta.json'),
    'taxonomy.json': readJson('taxonomy.json'),
    'taxonomy.map.json': readJson('taxonomy.map.json'),
    'catalog.json': readJson('catalog.json'),
    'links.json': readJson('links.json'),
    'annotations/curated.json': readJson('annotations/curated.json'),
    'annotations/derived.json': readJson('annotations/derived.json'),
    'rubrics.json': readJson('rubrics.json'),
    'tags.json': fs.existsSync(path.join(DB, 'tags.json')) ? readJson('tags.json') : null,
    'cases/guiding.json': skipCases ? null : readJson('cases/guiding.json'),
    'cases/gazette.json': skipCases ? null : readJson('cases/gazette.json'),
    docs,
  };
}

function main() {
  const sources = buildSources();
  const data = zlib.gzipSync(Buffer.from(JSON.stringify(sources)), { level: 6 }).toString('base64');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const bundle = buildBundle('public/single-app');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>法律学习平台</title>
<style>
${css}
</style>
<script>
${app.replace(/<\/script/gi, '<\\/script')}
</script>
</head>
<body>
<p class="empty">正在装载数据……</p>
<script id="db-data" type="application/gzip-base64">${data}</script>
<script>
${bundle.replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  const size = fs.statSync(OUT).size;
  console.log(`单文件：${path.relative(ROOT, OUT)}（${(size / 1048576).toFixed(1)} MB，文档 ${sources.docs.length} 篇）`);
}

main();
