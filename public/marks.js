/* 条文标注：选中条文文字后在浏览器本地记录标注，正文高亮，/marks 汇总。数据存 localStorage，禁用 JS 时隐藏入口。 */

(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var KEY = 'law-study-platform.marks.v1';
  var WIN_KEY = 'law-study-platform.mark-window.v1';
  var doc = root.document || null;
  var editor = null;
  var win = null;
  var current = null;
  var saveTimer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && data.marks && typeof data.marks === 'object') return data;
    } catch (err) { /* 隐私模式或 file:// 限制时退化为空 */ }
    return { version: 1, marks: {} };
  }

  function save(store) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(store));
    } catch (err) { /* 同上 */ }
  }

  function put(store, mark) {
    store.marks[mark.id] = mark;
    save(store);
    return mark;
  }

  function remove(store, id) {
    if (!store.marks[id]) return false;
    delete store.marks[id];
    save(store);
    return true;
  }

  // ---------- Markdown 渲染（白名单，先转义再拼标签） ----------

  function inline(s) {
    var t = esc(s);
    t = t.replace(/`([^`]+)`/g, function (_, c) { return '<code>' + c + '</code>'; });
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, txt, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>';
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return t;
  }

  function mdToHtml(md) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var list = null;
    var inCode = false;
    var code = [];

    function closeList() {
      if (list) {
        out.push('</' + list + '>');
        list = null;
      }
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (/^```/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
          code = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        code.push(line);
        continue;
      }
      if (!line.trim()) {
        closeList();
        continue;
      }
      var m = line.match(/^(#{1,3})\s+(.*)$/);
      if (m) {
        closeList();
        var level = m[1].length + 1;
        out.push('<h' + level + '>' + inline(m[2]) + '</h' + level + '>');
        continue;
      }
      m = line.match(/^>\s?(.*)$/);
      if (m) {
        closeList();
        out.push('<blockquote>' + inline(m[1]) + '</blockquote>');
        continue;
      }
      m = line.match(/^\s*[-*]\s+(.*)$/);
      if (m) {
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        out.push('<li>' + inline(m[1]) + '</li>');
        continue;
      }
      m = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (m) {
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push('<li>' + inline(m[1]) + '</li>');
        continue;
      }
      closeList();
      out.push('<p>' + inline(line) + '</p>');
    }
    if (inCode) out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
    closeList();
    return out.join('');
  }

  // ---------- 编辑器 HTML -> Markdown ----------

  function inlineMd(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var inner = Array.prototype.map.call(node.childNodes, inlineMd).join('');
    if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return '*' + inner + '*';
    if (tag === 'code') return '`' + inner + '`';
    if (tag === 'a') return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
    if (tag === 'br') return '\n';
    return inner;
  }

  function serialize(container) {
    var out = [];
    Array.prototype.forEach.call(container.childNodes, function (node) {
      if (node.nodeType === 3) {
        var t = node.nodeValue.trim();
        if (t) out.push(inlineMd(node));
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      var inner = Array.prototype.map.call(node.childNodes, inlineMd).join('').trim();
      if (!inner && tag !== 'br') return;
      if (tag === 'h1') out.push('# ' + inner);
      else if (tag === 'h2') out.push('## ' + inner);
      else if (tag === 'h3') out.push('### ' + inner);
      else if (tag === 'blockquote') out.push('> ' + inner);
      else if (tag === 'pre') out.push('```\n' + node.textContent.replace(/\n+$/, '') + '\n```');
      else if (tag === 'ul' || tag === 'ol') {
        var i = 0;
        Array.prototype.forEach.call(node.querySelectorAll('li'), function (li) {
          i += 1;
          var item = Array.prototype.map.call(li.childNodes, inlineMd).join('').trim();
          if (item) out.push((tag === 'ol' ? i + '. ' : '- ') + item);
        });
      } else out.push(inner);
    });
    return out.join('\n\n');
  }

  // ---------- 定位 ----------

  function resolveAnchor(text, mark) {
    var quote = String(mark.quote || '');
    if (!quote) return null;
    if (typeof mark.start === 'number' && text.slice(mark.start, mark.start + quote.length) === quote) {
      return { start: mark.start, end: mark.start + quote.length };
    }
    var at = -1;
    if (mark.prefix) at = text.indexOf(mark.prefix + quote);
    if (at >= 0) {
      var s = at + mark.prefix.length;
      return { start: s, end: s + quote.length };
    }
    at = text.indexOf(quote);
    if (at >= 0) return { start: at, end: at + quote.length };
    return null;
  }

  function mergeSpans(spans) {
    spans.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var merged = [];
    spans.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && s.start < last.end) {
        last.end = Math.max(last.end, s.end);
        if (last.ids.indexOf(s.ids[0]) < 0) last.ids.push(s.ids[0]);
      } else {
        merged.push({ start: s.start, end: s.end, ids: s.ids.slice() });
      }
    });
    return merged;
  }

  function applyHighlights(el, marks) {
    var paras = Array.prototype.slice.call(el.querySelectorAll('p.para'));
    if (!paras.length) return;
    var text = paras.map(function (p) { return p.textContent; }).join('');
    var spans = [];
    marks.forEach(function (m) {
      var hit = resolveAnchor(text, m);
      if (!hit) return;
      spans.push({ start: hit.start, end: hit.end, ids: [m.id] });
    });
    var merged = mergeSpans(spans);
    var lineStart = 0;
    paras.forEach(function (p) {
      var pt = p.textContent;
      var lineEnd = lineStart + pt.length;
      var local = merged.filter(function (s) { return s.end > lineStart && s.start < lineEnd; });
      var out = '';
      var pos = 0;
      local.forEach(function (s) {
        var a = Math.max(0, s.start - lineStart);
        var b = Math.min(pt.length, s.end - lineStart);
        if (b <= pos) return;
        a = Math.max(a, pos);
        out += esc(pt.slice(pos, a));
        out += '<mark class="user-mark" data-mark-id="' + s.ids[0] + '" data-mark-ids="' + s.ids.join(',') + '">' + esc(pt.slice(a, b)) + '</mark>';
        pos = b;
      });
      out += esc(pt.slice(pos));
      p.innerHTML = out;
      lineStart = lineEnd;
    });
  }

  // ---------- 汇总 ----------

  function groupMarks(store) {
    var by = {};
    Object.keys(store.marks).forEach(function (id) {
      var m = store.marks[id];
      var key = m.articleId || (m.docId + ':' + m.number);
      var row = by[key];
      if (!row) {
        row = by[key] = { articleId: key, docId: m.docId, law: m.law, number: m.number, slug: m.slug, category: m.category, count: 0, updatedAt: 0 };
      } else {
        ['docId', 'law', 'number', 'slug', 'category'].forEach(function (field) {
          if (!row[field] && m[field]) row[field] = m[field];
        });
      }
      row.count += 1;
      row.updatedAt = Math.max(row.updatedAt, m.updatedAt || 0);
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  // 删除拿不到条文链接的记录（早期版本或异常状态留下的空壳）。
  function pruneMarks(store) {
    var removed = 0;
    Object.keys(store.marks).forEach(function (id) {
      var m = store.marks[id];
      if (!m || !m.docId || !m.slug) {
        delete store.marks[id];
        removed += 1;
      }
    });
    if (removed) save(store);
    return removed;
  }

  function sortMarks(rows, mode) {
    var list = rows.slice();
    list.sort(function (a, b) {
      if (mode === 'recent') {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        return b.count - a.count || String(a.law).localeCompare(String(b.law), 'zh');
      }
      return b.count - a.count || String(a.law).localeCompare(String(b.law), 'zh') || String(a.number).localeCompare(String(b.number), 'zh');
    });
    return list;
  }

  // ---------- 链接 ----------

  function articleHref(docId, slug) {
    var path = '/d/' + encodeURIComponent(docId) + '/' + encodeURIComponent(slug);
    if (root.__DSH_PORTABLE) return '#' + path;
    var base = doc && doc.body && doc.body.dataset ? doc.body.dataset.base || '' : '';
    return base + path;
  }

  // ---------- 编辑窗口 ----------

  function geometry() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(WIN_KEY);
      var g = raw ? JSON.parse(raw) : null;
      if (g && typeof g.width === 'number') return g;
    } catch (err) { /* ignore */ }
    return null;
  }

  function saveGeometry() {
    if (!win) return;
    try {
      root.localStorage.setItem(WIN_KEY, JSON.stringify({
        left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight,
      }));
    } catch (err) { /* ignore */ }
  }

  function ensureWindow() {
    if (win && win.isConnected) return;
    win = null;
    win = doc.createElement('div');
    win.className = 'mark-window';
    win.hidden = true;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', '条文标注');
    win.innerHTML = [
      '<div class="mark-win-head" data-mark-drag>',
      '<span class="mark-win-title">标注</span>',
      '<span class="mark-win-hint">拖动标题栏移动 · 右下角缩放</span>',
      '<button type="button" class="mark-close" aria-label="关闭">×</button>',
      '</div>',
      '<div class="mark-toolbar" role="toolbar" aria-label="排版工具">',
      '<button type="button" class="mark-tool" data-cmd="bold" title="粗体">B</button>',
      '<button type="button" class="mark-tool" data-cmd="italic" title="斜体"><i>I</i></button>',
      '<button type="button" class="mark-tool" data-cmd="h2" title="标题">H</button>',
      '<button type="button" class="mark-tool" data-cmd="ul" title="无序列表">•</button>',
      '<button type="button" class="mark-tool" data-cmd="ol" title="有序列表">1.</button>',
      '<button type="button" class="mark-tool" data-cmd="quote" title="引用">❝</button>',
      '<button type="button" class="mark-tool" data-cmd="code" title="行内代码">&lt;/&gt;</button>',
      '<button type="button" class="mark-tool" data-cmd="pre" title="代码块">{ }</button>',
      '<button type="button" class="mark-tool" data-cmd="link" title="链接">↗</button>',
      '<span class="mark-tool-sep"></span>',
      '<button type="button" class="mark-tool" data-cmd="undo" title="撤销">↶</button>',
      '<button type="button" class="mark-tool" data-cmd="redo" title="重做">↷</button>',
      '</div>',
      '<div class="mark-editor" contenteditable="true" data-placeholder="写点什么……" aria-label="标注内容"></div>',
      '<div class="mark-win-foot"><span class="mark-status" data-mark-status></span>',
      '<button type="button" class="mark-delete" data-mark-delete>删除标注</button></div>',
    ].join('');
    doc.body.appendChild(win);
    editor = win.querySelector('.mark-editor');

    win.addEventListener('focusin', function () { win.classList.add('is-focused'); });
    win.addEventListener('focusout', function () {
      root.setTimeout(function () {
        if (win && !win.contains(doc.activeElement)) win.classList.remove('is-focused');
      }, 0);
    });
    win.querySelector('.mark-close').addEventListener('click', closeEditor);
    win.querySelector('[data-mark-delete]').addEventListener('click', deleteCurrent);
    editor.addEventListener('input', function () { scheduleSave(); updateTools(); });
    editor.addEventListener('keyup', updateTools);
    editor.addEventListener('mouseup', updateTools);
    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeEditor(); }
    });

    win.querySelectorAll('.mark-tool').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        runCommand(btn.getAttribute('data-cmd'));
      });
    });

    var head = win.querySelector('[data-mark-drag]');
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      var startX = e.clientX;
      var startY = e.clientY;
      var left = win.offsetLeft;
      var top = win.offsetTop;
      function move(ev) {
        win.style.left = Math.max(0, Math.min(root.innerWidth - 80, left + ev.clientX - startX)) + 'px';
        win.style.top = Math.max(0, Math.min(root.innerHeight - 40, top + ev.clientY - startY)) + 'px';
      }
      function up() {
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        saveGeometry();
      }
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
    });

    if (root.ResizeObserver) {
      new root.ResizeObserver(function () { if (win && !win.hidden) saveGeometry(); }).observe(win);
    }
  }

  function runCommand(name) {
    if (!editor) return;
    editor.focus();
    var sel = root.getSelection();
    if (name === 'bold' || name === 'italic' || name === 'undo' || name === 'redo') {
      doc.execCommand(name, false, null);
    } else if (name === 'h2' || name === 'quote' || name === 'pre') {
      var tag = name === 'quote' ? 'blockquote' : name;
      doc.execCommand('formatBlock', false, toggleTarget(blockNode(sel), tag));
    } else if (name === 'ul') {
      doc.execCommand('insertUnorderedList', false, null);
    } else if (name === 'ol') {
      doc.execCommand('insertOrderedList', false, null);
    } else if (name === 'code') {
      toggleInlineCode(sel);
    } else if (name === 'link') {
      var url = root.prompt('链接地址（http 或 https）', 'https://');
      if (url && /^https?:\/\//i.test(url)) doc.execCommand('createLink', false, url);
    }
    scheduleSave();
    updateTools();
  }

  function blockNode(sel) {
    if (!sel || !sel.rangeCount || !editor) return null;
    var node = sel.getRangeAt(0).startContainer;
    node = node.nodeType === 3 ? node.parentNode : node;
    return node && editor.contains(node) ? node : null;
  }

  function toggleTarget(node, tag) {
    return node && node.closest && node.closest(tag) ? 'p' : tag;
  }

  function toggleInlineCode(sel) {
    var node = blockNode(sel);
    var code = node && node.closest && node.closest('code');
    if (code && !code.closest('pre')) {
      var parent = code.parentNode;
      while (code.firstChild) parent.insertBefore(code.firstChild, code);
      parent.removeChild(code);
      return;
    }
    var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range || range.collapsed) return;
    var el = doc.createElement('code');
    try { range.surroundContents(el); } catch (err) { /* 跨节点时跳过 */ }
  }

  function toolFlags(node, commandState) {
    var inPre = !!(node && node.closest && node.closest('pre'));
    var closest = function (sel) { return !!(node && node.closest && node.closest(sel)); };
    return {
      bold: !!commandState('bold'),
      italic: !!commandState('italic'),
      ul: !!commandState('insertUnorderedList'),
      ol: !!commandState('insertOrderedList'),
      h2: closest('h2'),
      quote: closest('blockquote'),
      pre: inPre,
      code: !inPre && closest('code'),
      link: closest('a'),
    };
  }

  function updateTools() {
    if (!win || win.hidden || !editor) return;
    var sel = root.getSelection && root.getSelection();
    var node = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
    var host = node && node.nodeType === 3 ? node.parentNode : node;
    var inside = !!(host && editor.contains(host));
    var flags = inside ? toolFlags(host, function (cmd) {
      try { return doc.queryCommandState(cmd); } catch (err) { return false; }
    }) : {};
    win.querySelectorAll('.mark-tool').forEach(function (btn) {
      var active = !!flags[btn.getAttribute('data-cmd')];
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function scheduleSave() {
    setStatus('正在保存…');
    if (saveTimer) root.clearTimeout(saveTimer);
    saveTimer = root.setTimeout(saveCurrent, 600);
  }

  function setStatus(text) {
    var node = win && win.querySelector('[data-mark-status]');
    if (node) node.textContent = text;
  }

  function saveCurrent() {
    if (!current || !editor) return;
    if (saveTimer) { root.clearTimeout(saveTimer); saveTimer = null; }
    var body = serialize(editor).trim();
    var store = load();
    var m = current.mark;
    if (!m.id) {
      m.id = uid();
      m.createdAt = Date.now();
    }
    m.body = body;
    m.updatedAt = Date.now();
    put(store, m);
    current.mark = m;
    setStatus(body ? '已自动保存' : '空标注，仍会高亮');
    refreshPage();
  }

  function deleteCurrent() {
    if (saveTimer) { root.clearTimeout(saveTimer); saveTimer = null; }
    if (!current) { if (win) win.hidden = true; return; }
    var store = load();
    if (current.mark.id) remove(store, current.mark.id);
    current = null;
    if (win) { win.hidden = true; win.classList.remove('is-focused'); }
    refreshPage();
  }

  function closeEditor() {
    saveCurrent();
    if (win) win.hidden = true;
    current = null;
    refreshPage();
  }

  function openEditor(mark, rect) {
    if (current) saveCurrent();
    ensureWindow();
    current = { mark: mark };
    editor.innerHTML = mark.body ? mdToHtml(mark.body) : '';
    setStatus('自动保存');
    var g = geometry();
    win.style.left = Math.max(8, Math.min(root.innerWidth - 320, (g ? g.left : rect.left))) + 'px';
    win.style.top = Math.max(8, Math.min(root.innerHeight - 240, (g ? g.top : rect.bottom + 10))) + 'px';
    win.style.width = (g ? g.width : 380) + 'px';
    win.style.height = (g ? g.height : 280) + 'px';
    win.hidden = false;
    win.classList.add('is-focused');
    editor.focus();
    updateTools();
  }

  function articleContext(el) {
    return {
      articleId: el.getAttribute('data-article-id') || '',
      docId: el.getAttribute('data-doc-id') || '',
      law: el.getAttribute('data-law') || '',
      number: el.getAttribute('data-number') || '',
      slug: el.getAttribute('data-slug') || '',
      date: el.getAttribute('data-date') || '',
      category: el.getAttribute('data-category') || '',
    };
  }

  // ---------- 条文页 ----------

  function selectionInfo(el) {
    var sel = root.getSelection && root.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
    var pre = doc.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    var start = pre.toString().length;
    var quote = range.toString();
    if (!quote.trim()) return null;
    var text = el.textContent || '';
    return {
      start: start,
      end: start + quote.length,
      quote: quote,
      prefix: text.slice(Math.max(0, start - 20), start),
      suffix: text.slice(start + quote.length, start + quote.length + 20),
      rect: range.getBoundingClientRect(),
    };
  }

  function refreshArticle(el) {
    var ctx = articleContext(el);
    var store = load();
    var marks = Object.keys(store.marks).map(function (id) { return store.marks[id]; }).filter(function (m) {
      return m.articleId === ctx.articleId;
    });
    applyHighlights(el, marks);
  }

  var selectionUpdate = null;

  function initArticle() {
    if (selectionUpdate) {
      doc.removeEventListener('selectionchange', selectionUpdate);
      doc.removeEventListener('mouseup', selectionUpdate);
      selectionUpdate = null;
    }
    var el = doc.getElementById('article-text');
    var btn = doc.getElementById('mark-pencil');
    if (!el || !btn) return;
    var fine = !root.matchMedia || root.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    btn.hidden = false;
    var pending = null;

    function update() {
      pending = selectionInfo(el);
      btn.classList.toggle('is-ready', !!pending);
    }
    doc.addEventListener('selectionchange', update);
    doc.addEventListener('mouseup', update);
    selectionUpdate = update;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      update();
      if (!selectionInfo(el)) return;
      var hit = selectionInfo(el);
      var ctx = articleContext(el);
      var mark = {
        id: uid(),
        articleId: ctx.articleId, docId: ctx.docId, law: ctx.law, number: ctx.number,
        slug: ctx.slug, date: ctx.date, category: ctx.category,
        quote: hit.quote, prefix: hit.prefix, suffix: hit.suffix, start: hit.start, end: hit.end,
        body: '', createdAt: Date.now(), updatedAt: Date.now(),
      };
      put(load(), mark);
      refreshArticle(el);
      openEditor(mark, hit.rect);
    });

    el.addEventListener('click', function (e) {
      var mk = e.target.closest('mark.user-mark');
      if (!mk) return;
      var id = mk.getAttribute('data-mark-id');
      var store = load();
      var mark = store.marks[id];
      if (!mark) return;
      openEditor(mark, mk.getBoundingClientRect());
    });

    refreshArticle(el);
  }

  // ---------- 标注页 ----------

  var CATEGORY_CLASS = {
    '宪法': 'cat-constitution', '法律': 'cat-law', '行政法规': 'cat-regulation',
    '司法解释': 'cat-interpretation', '指导性案例': 'cat-case', '裁判文书': 'cat-gazette',
  };

  function catBadge(category) {
    return '<span class="badge ' + (CATEGORY_CLASS[category] || 'cat-other') + '">' + esc(category || '其他') + '</span>';
  }

  function renderMarksPage() {
    var page = doc.querySelector('[data-marks-page]');
    if (!page) return;
    var store = load();
    var rows = groupMarks(store);
    var list = page.querySelector('[data-marks-list]');
    var empty = page.querySelector('[data-marks-empty]');
    var count = page.querySelector('[data-marks-count]');
    var head = page.querySelector('[data-marks-head]');
    var select = page.querySelector('[data-marks-sort]');
    var mode = select ? select.value : 'count';
    var sorted = sortMarks(rows, mode);
    var total = Object.keys(store.marks).length;

    if (!rows.length) {
      empty.hidden = false;
      head.hidden = true;
      list.innerHTML = '';
      return;
    }
    empty.hidden = true;
    head.hidden = false;
    count.textContent = total + ' 处标注 · ' + rows.length + ' 条条文';
    list.innerHTML = sorted.map(function (r) {
      var title = r.law || r.number ? esc(r.law) + ' ' + esc(r.number) : esc(r.docId) + ' 第' + esc(r.slug) + '条';
      return '<li class="tag-article">' + catBadge(r.category) +
        '<a class="tag-article-title" href="' + articleHref(r.docId, r.slug) + '">' + title + '</a>' +
        '<span class="tag-article-date">' + r.count + ' 处标注</span></li>';
    }).join('');
  }

  function initMarksPage() {
    var page = doc.querySelector('[data-marks-page]');
    if (!page) return;
    renderMarksPage();
    var select = page.querySelector('[data-marks-sort]');
    if (select) select.addEventListener('change', renderMarksPage);
  }

  function refreshPage() {
    var el = doc && doc.getElementById('article-text');
    if (el) refreshArticle(el);
    renderMarksPage();
  }

  function boot() {
    if (!doc) return;
    pruneMarks(load());
    doc.addEventListener('selectionchange', updateTools);
    initArticle();
    initMarksPage();
    root.addEventListener('dsh:rendered', function () {
      initArticle();
      initMarksPage();
    });
    root.addEventListener('storage', renderMarksPage);
  }

  var api = {
    KEY: KEY,
    mdToHtml: mdToHtml,
    serialize: serialize,
    resolveAnchor: resolveAnchor,
    mergeSpans: mergeSpans,
    load: load,
    save: save,
    put: put,
    remove: remove,
    groupMarks: groupMarks,
    pruneMarks: pruneMarks,
    toolFlags: toolFlags,
    toggleTarget: toggleTarget,
    sortMarks: sortMarks,
    uid: uid,
  };

  root.LawMarks = api;

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
