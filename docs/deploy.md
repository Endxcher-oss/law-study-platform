# 静态部署（GitHub Pages）

GitHub Pages 只发静态文件，而本项目的正文页、目录页都是服务端渲染的。**静态导出**把每个服务端页面渲染成一份 HTML 落盘，链接改写成静态路径，检索则在浏览器里用同一套打分代码跑一遍——这样整站不依赖 Node 运行时也能用。

## 命令

```bash
npm run export:static          # 导出到 dist/（默认部署前缀 /laws）
BASE_PATH= npm run export:static   # 前缀为空：本地根路径预览时用
BASE_PATH=/other npm run export:static
EXPORT_SAMPLE=3 npm run export:static   # 只渲染前 3 部文档（自检、测试用，跳过链接自检）
OUT_DIR=/tmp/site npm run export:static
```

本地预览（`BASE_PATH` 与访问路径必须一致）：

```bash
BASE_PATH=/laws npm run export:static
mkdir -p /tmp/preview && ln -sfn "$PWD/dist" /tmp/preview/laws
python3 -m http.server 8777 --directory /tmp/preview   # http://127.0.0.1:8777/laws/
```

`dist/` 是构建产物，不入库（见 `.gitignore`）；线上由 GitHub Actions 现搭现发。

## 部署前缀

Pages 的项目站点挂在 `https://<用户>.github.io/<仓库名>/` 下，而渲染层写的是站内绝对路径（`/d/...`、`/assets/...`）。导出时用 `BASE_PATH` 统一加前缀，规则只有三条（实现见 `public/static-url.js`，导出脚本与浏览器端共用）：

- `href` / `src` / `action` 里以单个 `/` 开头的地址加前缀；`https://`、`//cdn...`、`data:`、`#锚点` 原样保留。
- 每个页面的 `<body>` 注入 `data-base="<前缀>"`，供前端脚本拼绝对地址。
- 查询串形式的浏览地址改写成静态路径（下表），因为静态主机不会把查询串映射到不同的文件。

| 服务端写法 | 静态导出后的路径 |
| --- | --- |
| `/notes?division=civil` | `/notes/d/civil` |
| `/notes?level=key` | `/notes/l/key` |
| `/notes?division=civil&level=warning` | `/notes/d/civil/l/warning` |
| `/cases?page=3` | `/cases/page/3` |
| `/cases?q=居间合同` | `/search?q=居间合同&type=指导性案例` |
| `/d/civil-code?from=101` | `/d/civil-code/from/101` |
| `/search?q=违约金&scope=civil` | 保持查询串，交给浏览器检索 |

条文窗（`?from=`）之所以也要改写成路径，是因为一部法律超过 100 条时分页显示目录，静态站点必须为每一窗准备文件。案例页的检索表单改接全局检索，静态站点没有服务端过滤。

## 静态检索

- 打分、摘要高亮、分面全部复用 `server/search.js`：导出时把该模块与 `server/html.js`、`server/constants.js`、`scripts/lib/cn-num.js` 原样复制进 `dist/assets/`，浏览器按原生 ES 模块加载，**没有打包器，也没有第二套实现**。为此 `server/html.js` 只依赖 `server/constants.js`，`server/search.js` 只依赖 `scripts/lib/cn-num.js`。
- 条文语料导出成 `assets/index.json`（约 3 万条、17 MB，gzip 后约 4.6 MB），只在检索页按需下载，之后走浏览器缓存；`assets/catalog.json`、`assets/taxonomy.json` 供“法律名 + 条号”直达与分面标签使用。
- 检索页首屏仍是服务端渲染的“按当前范围浏览”第一页，禁用 JS 也能看到表单与内容；一旦 URL 带参数（`q` / `page` / `scope` / `type` / `sort` / `doc` / `annotated`），`public/static.js` 才会在浏览器里重算并替换结果区。搜索表单是普通 GET 表单，回车即跳转，不需要 JS 拦截。

## 导出物结构

```
dist/
├── index.html · 404.html · .nojekyll
├── divisions/ about/ search/                     # 静态页面（每页一个目录 + index.html）
├── notes/ notes/d/<编>/ notes/l/<等级>/
├── cases/ cases/page/<n>/ case/<案例 id>/
├── division/<编>/ domain/<领域>/
├── d/<文件 id>/[from/<n>/] d/<文件 id>/<条号>/
└── assets/
    ├── style.css app.js                          # 与服务端渲染页面里引用的路径一致
    ├── index.json catalog.json taxonomy.json     # 静态检索数据
    ├── public/static.js public/static-url.js      # 检索增强、链接改写
    ├── server/{search,html,constants}.js          # 原样复制，浏览器直接复用
    └── scripts/lib/cn-num.js
```

不导出 JSON API：`server/api.js` 描述的 `/api/*` 只在 `npm start` 的本地服务下可用（见 [api.md](api.md)）。

## GitHub Actions

`.github/workflows/pages.yml`：推送到 `main` 或手动触发 → 构建 `db/` → `verify` → `npm test` → 静态导出 → 发布到 Pages。部署前缀默认取仓库名（`/${{ github.event.repository.name }}`）；换自定义域名时把仓库变量 `BASE_PATH` 设为空串即可（Settings → Secrets and variables → Actions → Variables）。

仓库设置里需要把 Pages 的来源设为 **GitHub Actions**（Settings → Pages → Build and deployment → Source）。整站约 3.1 万个文件 / 260 MB，仍在 Pages 的 1 GB 上限内。

## 自检

- **链接自检**：完整导出会遍历所有页面里的站内链接（约 73 万条），每一条都必须在导出物里有对应文件，否则导出以非零状态结束（CI 会因此失败）。
- **样本模式**：`EXPORT_SAMPLE=N` 只渲染前 N 部文档并跳过链接自检，供 `test/export.test.js` 校验目录结构、前缀改写、查询串改写、浏览器模块的 import 是否都能在导出物里解析。
- **条文地址往返**：同一个测试逐条检查“条文 id → URL → 真实条文页”，防止 id 里含数字的文件名（如 `sfjs-3492980330-0002`）被解析错。

## 已知边界

- 没有服务端路由：任意未导出的路径由 `404.html` 兜底，不再有服务端的模糊匹配与重定向（`/search?q=` 这类查询串页面除外，它们由浏览器脚本渲染）。
- 静态检索首次进入检索页要下载约 4.6 MB（gzip）的索引；服务端版的线性扫描（约 60–90 ms）换成了浏览器内的同款扫描，大查询下会占用主线程数百毫秒。
- 检索结果页无法被搜索引擎静态收录，只有浏览路径（目录、条文、注解、案例）是预渲染的静态页面。
