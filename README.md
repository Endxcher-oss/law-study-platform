# 法律学习平台

用 **Node.js（零运行时依赖）** 搭的 B/S 学习平台：把法律条文与最高人民法院司法解释整理成结构化数据库（`db/`），在它们之间建立**条文级关联**，对疑难条文给出**注解 + 依据**，并提供**全局检索**与一套纯 HTML 的网页 GUI。

> 在线站点：<https://endxcher-oss.github.io/law-study-platform/>（GitHub Pages 静态导出，检索在浏览器内完成，详见[静态部署](docs/deploy.md)）

## 快速开始

```bash
npm run build     # 由 data/raw 构建 db/（约 2.3 秒）
npm start         # http://127.0.0.1:3000
npm test          # 85 项测试
npm run verify    # 数据完整性与引文可核性校验
npm run stats     # 生成数据统计报表
npm run export:static   # 导出可上传 GitHub Pages 的 dist/（见文档：静态部署）
```

`PORT=8080 npm start` 换端口；`HOST=0.0.0.0` 对外监听；`LOG=0` 关闭请求日志。

## 现在能做什么

- **结构化数据库**：520 部文档全部切成条文，带「编 / 领域 / 章节 path」与发布、施行日期、制定机关；宪法编、刑法编、民法编、商法编、社会法编、行政法编、经济法编**七个编全部正式交付**。
- **条文主旨（条旨）**：504 条人工撰写的条旨（刑法全典：总则 103 条 + 分则 401 条），按教材习惯排成「第三条 【罪刑法定原则】」，与官方正文分开存放。
- **条文级关联**：2,717 条司法解释 ↔ 法条关联（合计 3,043 处提及），标出**直接引用 / 并列引用 / 同句推断**等级，可回原文核对。
- **疑难注解**：1,018 条（20 条人工撰写 + 998 条自动派生），每条附「依据的司法解释 + 逐字引文」，构建时逐字校验。
- **全局检索**：一次检索覆盖条文正文/条号/法名/注解/关键词/案例六类内容，可按编、文件类别、单部法律、是否带注解限定范围，支持 6 种排序、分面收窄与命中快照高亮；勾选“只搜索裁判文书”则只在《最高人民法院公报》裁判文书里检索。
- **裁判文书**：《最高人民法院公报》裁判文书 445 件（2003–2026 年，判决书/裁定书等，含裁判摘要与文书全文）独立成栏：只收文书正文与客观元数据，**不与法条建立条文级关联**，也不参与默认检索。
- **网页 GUI**：14 个服务端渲染页面 + 14 个 JSON API，纯 HTML/CSS，禁用 JavaScript 也能完整使用；手机/平板上页头收成两行、侧栏折成单列、法律总览的目录树可一键收起；深浅色跟随系统设置。

## 文档

| 主题 | 文档 |
| --- | --- |
| 仓库目录与每个文件的职责 | [docs/architecture.md](docs/architecture.md) |
| 代码约定、注释规范、命名与性能约定 | [docs/conventions.md](docs/conventions.md) |
| `db/` 的数据模型与字段 | [docs/data-model.md](docs/data-model.md) |
| `data/raw` → `db/` 流水线与引用抽取引擎 | [docs/pipeline.md](docs/pipeline.md) |
| 司法解释如何“挂”到法条下、注解怎么生成 | [docs/interp-linking.md](docs/interp-linking.md) |
| 全局检索：范围、排序、查询写法、实现要点 | [docs/search.md](docs/search.md) |
| 网页 GUI：页面清单与条文页结构 | [docs/web-ui.md](docs/web-ui.md) |
| 静态部署到 GitHub Pages：导出、前缀、静态检索 | [docs/deploy.md](docs/deploy.md) |
| HTTP JSON API | [docs/api.md](docs/api.md) |
| 质量保障：`verify` 校验什么、测试覆盖 | [docs/quality.md](docs/quality.md) |
| 如何扩展：加法条、加编、加注解、换存储 | [docs/extending.md](docs/extending.md) |
| 已知边界与取舍 | [docs/limits.md](docs/limits.md) |
| 数据来源与许可 | [docs/data-source.md](docs/data-source.md) |

## 仓库一览

```
law-study-platform/
├── data/      只读语料 data/raw/ + 人工撰写的注解 data/annotations/curated.mjs
├── scripts/   离线数据流水线（build-db / verify-db / stats / export-static + lib/）
├── db/        构建产物：结构化数据库（只读，随时可重建）
├── server/    原生 http 服务端：路由、索引、检索、页面渲染、JSON API
├── public/    前端增强（style.css / app.js / static.js；禁用 JS 也能用）
├── test/      node:test 测试（85 项）
├── dist/      静态导出产物（不入库，由 GitHub Actions 构建并发布）
└── docs/      详细文档
```

完整清单（含每个文件的一句话说明）见 [docs/architecture.md](docs/architecture.md)。

---

语料来自上游 CC0 公开数据集，详见 [docs/data-source.md](docs/data-source.md) 与 `data/raw/LICENSE`。已知边界（规模上限、机器抽取的误判风险等）见 [docs/limits.md](docs/limits.md)。
