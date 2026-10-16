/**
 * 文档一致性测试：README 与 docs/ 里的相对链接必须可达，锚点必须对应真实标题。
 * 纯文件检查，不依赖 db/。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCS = path.join(ROOT, 'docs');

function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_[\]()（）「」“”"'’·。，、：；！？—–]/g, '')
    .replace(/\s+/g, '-');
}

function headingSlugs(file) {
  const text = fs.readFileSync(file, 'utf8');
  return new Set(
    [...text.matchAll(/^#{1,6} +(.+?)\s*$/gm)].map((m) => slugify(m[1])),
  );
}

function markdownFiles() {
  return [
    path.join(ROOT, 'README.md'),
    ...fs.readdirSync(DOCS).filter((f) => f.endsWith('.md')).map((f) => path.join(DOCS, f)),
  ];
}

test('README 与 docs/ 的相对链接都指向真实文件', () => {
  const bad = [];
  for (const file of markdownFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = m[1].trim();
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const [rel, anchor] = target.split('#');
      if (!rel) continue;
      const abs = path.resolve(path.dirname(file), rel);
      if (!fs.existsSync(abs)) {
        bad.push(`${path.relative(ROOT, file)} → ${target}（文件不存在）`);
      } else if (anchor && !headingSlugs(abs).has(slugify(anchor))) {
        bad.push(`${path.relative(ROOT, file)} → ${target}（锚点不存在）`);
      }
    }
  }
  assert.deepEqual(bad, [], `损坏的链接：\n${bad.join('\n')}`);
});

test('每个 docs/*.md 都在 README 的文档索引里列出', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const missing = fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !readme.includes(`(docs/${f})`));
  assert.deepEqual(missing, [], `README 未列出：${missing.join(', ')}`);
});

test('每份文档都有唯一的 H1，且不残留旧的章节编号引用', () => {
  for (const file of markdownFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    assert.equal((text.match(/^# /gm) || []).length, 1, `${rel} 的 H1 数量不为 1`);
    assert.ok(!/§\s*\d/.test(text), `${rel} 仍有 §N 形式的章节引用`);
    assert.ok(!/见 {0,1}\d+\.\d+/.test(text), `${rel} 仍有“见 3.4”形式的章节引用`);
  }
});
