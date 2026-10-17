# 代码约定与实现要点

这份文档收拢散落在各处的工程约定，也是**注释规范的落点**：代码里只在文件头写一段概括性说明，其余说明一律进 `docs/`。

## 注释规范

- **只在文件开头保留一段概括注释**：这个文件做什么、边界在哪、细节去哪份文档看。**不在代码里写注释**——包括行尾注释、大段 JSDoc、`// ---- 章节分隔 ----` 这类装饰线。
- 设计理由、算法取舍、字段口径、踩过的坑，全部写进 `docs/` 对应文档（本目录），保持精简凝练。
- 唯一的例外是数据文件里必须自解释的字段名本身；字段语义写在 `docs/data-model.md`。

## 分层与依赖

- **零依赖**：只用 Node ≥ 20 标准库（ESM，`dependencies: {}`）。不引入框架、模板引擎、打包器、分词库。静态站点需要的浏览器代码也是原生 ES 模块（见 [deploy.md](deploy.md)）。
- 数据只朝一个方向流：

  ```
  data/raw（只读语料） + data/annotations（手写输入）
        └─ scripts/（离线构建）─► db/（只读产物）
                                      └─ server/（只读内存索引）─► public/（渐进增强）
  ```

- **只读约定**：`data/raw/` 与 `db/` 都不手改。改内容要么改 `data/annotations/*.mjs`（人工内容），要么改 `scripts/`（构建逻辑），然后 `npm run build`。
- `server/db.js` 是唯一的数据访问层：换存储（SQLite / ES）只要保持它的导出接口不变（见 `docs/extending.md`）。
- **浏览器可加载的模块**：`server/html.js`、`server/search.js`、`scripts/lib/cn-num.js` 会被静态导出原样发布给浏览器，因此它们只能依赖标准 JS 与 `server/constants.js`（json/db 由调用方注入）。分层与导出规则见 [deploy.md](deploy.md)。
- 页面渲染只用模板字符串 + 显式转义（`server/html.js`），不做字符串拼接式的“优化”。

## 前端约定（渐进增强）

- 服务端渲染为准：禁用 JS 也能完整使用（目录树用原生 `<details>`、回到顶部是普通 `#top` 锚点、检索是表单 GET）。
- JS 只做增强，并且都要有兜底：滚动类监听走 `requestAnimationFrame` 节流 + `{ passive: true }`；尊重 `prefers-reduced-motion`。
- 交互改动要同时检查：窄屏（≤640px）、打印（`@media print` 隐藏导航/悬浮件）、键盘（`/` 聚焦搜索、Esc 失焦）。

## 数据与文案口径

- **不臆造**：定位不到的引用不猜目标，保留原文写法并在“数据说明”里列出（`db/reports/build-report.json` 的 `unresolvedTop`）。
- **关联分级可见**：`explicit` / `list` / `contextual` / `document` 四级可靠度直接展示给用户，不藏在后台（判定规则见 `docs/data-model.md`）。
- **编辑层与官方正文分离**：条文 `text` 永远是官方原文；人工条旨（`db/rubrics.json`）只做渲染，正文里连一个 `【】` 都不许有（`verify` 强制）。
- **机器产出必须标注**：自动派生的注解一律写明“机器抽取，未经人工确认”，与 `curated` 分开存放。
- 用词以条文原文与司法解释原文为准；改写只在无法定位时以“说明”的形式出现。

## 命名与字段约定

| 名字 | 含义 |
| --- | --- |
| `slug` | 条文 URL 定位符：普通条 `585`，插入条 `120-1`；排序键 `number*10 + seq`（否则“第十七条之一”会排到 17001 位） |
| `mentions` | 同一引用写法在来源条文里出现的次数：“条”= 去重后的关联数，“处”= `sum(mentions)` |
| `kind` | 检索语料条目的类型：`article`（条文，走 `/d/:docId/:slug`）、`case`（指导性案例，走 `/case/:id`）或 `gazette`（公报裁判文书，走 `/gazette/:id`，不与条文关联） |
| `status` | 编的状态：`ready`（正式交付）/ `planned`（门类待细化）/ `pending`（待归类兜底） |
| `confidence` | 关联可靠度：`explicit` / `list` / `contextual` / `document` |

## 性能约定

- **不建倒排索引**：3 万条条文下线性扫描毫秒级完成，换来的是“改任何字段立刻生效”（见 `docs/search.md`）。
- 检索匹配读语料里预先算好的小写副本（`textLower` 等），命中后再用原文生成摘要与高亮。
- 页面与索引都在启动时一次性建好，运行期不写盘、不缓存外部依赖。

## 改动后的自检清单

```bash
npm run build      # 重建 db/（含告警统计）
npm run verify     # 结构、引文逐字、条旨与 mentions 等不变式
npm test           # 81 项：引用抽取 / 数据库 / 检索 / HTTP 端到端 / 静态导出 / 文档
```

数据库或渲染层改动，建议再跑一次全库渲染扫描（每部文档的目录树与条文窗不变式）。
