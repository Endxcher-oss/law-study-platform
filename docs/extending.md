# 如何扩展

## 新增一部法律/司法解释
把上游 JSON 放进 `data/raw/laws/`，在 `data/raw/laws/index.json` 里登记，然后 `npm run build`。若文件名是 `law-xxxxxxxx.json` 这种哈希名，`scripts/lib/taxonomy.js` 的 `CURATED` 表可用文档 id 直接指定编/领域。

## 新增一个编（如社会法编转为正式交付）
1. `scripts/lib/taxonomy.js`：把该编 `status` 改成 `ready`，必要时补 `RULES` 规则或 `CURATED` 兜底；
2. `npm run build && npm run verify`；
3. 刷新页面即可（`/divisions` 与检索的 `scope` 选项都从 `db/taxonomy.json` 读取，无需改前端）。

## 新增一条人工疑难注解
编辑 `data/annotations/curated.mjs`，照现有条目填 `question/analysis/points/pitfalls/basis[]`，然后：

```bash
npm run build && npm run verify   # verify 会逐字核对你的 quote
```

`quote` 写错一个字都会被 verify 拦下来——这是注解可信度的保证。字段口径：`level` 取 `key`（重点）/ `standard`（一般）/ `warning`（易错）；`basis[]` 每项写 `docId` + `articleNumber` + `relation`（依据 / 参见 / 对照）+ `quote`；`cases[]` 写指导性案例编号（`number`）。结论必须落在“法条 → 司法解释 → 裁判要点”这条链上，没有库内依据的写 `references`（外部依据）并说明，不要写没依据的判断。

## 让某部司法解释在列表里显示得更短
上游语料的简称往往就是全称。在 `scripts/build-db.js` 的 `SHORT_TITLE_OVERRIDES` 里加一行 `'sfjs-xxx': '短名'`（只影响展示与简称匹配，不改 `title`），重新 `npm run build` 即可。

## 新增一种排序方式
`server/search.js` 的 `SORTS` 表加一项（比较函数 + 中文标签），页面与 API 自动出现该选项。

## 接入数据库/检索服务
`server/db.js` 是唯一的数据访问层：它把 `db/` 载入内存并建立各种反查 Map（条文、文档、关联、案例、注解）供 API 与页面使用。换成 SQLite/Elasticsearch 时，只需保持该模块的导出接口不变。
