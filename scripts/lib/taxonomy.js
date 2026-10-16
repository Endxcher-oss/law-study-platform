/**
 * 编 / 门类分类体系（数据驱动的注册表）：新增编只加条目与匹配规则，不改逻辑代码。
 * 分类优先级、七个编的规模与 status 含义见 docs/data-model.md。
 */

export const DIVISIONS = [
  {
    id: 'constitutional',
    name: '宪法编',
    order: 1,
    status: 'ready',
    description: '宪法、国家机构组织法、选举与代表制度、立法与监督、公民基本权利、国家安全与对外事务、国家象征与统一。',
  },
  {
    id: 'criminal',
    name: '刑法编',
    order: 2,
    status: 'ready',
    description: '刑法（总则与分则）、刑事司法解释（罪名与量刑标准）、刑事诉讼、刑事执行与矫正、特别刑法。',
  },
  {
    id: 'civil',
    name: '民法编',
    order: 3,
    status: 'ready',
    description: '民法典各编、物权与担保、合同与借贷、人格权与个人信息、婚姻家庭继承、侵权责任、知识产权、民事诉讼与执行。',
  },
  {
    id: 'commercial',
    name: '商法编',
    order: 4,
    status: 'ready',
    description: '公司与企业主体、证券与期货、保险、票据、海商海事、破产重整、金融监管、信托与资管。',
  },
  {
    id: 'social',
    name: '社会法编',
    order: 5,
    status: 'ready',
    description: '劳动与用工、社会保障、特殊群体保护、教育科技文化、卫生与健康。',
  },
  {
    id: 'administrative',
    name: '行政法编',
    order: 6,
    status: 'ready',
    description: '行政法总则性规范、行政处罚与治安、行政复议与诉讼、行业管理与公共服务、公共安全与应急。',
  },
  {
    id: 'economic',
    name: '经济法编',
    order: 7,
    status: 'ready',
    description: '市场竞争、财税与金融、质量与标准、资源环境与能源、涉外经贸。',
  },
  {
    id: 'other',
    name: '其他编（待归类）',
    order: 9,
    status: 'pending',
    description: '分类规则尚未覆盖的法律法规，等待后续建设。',
  },
];

export const DOMAINS = {
  constitutional: [
    { id: 'c-constitution', name: '宪法', order: 1 },
    { id: 'c-org', name: '国家机构与组织', order: 2 },
    { id: 'c-electoral', name: '选举与代表制度', order: 3 },
    { id: 'c-legislation', name: '立法与监督', order: 4 },
    { id: 'c-rights', name: '公民基本权利与身份', order: 5 },
    { id: 'c-security', name: '国家安全、国防与对外事务', order: 6 },
    { id: 'c-symbol', name: '国家象征与国家统一', order: 7 },
  ],
  criminal: [
    { id: 'k-general', name: '刑法（总则与分则）', order: 1 },
    { id: 'k-cases', name: '刑事司法解释（罪名与量刑）', order: 2 },
    { id: 'k-procedure', name: '刑事诉讼', order: 3 },
    { id: 'k-execution', name: '刑事执行与矫正', order: 4 },
    { id: 'k-special', name: '特别刑法与其他', order: 5 },
  ],
  civil: [
    { id: 'm-civilcode', name: '民法典总则与综合', order: 1 },
    { id: 'm-property', name: '物权、担保与不动产', order: 2 },
    { id: 'm-contract', name: '合同、借贷与交易规则', order: 3 },
    { id: 'm-personality', name: '人格权与个人信息', order: 4 },
    { id: 'm-family', name: '婚姻家庭与继承', order: 5 },
    { id: 'm-tort', name: '侵权责任与损害赔偿', order: 6 },
    { id: 'm-ip', name: '知识产权', order: 7 },
    { id: 'm-procedure', name: '民事诉讼与证据', order: 8 },
    { id: 'm-enforcement', name: '民事执行、仲裁与调解', order: 9 },
    { id: 'm-other', name: '其他民事法律', order: 10 },
  ],
  commercial: [
    { id: 's-entity', name: '公司与企业主体', order: 1 },
    { id: 's-securities', name: '证券与期货', order: 2 },
    { id: 's-insurance', name: '保险', order: 3 },
    { id: 's-negotiable', name: '票据与结算', order: 4 },
    { id: 's-maritime', name: '海商海事', order: 5 },
    { id: 's-insolvency', name: '破产与重整', order: 6 },
    { id: 's-finance', name: '金融与反洗钱', order: 7 },
    { id: 's-trust', name: '信托与资管', order: 8 },
    { id: 's-other', name: '其他商事法律', order: 9 },
  ],
  social: [
    { id: 'soc-labor', name: '劳动与用工', order: 1 },
    { id: 'soc-security', name: '社会保障', order: 2 },
    { id: 'soc-protection', name: '特殊群体与慈善', order: 3 },
    { id: 'soc-education', name: '教育、科技与文化', order: 4 },
    { id: 'soc-health', name: '卫生与健康', order: 5 },
    { id: 'soc-other', name: '其他社会法', order: 6 },
  ],
  administrative: [
    { id: 'adm-general', name: '行政法总则性规范', order: 1 },
    { id: 'adm-penalty', name: '行政处罚与治安', order: 2 },
    { id: 'adm-procedure', name: '行政复议与行政诉讼', order: 3 },
    { id: 'adm-service', name: '行业管理与公共服务', order: 4 },
    { id: 'adm-safety', name: '公共安全与应急管理', order: 5 },
    { id: 'adm-other', name: '其他行政法律', order: 6 },
  ],
  economic: [
    { id: 'eco-market', name: '市场竞争与交易秩序', order: 1 },
    { id: 'eco-finance-tax', name: '财税与金融', order: 2 },
    { id: 'eco-quality', name: '质量、标准与计量', order: 3 },
    { id: 'eco-resource', name: '资源、环境与能源', order: 4 },
    { id: 'eco-trade', name: '涉外经贸与投资', order: 5 },
    { id: 'eco-other', name: '其他经济法', order: 6 },
  ],
  other: [{ id: 'other-all', name: '待归类', order: 1 }],
};

export const CURATED_IDS = {
  'constitutional/c-constitution': ['constitution'],
  'constitutional/c-org': [
    'law-68dce69e40', 'law-6332aa3491', 'law-34014cf253', 'law-d95503e396',
    'law-01a651529a', 'law-94108ca2ea', 'law-f762d1c6cb', 'law-6e19f06baa',
    'law-4a9aed9831', 'law-f13e45e11d', 'law-ccc60f022b', 'law-922c974ba5',
    'law-370b894ed9', 'law-43678e6618', 'law-1142dcbdf8', 'law-48be66e12d',
  ],
  'constitutional/c-electoral': [
    'electoral-law', 'law-d9518d9f38', 'law-2f83499859', 'law-1a2ce7f6b3',
  ],
  'constitutional/c-legislation': ['legislation-law', 'law-98149596bd', 'law-00ed05f188'],
  'constitutional/c-rights': [
    'law-782a466a52', 'law-c19762ca25', 'patriotic-education-law', 'law-f9b2c09563',
    'law-0e5808b898', 'law-ad781f06b3', 'law-34727b030f', 'law-1e2db1f22a',
    'law-40edb05366', 'law-e006aacc71',
  ],
  'constitutional/c-security': [
    'law-c0aab3faa9', 'national-security-law', 'law-38dcae8b85', 'law-c7381e5758',
    'military-service-law', 'law-b98897c6df', 'law-8cb93801bb', 'law-0e5c9fc702',
    'law-94d4a693d0', 'law-e65d684fa8', 'law-1af1abe0c0', 'law-41e2571082',
    'law-2d9d1a0eb9', 'peoples-police-law', 'law-25ea89368d', 'law-230e7f72fe',
    'law-63d98aeca8', 'law-dded1f7d3a', 'law-0cf006585b', 'law-c2aea0b856',
    'law-945dc6f5af', 'law-9737ffce50', 'law-10d8f262fd', 'law-d42834f991',
    'law-0359d47817', 'law-a42df92478', 'law-574695b1a9', 'law-5c441dcf6c',
    'law-0e812f069c',
  ],
  'constitutional/c-symbol': [
    'national-flag-law', 'national-emblem-law', 'law-8d1cae694f', 'law-ad55cb0044',
    'law-7f379e5453',
  ],

  'criminal/k-general': ['criminal-law'],
  'criminal/k-procedure': ['criminal-procedure-law', 'sfjs-520821ba98'],
  'criminal/k-execution': ['law-589af18f36', 'law-c674c950be'],
  'criminal/k-special': [
    'law-1642188a69', 'law-9e0713ca90', 'law-1a2ce25817', 'law-cf97bb4be6',
    'law-06967a2de9', 'law-cd0fc831d4', 'law-d73888b844', 'law-c65ec9ede1',
    'anti-telecom-fraud-law',
  ],

  'civil/m-civilcode': ['civil-code', 'sfjs-mfd-zongze', 'sfjs-mfd-shijian'],
  'civil/m-property': [
    'sfjs-mfd-wuquan', 'sfjs-danbao', 'xzfg-662078a4f6', 'law-992a831900',
    'urban-real-estate-administration-law', 'law-5fd04c8db7', 'sfjs-c2428faa93',
  ],
  'civil/m-contract': [
    'sfjs-mfd-hetong', 'sfjs-maimai', 'sfjs-jiedai', 'sfjs-27244ba301',
    'sfjs-jianshe', 'sfjs-37fdaa6e8f', 'sfjs-0c90d86229', 'sfjs-5f6fa5b5cc',
    'sfjs-c7fe05429b', 'sfjs-0bb4df4166', 'sfjs-shangpinfang',
  ],
  'civil/m-personality': [
    'personal-information-protection-law', 'sfjs-2a9333bfbd', 'sfjs-cbd39aa13a',
    'law-8d296329b7', 'law-0865f96a11',
  ],
  'civil/m-family': ['sfjs-mfd-hunyin-1', 'sfjs-mfd-hunyin-2', 'sfjs-mfd-jicheng'],
  'civil/m-tort': ['sfjs-mfd-qinquan'],
  'civil/m-ip': [
    'copyright-law', 'patent-law', 'trademark-law', 'xzfg-25f76ae9c6',
    'xzfg-58f07076ea', 'xzfg-6720d534b3', 'xzfg-8ca169e595', 'xzfg-217b330e27',
  ],
  'civil/m-procedure': [
    'civil-procedure-law', 'law-2a1ac04584', 'sfjs-minsusong', 'sfjs-zhengju',
  ],
  'civil/m-enforcement': [
    'arbitration-law', 'law-95ac930197', 'sfjs-e23320b273', 'sfjs-94041b8c62',
  ],
  'civil/m-other': [
    'law-f92347d895', 'sfjs-f0d48f76d6', 'law-69ca17408c', 'law-39e968d259',
    'xzfg-8e59098ff5', 'law-9db26a8a65', 'law-ac3423e04f',
  ],

  'commercial/s-entity': [
    'company-law', 'partnership-enterprise-law', 'sole-proprietorship-enterprise-law',
    'xzfg-3a08abf240', 'xzfg-8c97b575ba', 'law-24ace43176', 'law-130dfa1c88',
  ],
  'commercial/s-securities': [
    'securities-law', 'law-4d9ca57549', 'law-c025646800', 'xzfg-0de35ca915',
  ],
  'commercial/s-insurance': ['insurance-law', 'xzfg-246c579a3c', 'sfjs-b296d68518'],
  'commercial/s-negotiable': ['law-89b9e7bc5b'],
  'commercial/s-maritime': ['law-7679d0ee6d', 'law-a030e7117b', 'law-3f031d2e97', 'law-1b46c86e99'],
  'commercial/s-insolvency': ['enterprise-bankruptcy-law'],
  'commercial/s-finance': [
    'banking-supervision-law', 'law-5ccbf2abf6', 'law-8da82f8f8a',
    'anti-money-laundering-law',
  ],
  'commercial/s-trust': ['law-cd2f1f5b38'],
  'commercial/s-other': ['e-commerce-law'],

  'social/soc-labor': [
    'labor-law', 'labor-contract-law', 'labor-dispute-mediation-arbitration-law',
    'trade-union-law', 'law-a7458586db', 'law-703831d503', 'xzfg-ec5eb2c922',
    'law-1be710e8ec',
  ],
  'social/soc-security': [
    'social-insurance-law', 'xzfg-8e4ae5638e', 'law-ede812eae9', 'law-373a1450f2',
    'law-3eaedf7e55', 'law-3f8de6abe5', 'law-3b0d2f905f',
  ],
  'social/soc-protection': [
    'minors-protection-law', 'women-rights-protection-law', 'law-ed05388bd7',
    'law-d6cb3d521f', 'law-a011ca05bb', 'law-3cfabcd7ed', 'law-f44188c3ba',
    'accessibility-law',
  ],
  'social/soc-health': [
    'infectious-disease-prevention-law', 'law-e836804815', 'law-899829ba27',
    'law-b6fc9c91eb', 'physicians-law', 'law-7962fdb163', 'law-571c241ce0',
    'law-8daf4a841f',
  ],

  'administrative/adm-general': ['law-15523ff71a', 'law-5b0dfbea59', 'lawyers-law', 'legal-aid-law', 'law-cebfc66f11', 'law-21ad6d71b5'],
  'administrative/adm-penalty': [
    'administrative-penalty-law', 'public-security-administration-punishments-law',
  ],
  'administrative/adm-procedure': ['law-2b78b78598'],
  'administrative/adm-service': [
    'law-7b8d952b7d', 'law-6226ba40d8', 'law-66d712f396', 'law-8eb7e663aa',
    'law-c0646902dd', 'law-6012917805', 'law-9f4683e022', 'law-5cc255e0b2',
    'law-eb714926aa', 'law-dfa0cf7aeb', 'law-62dadf2361', 'law-be07be63a3',
    'law-e9e0721e2f', 'law-f37f36a6f3', 'law-8198937445', 'road-traffic-safety-law',
    'law-29614e4167', 'law-2b120d8455', 'law-312dc4cfaa', 'law-513089f397',
    'law-fef59ac458',
  ],
  'administrative/adm-safety': [
    'law-29a0fef23a', 'law-a1a798e9ae', 'law-dbe8fbcf0c', 'law-f80aa26bfe',
    'law-e7ac2bb046', 'work-safety-law',
  ],

  'economic/eco-market': ['law-05d312aece', 'law-9db26a8a65', 'law-ac3423e04f'],
  'economic/eco-finance-tax': [
    'individual-income-tax-law', 'law-463876ad57', 'tax-collection-administration-law',
    'law-9f66b8a118', 'law-e51f180ab2',
  ],
  'economic/eco-quality': ['law-0ecd87eb8c', 'law-ec3694af23', 'law-44659fa333', 'law-34dde7ddf6'],
  'economic/eco-resource': ['environmental-protection-law', 'law-9db26a8a65', 'law-b94c79783f'],
  'economic/eco-trade': [
    'foreign-investment-law', 'law-e7a53a5b6b', 'law-1fd1f2abbc', 'law-86948d8df1',
    'law-fcb28dddb5',
  ],
  'economic/eco-other': [
    'law-a00bdffd51', 'law-ac622a2d4f', 'law-cd2d84491d', 'law-fe6358efe8',
    'law-29362025b8', 'law-b8c372474e',
  ],
};

export const CURATED_TITLES = [
  { re: /(刑事|犯罪|盗窃|抢劫|诈骗|抢夺|敲诈|挪用|贪污|贿赂|受贿|行贿|渎职|毒品|赌博|淫秽|拐卖|绑架|猥亵|强奸|杀人|伤害|走私|伪造|变造|掩饰|隐瞒|窝藏|包庇|销赃|非法经营|非法集资|非法吸收|黑社会|恐怖|枪支|弹药|交通肇事|危险驾驶|职务侵占|拒不执行|破坏|扰乱|妨害)/, cat: '司法解释', division: 'criminal', domain: 'k-cases' },

  { re: /(知识产权|专利|商标|著作权|不正当竞争|商业秘密|植物新品种|集成电路|域名)/, cat: '司法解释', division: 'civil', domain: 'm-ip' },
  { re: /(婚姻|家庭|继承|抚养|赡养|夫妻|亲子)/, cat: '司法解释', division: 'civil', domain: 'm-family' },
  { re: /(侵权|损害赔偿|人身损害|医疗|道路交通|精神损害|生态环境|环境污染|责任纠纷|产品质量)/, cat: '司法解释', division: 'civil', domain: 'm-tort' },
  { re: /(买卖合同|借贷|借款|民间借贷|担保|保证合同|租赁|房屋租赁|建设工程|承揽|融资租赁|技术合同|合同纠纷|不当得利|无因管理|债权|存单|票据纠纷)/, cat: '司法解释', division: 'civil', domain: 'm-contract' },
  { re: /(物权|土地|不动产|房屋登记|商品房|矿业权|农村土地|建设用地|所有权|抵押)/, cat: '司法解释', division: 'civil', domain: 'm-property' },
  { re: /(执行|拍卖|变卖|查封|扣押|冻结|失信|限制高消费|财产保全|执行异议|委托执行|执行和解|执行担保|仲裁|调解|公证|承认及执行)/, cat: '司法解释', division: 'civil', domain: 'm-enforcement' },
  { re: /(证据|诉讼|送达|审判监督|管辖|公益诉讼|代表人诉讼|审理期限|回避|独任|简易程序|小额诉讼|再审|立案|诉讼费用|送达|司法鉴定|涉外|域外|送达)/, cat: '司法解释', division: 'civil', domain: 'm-procedure' },
  { re: /(人格权|名誉|个人信息|人脸识别|肖像|隐私|人身权益)/, cat: '司法解释', division: 'civil', domain: 'm-personality' },

  { re: /(证券|期货|虚假陈述|内幕交易|操纵市场|基金|上市公司)/, cat: '司法解释', division: 'commercial', domain: 's-securities' },
  { re: /(破产|重整|管理人|清算)/, cat: '司法解释', division: 'commercial', domain: 's-insolvency' },
  { re: /(保险)/, cat: '司法解释', division: 'commercial', domain: 's-insurance' },
  { re: /(海事|海商|海上|船舶)/, cat: '司法解释', division: 'commercial', domain: 's-maritime' },
  { re: /(票据)/, cat: '司法解释', division: 'commercial', domain: 's-negotiable' },
  { re: /(公司法|企业改制|企业破产|外商投资|国有股|独资|合伙)/, cat: '司法解释', division: 'commercial', domain: 's-entity' },

  { re: /(劳动争议|劳动合同|工伤保险|职业病|人事争议|工会)/, cat: '司法解释', division: 'social', domain: 'soc-labor' },
  { re: /(社会保险|军人保险|医疗保障|救助|优抚|退役军人)/, cat: '司法解释', division: 'social', domain: 'soc-security' },
  { re: /(教育法|义务教育|高等教育|职业教育|教师法|科学技术|科普|文物|非物质文化遗产|公共文化|图书馆|体育法|电影产业|档案法|学位)/, cat: '法律', division: 'social', domain: 'soc-education' },
  { re: /(传染病|公共卫生|精神卫生|医师法|中医药|医疗|红十字会|健康|母婴保健|献血|人口与计划生育)/, cat: '法律', division: 'social', domain: 'soc-health' },

  { re: /^中华人民共和国宪法/, cat: '宪法', division: 'constitutional', domain: 'c-constitution' },
  { re: /(组织法|议事规则|选举|代表法|立法法|监督法|民族区域自治|基本法|国籍法|国旗|国徽|国歌|国家勋章|反分裂|缔结条约|对外关系法|外交特权|领事特权|人民陪审员|人民警察法|驻军法|陆地国界)/, division: 'constitutional', domain: 'c-org' },

  { re: /(行政许可|行政强制|行政复议|行政诉讼|行政处罚|治安管理处罚|公务员|政务处分|监察法|监察官|行政程序)/, division: 'administrative', domain: 'adm-procedure' },
  { re: /(消防法|突发事件应对|枪支管理|危险化学品|安全生产|矿山安全|核安全|民用爆炸物)/, division: 'administrative', domain: 'adm-safety' },

  { re: /(反垄断|反不正当竞争|消费者权益|产品质量|广告法|招标投标|拍卖法|价格法|政府采购|统计法|注册会计师|资产评估|粮食流通|旅游法)/, division: 'economic', domain: 'eco-market' },
  { re: /(税法|税收|预算|审计|会计|中国人民银行|商业银行|银行业监督|反洗钱|外汇管理|金融|保险业监督|期货交易管理)/, division: 'economic', domain: 'eco-finance-tax' },
  { re: /(质量法|标准化|计量|认证认可|特种设备|农业机械|种子法|畜牧法|渔业法|动物防疫|农产品质量|植物检疫)/, division: 'economic', domain: 'eco-quality' },
  { re: /(环境|污染|生态|水法|水土保持|森林|草原|矿产资源|能源|电力|煤炭|可再生|清洁生产|循环经济|节约能源|海洋|海域|海岛|湿地|自然保护|黑土地|国家公园|野生动物|城乡规划|防沙治沙|长江|黄河|生物安全|深海|管道保护|气象|测绘|地震|防汛)/, division: 'economic', domain: 'eco-resource' },
  { re: /(对外贸易|出口管制|进出口|海关|商检|反倾销|涉外经济)/, division: 'economic', domain: 'eco-trade' },

  { re: /(公司法|合伙企业|个人独资企业|市场主体登记|企业国有资产|农民专业合作社|企业破产|破产法)/, division: 'commercial', domain: 's-entity' },
  { re: /(国有公司|国有控股)/, cat: '司法解释', division: 'commercial', domain: 's-entity' },
  { re: /(证券|期货|基金|信托)/, division: 'commercial', domain: 's-securities' },
  { re: /(保险法|保险)/, division: 'commercial', domain: 's-insurance' },
  { re: /(票据法)/, division: 'commercial', domain: 's-negotiable' },
  { re: /(海商法|海事|海上交通)/, division: 'commercial', domain: 's-maritime' },
  { re: /(电子商务)/, division: 'commercial', domain: 's-other' },

  { re: /(网络安全法|数据安全法|密码法|个人信息保护法|电子签名法)/, division: 'civil', domain: 'm-personality' },
  { re: /国有土地上房屋征收|物业管理条例|土地管理法|实施条例.*土地/, division: 'civil', domain: 'm-property' },
  { re: /(诉讼费用|国际商事法庭)/, division: 'civil', domain: 'm-procedure' },
  { re: /(医疗事故|医疗纠纷)/, division: 'civil', domain: 'm-tort' },
  { re: /(信息网络传播权)/, division: 'civil', domain: 'm-ip' },

  { re: /(家庭教育促进|未成年人|妇女权益|老年人|残疾人|慈善|无障碍)/, division: 'social', domain: 'soc-protection' },
  { re: /(食品安全|药品管理|疫苗管理|国境卫生检疫)/, division: 'social', domain: 'soc-health' },
  { re: /(女职工劳动保护|带薪年休假|农民工工资)/, division: 'social', domain: 'soc-labor' },
  { re: /(促进科技成果转化|民办教育|学位|科学技术)/, division: 'social', domain: 'soc-education' },
  { re: /住房公积金|社会保险|军人保险/, division: 'social', domain: 'soc-security' },

  { re: /(国家赔偿|行政赔偿|政府信息公开|人民防空|防洪法|防震减灾|消防|应急)/, division: 'administrative', domain: 'adm-procedure' },
  { re: /(道路交通安全法实施条例|海关|出入境|邮政|铁路法|公路法|民用航空)/, division: 'administrative', domain: 'adm-service' },

  { re: /(中小企业促进|反食品浪费|粮食安全保障|烟草专卖|价格法|旅游法)/, division: 'economic', domain: 'eco-market' },
  { re: /(土地管理法实施条例|耕地保护|原子能法|矿产资源|资源税)/, division: 'economic', domain: 'eco-resource' },
  { re: /(建设工程质量管理|质量|标准|计量|认证认可)/, division: 'economic', domain: 'eco-quality' },
];

export const RULES = [
  { re: /./, cat: '司法解释', division: 'other', domain: 'other-all' },
  { re: /./, division: 'other', domain: 'other-all' },
];

export function buildCuratedIndex() {
  const map = new Map();
  for (const [key, ids] of Object.entries(CURATED_IDS)) {
    const [division, domain] = key.split('/');
    for (const id of ids) map.set(id, { division, domain });
  }
  return map;
}

export function classify(doc, curatedIndex) {
  const hit = curatedIndex.get(doc.id);
  if (hit) return { ...hit, source: 'curated-id' };
  for (const rule of CURATED_TITLES) {
    if (rule.cat && rule.cat !== doc.category) continue;
    if (rule.re.test(doc.title || '')) {
      return { division: rule.division, domain: rule.domain, source: 'curated-title' };
    }
  }
  for (const rule of RULES) {
    if (rule.cat && rule.cat !== doc.category) continue;
    if (rule.re.test(doc.title || '')) {
      return { division: rule.division, domain: rule.domain, source: 'rule' };
    }
  }
  return { division: 'other', domain: 'other-all', source: 'fallback' };
}

export function taxonomyObject() {
  return {
    schemaVersion: 1,
    divisions: DIVISIONS.map((d) => ({
      ...d,
      domains: (DOMAINS[d.id] || []).map((x) => ({ ...x, division: d.id })),
    })),
  };
}
