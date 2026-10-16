/**
 * 法条引用抽取：把“《民法典》第五百七十七条”这类表述解析为（目标文档, 条号, 引用强度）。
 * 四级强度的判定规则见 docs/data-model.md 与 docs/pipeline.md。
 */

import { findArticleRefs, findGranularity } from './cn-num.js';
export const SUPERSEDED = {
  中华人民共和国侵权责任法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》侵权责任编承接（条号不通用）' },
  中华人民共和国物权法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》物权编承接（条号不通用）' },
  中华人民共和国合同法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》合同编承接（条号不通用）' },
  中华人民共和国担保法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》担保制度相关条文承接（条号不通用）' },
  中华人民共和国婚姻法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》婚姻家庭编承接（条号不通用）' },
  中华人民共和国继承法: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》继承编承接（条号不通用）' },
  中华人民共和国民法通则: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》承接（条号不通用）' },
  中华人民共和国民法总则: { successor: 'civil-code', note: '该法已废止，内容由《中华人民共和国民法典》总则编承接（条号不通用）' },
};

export const SHORT_ALIASES = {
  民法典: 'civil-code',
  刑法: 'criminal-law',
  刑诉法: 'criminal-procedure-law',
  刑事诉讼法: 'criminal-procedure-law',
  民诉法: 'civil-procedure-law',
  民事诉讼法: 'civil-procedure-law',
  行政诉讼法: 'administrative-procedure-law',
  行政处罚法: 'administrative-penalty-law',
  行政许可法: 'administrative-license-law',
  行政复议法: 'administrative-reconsideration-law',
  公司法: 'company-law',
  合伙企业法: 'partnership-enterprise-law',
  个人独资企业法: 'sole-proprietorship-enterprise-law',
  证券法: 'securities-law',
  证券投资基金法: 'law-4d9ca57549',
  期货和衍生品法: 'law-c025646800',
  期货交易管理条例: 'xzfg-0de35ca915',
  票据法: 'law-89b9e7bc5b',
  保险法: 'insurance-law',
  海商法: 'law-7679d0ee6d',
  企业破产法: 'enterprise-bankruptcy-law',
  破产法: 'enterprise-bankruptcy-law',
  信托法: 'law-cd2f1f5b38',
  商业银行法: 'law-5ccbf2abf6',
  银行业监督管理法: 'banking-supervision-law',
  中国人民银行法: 'law-8da82f8f8a',
  反洗钱法: 'anti-money-laundering-law',
  电子商务法: 'e-commerce-law',
  劳动争议调解仲裁法: 'labor-dispute-mediation-arbitration-law',
  劳动合同法: 'labor-contract-law',
  劳动法: 'labor-law',
  社会保险法: 'social-insurance-law',
  仲裁法: 'arbitration-law',
  人民调解法: 'law-95ac930197',
  商标法: 'trademark-law',
  专利法: 'patent-law',
  著作权法: 'copyright-law',
  反不正当竞争法: 'anti-unfair-competition-law',
  反垄断法: 'anti-monopoly-law',
  消费者权益保护法: 'consumer-rights-protection-law',
  产品质量法: 'product-quality-law',
  食品安全法: 'food-safety-law',
  个人信息保护法: 'personal-information-protection-law',
  数据安全法: 'data-security-law',
  网络安全法: 'cybersecurity-law',
  土地管理法: 'land-administration-law',
  城市房地产管理法: 'urban-real-estate-administration-law',
  环境保护法: 'environmental-protection-law',
  道路交通安全法: 'road-traffic-safety-law',
  治安管理处罚法: 'public-security-administration-punishments-law',
  国家赔偿法: 'law-cd4d392750',
  立法法: 'legislation-law',
  选举法: 'electoral-law',
  未成年人保护法: 'minors-protection-law',
  妇女权益保障法: 'women-rights-protection-law',
  工会法: 'trade-union-law',
  律师法: 'lawyers-law',
  法官法: 'law-15523ff71a',
  检察官法: 'law-5b0dfbea59',
  民事证据规定: 'sfjs-zhengju',
  民事诉讼证据的若干规定: 'sfjs-zhengju',
  担保制度解释: 'sfjs-danbao',
  工伤保险条例: 'xzfg-8e4ae5638e',
  劳动合同法实施条例: 'xzfg-ec5eb2c922',
  消法: 'consumer-rights-protection-law',
  消费者权益保护法: 'consumer-rights-protection-law',
  行诉法: 'administrative-procedure-law',
  行政诉讼解释: 'sfjs-48ccf9c396',
  治安处罚法: 'public-security-administration-punishments-law',
  道交法: 'road-traffic-safety-law',
  反不当竞争法: 'anti-unfair-competition-law',
  药品管理法: 'law-018c2e44fb',
  税收征管法: 'tax-collection-administration-law',
  基金法: 'law-4d9ca57549',
  证券投资基金法: 'law-4d9ca57549',
  广告法: 'advertising-law',
  旅游法: 'law-100415b86b',
  行政强制法: 'administrative-compulsion-law',
  社区矫正法: 'law-c674c950be',
  海事诉讼特别程序法: 'law-a030e7117b',
  行政复议法: 'administrative-reconsideration-law',
  民诉解释: 'sfjs-minsusong',
  刑诉解释: 'sfjs-520821ba98',
  执行解释: 'sfjs-47398de6bd',
  执行工作若干问题的规定: 'sfjs-47398de6bd',
  民法典合同编通则解释: 'sfjs-mfd-hetong',
  合同编通则解释: 'sfjs-mfd-hetong',
  民法典总则编解释: 'sfjs-mfd-zongze',
  总则编解释: 'sfjs-mfd-zongze',
  民法典物权编解释: 'sfjs-mfd-wuquan',
  物权编解释: 'sfjs-mfd-wuquan',
  民法典婚姻家庭编解释: 'sfjs-mfd-hunyin-1',
  婚姻家庭编解释: 'sfjs-mfd-hunyin-1',
  民法典继承编解释: 'sfjs-mfd-jicheng',
  继承编解释: 'sfjs-mfd-jicheng',
  民法典侵权责任编解释: 'sfjs-mfd-qinquan',
  侵权责任编解释: 'sfjs-mfd-qinquan',
  民法典时间效力规定: 'sfjs-mfd-shijian',
  买卖合同解释: 'sfjs-maimai',
  商品房买卖合同解释: 'sfjs-shangpinfang',
  建设工程施工合同解释: 'sfjs-jianshe',
  人身损害赔偿解释: 'sfjs-renshen',
  劳动争议解释: 'sfjs-laodong-1',
  毒品犯罪解释: 'sfjs-295c8025f9',
  道交损害赔偿解释: 'sfjs-4ba5b4bd8a',
};

function stripBrackets(s) {
  return String(s).replace(/[〈《]([^》〉]*)[》〉]/g, '$1');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SELF_WORDS = ['本法', '本解释', '本规定', '本决定', '本条例', '本规定所称', '本解释所称'];
const GLUE = /^[\s、，,和及与或以及至第条款项目个之《》〈〉()（）0-9]+$/;

export function buildNameIndex(docs) {
  const names = new Map();
  const add = (name, docId, extra = {}) => {
    const n = String(name || '').trim();
    if (n.length < 2) return;
    if (!names.has(n)) names.set(n, { docId, ...extra });
  };

  for (const doc of docs) {
    const raw = stripBrackets(doc.title || '');
    add(raw, doc.id);
    add(raw.replace(/^中华人民共和国/, ''), doc.id);
    add(raw.replace(/^最高人民法院关于/, ''), doc.id);
    for (const a of doc.aliases || []) add(a, doc.id);
  }
  for (const [alias, docId] of Object.entries(SHORT_ALIASES)) if (docId) add(alias, docId);
  for (const [name, info] of Object.entries(SUPERSEDED)) {
    add(name, null, { successor: info.successor, note: info.note });
    add(name.replace(/^中华人民共和国/, ''), null, { successor: info.successor, note: info.note });
  }

  const sorted = [...names.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(escapeRe).join('|'), 'g');
  return { names, re, sorted };
}

export function findNameMentions(text, nameIndex) {
  const out = [];
  if (!text) return out;
  const re = new RegExp(nameIndex.re.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const info = nameIndex.names.get(m[0]);
    if (!info) continue;
    out.push({ index: m.index, end: m.index + m[0].length, name: m[0], ...info });
  }
  return out;
}

export function extractArticleRefs(text, { docId, nameIndex, window = 60, includeSelf = true } = {}) {
  const refs = [];
  if (!text) return refs;

  const mentions = findNameMentions(text, nameIndex);

  let lineStart = 0;
  for (const line of String(text).split('\n')) {
    const lineEnd = lineStart + line.length;
    const lineMentions = mentions.filter((m) => m.index >= lineStart && m.index < lineEnd);
    const anchors = findArticleRefs(line).map((r) => {
      const g = findGranularity(line, r.endIndex);
      return {
        ...r,
        kuan: g.kuan,
        xiang: g.xiang,
        absIndex: lineStart + r.index,
        absEnd: lineStart + r.endIndex,
        target: null,
        confidence: 'document',
        mentionName: undefined,
      };
    });

    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const segStart = Math.max(
        lineStart,
        1 + Math.max(
          text.lastIndexOf('。', a.absIndex - 1),
          text.lastIndexOf('；', a.absIndex - 1),
          text.lastIndexOf('\n', a.absIndex - 1),
        ),
      );
      const segBefore = text.slice(segStart, a.absIndex);

      const selfHit = SELF_WORDS.map((w) => ({ w, idx: segBefore.lastIndexOf(w) }))
        .filter((x) => x.idx >= 0)
        .sort((x, y) => y.idx - x.idx)[0];
      if (selfHit) {
        const gap = segBefore.slice(selfHit.idx + selfHit.w.length);
        if (gap.length <= 12 && /^[\s、，,和及与或至第条款项目个之的《》〈〉()0-9（）]*$/.test(gap)) {
          a.target = docId;
          a.self = true;
          a.confidence = 'explicit';
          a.mentionName = selfHit.w;
          refs.push(toRef(a, docId, true));
          continue;
        }
      }

      const prev = anchors[i - 1];
      if (prev && prev.target) {
        const gap = text.slice(prev.absEnd, a.absIndex);
        if (gap.length <= 8 && GLUE.test(gap)) {
          a.target = prev.target;
          a.confidence = prev.confidence === 'explicit' ? 'list' : prev.confidence;
          a.mentionName = prev.mentionName;
          refs.push(toRef(a, docId, false));
          continue;
        }
      }

      let best = null;
      for (const m of lineMentions) {
        if (m.index >= a.absIndex) break;
        best = m;
      }
      if (best) {
        const gap = text.slice(best.end, a.absIndex);
        const dist = gap.length;
        const hardStop = /[。；\n]/.test(gap);
        if (!hardStop && dist <= window) {
          a.target = best.docId || null;
          a.confidence = dist <= 8 && GLUE.test(gap) ? 'explicit' : 'contextual';
          a.mentionName = best.name;
          a.note = best.note;
        } else if (dist <= 80 && !hardStop) {
          a.target = best.docId || null;
          a.confidence = 'contextual';
          a.mentionName = best.name;
          a.note = best.note;
        } else if (!best.docId && dist <= 30) {
          a.target = null;
          a.confidence = 'contextual';
          a.mentionName = best.name;
          a.note = best.note;
        }
      }

      if (!a.target) a.confidence = 'document';
      refs.push(toRef(a, docId, false));
    }

    lineStart = lineEnd + 1;
  }

  return includeSelf ? refs : refs.filter((r) => !r.self);
}

function toRef(a, docId, self) {
  return {
    sourceDocId: docId,
    targetDocId: a.target || null,
    self,
    raw: a.raw,
    articleNumber: a.number,
    suffix: a.suffix || null,
    kuan: a.kuan,
    xiang: a.xiang,
    confidence: a.confidence,
    mentionName: a.mentionName,
    note: a.note,
    position: a.absIndex,
  };
}

export function extractQuotedRefs(text, { docId, nameIndex } = {}) {
  return extractArticleRefs(text, { docId, nameIndex, window: 200, includeSelf: false });
}

export function lawIdFromTitle(title, nameIndex) {
  const inner = [...String(title).matchAll(/[〈《]([^》〉]+)[》〉]/g)].map((m) => m[1]);
  for (const name of inner) {
    const info = nameIndex.names.get(name) || nameIndex.names.get(name.replace(/^中华人民共和国/, ''));
    if (info?.docId) return info.docId;
  }
  return null;
}
