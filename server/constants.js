/**
 * 展示层常量：法律位阶（HIERARCHY）与关联可靠度分级（CONFIDENCE）。
 * 单独成文件是为了让渲染层（html.js）与静态站点客户端可以只依赖常量、不依赖 db.js 的文件读取。口径见 docs/data-model.md。
 */

export const HIERARCHY = ['宪法', '法律', '行政法规', '司法解释'];

export const CONFIDENCE = {
  explicit: { label: '直接引用', weight: 3, color: 'strong', hint: '法名与条号紧邻出现，可靠性最高' },
  list: { label: '并列引用', weight: 2, color: 'mid', hint: '与上一条引用构成“第X条、第Y条”并列，继承目标' },
  contextual: { label: '同句推断', weight: 1, color: 'weak', hint: '同一句内最近的法名，建议核对原文' },
  document: { label: '待核对', weight: 0, color: 'weak', hint: '仅识别出条号，未能确定所属法律' },
};
