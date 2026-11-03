/** 分类体系：八个法律部门 + 司法解释、行政法规、指导性案例三类文件。 */

export const DEPARTMENTS = [
  {
    id: 'constitutional',
    name: '宪法相关法',
    order: 1,
    description: '宪法、国家机构组织法、选举与代表制度、立法与监督、公民基本权利、国家安全与对外事务、国家象征与统一。',
  },
  {
    id: 'criminal',
    name: '刑法',
    order: 2,
    description: '刑法典与特别刑法、刑事处罚与罪名体系。',
  },
  {
    id: 'civil-commercial',
    name: '民法商法',
    order: 3,
    description: '民法典各编、物权与担保、合同与借贷、婚姻家庭继承、侵权责任、知识产权、公司与企业、证券期货、保险票据、海商海事、破产重整。',
  },
  {
    id: 'administrative',
    name: '行政法',
    order: 4,
    description: '行政法总则性规范、行政处罚与治安、行政复议与诉讼、教育卫生与公共服务、公共安全与应急。',
  },
  {
    id: 'economic',
    name: '经济法',
    order: 5,
    description: '市场竞争、财税与金融、质量与标准、能源与资源、涉外经贸。',
  },
  {
    id: 'social',
    name: '社会法',
    order: 6,
    description: '劳动与用工、社会保障、特殊群体保护、公益事业。',
  },
  {
    id: 'ecological-environment',
    name: '生态环境法',
    order: 7,
    description: '生态环境保护、污染防治、生态保护与绿色低碳发展。',
  },
  {
    id: 'litigation',
    name: '诉讼与非诉讼程序法',
    order: 8,
    description: '民事诉讼、刑事诉讼、行政诉讼、仲裁与调解、海事诉讼与引渡。',
  },
];

export const SPECIAL_CATEGORIES = [
  {
    id: 'interpretation',
    name: '司法解释',
    kind: 'interpretation',
    order: 9,
    description: '最高人民法院、最高人民检察院就法律适用作出的解释与规定。',
  },
  {
    id: 'regulation',
    name: '行政法规',
    kind: 'regulation',
    order: 10,
    description: '国务院制定的条例、规定与办法。',
  },
  {
    id: 'case',
    name: '指导性案例',
    kind: 'case',
    order: 11,
    description: '最高人民法院发布的指导性案例。',
  },
];

export const CATEGORIES = [
  ...DEPARTMENTS.map((item) => ({ ...item, kind: 'department' })),
  ...SPECIAL_CATEGORIES,
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((item) => [item.id, item]));

/** 法律按 departments.json 的 docId 映射归入部门；司法解释、行政法规按文件类别归类。 */
export function categoryOf(doc, departments) {
  if (doc.category === '法律' || doc.category === '宪法') {
    const id = departments.get(doc.id);
    if (!id) throw new Error(`法律未在 data/taxonomy/departments.json 中归类：${doc.id} ${doc.title}`);
    if (!CATEGORY_BY_ID.has(id) || CATEGORY_BY_ID.get(id).kind !== 'department') {
      throw new Error(`部门 id 不在分类表中：${doc.id} → ${id}`);
    }
    return id;
  }
  if (doc.category === '司法解释') return 'interpretation';
  if (doc.category === '行政法规') return 'regulation';
  throw new Error(`未知文件类别：${doc.category}（${doc.id}）`);
}

export function taxonomyObject(stats = {}) {
  return {
    schemaVersion: 2,
    categories: CATEGORIES.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      order: category.order,
      description: category.description,
      documents: stats[category.id]?.documents ?? 0,
      articles: stats[category.id]?.articles ?? 0,
    })),
  };
}
