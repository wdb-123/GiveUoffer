#!/usr/bin/env node

import { mkdir, writeFile } from 'fs/promises';
import { readRecruitmentMarket } from '../cli/recruitment-market-store.mjs';

const marketPath = 'workspace/ops/data/recruitment-market.json';
const outputDir = 'workspace/jobs/reports';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const reportPath = `${outputDir}/china-market-cluster-analysis-${today}.md`;

const market = await readRecruitmentMarket(marketPath, { mergeLegacyJobs: true });
const jobs = market.jobs || [];

const clusterDefs = [
  {
    id: 'robotics-system',
    title: '机器人系统 / 工业通信 / 解决方案',
    resume: 'workspace/resumes/library/01-robotics-system-engineer.md',
    match: /机器人系统|工业通信|运动控制|EtherCAT|CANopen|实时|解决方案|工业机器人|机器人相关/i,
    position: '主投方向。市场样本多，薪资上限高，与你的 EtherCAT/CANopen、ROS2、SDK、客户问题闭环最贴近。',
    resumeAdjustments: [
      '把摘要第一屏改成“机器人系统工程 + EtherCAT/CANopen + ROS2/MoveIt + 客户现场问题闭环”，少讲泛 AI。',
      '项目一放 EtherCAT 通信稳定性，写清掉 OP、首次启动无法进入 OP、多电机 CSP、0xA000、DC Sync、RT-Linux、1kHz 等关键词。',
      '把“解决方案”证据补上：需求澄清、方案设计、客户环境复现、研发协同、交付文档、问题关闭结果。',
      '猎聘高薪岗常写 3-5 年/硕士/系统架构，简历要强调“独立负责模块 + 跨团队推动”，不要包装成算法负责人。',
    ],
    humanInputs: [
      '补 2-3 个真实客户问题闭环：问题现象、客户环境、定位路径、你做了什么、最后结果。',
      '补一张 EtherCAT/CANopen/ROS2 软件架构图或文字版模块边界。',
      '补能公开的指标：稳定运行时长、测试电机数量、控制周期、下载量、客户接入数量。',
    ],
  },
  {
    id: 'robotics-sdk',
    title: '机器人软件 / ROS2 / SDK / 开发者生态',
    resume: 'workspace/resumes/library/02-robotics-software-sdk-engineer.md',
    match: /机器人软件|ROS|ROS2|SDK|平台|开发者|生态|C\+\+|Linux/i,
    position: '第二主投方向。岗位数量稳定，与你的 eRob SDK、开源 Demo、文档和客户接入效率高度相关。',
    resumeAdjustments: [
      '摘要里突出“把底层通信能力产品化为 SDK/API/Demo/文档/FAQ”，不要只写参与开发。',
      '技能区补强 C/C++、Linux、ROS2、MoveIt、URDF、SOEM/IGH、CANopen，弱化没有证据的算法词。',
      '项目写成“SDK 模块边界 + 示例工程 + 开源仓库 + 客户接入 + 文档体系”，突出可复用资产。',
      '增加 AI 工具驱动研发能力：用 Codex/Claude/Cursor 生成调试脚本、文档、测试样例、接口说明。',
    ],
    humanInputs: [
      '补 GitHub 仓库链接、star/download/issue/客户使用情况。',
      '补一个 SDK API 示例：初始化、模式切换、PDO/SDO、错误处理。',
      '补客户接入前后效率变化或重复咨询减少的证据。',
    ],
  },
  {
    id: 'embodied-data',
    title: '具身智能数据基建 / 机器人数据平台',
    resume: 'workspace/resumes/library/04-embodied-data-infra-engineer.md',
    match: /具身.*数据|机器人数据|数据采集|多模态数据|训练数据|数据基建|数据平台|数据清洗|数据标注/i,
    position: '机会方向。高质量岗位少，但未来空间好；当前市场混入大量低薪数据采集外包，需要严格筛选。',
    resumeAdjustments: [
      '定位必须写成“机器人系统背景 + AI 数据治理/评测闭环迁移到具身数据平台”，不要写成传统大数据工程师。',
      '把 ZeroErr GPT 的文档解析、清洗、切分、索引、Evidence API、评测集、失败样本回流映射为数据基建能力。',
      '增加“机器人数据来源理解”：状态、轨迹、控制指令、动作序列、通信日志、错误码、仿真数据。',
      '对低薪“数据采集员”岗位明确不主投；只跟进“数据平台/数据工程/数据质量/训练数据基础设施”。',
    ],
    humanInputs: [
      '补一个机器人数据 Pipeline Demo：ROS bag/MCAP 或日志 -> 清洗 -> 标注/质检 -> 数据版本 -> 评测。',
      '补你实际处理过的日志、错误码、对象字典、表格、图片资料规模。',
      '补 MinIO/DVC/Label Studio/CVAT/MLflow/W&B 其中至少 1-2 个可演示工具链。',
    ],
  },
  {
    id: 'rag-agent',
    title: '企业级 AI / RAG / Agent / 知识库',
    resume: 'workspace/resumes/library/06-enterprise-ai-rag-engineer.md',
    match: /RAG|Agent|知识库|大模型|LLM|检索|重排|Evidence|OpenAI|FastAPI|Dify|LangChain/i,
    position: '高匹配但要分层投递。AI 应用/RAG 工程适合，纯算法训练/大模型算法岗不宜主投。',
    resumeAdjustments: [
      '第一屏必须写清“从 0 到 1 企业级 RAG/Agent 系统”，附 Top-10 召回、测试集、业务降本或重复咨询减少。',
      '项目细节补“文档解析、标题增强、混合检索、重排、Evidence API、OpenAI-compatible API、CLI、私有化部署”。',
      '把机器人行业资料复杂度作为差异化：协议、对象字典、错误码、表格、图片、客户问题。',
      '避免写成只会调 LangChain/Dify；要突出自建评测、失败样本回流、证据可追溯和业务闭环。',
    ],
    humanInputs: [
      '补系统架构图、接口截图、评测结果表、失败样本修复案例。',
      '补线上/内部使用数据：用户数、查询量、响应时间、成本、重复咨询减少比例。',
      '补部署环境：模型、向量库、reranker、API 服务、权限或日志方案。',
    ],
  },
  {
    id: 'embodied-app',
    title: '具身智能应用 / 仿真 / 机器人产品解决方案',
    resume: 'workspace/resumes/library/03-embodied-ai-application-engineer.md',
    match: /具身智能应用|仿真|Isaac|MuJoCo|Unity|路径规划|导航|机器人产品|项目经理|产教融合|智能硬件/i,
    position: '可选方向。适合 AI+机器人复合叙事，但要避开纯销售、产教融合、算法深度过高的岗位。',
    resumeAdjustments: [
      '强调 Isaac/URDF/STL/ROS2/MoveIt 的实际探索和 AI 展区机械臂调试支持。',
      '把产品/解决方案能力写成“机器人场景理解 + 技术方案 + Demo/交付 + 客户沟通”。',
      '如果投应用工程师，保留 C++/Python/机器人编程；如果投产品方案，强化需求分析和交付闭环。',
      '不要把自己包装成强化学习/模仿学习/视觉算法候选人。',
    ],
    humanInputs: [
      '补 AI 展区机械臂项目：场景、硬件、你的任务、调试问题、交付结果。',
      '补 Isaac/ROS2/MoveIt 可截图或可演示 Demo。',
      '补客户/展区/售前方案材料中可公开的一页案例。',
    ],
  },
];

const clusters = clusterDefs.map((def) => {
  const clusterJobs = jobs.filter((job) => jobMatches(job, def.match));
  return { ...def, jobs: clusterJobs, stats: summarize(clusterJobs) };
});

const unclustered = jobs.filter((job) => !clusters.some((cluster) => cluster.jobs.includes(job)));

await mkdir(outputDir, { recursive: true });
await writeFile(reportPath, renderReport(), 'utf8');

console.log(JSON.stringify({
  reportPath,
  totalJobs: jobs.length,
  clusters: clusters.map((cluster) => ({
    id: cluster.id,
    title: cluster.title,
    jobs: cluster.jobs.length,
    avgScore: cluster.stats.avgScore,
    targetSalaryJobs: cluster.stats.targetSalaryJobs,
  })),
  unclustered: unclustered.length,
}, null, 2));

function jobMatches(job, pattern) {
  const text = [
    job.company,
    job.role,
    job.direction,
    job.salary,
    job.platform,
    job.source,
    ...(job.keywords || []),
    job.rawText,
    job.fitReason,
    job.evidenceGap,
  ].filter(Boolean).join(' ');
  return pattern.test(text);
}

function summarize(items) {
  const scored = items.map((job) => Number(job.matchScore || 0)).filter(Boolean);
  const salaries = items.map((job) => salaryValue(job.salary || job.rawText || job.role)).filter(Boolean);
  return {
    count: items.length,
    avgScore: scored.length ? Number((scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1)) : 0,
    maxScore: scored.length ? Math.max(...scored) : 0,
    avgSalary: salaries.length ? Number((salaries.reduce((a, b) => a + b, 0) / salaries.length).toFixed(1)) : 0,
    targetSalaryJobs: salaries.filter((salary) => salary >= 35).length,
    platforms: topValues(items.map((job) => job.platform || job.source || '未知'), 5),
    keywords: topValues(items.flatMap((job) => job.keywords || []), 12),
    topJobs: [...items]
      .sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0) || salaryValue(b.salary || b.rawText || b.role) - salaryValue(a.salary || a.rawText || a.role))
      .slice(0, 6),
  };
}

function topValues(values, limit) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-Hans')).slice(0, limit);
}

function salaryValue(raw) {
  const value = String(raw || '');
  const cn = value.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*万/);
  if (cn) return ((Number(cn[1]) + Number(cn[2])) / 2) * 10;
  const k = value.match(/(\d{1,3})\s*[kK]\s*[-~－]\s*(\d{1,3})\s*[kK]/);
  if (k) return (Number(k[1]) + Number(k[2])) / 2;
  const k2 = value.match(/(\d{1,3})\s*[-~－]\s*(\d{1,3})\s*[kK]/);
  if (k2) return (Number(k2[1]) + Number(k2[2])) / 2;
  const yuan = value.match(/(\d{4,5})\s*-\s*(\d{4,5})元/);
  if (yuan) return (Number(yuan[1]) + Number(yuan[2])) / 2000;
  return 0;
}

function renderReport() {
  return `# 中国招聘市场聚类分析与简历调整建议

更新时间：${today}

## 本次检索概况

- 岗位样本：${jobs.length} 条
- 新增检索方式：直接平台爬虫 + 已登录页面采集记录 + 官网/聚合来源
- 聚类口径：按岗位关键词和方向信号做“非互斥方向聚类”，同一岗位可能同时属于机器人系统、SDK 或具身应用方向。
- 覆盖渠道：${topValues(jobs.map((job) => job.platform || job.source || '未知'), 12).map(([name, count]) => `${name} ${count}`).join('、')}
- 联系方式：平台详情页已尝试提取公开邮箱；当前样本未发现可直接邮箱投递的公开邮箱，主路径仍是平台沟通、官网投递或猎头私域。
- 薪资目标：按你的期望 35K-45K，优先关注“系统/软件/解决方案/AI 工程”而不是低薪数据采集外包。

## 聚类结论

${clusters.map(renderCluster).join('\n\n')}

## 应立即改的简历结构

1. 首页摘要保留 3 个版本：机器人系统版、机器人软件/SDK 版、RAG/Agent 版。具身数据版作为机会方向，不要和主简历混成一个泛泛版本。
2. 每个方向第一项目必须换：系统岗放 EtherCAT 稳定性；SDK 岗放 eRob SDK；RAG 岗放 ZeroErr GPT；具身数据岗放数据治理 + 机器人数据来源理解。
3. 增加“市场关键词映射”小节：每份简历只放该方向的 10-14 个关键词，不要所有关键词堆在一起。
4. 增加“可验证证据”：仓库、Demo、架构图、评测表、下载量、测试集规模、客户问题闭环、业务指标。
5. 删除或降权低命中内容：没有证据的强化学习/模仿学习/视觉算法、大数据 Spark/Flink/Hive、纯产品销售叙事。

## 下一轮需要你补充的信息

- EtherCAT/CANopen：最典型的 3 个故障闭环案例，每个按“现象-环境-定位-动作-结果”写。
- SDK：公开仓库链接、核心 API 示例、下载量/客户使用/issue 情况。
- RAG：架构图、评测截图或表格、Top-10 召回细节、失败样本修复案例、部署方式。
- 具身数据：做一个最小 Demo，哪怕是 ROS/log/CSV -> 清洗 -> 版本管理 -> 质检报告，也比只写概念强。
- AI 工具研发：补 2 个你用 Codex/Claude/Cursor 真实提升研发效率的例子。

## 不建议主投的方向

- 低薪“具身数据采集员”：样本多但薪资明显低，且更像外包执行岗。
- 纯算法岗：如 VLA、Diffusion Policy、强化学习、视觉算法，除非 JD 同时接受系统工程/数据平台背景。
- 纯销售/产教融合岗：可以作为沟通练习，不应占用主投名额。
`;
}

function renderCluster(cluster) {
  const stat = cluster.stats;
  const topJobs = stat.topJobs.map((job) => {
    const salary = job.salary || '未披露';
    const source = job.platform || job.source || '未知';
    return `| ${pipe(job.company)} | ${pipe(job.role)} | ${pipe(salary)} | ${Number(job.matchScore || 0).toFixed(1)} | ${pipe(source)} |`;
  }).join('\n') || '| - | - | - | - | - |';

  return `### ${cluster.title}

**定位判断：** ${cluster.position}

**样本统计：** ${stat.count} 条；平均匹配 ${stat.avgScore}；最高匹配 ${stat.maxScore}；薪资均值约 ${stat.avgSalary ? `${stat.avgSalary}K` : '未能估算'}；达到 35K+ 的样本 ${stat.targetSalaryJobs} 条。

**主要渠道：** ${stat.platforms.map(([name, count]) => `${name}(${count})`).join('、') || '-'}

**高频关键词：** ${stat.keywords.map(([name, count]) => `${name}(${count})`).join('、') || '-'}

**建议使用简历：** \`${cluster.resume}\`

| 公司 | 岗位 | 薪资 | 匹配 | 来源 |
|---|---|---|---:|---|
${topJobs}

**简历调整：**

${cluster.resumeAdjustments.map((item) => `- ${item}`).join('\n')}

**需要你补充：**

${cluster.humanInputs.map((item) => `- ${item}`).join('\n')}`;
}

function pipe(value) {
  return String(value ?? '').replaceAll('|', '/').replace(/\s+/g, ' ').trim();
}
