# 数据流水线（`scripts/`）

```
data/raw/**                 scripts/lib/*.js                db/**
─────────────  ─────────────────────────────────────  ─────────────
laws/*.json     ─┐
guiding-cases/  ─┴─► clean.js（清洗）─► cn-num.js（条号）
                        │
                        ├─► refs.js     抽取条文引用 ─► links.json
                        ├─► taxonomy.js 编/领域归类 ─► taxonomy*.json、catalog.json
                        └─► curated.mjs 人工注解 ────► annotations/*.json
                                                       │
                            build-db.js ──────────────┴─► codes/ interpretations/
                                                         regulations/ cases/ meta.json
                                                         reports/build-report.json
```

- **可重复**：`npm run build` 每次从 `data/raw` 全量重建 `db/`，结果与本次构建时间之外完全一致。

## 清洗与条号（`clean.js` / `cn-num.js`）

- **清洗**：统一换行与空白（全角空格、页眉页脚），把被并入上一条正文尾部的「编/章/节/部分」标题剥离出来还原成章节结构——**不改写正文一个字**。公报裁判文书只做空白归一，不抽引用、不建关联，产出 `db/cases/gazette.json`。
- **条号**：法律文本里的条号一律写作汉字（“第五百七十七条”），`cn-num.js` 负责汉字 ⇄ 数字、解析“之一/之二”插入条。上游把插入条编码为 `number*1000+seq`（刑法第十七条之一 → `17*1000+1`），构建时按 `displayNumber` 归一成 `{number, seq, slug}`，排序键用 `number*10 + seq`，否则插入条会被当成第 17001 条排到末尾。
- **幂等**：`data/annotations/curated.mjs` 是唯一的手写输入；其余 `db/` 文件都可再生（`db/` 是构建产物，如果要保留库文件，直接提交即可；不提交也能一条命令重建）。
- **告警不阻断**：无法解析的引用、条号与位置不一致（源语料问题）都记入 `db/reports/build-report.json`，不影响构建。

## 引用抽取引擎（`scripts/lib/refs.js`）的几个关键决定

1. **法名识别优先于条号**：先用法名索引（全称 + 简称 + 别名，约 70 条简称映射）定位句子里的法律，再决定条号归谁。
2. **换行是硬边界**：法名不跨行回溯，避免把上一段的法律错配给下一段的条号。
3. **本法/本解释/本规定 → 自引用**（`self: true`）。
4. **已废止法律不映射条号**：《民法通则》《合同法》《侵权责任法》《物权法》等即使内容被民法典承接，也**不**做“第 146 条 → 民法典第 146 条”的机械映射（条号并不通用，会张冠李戴），只保留“内容已由民法典承接”的说明。
5. **不确定就降级**：拿不准时给 `contextual` 并如实标注，宁可让用户核对原文，也不制造假关联。
