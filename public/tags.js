/* 用户标签：条文页右侧标签区块与 /tags 标签集合页。数据存在浏览器 localStorage，禁用 JS 时隐藏。 */

(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  var KEY = 'law-study-platform.tags.v1';
  var MAX = 15;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(raw) {
    var chars = Array.from(String(raw == null ? '' : raw).trim());
    var s = chars.slice(0, MAX).join('').trim();
    return s;
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && data.articles && typeof data.articles === 'object') return data;
    } catch (err) { /* 隐私模式或 file:// 限制时退化为空 */ }
    return { articles: {} };
  }

  function save(store) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(store));
    } catch (err) { /* 同上 */ }
  }

  function ensure(store, meta) {
    var e = store.articles[meta.id];
    if (!e) {
      e = {
        id: meta.id,
        docId: meta.docId || '',
        law: meta.law || '',
        number: meta.number || '',
        slug: meta.slug || '',
        date: meta.date || '',
        category: meta.category || '',
        tags: [],
        updatedAt: 0,
      };
      store.articles[meta.id] = e;
    }
    return e;
  }

  function addTag(store, meta, name) {
    var n = normalize(name);
    if (!n) return false;
    var e = ensure(store, meta);
    if (e.tags.some(function (t) { return t.name === n; })) return false;
    e.tags.push({ name: n, at: Date.now() });
    e.updatedAt = Date.now();
    save(store);
    return true;
  }

  function removeTag(store, id, name) {
    var e = store.articles[id];
    if (!e) return false;
    e.tags = e.tags.filter(function (t) { return t.name !== name; });
    if (!e.tags.length) delete store.articles[id];
    else e.updatedAt = Date.now();
    save(store);
    return true;
  }

  function renameTag(store, id, oldName, newName) {
    var n = normalize(newName);
    if (!n || !store.articles[id]) return false;
    if (n === oldName) return false;
    var e = store.articles[id];
    if (e.tags.some(function (t) { return t.name === n; })) {
      e.tags = e.tags.filter(function (t) { return t.name !== oldName; });
    } else {
      var hit = e.tags.filter(function (t) { return t.name === oldName; })[0];
      if (!hit) return false;
      hit.name = n;
    }
    e.updatedAt = Date.now();
    save(store);
    return true;
  }

  function formatTime(ts) {
    var d = new Date(ts || 0);
    if (!ts || isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var CATEGORY_CLASS = {
    '宪法': 'cat-constitution',
    '法律': 'cat-law',
    '行政法规': 'cat-regulation',
    '司法解释': 'cat-interpretation',
    '指导性案例': 'cat-case',
    '裁判文书': 'cat-gazette',
  };

  function categoryBadge(category) {
    if (!category) return '';
    return '<span class="badge ' + (CATEGORY_CLASS[category] || 'cat-other') + '">' + esc(category) + '</span>';
  }

  function touchMeta(store, meta) {
    var e = store.articles[meta.id];
    if (!e) return;
    var changed = false;
    ['docId', 'law', 'number', 'slug', 'date', 'category'].forEach(function (k) {
      if (meta[k] && e[k] !== meta[k]) { e[k] = meta[k]; changed = true; }
    });
    if (changed) save(store);
  }

  function entries(store) {
    return Object.keys(store.articles)
      .map(function (k) { return store.articles[k]; })
      .filter(function (e) { return e.tags && e.tags.length; });
  }

  function counts(store) {
    var map = {};
    entries(store).forEach(function (e) {
      e.tags.forEach(function (t) {
        var c = map[t.name];
        if (!c) map[t.name] = c = { name: t.name, count: 0, lastAt: 0 };
        c.count += 1;
        c.lastAt = Math.max(c.lastAt, t.at || 0);
      });
    });
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'zh'); });
  }

  function filterEntries(store, selected) {
    var list = entries(store);
    if (!selected.length) return list;
    return list.filter(function (e) {
      return selected.every(function (n) {
        return e.tags.some(function (t) { return t.name === n; });
      });
    });
  }

  function sortEntries(list, mode) {
    var out = list.slice();
    var cmp;
    if (mode === 'recent') {
      cmp = function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); };
    } else if (mode === 'date') {
      cmp = function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); };
    } else if (mode === 'title') {
      cmp = function (a, b) { return (a.law + a.number).localeCompare(b.law + b.number, 'zh'); };
    } else {
      cmp = function (a, b) {
        return b.tags.length - a.tags.length || (b.updatedAt || 0) - (a.updatedAt || 0) || (a.law + a.number).localeCompare(b.law + b.number, 'zh');
      };
    }
    return out.sort(cmp);
  }

  root.LawTags = {
    KEY: KEY,
    MAX: MAX,
    formatTime: formatTime,
    normalize: normalize,
    load: load,
    save: save,
    addTag: addTag,
    removeTag: removeTag,
    renameTag: renameTag,
    entries: entries,
    counts: counts,
    filterEntries: filterEntries,
    sortEntries: sortEntries,
  };

  if (typeof document === 'undefined') return;

  var state = { selected: [], sort: 'count' };

  function base() {
    if (root.__DSH_PORTABLE) return '#';
    var b = document.body && document.body.dataset ? document.body.dataset.base : '';
    return b || '';
  }

  function articleHref(e) {
    return base() + '/d/' + encodeURIComponent(e.docId) + '/' + encodeURIComponent(e.slug);
  }

  function metaOf(block) {
    return {
      id: block.getAttribute('data-article-id') || '',
      docId: block.getAttribute('data-doc-id') || '',
      law: block.getAttribute('data-law') || '',
      number: block.getAttribute('data-number') || '',
      slug: block.getAttribute('data-slug') || '',
      date: block.getAttribute('data-date') || '',
      category: block.getAttribute('data-category') || '',
    };
  }

  function tagItem(name) {
    return (
      '<span class="tag-item" data-name="' + esc(name) + '"><button type="button" class="chip user-tag" data-name="' + esc(name) + '" title="点击编辑标签">' + esc(name) + '</button>' +
      '<button type="button" class="tag-del" data-name="' + esc(name) + '" aria-label="删除标签：' + esc(name) + '" title="删除">×</button></span>'
    );
  }

  function renderArticle(block) {
    var store = load();
    var meta = metaOf(block);
    touchMeta(store, meta);
    var entry = store.articles[meta.id];
    var chips = entry && entry.tags.length ? entry.tags.map(function (t) { return tagItem(t.name); }).join('') : '';
    var holder = block.querySelector('[data-tag-chips]');
    if (holder) holder.innerHTML = chips;
    block.hidden = false;
    block.classList.toggle('has-tags', !!chips);
  }

  function startInput(block, oldName) {
    var holder = block.querySelector('[data-tag-chips]');
    if (!holder || block.querySelector('.tag-input')) return;
    if (oldName) {
      var item = holder.querySelector('.tag-item[data-name="' + oldName + '"]');
      var target = item || holder;
      var input = document.createElement('input');
      input.className = 'tag-input';
      input.maxLength = MAX;
      input.value = oldName;
      input.setAttribute('data-old', oldName);
      input.setAttribute('aria-label', '编辑标签');
      if (item) {
        item.innerHTML = '';
        item.appendChild(input);
      } else {
        holder.appendChild(input);
      }
      input.focus();
      input.select();
      return;
    }
    var addBtn = block.querySelector('[data-tag-add]');
    var fresh = document.createElement('input');
    fresh.className = 'tag-input';
    fresh.maxLength = MAX;
    fresh.setAttribute('aria-label', '新标签');
    holder.appendChild(fresh);
    if (addBtn) addBtn.hidden = true;
    fresh.focus();
  }

  function commitInput(input) {
    var block = input.closest('#user-tags');
    if (!block) return;
    var meta = metaOf(block);
    var store = load();
    var oldName = input.getAttribute('data-old');
    var value = normalize(input.value);
    if (!value) {
      cancelInput(input);
      return;
    }
    if (oldName) renameTag(store, meta.id, oldName, value);
    else addTag(store, meta, value);
    renderArticle(block);
    renderTagsPage();
    finishInput(block);
  }

  function cancelInput(input) {
    var block = input.closest('#user-tags');
    if (!block) return;
    renderArticle(block);
    finishInput(block);
  }

  function finishInput(block) {
    var addBtn = block.querySelector('[data-tag-add]');
    if (addBtn) addBtn.hidden = false;
  }

  var pageCategories = null;
  function categoryOf(e) {
    if (e.category) return e.category;
    if (!pageCategories) {
      var page = document.querySelector('[data-tags-page]');
      try { pageCategories = page && page.dataset.categories ? JSON.parse(page.dataset.categories) : {}; } catch (err) { pageCategories = {}; }
    }
    return pageCategories[e.docId] || '';
  }

  function renderTagsPage() {
    var page = document.querySelector('[data-tags-page]');
    if (!page) return;
    var cloud = page.querySelector('[data-tag-cloud]');
    var list = page.querySelector('[data-tag-articles]');
    var count = page.querySelector('[data-tag-count]');
    var empty = page.querySelector('[data-tag-empty]');
    var sortSelect = page.querySelector('[data-tag-sort]');
    if (sortSelect) state.sort = sortSelect.value || state.sort;
    var store = load();
    var cats = counts(store);
    var all = entries(store);
    var names = cats.map(function (c) { return c.name; });
    state.selected = state.selected.filter(function (n) { return names.indexOf(n) >= 0; });

    if (cloud) {
      var chips = ['<button type="button" class="chip' + (state.selected.length ? '' : ' is-active') + '" data-tag-all>全部</button>'];
      cats.forEach(function (c) {
        var active = state.selected.indexOf(c.name) >= 0;
        chips.push('<button type="button" class="chip' + (active ? ' is-active' : '') + '" data-tag="' + esc(c.name) + '">' + esc(c.name) + '<em>' + c.count + '</em></button>');
      });
      cloud.innerHTML = chips.join('');
    }

    if (empty) empty.hidden = all.length > 0;
    var shown = sortEntries(filterEntries(store, state.selected), state.sort);
    if (count) count.textContent = shown.length + ' 条';
    if (list) {
      list.innerHTML = shown
        .map(function (e) {
          return (
            '<li class="tag-article">' + categoryBadge(categoryOf(e)) +
            '<a class="tag-article-title" href="' + articleHref(e) + '">' + esc(e.law) + ' ' + esc(e.number) + '</a>' +
            '<span class="tag-article-date">' + esc(formatTime(e.updatedAt)) + '</span>' +
            '<span class="tag-chips">' + e.tags.map(function (t) { return '<span class="chip is-static">' + esc(t.name) + '</span>'; }).join('') + '</span></li>'
          );
        })
        .join('');
    }
  }

  function mount() {
    document.querySelectorAll('#user-tags').forEach(renderArticle);
    renderTagsPage();
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.user-tag');
    if (chip) {
      var block = chip.closest('#user-tags');
      if (block) startInput(block, chip.getAttribute('data-name'));
      return;
    }
    var del = e.target.closest('.tag-del');
    if (del) {
      var b = del.closest('#user-tags');
      if (!b) return;
      var store = load();
      removeTag(store, metaOf(b).id, del.getAttribute('data-name'));
      renderArticle(b);
      renderTagsPage();
      return;
    }
    var add = e.target.closest('[data-tag-add]');
    if (add) {
      var owner = add.closest('#user-tags');
      if (owner) startInput(owner, '');
      return;
    }
    var cloudChip = e.target.closest('[data-tag-cloud] [data-tag]');
    if (cloudChip) {
      var name = cloudChip.getAttribute('data-tag');
      var i = state.selected.indexOf(name);
      if (i >= 0) state.selected.splice(i, 1);
      else state.selected.push(name);
      renderTagsPage();
      return;
    }
    if (e.target.closest('[data-tag-all]')) {
      state.selected = [];
      renderTagsPage();
    }
  });

  document.addEventListener('keydown', function (e) {
    var input = e.target.closest && e.target.closest('.tag-input');
    if (!input) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInput(input);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInput(input);
    }
  });

  document.addEventListener('focusout', function (e) {
    var input = e.target.closest && e.target.closest('.tag-input');
    if (input) setTimeout(function () { if (document.contains(input)) commitInput(input); }, 120);
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-tag-sort]')) {
      state.sort = e.target.value;
      renderTagsPage();
    }
  });

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('dsh:rendered', mount);
    root.addEventListener('storage', function (e) { if (e.key === KEY) mount(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
