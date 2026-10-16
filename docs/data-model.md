# 数据模型（`db/`）

## `catalog.json` — 文档目录（数组）

```json
{
  "id": "civil-code",
  "title": "中华人民共和国民法典",
  "shortTitle": "民法典",
  "aliases": ["民法典", "中国民法典"],
  "category": "法律",                 // 宪法 | 法律 | 行政法规 | 司法解释
  "division": "civil",               // 编：见下文“taxonomy.json — 编与领域”
  "domain": "m-civilcode",           // 编内领域
  "status": "effective",             // effective | amended | repealed
  "promulgationDate": "2020-05-28",
  "effectiveDate": "2021-01-01",
  "authority": "全国人民代表大会",
  "articleCount": 1260,
  "sectionCount": 136,
  "interpretationOf": null           // 司法解释填被解释法律的 id
}
```

## `codes/` `interpretations/` `regulations/` — 条文

一部文档一个文件，结构一致；文件名即文档 id。

```json
{
  "id": "civil-code", "title": "…", "shortTitle": "民法典", "category": "法律",
  "division": "civil", "domain": "m-civilcode", "status": "effective",
  "promulgationDate": "2020-05-28", "effectiveDate": "2021-01-01",
  "authority": "全国人民代表大会", "interpretationOf": null,
  "articleCount": 1260, "sections": [ … ],
  "articles": [
    {
      "id": "civil-code-0585",          // 全局唯一：`${docId}-${4 位补零条号}`，插入条为 `${docId}-${4 位条号}-${序号}`
      "number": 585,
      "seq": 0,                         // 0 = 本条；1/2… = 第一百三十三条之一/之二
      "slug": "585",                     // URL 定位符：普通条 "585"，插入条 "120-1"
      "displayNumber": "第五百八十五条",
      "suffix": null,                   // “之一/之二”…
      "path": ["第三编合同", "第一分编通则", "第八章违约责任"],
      "text": "当事人可以约定一方违约时…",   // 款之间用 \n 分隔，保留原文
      "paragraphs": 3,                  // 款数
      "chars": 173,
      "partHeading": null
    }
  ]
}
```

要点：

- **条文 id 稳定**，是全库的定位主键（URL、关联、注解都用它）。
- **插入条（“之一/之二…”）**：全库 53 条，均在刑法，如 `刑法-0276-1` / URL `/d/criminal-law/276-1`。它们与前一条共用 `number`（如 276），靠 `seq` 区分；排序键为 `number*10+seq`，所以目录里紧跟“第二百七十六条”。条文页的上一/下一条、目录锚点（`#a276-1`）、搜索“刑法第276条之一”的直接定位都按插入顺序处理——**只给条号会落到基础条，给 slug 才落到插入条**。
- `path` 从编到节，用于面包屑；条文页会把同节条文做成侧栏。
- 正文**未经模型改写**，仅做清洗（去页眉页脚、全角空格、标点归一，见 `scripts/lib/clean.js`）。

## `links.json` — 条文级关联（本平台的核心资产）

每条记录 = 一个**去重后的关联事实**：“某条条文（通常是司法解释）引用了某条法条”；原文里同一写法出现多次时只留一条，用 `mentions` 计次数。

```json
{
  "s":  "sfjs-mfd-hetong-0064",   // source：发起引用的条文
  "sd": "sfjs-mfd-hetong",        // source 所属文档
  "t":  "civil-code-0585",        // target：被引用的条文（未定位时为 null）
  "td": "civil-code",             // target 所属文档
  "tn": 585,                      // target 条号
  "c":  "explicit",               // 可靠度：见下表
  "raw": "第五百八十五条",          // 原文里的引用写法
  "name": "民法典",                // 原文里出现的法名（用于审计）
  "note": null,                    // 异常说明，可为 null
  "mentions": 2                    // 该写法在来源条文里出现了几处
}
```

`c`（confidence）四级，决定了 UI 里的排序与提示语气：

| 级别 | 判定规则 | 含义 |
| --- | --- | --- |
| `explicit` | “民法典第五百八十五条”这类**法名紧邻条号** | 最可靠，可直接采信 |
| `list` | 并列列表（“第一百一十一条、第一百一十二条”）继承前一个法名 | 可靠 |
| `contextual` | 同句内最近的法定名（跨行不回溯，窗口 60 字） | **需核对原文** |
| `document` | 只写了条号、没写法名；或条号在源语料里已失效 | 仅作线索，不给目标条文 |

配套内容：

- **“条”与“处”**：抽取阶段每遇到一处条号引用就产出一条原始记录（同一处条文里把“第十条”写了两次就是两处）。同源、同目标、同写法、同可靠度的记录在构建时**合并为一条关联**，`mentions` 记下提及次数：所以 `links.json` 里是 **2,717 条关联**，而 `sum(mentions)` = **3,043 处提及**（`meta.counts.links` / `meta.counts.linkMentions`）。页面上的“N 处引用”用的是提及数，“关联 N 条”用的是去重后的条数。
- `meta.json.coverage` 的分子分母**同一集合**：`lawArticles`（25,000 条法律法规条文）↔ `lawArticlesWithLinks`（1,262 条，5.0% 已挂上司法解释关联）。
- 从司法解释出发的关联共 **1,808 条**（`interpretationLinks`，去重后）。
- 未能定位到具体条号的引用都不丢弃：`t` 为 null 的有 **266 条**（含 300 处提及）——其中 4 条能确定是哪部法律（在“关联条文”里标“本库未定位到原文”），262 条连法律名都没识别出来（收在文档页的“数据说明”与 `db/reports/build-report.json` 的 `unresolvedTop`）。

## `annotations/` — 注解

注解回答的是“**这条为什么难、怎么理解、依据哪一条司法解释**”。

```json
{
  "id": "ann-civil-code-0585",
  "source": "curated",                 // curated 人工撰写 | derived 机器派生
  "level": "key",                      // key | warning | standard | note
  "topic": "违约金过高/过低的司法调整",
  "question": "约定违约金过高于损失，法院如何调整？",
  "analysis": ["…逐段讲解…"],
  "points": ["…要点…"],
  "pitfalls": ["…常见误区…"],
  "keywords": ["违约金", "酌减"],
  "references": ["《全国法院民商事审判工作会议纪要》第 50 条（本库未收录，仅作提示）"],
  "basis": [                           // ★ 依据：指向本库内的司法解释条文
    {
      "docId": "sfjs-mfd-hetong",
      "articleId": "sfjs-mfd-hetong-0065",
      "displayNumber": "第六十五条",
      "relation": "依据",              // 依据 | 展开 | 例外 | 相关
      "relevance": "primary",
      "quote": "…必须逐字出现在该条文 text 中，verify 会比对…",
      "note": "为什么要引这一条"
    }
  ],
  "cases": ["guiding-124"]
}
```

- `curated.json`：**20 条人工注解**（覆盖刑法、民法、商法、民诉的重点难点条文），来自 `data/annotations/curated.mjs`。
- `derived.json`：**998 条自动派生注解**，由 `links.json` 汇总生成（“本库有 N 件司法解释、共 M 个条文引用了本条”），用于把关联结果直接呈现到条文页；文案明确标注“机器抽取结果，非人工意见”。
- `index.json`：**1,018 条**轻量索引（不含正文），供列表页与检索使用。

## `rubrics.json` — 条文主旨（条旨）

```json
{
  "docId": "criminal-law",
  "articleId": "criminal-law-0003",
  "slug": "3",
  "displayNumber": "第三条",
  "text": "罪刑法定原则"
}
```

- **21 条**（目前为刑法前 20 条，含“第十七条之一”），来自 `data/annotations/rubrics.mjs`，是**人工撰写的编辑层**。
- 教材/释义书排作「第一条 【立法目的和根据】……」的那一截，**官方发布文本里没有**，所以单独存放、单独渲染：`db/**` 里条文的 `text` 永远是官方原文，一个 `【】` 都没有（`verify-db.js` 会强制这条不变式）。
- 只写条旨本身，**只用汉字/字母/数字/顿号**——不带括号、冒号等其他标点或特殊符号（例：「刑法的溯及力」，不写成「刑法的溯及力（从旧兼从轻）」；并列项可用顿号，如「又聋又哑的人、盲人犯罪的从宽处罚」）；条旨必须能对应到真实条文（`docId` + `slug`），否则构建告警 / 校验报错。

## `taxonomy.json` — 编与领域

| 编 id | 名称 | 状态 | 文档 | 条文 | 领域数（有文件的） |
| --- | --- | --- | --- | --- | --- |
| `constitutional` | 宪法编 | ready | 71 | 3,390 | 7 |
| `criminal` | 刑法编 | ready | 41 | 2,500 | 5 |
| `civil` | 民法编 | ready | 152 | 6,993 | 10 |
| `commercial` | 商法编 | ready | 47 | 3,234 | 9 |
| `social` | 社会法编 | ready | 60 | 4,221 | 5 |
| `administrative` | 行政法编 | ready | 53 | 3,698 | 5 |
| `economic` | 经济法编 | ready | 96 | 6,033 | 6 |
| `other` | 其他编（待归类） | pending | 0 | 0 | 0 |

七个编均为**正式交付**范围（`status: 'ready'`，门类划分已定型）。`status` 是留给后续扩展的字段：规则尚未覆盖的法规会落到 `other`（`pending`，页面上标“待归类”），保证不丢失数据；当前该桶为空，说明分类规则覆盖了全部 520 部文件。编总览页只列出有文件的编。

## `cases/guiding.json` — 指导性案例

```json
{
  "id": "guiding-124", "number": 124, "title": "…", "publishedAt": "2019-12-24",
  "keywords": ["民事", "买卖合同", "违约责任"],
  "gist": ["裁判要点…"], "facts": ["基本案情…"], "result": "裁判结果…",
  "reasoning": "裁判理由…", "relatedLaws": "《中华人民共和国合同法》…",
  "related": [
    {
      "lawId": "civil-code", "lawName": "中华人民共和国民法典",
      "articleId": "civil-code-0585", "articleNumber": 585,
      "raw": "第五百八十五条", "source": "《中华人民共和国民法典》第五百八十五条",
      "note": null
    }
  ],
  "sourceUrl": "…"
}
```

- `related` 把案例锚定到具体条文，因此**在条文页上能看到“哪些指导性案例适用本条”**。
- 引用已废止法律时（如《合同法》第 424 条），`lawId`/`articleId` 为 `null`，`note` 注明“内容由民法典承接，条号不通用”，**不做错误的条号映射**。
