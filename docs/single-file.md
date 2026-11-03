# 单文件离线站点

把整站（页面、样式、检索代码、数据库）打进 **一份 HTML**：拷到别的电脑、断网、双击即可浏览，不需要 Node，也不需要本地服务器。

## 命令

```bash
npm run export:single      # 产物：dist-single/index.html，整库约 11 MB
```

样本导出（只带指定文档，产物约 1 MB，测试用）：

```bash
SINGLE_DOCS=civil-code SINGLE_SKIP_CASES=1 SINGLE_OUT=/tmp/sample.html node scripts/export-single.js
```

| 环境变量 | 作用 |
| --- | --- |
| `SINGLE_OUT` | 输出文件路径，默认 `dist-single/index.html` |
| `SINGLE_DOCS` | 逗号分隔的 docId，只打包这些文档；留空为整库 |
| `SINGLE_SKIP_CASES` | 设为 `1` 时不打包指导性案例与裁判文书 |

## 产物包含什么

- `public/style.css` 与 `public/app.js` 原样内联；
- 页面渲染模块（`server/db.js`、`server/search.js`、`server/html.js`、`server/pages.js`、`scripts/lib/cn-num.js`、`server/constants.js`）拼接后内联，浏览器里跑的是与服务端同一套渲染与检索代码；
- `db/` 的数据以 JSON → gzip → base64 的形式内嵌在 `#db-data` 脚本里，打开页面时用 `DecompressionStream` 解压，再用 `Database(sources)` 在内存里建索引（不读本地文件）。

## 地址与导航

打开后默认首页。站内链接在渲染时被改写成 hash 路由，因此地址栏形如：

```text
index.html#/d/civil-code/585
index.html#/search?q=违约金&scope=civil&scope=social
index.html#/notes?division=civil-commercial&level=key
```

- 页头/页内检索表单由脚本拦截，提交后同样落到 hash；
- 浏览器前进/后退可用；
- 页内锚点（`#sec-…`）保持页面自身跳转，不会被当成路由。

## 与服务端、`export:static` 的区别

- `npm start`：Node 服务端渲染，按需读文件；
- `npm run export:static`：每个页面导出成独立 HTML，多文件，需要 HTTP 托管（GitHub Pages）；
- `npm run export:single`：单文件、`file://` 直接打开，代价是首屏要解压并建索引，整库产物约 11 MB。

## 已知边界

- 需要支持 `DecompressionStream` 的浏览器（Chrome 80+、Firefox 113+、Safari 16.4+）；
- 不做跨页的增量加载，所有数据一次进内存；
- 复制出来的地址是本机文件路径 + hash，不能直接分享给没拿到文件的人；
- 与 `export:static` 各自独立，不共享产物目录。

## 自检

`test/single.test.js` 覆盖两件事：hash 路由到页面函数的映射（首页、条文页、检索、404），以及样本导出确实只含内联资源、内嵌数据可被 gunzip 还原。
