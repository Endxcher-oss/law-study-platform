# 数据来源与许可

- 《中华人民共和国生态环境法典》（2026-03-12 通过，2026-08-15 施行）由 `scripts/fetch-eco-code.mjs` 从[生态环境部全文页](https://www.mee.gov.cn/ywgz/fgbz/fl/202603/t20260313_1146496.shtml)抓取解析，存为 `data/raw/laws/ecological-environment-code.json`；其余 520 部来自 `chinese-law-corpus`。
- 语料：`chinese-law-corpus`（CC0-1.0）→ `https://github.com/lttxzmj/chinese-law-corpus`，其中 `laws/`（520 部文件 / 30,069 条）、`guiding-cases/`（278 件指导性案例）、`gazette-cases/`（445 件《最高人民法院公报》裁判文书，原始出处 <http://gongbao.court.gov.cn/>）三部分全部收进 `data/raw/`
- 法条正文原始出处：国家法律法规数据库 <https://flk.npc.gov.cn/>
- 本项目源码：MIT → <https://github.com/Endxcher-oss/law-study-platform>（在线站点 <https://endxcher-oss.github.io/law-study-platform/>）
- `db/` 为派生产物，随语料同为 CC0。
