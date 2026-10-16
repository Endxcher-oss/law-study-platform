# 目录结构

代码约定与注释规范见 [conventions.md](conventions.md)；各文件头部只保留一段概括说明，细节都在 `docs/`。

```
laws/
├── package.json              # 脚本入口：build / verify / stats / start / test
├── docs/                     # 详细文档（数据模型 / 流水线 / 关联 / 检索 / API / 扩展…）
├── data/
│   ├── raw/                  # 只读语料（上游 CC0 语料，未经改写）
│   │   ├── laws/             #   520 部法律/司法解释/行政法规 JSON + index.json + manifest
│   │   ├── guiding-cases/    #   278 件指导性案例 JSON + manifest.json
│   │   └── LICENSE           #   语料来源与许可（CC0-1.0）
│   └── annotations/
│       ├── curated.mjs       # ★ 人工撰写的疑难注解（唯一需要手写的业务文件）
│       └── rubrics.mjs       # ★ 人工撰写的条文主旨（条旨）
├── scripts/                  # 数据流水线（离线，可重复执行）
│   ├── build-db.js           #   主构建：raw → db/
│   ├── verify-db.js          #   数据校验（含注解引文逐字比对）
│   ├── stats.js              #   统计报表 → db/reports/stats.json
│   └── lib/
│       ├── clean.js          #   正文清洗（去页眉页脚/空格/繁体标点归一）
│       ├── cn-num.js         #   中文数字 ⇄ 阿拉伯数字、条号解析
│       ├── refs.js          #   ★ 引用抽取引擎（谁引用了哪一条）
│       └── taxonomy.js       #   ★ 编/领域分类规则与人工兜底表
├── db/                       # ★ 构建产物：结构化数据库（只读，可随时重建）
│   ├── catalog.json          #   文档目录（数组，520 项）
│   ├── codes/                #   法律条文（312 部，一部一文件）
│   ├── interpretations/      #   司法解释条文（175 部，一部一文件）
│   ├── regulations/          #   行政法规条文（32 部，一部一文件）
│   ├── cases/guiding.json    #   指导性案例（278 件）+ manifest.json
│   ├── annotations/          #   curated.json / derived.json / index.json
│   ├── links.json            #   ★ 条文级关联表（2,717 条，合计 3,043 处提及）
│   ├── rubrics.json          #   条文主旨（条旨，人工撰写的编辑层）
│   ├── taxonomy.json         #   编/领域树（含各编规模）
│   ├── taxonomy.map.json     #   文档 → {division, domain}
│   ├── meta.json             #   元信息、计数、覆盖度
│   └── reports/              #   build-report.json、stats.json
├── server/                   # 服务端（原生 http，无框架）
│   ├── index.js              #   路由 + 静态资源 + 启动
│   ├── db.js                 #   载入 db/ 并建索引（供 API 与页面共用）
│   ├── search.js             #   ★ 检索：查询解析、加权打分、分面、快照高亮
│   ├── pages.js              #   ★ 服务端渲染的 12 个页面
│   ├── api.js                #   12 个 JSON API
│   └── html.js               #   极简模板/转义工具
├── public/                   # 前端增强（零依赖，禁用 JS 也能用）
│   ├── style.css             #   印刷风格的排版与配色
│   └── app.js                #   搜索建议、目录跳转、复制条文、快捷键
└── test/                     # node:test 测试（67 项）
    ├── refs.test.js          #   引用抽取引擎
    ├── db.test.js            #   数据库结构与不变式
    ├── search.test.js        #   检索、排序、分页、高亮
    ├── server.test.js        #   端到端 HTTP 冒烟（随机端口起真服务）
    └── docs.test.js          #   文档一致性：README/docs 的链接与锚点可达
```

## 数据层（`server/db.js`）要点

- `db/` 是唯一数据源，这一层**不做再加工**，只建内存索引（改数据请改 `scripts/` 后重新构建）。
- 全部文档一次性载入（约 4.6M 字正文），换页零延迟；条文对象同时充当检索语料（含预先算好的小写副本），不做二次拷贝。
- 对上层只暴露只读视图：`docs / articles / links / annotations / cases`，以及反查 Map（`linksByTarget`、`interpByLaw`、`casesByArticle`…）。
