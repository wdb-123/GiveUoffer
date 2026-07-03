# User Profile Context -- 韦东波

<!--
This file is the personal overlay for career-ops.
Keep user-specific positioning, scoring preferences, proof points, and negotiation framing here.
-->

## Target Roles

| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **机器人系统工程师** | ROS2, MoveIt, EtherCAT, CANopen, RT-Linux, 系统集成 | 能把机器人关节、通信、控制、调试和交付串起来的人 |
| **机器人软件工程师 / SDK 工程师** | SDK, Demo, 文档, 开源生态, CiA402, SOEM/IGH | 能把底层能力包装成客户可用的软件接口和开发者生态的人 |
| **具身智能应用工程师** | Isaac Sim/Lab, URDF/STL, ROS2, 机械臂, 仿真, 强化学习 | 能把机器人硬件接入仿真、展示和应用验证的人 |
| **具身智能数据基建工程师** | 训练数据, 多模态数据, 数据治理, DataOps, 质量评估, 数据闭环 | 能把机器人数据、工程知识、标注和评测体系做成可复用基础设施的人 |
| **AI + 机器人解决方案工程师** | RAG, Agent, 售后知识库, 客户问题闭环, 私有化部署 | 能把机器人行业知识、客户问题和 AI 系统落成业务价值的人 |
| **企业级 AI / RAG 工程师** | RAG, Agent, Evidence API, 评测体系, OpenAI-compatible API | 能从 0 到 1 建设可评测、可引用、可运营的企业 AI 系统的人 |
| **机器人开发者生态 / 技术产品** | SDK, 文档, 开源, 技术支持产品化, NVIDIA 生态 | 能把技术资产转化为生态、客户成功和产品能力的人 |

## Adaptive Framing

| If the role is... | Emphasize | Proof point sources |
|-------------------|-----------|---------------------|
| 机器人系统 / 控制 / 通信 | EtherCAT 掉 OP、多电机 CSP、SOEM/IGH、CiA402、RT-Linux、多关节同步、客户问题闭环 | cv.md + article-digest.md |
| ROS2 / SDK / 软件生态 | eRob SDK、CAN/CANopen/EtherCAT、ROS2/MoveIt/URDF、开源 Demo、技术文档、周下载量 50+ | cv.md + article-digest.md |
| 具身智能 / 仿真 | Isaac Sim、Isaac Lab、URDF/STL、ROS2/MoveIt、NVIDIA 生态、AI 展区机械臂交付支持 | article-digest.md |
| 具身智能数据基建 | 机器人知识数据平台、数据解析/清洗/切分/索引、Evidence API、自动化评测、失败样本回流、机器人状态/轨迹/控制指令理解 | article-digest.md + research/embodied-data-infra-direction.md |
| AI 应用 / RAG / Agent | ZeroErr GPT、Evidence API、混合检索、重排、评测闭环、Top-10 召回率约 98%、OpenAI-compatible API | cv.md + article-digest.md |
| 解决方案 / 售前售后 / 技术产品 | 客户问题到知识库、售后自动化、研发/技术支持/客户协同、NVIDIA Inception Top 10 | cv.md + article-digest.md |

## Scoring Preferences

- Strong positive: 机器人系统、机器人软件、ROS2、EtherCAT、CANopen、SDK、具身智能、AI + 机器人复合岗位。
- Strong positive: 具身智能数据基建、机器人训练数据、多模态数据平台、数据质量评估、数据闭环、DataOps/MLOps、仿真数据管线。
- Strong positive: 真实客户场景、交付闭环、从 0 到 1、复杂系统问题定位、跨部门推进。
- Positive: 初创或成长型机器人/具身智能/工业 AI 公司，但要求业务方向清晰、真实客户明确。
- Caution: 纯项目管理、纯客服、纯内部 IT、纯低层重复开发、没有客户场景或成长空间的岗位。
- Caution: 只做传统产品经理且不能体现技术复合优势的岗位。
- Caution: 强要求控制算法负责人、whole-body control、MPC、传感器融合深度的岗位。可以冲刺，但需要标记短板。
- Caution: 强制资深 Spark/Flink/Hive/Kafka 生产经验的纯大数据岗位。候选人不是传统大数据工程师，不要伪造经验。
- Caution: 强制计算机视觉算法论文或 3D 重建/扩散模型训练成果的岗位。可以用数据治理和工具链角度切入，但要标记短板。

## Signature Advantage

Frame profile as:

> 机器人系统工程背景出身，能把底层通信、客户问题、知识治理和大模型 Agent 串成可交付业务系统的 AI + 机器人复合型工程负责人。

Market-facing version:

> 我擅长把机器人行业里的复杂技术问题，沉淀成可复用的软件工具、知识系统和 AI Agent 产品。

## Education Framing

- Master: 南方科技大学，智能制造与机器人，2021 - 2024.07。
- Bachelor: 广西科技大学，车辆工程，2016 - 2020。
- Use the bachelor background to support mechanical/electromechanical fundamentals, vehicle/mobile platform intuition, controls foundation, and engineering practice. This is especially useful for mobile robot, embodied AI, robotics system, and robot chassis roles.

## AI-Native Development Skills

Emphasize that the candidate is not just an AI tool user, but an AI-native engineer who uses Codex, Claude Code, Cursor, GPT, Manus and multi-agent workflows for:

- requirement decomposition and technical planning;
- code generation, refactoring, debugging and script automation;
- API / CLI / RAG / Agent workflow development;
- documentation, test case design and evaluation loops;
- turning recurring engineering work into reusable workflows and knowledge assets.

## Interview Stories

### Story 1: From robotics software to enterprise AI system owner

Start with robot joint communication, EtherCAT, CANopen, ROS2 and customer debugging. Then show how those real customer issues were converted into docs, FAQs, knowledge bases, test sets, Evidence API and a RAG / Agent system used by support, R&D and customers.

### Story 2: Customer issue to productized knowledge system

Customer issues should not disappear after one support case. The candidate turned customer problems, technical support experience and R&D debugging paths into reusable documents, FAQs, knowledge base entries, evaluation data and Agent tools.

### Story 3: Complex system single-point breakthrough

EtherCAT dropped OP, multi-motor CSP issues, RT-Linux, DC Sync and first-start OP failures are not simple bugs. They involve master, slave, realtime scheduling, network cards, state machines and customer environments. The candidate can reproduce, isolate, coordinate and turn the finding into an engineering solution.

### Story 4: From robotics system data to embodied AI data infrastructure

The candidate understands where robot data comes from: joint state, control commands, object dictionary, error codes, communication logs, ROS2/MoveIt/URDF, Isaac simulation assets, customer issue records and technical documents. Position ZeroErr GPT / TechChat as a robot-industry knowledge data platform: parsing, cleaning, chunking, indexing, quality evaluation, Evidence API, automated benchmarks and failed-sample feedback loops. Map this to embodied AI training data governance and data-training-evaluation-recovery loops.

## Compensation

Use `config/profile.yml`: target 35K-45K/month, minimum 35K/month, CNY. For roles below 35K/month, score compensation low unless the company is strategically exceptional and can provide a higher-level HC.

## Location Policy

深圳优先。可根据岗位质量考虑其他城市或混合办公。For Boss 直聘 screening, Shenzhen roles with 35K-45K/month and strong robotics/AI overlap should be prioritized.

## Job Intake Preferences

For Boss 直聘 and other web job intake, do not store list summaries as final job records. Final入库 must be based on JD detail text.

Required fields for each imported job:

- 岗位名称
- 公司名称
- 薪资
- Base 城市 / 区域
- 详细工作地址
- 岗位网址
- 来源平台
- 搜索关键词
- 抓取/入库时间
- JD 全文：岗位职责、任职要求、加分项和其他页面可见岗位内容

Preferred workflow:

1. Use list summaries only for fast filtering and deduplication.
2. Open or select each promising job and read the JD detail panel before writing to the job market.
3. Import 10 detailed JDs per batch by default, then score and filter before continuing.
4. Never click external submit, apply, or immediate-chat actions without explicit user confirmation.
