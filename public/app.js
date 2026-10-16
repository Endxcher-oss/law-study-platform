/* 前端交互（渐进增强，禁用 JS 也不影响阅读） */

(function () {
  'use strict';

  (function () {
    var btn = document.querySelector('.to-top');
    if (!btn) return;
    var ticking = false;
    var update = function () {
      ticking = false;
      btn.classList.toggle('is-hidden', window.scrollY < 400);
    };
    update();
    window.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  })();

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.js-copy');
    if (!btn) return;
    var sel = btn.getAttribute('data-target');
    var node = sel ? document.querySelector(sel) : null;
    if (!node) return;
    var text = node.innerText.replace(/\n{2,}/g, '\n').trim();
    var done = function (ok) {
      var old = btn.textContent;
      btn.textContent = ok ? '已复制 ✓' : '复制失败';
      setTimeout(function () { btn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
  });

  document.querySelectorAll('.search-filters select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var form = sel.closest('form');
      if (form) form.submit();
    });
  });
  document.querySelectorAll('.search-filters input[type=checkbox]').forEach(function (box) {
    box.addEventListener('change', function () {
      var form = box.closest('form');
      if (form) form.submit();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      var box = document.querySelector('.header-search input[type=search], .search-row input[type=search]');
      if (box) { e.preventDefault(); box.focus(); box.select(); }
    }
    if (e.key === 'Escape' && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
  });

  document.querySelectorAll('.header-search').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var box = form.querySelector('input[name=q]');
      if (box && !box.value.trim()) {
        e.preventDefault();
        location.assign('/search');
      }
    });
  });

  var hash = location.hash;
  if (hash && hash.indexOf('#a') === 0) {
    var el = document.querySelector(hash);
    if (el) {
      el.style.background = 'var(--accent-bg)';
      el.style.borderRadius = '6px';
    }
  }

  var panel = document.querySelector('.toc-panel');
  var tree = document.querySelector('.section-tree');

  function nodeByIndex(idx) {
    if (!tree) return null;
    var nodes = tree.querySelectorAll('li[data-idx][data-count]');
    var best = null;
    for (var i = 0; i < nodes.length; i++) {
      var from = Number(nodes[i].dataset.idx);
      var count = Number(nodes[i].dataset.count);
      if (idx < from || idx >= from + count) continue;
      if (!best || count <= Number(best.dataset.count)) best = nodes[i];
    }
    return best;
  }

  function keepInPanel(node) {
    if (!panel || !node) return;
    var nr = node.getBoundingClientRect();
    var pr = panel.getBoundingClientRect();
    if (nr.top < pr.top + 8 || nr.bottom > pr.bottom - 8) {
      panel.scrollTop += nr.top - pr.top - panel.clientHeight / 2 + nr.height / 2;
    }
  }

  function reveal(idx, follow) {
    var node = nodeByIndex(idx);
    if (!node) return;
    for (var d = node.parentElement; d && d !== tree.parentElement; d = d.parentElement) {
      if (d.tagName === 'DETAILS') d.open = true;
    }
    if (follow) keepInPanel(node);
    if (tree.dataset.at === node.dataset.idx) return;
    tree.dataset.at = node.dataset.idx;
    tree.querySelectorAll('a.is-current').forEach(function (a) { a.classList.remove('is-current'); });
    tree.querySelectorAll('a.is-on-path').forEach(function (a) { a.classList.remove('is-on-path'); });
    var link = node.querySelector('a');
    if (link) link.classList.add('is-current');
    for (var p = node.parentElement; p && p !== tree.parentElement; p = p.parentElement) {
      if (p.tagName !== 'DETAILS') continue;
      var sum = p.querySelector('summary > a');
      if (sum) sum.classList.add('is-on-path');
    }
  }

  if (tree) {
    var anchored = hash && /^#a[\w-]+$/.test(hash) ? document.getElementById(hash.slice(1)) : null;
    if (anchored && anchored.dataset.idx !== undefined) {
      reveal(Number(anchored.dataset.idx), true);
    } else {
      keepInPanel(tree.querySelector('a.is-current'));
    }

    window.addEventListener('hashchange', function () {
      var h = location.hash;
      if (!h || h.indexOf('#a') !== 0) return;
      var t = document.getElementById(h.slice(1));
      if (t && t.dataset.idx !== undefined) reveal(Number(t.dataset.idx), true);
    });

    var probes = document.querySelectorAll('.toc-article[data-idx]');
    if (probes.length) {
      var ticking = false;
      var spy = function () {
        ticking = false;
        var best = probes[0];
        for (var i = 0; i < probes.length; i++) {
          if (probes[i].getBoundingClientRect().top <= 120) best = probes[i];
          else break;
        }
        reveal(Number(best.dataset.idx), true);
      };
      window.addEventListener('scroll', function () {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(spy);
        }
      }, { passive: true });
    }
  }
})();
