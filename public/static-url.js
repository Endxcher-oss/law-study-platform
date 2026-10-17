/**
 * 静态站点（GitHub Pages）的站内链接改写：给服务端渲染出的绝对路径加上部署前缀（如 /law-study-platform）。
 * 导出脚本与浏览器端增强脚本共用同一份实现，避免两边口径漂移。用法见 docs/deploy.md。
 */

const ATTR = /\b(href|src|action)="(\/(?!\/)[^"]*)"/g;

export function rebaseUrl(url, base) {
  return url.startsWith('/') && !url.startsWith('//') ? `${base}${url}` : url;
}

export function rebaseHtml(html, base) {
  if (!base) return String(html);
  return String(html)
    .replace(ATTR, (m, attr, url) => `${attr}="${base}${url}"`)
    .replace('<body>', `<body data-base="${base}">`);
}
