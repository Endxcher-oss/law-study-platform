# JSON API

| 端点 | 说明 |
| --- | --- |
| `GET /api/meta` | 元信息、计数、覆盖度、端点清单 |
| `GET /api/taxonomy` | 编/领域树 + 文档→编映射 |
| `GET /api/catalog?q=&division=&domain=&category=&status=&page=&size=` | 文档目录（含别名匹配） |
| `GET /api/docs/:id?links=1` | 文档详情（`links=1` 附带司法解释/案例/注解/覆盖度） |
| `GET /api/docs/:id/articles/:number` | 指定条文 |
| `GET /api/articles/:articleId` | 条文 + 其 `curated`/`derived` 注解 |
| `GET /api/search?q=&scope=&type=&sort=&doc=&page=&size=&annotated=1&gazette=1` | 检索（返回 `items`、`facets`、`total`、`gazetteOnly`、`docHits`，以及本次扫描耗时 `ms`）；`docHits` 是查询词精确或前缀命中的文件（查询含大写 `OR` / `NOT` 时为空），`gazette=1` 时只检索《最高人民法院公报》裁判文书 |
| `GET /api/annotations?level=&division=&lawId=&source=&q=&page=&size=` · `GET /api/annotations/:id` | 注解列表 / 详情（含 `basis`） |
| `GET /api/cases?lawId=&articleId=&q=&page=&size=` · `GET /api/cases/:id` | 案例列表 / 详情 |
| `GET /api/gazettes?year=&docType=&q=&page=&size=` · `GET /api/gazettes/:id` | 裁判文书列表（默认按公报期号倒序）/ 详情（含裁判摘要与全文；不与条文建立关联） |
| `GET /api/links?articleId=` | 某条文的 `incoming`（谁引用它）/ `outgoing`（它引用谁）/ `cases` |
| `GET /api/suggest?q=` | 检索建议（文档名 + 条文/案例；条目标 `kind: 'article' | 'case'`，案例要链到 `/case/:id`） |
| `GET /api/hot?size=&division=` | 被司法解释引用最多的条文 |

示例：

```bash
curl 'http://127.0.0.1:3000/api/search?q=违约金&scope=civil&sort=date_desc&size=3'
curl 'http://127.0.0.1:3000/api/links?articleId=civil-code-0585'
curl 'http://127.0.0.1:3000/api/annotations/ann-civil-code-0585'
```
