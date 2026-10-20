/**
 * 服务端端到端冒烟测试：真的起一个 HTTP 服务，逐条路由验证。
 * 使用随机端口，测试结束自动关闭。
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3800 + Math.floor(Math.random() * 150);
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let stderr = '';

before(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), LOG: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`服务启动失败：${stderr}`);
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
    }
    if (Date.now() > deadline) throw new Error(`服务启动超时：${stderr}`);
    await new Promise((r) => setTimeout(r, 150));
  }
});

after(() => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
});

const html = async (p) => {
  const res = await fetch(BASE + p);
  return { status: res.status, type: res.headers.get('content-type') || '', body: await res.text() };
};
const json = async (p) => {
  const res = await fetch(BASE + p);
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('首页与导航页可访问', async () => {
  for (const p of ['/', '/divisions', '/cases', '/notes', '/about']) {
    const r = await html(p);
    assert.equal(r.status, 200, `${p} 返回 ${r.status}`);
    assert.match(r.type, /text\/html/);
    assert.match(r.body, /法律学习平台/, `${p} 缺少站名`);
  }
});

test('顶部导航不再放“全文检索”；搜索框留空提交 = 进入 /search', async () => {
  const home = await html('/');
  const nav = home.body.match(/<nav class="site-nav">[\s\S]*?<\/nav>/)[0];
  assert.ok(!nav.includes('全文检索'), '顶部导航里不应再有“全文检索”');
  assert.ok(!nav.includes('href="/search"'), '顶部导航不应残留 /search 入口');
  assert.ok(nav.includes('href="/divisions"') && nav.includes('href="/notes"'), '其他导航项应保留');

  const redirect = await fetch(`${BASE}/search?q=`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/search');

  const clean = await html('/search');
  assert.equal(clean.status, 200);
  assert.match(clean.body, /全库检索/);

  const filtered = await html('/search?q=&scope=civil');
  assert.equal(filtered.status, 200);
});

test('条文页：民法典第 585 条含注解、依据条文与关联案例', async () => {
  const r = await html('/d/civil-code/585');
  assert.equal(r.status, 200);
  assert.match(r.body, /违约金/);
  assert.match(r.body, /第五百八十五条/);
  assert.match(r.body, /疑难|注解/, '应有注解区块');
  assert.match(r.body, /依据|司法解释/, '应有依据/司法解释区块');
});

test('法律总览页：分页与文档内关键词筛选', async () => {
  const a = await html('/d/civil-code');
  assert.equal(a.status, 200);
  assert.match(a.body, /民法典/);
  const b = await html('/d/civil-code?from=101');
  assert.equal(b.status, 200);
  assert.match(b.body, /条文（101/);
  const f = await html('/d/civil-code?q=' + encodeURIComponent('违约金'));
  assert.equal(f.status, 200);
  assert.match(f.body, /筛选/);
  assert.match(f.body, /第五百八十五条/);
  const none = await html('/d/civil-code?q=' + encodeURIComponent('这个词不存在zzz'));
  assert.equal(none.status, 200);
  assert.match(none.body, /没有包含/);
  assert.match(none.body, /改为全库检索/);
});

test('检索页：指定范围/排序/类型', async () => {
  const r = await html('/search?q=%E8%BF%9D%E7%BA%A6%E9%87%91&scope=civil&sort=date_desc');
  assert.equal(r.status, 200);
  assert.match(r.body, /违约金/);
  const r2 = await html('/search?q=%E6%B0%91%E6%B3%95%E5%85%B8585%E6%9D%A1');
  assert.equal(r2.status, 200);
  assert.match(r2.body, /直接定位/, '“法名+条号”应给出直接定位');
});

test('未知路径 404，静态资源 200', async () => {
  const bad = await html('/d/doc-that-does-not-exist');
  assert.equal(bad.status, 404);
  const css = await fetch(`${BASE}/assets/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type') || '', /css/);
});

test('API：meta / taxonomy / catalog', async () => {
  const meta = await json('/api/meta');
  assert.equal(meta.status, 200);
  assert.ok(meta.body.ok);
  assert.ok(meta.body.meta.counts.documents >= 500);
  const tax = await json('/api/taxonomy');
  assert.ok(tax.body.taxonomy.divisions.length >= 4);
  const cat = await json('/api/catalog?q=' + encodeURIComponent('民法典') + '&size=5');
  assert.ok(cat.body.items.length >= 1);
  assert.ok(cat.body.items.some((d) => d.id === 'civil-code'));
});

test('API：docs / articles / links', async () => {
  const doc = await json('/api/docs/civil-code?links=1');
  assert.equal(doc.status, 200);
  assert.ok(doc.body.doc.articles.length >= 1000);
  assert.ok(doc.body.related.interpretations.length >= 1);

  const art = await json('/api/articles/civil-code-0585');
  assert.equal(art.status, 200);
  assert.equal(art.body.article.number, 585);
  assert.ok(art.body.curated?.id, '应有手工注解');

  const links = await json('/api/links?articleId=civil-code-0585');
  assert.equal(links.status, 200);
  assert.ok(links.body.incoming.length >= 1, '应至少有一件司法解释引用本条');
  assert.ok(Array.isArray(links.body.outgoing));

  const nf = await json('/api/articles/not-a-real-article');
  assert.equal(nf.status, 404);
});

test('API：search 支持范围/类型/排序/分页，并返回分面', async () => {
  const q = encodeURIComponent('违约金');
  const all = await json(`/api/search?q=${q}&size=5`);
  assert.equal(all.status, 200);
  assert.ok(all.body.total > 10);
  assert.equal(all.body.items.length, 5);
  assert.ok(Object.keys(all.body.facets.category).length >= 2);

  const civil = await json(`/api/search?q=${q}&scope=civil&size=5`);
  assert.ok(civil.body.items.every((i) => i.division === 'civil'));
  assert.ok(civil.body.total < all.body.total);

  const byInterp = await json(`/api/search?q=${q}&type=${encodeURIComponent('司法解释')}&size=5`);
  assert.ok(byInterp.body.items.every((i) => i.category === '司法解释'));

  const page2 = await json(`/api/search?q=${q}&size=5&page=2`);
  const ids1 = new Set(all.body.items.map((i) => i.id));
  assert.ok(page2.body.items.every((i) => !ids1.has(i.id)));

  const byTitle = await json(`/api/search?q=${encodeURIComponent('中华人民共和国刑法')}&size=3`);
  assert.equal(byTitle.body.docHits[0].id, 'criminal-law');
  assert.ok(byTitle.body.items.every((i) => i.docId === 'criminal-law'));
});

test('API：annotations / cases / suggest / hot', async () => {
  const ann = await json('/api/annotations?level=key&size=5');
  assert.equal(ann.status, 200);
  assert.ok(ann.body.total >= 5);
  assert.ok(ann.body.items.every((a) => a.level === 'key'));

  const one = await json(`/api/annotations/${ann.body.items[0].id}`);
  assert.equal(one.status, 200);
  assert.ok(one.body.annotation.basis.length >= 1);

  const cases = await json('/api/cases?lawId=civil-code&size=100');
  assert.equal(cases.status, 200);
  assert.ok(cases.body.total >= 1);
  const byArticle = await json('/api/cases?articleId=civil-code-0585');
  assert.equal(byArticle.status, 200);
  assert.ok(byArticle.body.total >= 1, '应有适用民法典第 585 条的指导性案例');
  assert.ok(byArticle.body.total <= cases.body.total);
  const lawIds = new Set(cases.body.items.map((c) => c.id));
  assert.ok(byArticle.body.items.every((c) => lawIds.has(c.id)), '按条文筛选的结果必须是按法律筛选的子集');
  const detail = await json(`/api/cases/${byArticle.body.items[0].id}`);
  assert.ok(detail.body.case.related.some((r) => r.articleId === 'civil-code-0585'));

  const sug = await json('/api/suggest?q=' + encodeURIComponent('民法典'));
  assert.ok(sug.body.docs.some((d) => d.id === 'civil-code'));

  const hot = await json('/api/hot?size=5');
  assert.equal(hot.status, 200);
  assert.equal(hot.body.items.length, 5);

  const unknown = await json('/api/nope');
  assert.equal(unknown.status, 404);
});

test('法律总览页：关联信息在目录之后，侧栏顶部有区段跳转', async () => {
  const r = await html('/d/criminal-law');
  assert.equal(r.status, 200);
  const at = (s) => r.body.indexOf(s);
  const iToc = at('<h3>目录</h3>');
  const iNav = at('class="toc-jump"');
  const iWin = at('class="article-window"');
  const iCov = at('id="sec-coverage"');
  const iNotes = at('id="sec-notes"');
  const iCases = at('id="sec-cases"');
  const iBack = at('assoc-back');
  assert.ok(iToc > 0 && iNav > iToc, '跳转栏应在侧栏“目录”标题之下');
  assert.ok(iWin > iNav, '条文窗在侧栏之后');
  assert.ok(iCov > iWin, '关联概览应在目录/条文窗之后');
  assert.ok(iNotes > iCov && iCases > iNotes, '顺序应为 概览 → 疑难注解 → 指导性案例');
  assert.ok(iBack > iCases, '末尾应有“回到条文目录”');
  for (const id of ['#sec-coverage', '#sec-notes', '#sec-cases']) {
    assert.ok(r.body.includes(`href="${id}"`), `侧栏跳转缺少 ${id}`);
  }
  assert.ok(r.body.includes('id="toc"'), '目录容器应有 #toc 锚点供回跳');
  assert.match(r.body, /href="#sec-notes">疑难注解 \d+</);
});

test('司法解释页：本解释针对的法律 + 引用概览（反方向关联）', async () => {
  const r = await html('/d/sfjs-mfd-hetong');
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('id="sec-interp-of"'));
  assert.ok(r.body.includes('id="sec-coverage"'));
  assert.ok(r.body.includes('href="#sec-interp-of"'));
  assert.ok(r.body.includes('中华人民共和国民法典'), '应列出被解释的法律');
  assert.ok(r.body.includes('引用概览'), '司法解释页的概览应叫“引用概览”');
  const at = (s) => r.body.indexOf(s);
  assert.ok(at('class="article-window"') < at('id="sec-coverage"'), '概览应在目录之后');
});

test('目录树：编 → 分编 → 章 → 节，层级可展开收起，并按当前位置自动展开高亮', async () => {
  const r = await html('/d/civil-code?from=585');
  assert.equal(r.status, 200);
  const tree = r.body.slice(r.body.indexOf('section-tree'), r.body.indexOf('</aside>'));
  assert.ok(tree.includes('toc-branch lvl-1'), '应有编级节点');
  assert.ok(tree.includes('toc-branch lvl-2'), '应有分编级节点');
  assert.ok(!tree.includes('class="toc-leaf"'), '有章节结构时不逐条平铺（目录最深到节）');
  assert.ok(tree.includes('class="toc-end'), '最深一层章节应渲染成一行链接（不再套空的可展开框）');
  assert.ok(!/lvl-5/.test(tree), '目录层级不应超过数据里的最深一级');
  assert.ok(tree.includes('<details open>'), '当前浏览位置所在的各级章节应默认展开');
  assert.match(tree, /class="is-current"[^>]*><span class="toc-label">第八章 违约责任</, '当前所在章节应高亮');
  assert.match(tree, /class="is-on-path"[^>]*><span class="toc-label">第三编 合同</, '祖先层级应标为路径');
  assert.ok(/<li class="toc-branch lvl-1" data-idx="0" data-count="\d+">\s*<details>/.test(tree), '远离当前位置的编应保持折叠');
  assert.ok(tree.includes('class="toc-count"'), '章节节点应带条文数');

  const flat = await html('/d/sfjs-laodong-1');
  assert.equal(flat.status, 200);
  const flatTree = flat.body.slice(flat.body.indexOf('section-tree'), flat.body.indexOf('</aside>'));
  assert.ok(flatTree.includes('section-tree is-flat'), '无章节结构的文件应平铺' + flatTree.slice(0, 80));
  assert.ok(flatTree.includes('class="toc-leaf"'), '无章节结构的文件只能平铺条文，否则目录是空的');
  assert.ok(!flatTree.includes('其他条文'), '平铺时不应出现占位分支名');

  const mixed = await html('/d/sfjs-078c53d6b9');
  assert.equal(mixed.status, 200);
  const mixedTree = mixed.body.slice(mixed.body.indexOf('section-tree'), mixed.body.indexOf('</aside>'));
  assert.ok(mixedTree.includes('其他条文'), '混合文件应把无章节的条文放进“其他条文”');
  assert.ok(mixedTree.includes('司法文书的送达'), '混合文件应保留有章节的分支');
});

test('编 / 章 / 节标记与其后的标题之间留一个空格', async () => {
  const doc = await html('/d/civil-code?from=585');
  assert.equal(doc.status, 200);
  const tree = doc.body.slice(doc.body.indexOf('section-tree'), doc.body.indexOf('</aside>'));
  assert.match(tree, /<span class="toc-label">第三编 合同<\/span>/, '目录树的分编标题应留空格');
  assert.match(tree, /<span class="toc-label">第八章 违约责任<\/span>/, '目录树的章标题应留空格');
  assert.ok(
    !/toc-label">第[〇零一二三四五六七八九十百千]+(?:分)?[编章节][^\s<]/.test(tree),
    '目录树里不应再有“第X章标题”这样连写的节点',
  );

  const article = await html('/d/civil-code/585');
  assert.ok(article.body.includes('<span class="meta">第八章 违约责任</span>'), '条文页头部的章节应留空格');

  const search = await html('/search?q=%E6%B0%91%E6%B3%95%E5%85%B8%20585');
  assert.match(search.body, /class="result-path">第三编 合同 · 第一分编 通则 · 第八章 违约责任</, '检索结果的章节路径应留空格');
});

test('目录跨页跳转：超出当前 100 条窗口的章节带 ?from=，落地页有锚点并标出当前位置', async () => {
  const first = await html('/d/criminal-law');
  assert.equal(first.status, 200);
  const cross = [...first.body.matchAll(/href="(\/d\/criminal-law\?from=(\d+)#a[\w-]+)"/g)].map((m) => ({ href: m[1], from: Number(m[2]) }));
  assert.ok(cross.length > 5, `应有多个跨页目录项，实际 ${cross.length}`);
  assert.ok(cross.every((c) => c.from > 100), '跨页目录项必须带 ?from=（裸锚点在落地页不存在）');
  const seg = first.body.slice(0, first.body.indexOf('第二编 分则'));
  const mFen = seg.match(/href="\/d\/criminal-law\?from=(\d+)#a[\w-]+"[^>]*><span class="toc-label">$/);
  assert.ok(mFen, '第二编 分则应是带 ?from= 的跨页目录项');
  assert.equal(Number(mFen[1]), 104, '第二编分则的首条是第一百零二条（第 104 个条文），?from= 应为 104');
  assert.match(first.body, /class="toc-page">第 2 页</, '跨页章节要标出页码');

  const page = await html(cross[0].href);
  assert.equal(page.status, 200);
  const slug = cross[0].href.split('#')[1];
  const fromArg = Number(cross[0].href.match(/from=(\d+)/)[1]);
  assert.ok(page.body.includes(`id="${slug}"`), `跨页落地页应包含锚点 ${slug}`);
  assert.ok(
    page.body.includes(`<li class="toc-article" id="${slug}" data-idx="${fromArg - 1}"`),
    '落地页应把目标条文排在窗口第一条',
  );
  assert.match(page.body, /class="is-current"/, '落地页应在目录里标出当前位置');
  assert.match(page.body, /<li class="toc-article" id="a[\w-]+" data-idx="\d+"/);
  assert.match(page.body, /class="section-tree">.*?<li[^>]*data-idx="\d+"/s);
  assert.match(page.body, /href="#a\d/);
  const last = await html('/d/criminal-law?from=501');
  for (const c of last.body.matchAll(/href="\/d\/criminal-law\?from=(\d+)#/g)) {
    assert.ok(Number(c[1]) <= 501, '目录不应链到不存在的页');
  }
});

test('条文窗用章 / 节分隔行分组：换章换节标标题、落在章节中间标“续”、无章节结构时不加分隔', async () => {
  const cut = (body) => {
    const s = body.indexOf('<ul class="toc-article-list">') + '<ul class="toc-article-list">'.length;
    return body.slice(s, body.indexOf('</ul>', s));
  };
  const mid = cut((await html('/d/civil-code?from=585')).body);
  assert.match(
    mid,
    /^<li class="toc-sep is-part"><span class="toc-sep-text"><span class="toc-sep-kind">第三编<\/span>合同<\/span><span class="toc-sep-cont">续<\/span><\/li><li class="toc-sep is-subpart"/,
    '窗口首条所在的三级章节都应以“续”开头',
  );
  assert.match(mid, /is-chapter"><span class="toc-sep-text"><span class="toc-sep-kind">第八章<\/span>违约责任<\/span><span class="toc-sep-cont">续<\/span><\/li><li class="toc-article" id="a585"/);
  const head = cut((await html('/d/civil-code')).body);
  assert.match(head, /^<li class="toc-sep is-part"><span class="toc-sep-text"><span class="toc-sep-kind">第一编<\/span>总则<\/span><\/li>/);
  assert.match(head, /is-chapter"><span class="toc-sep-text"><span class="toc-sep-kind">第一章<\/span>基本规定<\/span><\/li>/);
  assert.match(head, /is-section"><span class="toc-sep-text"><span class="toc-sep-kind">第一节<\/span>民事权利能力和民事行为能力<\/span><\/li>/);
  assert.match(mid, /is-subpart"><span class="toc-sep-text"><span class="toc-sep-kind">第二分编<\/span>典型合同<\/span><\/li>/);
  assert.ok(!/<li class="toc-sep[^>]*data-idx/.test(mid), '分隔行不应带 data-idx');
  assert.ok(!/<li class="toc-sep[^>]*id="/.test(mid), '分隔行不应制造锚点');
  const flat = cut((await html('/d/sfjs-laodong-1')).body);
  assert.ok(!flat.includes('toc-sep'), '无章节结构的文档不应出现分隔行');
  const idxs = [...flat.matchAll(/data-idx="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(idxs, idxs.map((_, i) => i), '条文行 data-idx 应从 0 连续编号');
  const mixed = cut((await html('/d/sfjs-078c53d6b9')).body);
  assert.match(mixed, /^<li class="toc-sep is-chapter"><span class="toc-sep-text">其他条文<\/span><\/li>/);
});

test('本书内筛选时，目录不产生死锚点', async () => {
  const r = await html(`/d/criminal-law?q=${encodeURIComponent('盗窃')}`);
  assert.equal(r.status, 200);
  assert.match(r.body, /目录只列出命中条文所在的章节/, '筛选后不命中的章节应隐藏并说明');
  assert.ok(!/section-tree[\s\S]*?href="#a1"/.test(r.body.split('article-window')[0]), '不应留下本节不存在的 #a1');
});

test('“第十七条之一”页面可访问，邻近条文与锚点相邻', async () => {
  const plus = await html('/d/criminal-law/17-1');
  assert.equal(plus.status, 200);
  assert.ok(plus.body.includes('第十七条之一'), '页面应显示“第十七条之一”');
  const docPage = await html('/d/criminal-law?from=0');
  assert.equal(docPage.status, 200);
  assert.ok(docPage.body.includes('id="a17"'));
  assert.ok(docPage.body.includes('id="a17-1"'));
  assert.ok(docPage.body.includes('href="/d/criminal-law/17-1"'), '目录页应链到插入条');
  const near = plus.body.slice(plus.body.indexOf('邻近条文'));
  const i17 = near.indexOf('>第十七条<');
  const i171 = near.indexOf('>第十七条之一<');
  assert.ok(i17 >= 0 && i171 > i17, '邻近条文中“第十七条之一”应排在“第十七条”之后');
  const between = near.slice(i17 + '>第十七条<'.length, i171);
  assert.ok(!/第(十八|十九|二十)条/.test(between), `中间不得插有其他条：${between.slice(0, 120)}`);
  assert.ok(plus.body.includes('href="/d/criminal-law/17"'));
  assert.ok(plus.body.includes('href="/d/criminal-law/18"'));
  const plain = await html('/d/criminal-law/17');
  assert.ok(plain.body.includes('href="/d/criminal-law/17-1"'), '第十七条的“下一条”应是第十七条之一');
  const miss = await html('/d/criminal-law/9999');
  assert.equal(miss.status, 404);
});

test('每页右下角有“回到顶部”悬浮按钮（无 JS 时是普通的 #top 链接）', async () => {
  const home = await html('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /<header class="site-header" id="top">/, '需要 #top 锚点，否则按钮点了没反应');
  assert.match(home.body, /<a class="to-top" href="#top"[^>]*aria-label="回到顶部"/, '按钮应是可用的 #top 链接');
  assert.ok(home.body.indexOf('class="to-top"') < home.body.indexOf('</body>'), '按钮应在页面末尾输出');
  for (const path of ['/search', '/d/civil-code', '/notes']) {
    const r = await html(path);
    assert.match(r.body, /class="to-top" href="#top"/, `${path} 缺少回到顶部按钮`);
  }
  const css = await html('/assets/style.css');
  assert.match(css.body, /\.to-top \{[^}]*position: fixed/, '按钮应固定定位');
  assert.match(css.body, /\.to-top\.is-hidden \{[^}]*visibility: hidden/, '顶部时应由 JS 隐藏');
  assert.match(css.body, /@media print \{[\s\S]*\.to-top \{ display: none/, '打印时不显示按钮');
  const js = await html('/assets/app.js');
  assert.equal(js.status, 200);
  assert.match(js.body, /querySelector\('\.to-top'\)/, '脚本应接管按钮的显隐');
  assert.ok(!/form\.submit\(\)/.test(js.body), '检索条件改变不应自动提交：只有点“检索”按钮才跳转');
});

test('移动端：窄屏折叠页头与目录树、案例页侧栏折成一列', async () => {
  const css = await html('/assets/style.css');
  const mobile = css.body.slice(css.body.indexOf('@media (max-width: 760px)'));
  const singleColumn = css.body.slice(css.body.indexOf('@media (max-width: 960px)'), css.body.indexOf('@media (max-width: 760px)'));
  assert.ok(mobile.length > 0 && singleColumn.length > 0, '缺少窄屏断点');
  assert.match(singleColumn, /\.site-nav \{[^}]*overflow-x: auto/, '窄屏导航应改成一行横向滚动，而不是堆成多行粘在页顶');
  assert.match(mobile, /input\[type="search"\] \{[^}]*font-size: 16px/, '输入框 16px，避免 iOS 聚焦时自动放大');
  assert.match(singleColumn, /\.toc-panel \{ position: static/, '目录面板在单列布局下不应吸顶');
  assert.match(singleColumn, /\.toc-fold > summary \{[^}]*cursor: pointer/, '窄屏目录树应可收起');
  const caseGridBase = css.body.indexOf('.case-grid { grid-template-columns: 1fr 320px; }');
  const caseGridMobile = css.body.lastIndexOf('.case-grid { grid-template-columns: 1fr; }');
  assert.ok(caseGridBase > 0 && caseGridMobile > caseGridBase, '.case-grid 的窄屏覆盖必须晚于 320px 侧栏声明，否则窄屏仍排两列');
  const doc = await html('/d/civil-code');
  assert.match(doc.body, /<details class="toc-fold" open>\s*<summary class="toc-fold-head"><h3>目录<\/h3><\/summary>/, '目录树应包在可收起的 details 里，且默认展开（无 JS 也能看）');
  const js = await html('/assets/app.js');
  assert.match(js.body, /matchMedia\('\(max-width: 960px\)'\)/, '窄屏应默认收起目录树');
});

test('检索分面：零命中或只有案例命中时不留下空的“类型 / 编”标签', async () => {
  const none = await html('/search?q=zzzzzz');
  assert.equal(none.status, 200);
  assert.match(none.body, /命中 <strong>0<\/strong>/, '该查询应无命中');
  assert.ok(!none.body.includes('facet-label'), '零命中时不应输出分面行');

  const casesOnly = await html('/search?q=' + encodeURIComponent('居间合同'));
  assert.match(casesOnly.body, /facet-label">类型/, '只有案例命中时仍要显示类型分面');
  assert.ok(!casesOnly.body.includes('facet-label">编'), '案例不带编，不应留下空的“编”标签');

  const mixed = await html('/search?q=' + encodeURIComponent('违约金'));
  assert.match(mixed.body, /facet-label">编/, '普通命中时“编”分面照旧');

  const js = await html('/assets/static.js');
  assert.equal(js.status, 200);
  assert.match(js.body, /catChips && `<div class="facet-row">/, '静态检索的“类型”行要按有没有分面决定');
  assert.match(js.body, /divChips && `<div class="facet-row">/, '静态检索的“编”行同理');
});

test('暗色模式：跟随系统，且每个颜色变量都有暗色值', async () => {
  const css = (await html('/assets/style.css')).body;
  assert.match(css, /:root \{\s*color-scheme: light;/, '浅色是默认主题');
  assert.match(css, /@media screen and \(prefers-color-scheme: dark\) \{\s*:root \{\s*color-scheme: dark;/, '暗色跟随系统，且只对屏幕生效');
  const tokens = (block) =>
    new Set([...block.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,6}|rgba\([^)]*\))/gm)].map((m) => m[1]));
  const start = css.indexOf('@media screen and (prefers-color-scheme: dark)');
  const light = tokens(css.slice(css.indexOf(':root {'), start));
  const dark = tokens(css.slice(start, css.indexOf('* { box-sizing')));
  assert.ok(light.size >= 20, '颜色变量应集中在 :root');
  const missing = [...light].filter((t) => !dark.has(t));
  assert.deepEqual(missing, [], `暗色主题缺少这些颜色变量：${missing.join(', ')}`);
  assert.match(css, /mark \{ background: var\(--mark\); color: var\(--ink\)/, '高亮文字颜色要跟主题走，否则暗色下是黑字压深底');
});

test('检索命中指导性案例时，结果链接走 /case/:id（而不是 /d/:docId/:number 的条文路由）', async () => {
  const page = await html('/search?q=b');
  assert.equal(page.status, 200);
  const results = [...page.body.matchAll(/<article class="result"[\s\S]*?<\/article>/g)].map((m) => m[0]);
  assert.ok(results.length >= 5, `应有若干案例结果，实际 ${results.length}`);
  const hrefs = results.flatMap((r) => [...r.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(hrefs.length > 0, '结果卡应有链接');
  assert.equal(hrefs.filter((h) => h.startsWith('/d/guiding-')).length, 0, '案例结果不得指向 /d/guiding-…');
  assert.ok(hrefs.some((h) => h.startsWith('/case/guiding-')), '案例结果应指向 /case/guiding-…');
  for (const h of new Set(hrefs)) {
    const r = await html(h);
    assert.equal(r.status, 200, `${h} 应为 200，实际 ${r.status}`);
  }
  assert.match(page.body, /class="result-case-title">/, '案例结果应显示案例标题');
});

test('相关指导性案例列表不重复条号；案例页的关联法条用条文正式条号', async () => {
  const article = await html('/d/patent-law/11');
  assert.equal(article.status, 200);
  const strip = article.body.match(/<h2>相关指导性案例<\/h2>[\s\S]*?<\/section>/);
  assert.ok(strip, '条文页应有相关指导性案例区');
  assert.ok(strip[0].includes('指导案例 20 号'), '应列出相关指导性案例');
  assert.ok(
    !/第\s*[0-9〇零一二三四五六七八九十百千]+\s*条/.test(strip[0]),
    '当前条文已在页面标题里，案例列表不必再逐条重复条号（也避免“第十一条 / 第11条”混排）',
  );

  const detail = await html('/case/guiding-159');
  assert.equal(detail.status, 200);
  const aside = detail.body.slice(detail.body.indexOf('case-side'), detail.body.indexOf('</aside>'));
  assert.ok(aside.includes('>第十一条</a>'), '关联法条的链接文字应使用条文正式条号');
  assert.ok(!/第11条/.test(aside), '不应照抄案例原文里的阿拉伯条号');
});

test('页脚：语料仓库、本项目仓库与构建提交都给出链接', async () => {
  const r = await html('/');
  assert.equal(r.status, 200);
  const foot = r.body.slice(r.body.indexOf('site-footer'), r.body.indexOf('</footer>'));
  assert.ok(
    foot.includes('<a href="https://github.com/lttxzmj/chinese-law-corpus"') && foot.includes('>chinese-law-corpus</a>'),
    '语料名应链接到上游仓库',
  );
  assert.ok(foot.includes('（中国法律法规与案例结构化语料库）'), '中文语料名应保留在链接之外');
  assert.ok(foot.includes('href="https://github.com/Endxcher-oss/law-study-platform"'), '页脚应有本项目仓库链接');
  assert.ok(foot.includes('>源码</a>'), '本项目仓库的链接文字就是“源码”两个字（不露出长地址）');
  const commit = foot.match(/href="https:\/\/github\.com\/Endxcher-oss\/law-study-platform\/commit\/([0-9a-f]{7,40})"/);
  assert.ok(commit, '页脚应把构建提交链到对应 commit（需要构建时有 git 信息）');
  assert.ok(!foot.includes('部文件'), '页脚不再重复收录计数（收录情况放在“关于数据”页）');

  const about = await html('/about');
  assert.equal(about.status, 200);
  assert.ok(/本平台源码以 MIT 许可发布/.test(about.body), '“关于数据”页应说明源码许可');
});

test('裁判文书：导航位于“指导性案例”与“关于数据”之间，列表页与详情页可用且不链接条文', async () => {
  const home = await html('/');
  const nav = home.body.slice(home.body.indexOf('site-nav'), home.body.indexOf('</nav>'));
  const order = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(order, ['首页', '编 / 门类', '疑难注解', '指导性案例', '裁判文书', '关于数据'], '顶部导航顺序');

  const list = await html('/gazettes');
  assert.equal(list.status, 200);
  assert.match(list.body, /共 \d+ 件（\d{4}–\d{4} 年）/, '列表页应给出件数与年份区间');
  assert.match(list.body, /href="\/gazette\/[\w-]+"/, '列表应链到详情页');
  assert.match(list.body, /不与法条建立条文级关联/, '列表页应写明不与条文关联');
  assert.match(list.body, /<input type="hidden" name="gazette" value="1">/, '列表页的检索表单应带上 gazette=1');
  assert.ok(!/href="\/d\//.test(list.body.slice(list.body.indexOf('class="results"'))), '列表不应链接到条文');

  const firstId = list.body.match(/href="\/gazette\/([\w-]+)"/)[1];
  const detail = await html(`/gazette/${firstId}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.includes('文书全文'), '详情页应有文书全文');
  assert.ok(detail.body.includes('《最高人民法院公报》'), '详情页应标注公报期号');
  assert.ok(!/href="\/d\/[\w-]+/.test(detail.body), '详情页不链接到条文（独立收录）');
  assert.ok(/href="https?:\/\/gongbao\.court\.gov\.cn/.test(detail.body), '详情页应给出公报原文链接');

  const missing = await html('/gazette/nope');
  assert.equal(missing.status, 404);
  assert.match(missing.body, /未收录该裁判文书/);
});

test('检索：只在勾选“只搜索裁判文书”时检索裁判文书，且此时仅返回裁判文书', async () => {
  const normal = await html('/search?q=%E4%B8%93%E5%88%A9');
  assert.equal(normal.status, 200);
  assert.ok(normal.body.includes('只搜索裁判文书'), '检索表单应有该复选框');
  assert.ok(!normal.body.includes('name="gazette" value="1" checked'), '默认不勾选');
  const normalResults = normal.body.slice(normal.body.indexOf('class="results"'));
  assert.ok(!/href="\/gazette\//.test(normalResults), '默认结果不含裁判文书');
  assert.match(normal.body, /只看有注解的条文/);

  const only = await html('/search?q=%E4%B8%93%E5%88%A9&gazette=1');
  assert.equal(only.status, 200);
  assert.ok(only.body.includes('name="gazette" value="1" checked'), '勾选状态应回显');
  assert.match(only.body, /篇裁判文书/, '结果计数应说“篇裁判文书”');
  assert.match(only.body, /· 仅裁判文书/, '结果行应标明仅裁判文书');
  const onlyResults = only.body.slice(only.body.indexOf('class="results"'));
  assert.ok(/href="\/gazette\//.test(onlyResults), '应命中裁判文书');
  assert.ok(!/href="\/d\/[\w-]+/.test(onlyResults), '勾选后不应出现条文结果');
  assert.ok(!/class="callout direct-hit"/.test(only.body), '裁判文书模式不做“直接定位条文”');
});

test('API：/api/gazettes 列表与详情，/api/search 支持 gazette=1', async () => {
  const list = await (await fetch(`${BASE}/api/gazettes?size=5`)).json();
  assert.equal(list.ok, true);
  assert.equal(list.total, 445);
  assert.equal(list.items.length, 5);
  assert.ok(list.items.every((g) => g.id && g.caseNumber && g.court && g.docType));

  const byYear = await (await fetch(`${BASE}/api/gazettes?year=2003`)).json();
  assert.equal(byYear.total, 4);

  const one = await (await fetch(`${BASE}/api/gazettes/${list.items[0].id}`)).json();
  assert.equal(one.gazette.id, list.items[0].id);
  assert.ok(Array.isArray(one.gazette.body) && one.gazette.body.length > 0);

  const normal = await (await fetch(`${BASE}/api/search?q=%E4%B8%93%E5%88%A9&size=3`)).json();
  assert.ok(normal.items.every((r) => r.kind !== 'gazette'));
  const only = await (await fetch(`${BASE}/api/search?q=%E4%B8%93%E5%88%A9&gazette=1&size=3`)).json();
  assert.equal(only.gazetteOnly, true);
  assert.ok(only.items.every((r) => r.kind === 'gazette'));
});
