# 具身智能数据基建方向研究笔记

**目标：** 为韦东波投递「具身智能数据基建工程师 / 具身智能数据工程师 / 机器人训练数据平台工程师 / 多模态数据平台工程师」建立岗位画像、匹配证据、短板清单和准备路线。

## 1. 方向定义

这个方向不是传统机器人控制岗位，也不是普通 RAG 岗位，更不是纯 Spark/Flink/Hive 大数据岗位。它位于以下交叉点：

- 机器人系统：真实机器人、传感器、状态、轨迹、动作序列、控制指令、日志、仿真数据。
- 多模态数据：图像、视频、3D、点云、语言指令、人机交互、对象与场景语义。
- AI 数据工程：导入、解析、清洗、去重、切分、标注、质量评估、版本管理、索引、缓存、数据集构建。
- 模型训练闭环：数据选择、训练、评估、失败样本回流、数据增广、合成数据、DataOps / MLOps。

一句话定位：

> 机器人系统工程背景出身，做过企业级 AI 数据治理、知识库、RAG/Agent、评测闭环和机器人底层系统，正在切入具身智能训练数据基础设施方向的复合型工程师。

## 2. 公开 JD 信号

### 腾讯：数据引擎工程师（具身智能）

来源显示该岗位来自腾讯官网，发布日期为 2026-02-13，工作地点包含深圳。

岗位职责核心信号：

- 基于 LLM/VLM、经典视觉模型、图像视频生成模型，构建自动数据理解与自标注能力。
- 规模化抽取物体语义、场景语义、人类意图、对象与人-物交互关系、时序与因果信息。
- 研发图像、视频、3D、轨迹层面的数据增广与物理一致性合成。
- 建立覆盖完整性、准确性、偏差、时空一致性、可学习性的质量评估体系。
- 与算法和机器人团队围绕操作模型、感知模型制定数据策略，做“数据-训练-评估-回收”闭环。
- 集成大模型与工具生态，编排模型 API 和推理服务，沉淀管道组件、Prompt 模板与评测脚本。

岗位要求核心信号：

- Python、Linux、Git、容器化、CI/CD。
- 数据清洗与 ETL、任务调度、分布式计算、对象存储、消息队列、数据版本管理。
- 多模态/视觉：检测、分割、跟踪、姿态估计、3D 重建、事件分割。
- 开源模型工具：OpenMMLab、Detectron2、SegmentAnything、LLaVA、InternVL、Qwen-VL。
- 生成式模型：Diffusion、可控生成、合成数据、难例增广。
- LLM/VLM API 编排、Prompt 工程、函数调用、工具链集成。
- 标注体系、质检机制、主动学习、人机协同。
- 数据选择、采样、去偏、覆盖度评估、弱监督/半监督/自监督、伪标签。
- 具身智能/机器人基础：操作轨迹表示、模仿学习、行为克隆、策略学习、可供性、接触事件、人机交互意图。

加分项：

- 真实机器人数据经验：多传感器同步、标定、手眼协调、力/触觉。
- 仿真到现实迁移：Domain Randomization / Sim2Real。
- 3D 与场景生成：NeRF、Gaussian Splatting、场景重建、资产管线。
- MLOps / DataOps：MLflow、Weights & Biases、ClearML。
- 数据与训练的可观测性、可追溯体系。
- 开源数据集、评测基准、论文/专利、知识图谱、关系抽取、事件抽取。

### 腾讯 Robotics X：具身智能平台研发工程师

相邻岗位信号：

- 参与具身智能平台架构设计和模块研发。
- 支持实验室算法和数据能力开放，提供稳定、高效、安全服务。
- 建设具身智能仿真平台，支持多模态感知、决策规划、运动操作、人机交互算法迭代。
- 建设云边协同、安全防护、资源调配、机器人社区生态、开发者工具套件。

这说明腾讯具身智能方向不只要算法，也需要平台、服务化、数据开放、仿真和开发者生态能力。

### 海外 Robotics Data Infrastructure / Data Platform 岗位信号

海外机器人数据平台岗位普遍强调：

- 从真实机器人采集传感器、遥测、训练数据。
- 管理大规模多模态数据集，包括图像、视频、时间序列、文本、机器人状态、力/扭矩和标注。
- 建立云端和边缘侧数据管线。
- 建设数据质量、血缘、治理、访问、安全和版本体系。
- 将真实机器人数据连接到模型训练、评估、fleet analytics 和运营报告。
- 使用 DataOps / MLOps 管道自动化数据验证、标注、增广、训练和评估。

## 3. 与韦东波经历的匹配映射

| JD 能力 | 现有证据 | 匹配强度 |
|---|---|---|
| 多源工程数据治理 | ZeroErr GPT 处理产品手册、通信协议、FAQ、售后经验、表格、图片、客户问题 | 强 |
| 数据解析、切分、索引、检索 | 文档解析、知识切分、章节结构、标题增强、语义/关键词/混合检索、重排 | 强 |
| 质量评估与评测闭环 | 标准测试集约 1000 条，自动化评测，Top-10 召回率约 98%，失败样本回流 | 强 |
| API / 工具链集成 | OpenAI-compatible API、CLI、FastAPI、OpenWebUI、Dify、LangChain、Codex 接入 | 强 |
| 机器人数据来源理解 | eRob 关节、EtherCAT/CANopen/CAN、CiA402、PDO/SDO、CSP/CST/PP/PT、ROS2/MoveIt/URDF | 强 |
| 异常数据与问题闭环 | 掉 OP、首次启动无法进入 OP、多电机 CSP、主站掉线、RT-Linux、DC Sync 排查 | 强 |
| 仿真与具身生态 | Isaac Sim、Isaac Lab、URDF/STL、ROS2/MoveIt、NVIDIA 生态探索 | 中 |
| 多模态视觉模型 | 有图片/表格资料处理和 VLM 关注，但缺少 OpenMMLab/SAM/检测分割实战 | 中弱 |
| 大规模 DataOps / 分布式 | 有企业数据治理和管线意识，但缺少 Airflow/Prefect、对象存储、消息队列、分布式计算项目 | 弱 |
| 真实机器人训练数据 | 懂状态、轨迹、控制指令和日志来源，但缺少成规模训练数据集建设项目 | 中弱 |

## 4. 简历包装策略

不要包装成“资深大数据工程师”。应包装成：

> 具备机器人系统和企业 AI 数据治理双背景，能理解机器人数据来源，并把分散工程资料、日志、客户问题和知识沉淀成可检索、可评测、可追溯、可复用的数据资产。

### ZeroErr GPT 项目包装

从“售后问答系统”升级为：

> 机器人行业知识数据平台 / 企业级 AI 数据治理系统 / 售后知识数据闭环系统。

强调：

- 多源工程资料：产品手册、通信协议、对象字典、错误码、FAQ、客户问题、售后经验、表格、图片。
- 数据治理：解析、清洗、切分、结构化、索引、检索、质量评估、版本迭代。
- 质量闭环：标准测试集、自动化评测、失败样本回流。
- 可追溯：Evidence API 返回来源、章节、页码、原文片段、表格、图片摘要。
- 类比具身智能：训练数据治理、质量评估、数据闭环和可追溯系统。

### eRob SDK 项目包装

从“SDK/通信”升级为：

> 理解机器人本体、控制器、状态数据、通信数据和仿真生态的数据来源。

强调：

- 熟悉机器人关节通信、状态机、控制模式、错误码、对象字典。
- 能理解机器人训练数据中的状态、轨迹、控制指令、动作序列、错误状态、日志和仿真数据。
- 熟悉 ROS2 / MoveIt / URDF / Isaac Sim 生态。

### EtherCAT 稳定性项目包装

从“通信问题排查”升级为：

> 复杂机器人系统异常数据排查、质量评估和工程闭环。

强调：

- 掉 OP、多电机 CSP、首次启动失败是复杂系统异常。
- 可迁移到具身智能训练数据中的异常样本发现、质量评估、日志分析和数据闭环。

## 5. 搜索关键词

### 中文岗位关键词

- 具身智能数据基建工程师
- 具身智能数据工程师
- 具身智能数据引擎工程师
- 机器人训练数据平台工程师
- 机器人数据平台工程师
- 机器人 AI 数据工程师
- 多模态数据平台工程师
- 多模态数据工程师
- AI 数据基础设施工程师
- AI 数据治理工程师
- 数据引擎工程师 具身智能
- 数据平台工程师 机器人
- 仿真数据工程师 具身智能
- 数据闭环工程师 机器人
- 机器人数据采集工程师

### 英文岗位关键词

- Robotics Data Infrastructure Engineer
- Robotics Data Platform Engineer
- Embodied AI Data Engineer
- Robot Training Data Engineer
- Multimodal Data Platform Engineer
- AI Data Infrastructure Engineer
- Robot Learning Data Engineer
- DataOps Engineer Robotics
- MLOps Engineer Robotics
- Simulation Data Engineer

### 技术关键词

- 机器人训练数据
- 多模态数据
- 图像 / 视频 / 3D / 点云 / 轨迹 / 时间序列
- 机器人状态 / 控制指令 / 动作序列 / 语言指令
- 数据导入 / 解析 / 清洗 / 去重 / 格式转换 / 元信息抽取
- 数据资产 / 数据质量 / 数据血缘 / 数据版本 / 数据权限 / 数据可追溯
- 数据 Pipeline / ETL / DataOps / MLOps
- 标注系统 / 自标注 / 主动学习 / 人机协同
- 数据增广 / 合成数据 / 难例挖掘
- 数据-训练-评估-回收闭环
- LLM / VLM / Qwen-VL / InternVL / LLaVA
- Segment Anything / OpenMMLab / Detectron2
- Isaac Sim / Isaac Lab / MuJoCo / Habitat
- Sim2Real / Domain Randomization

## 6. 技术短板清单

**短期必须补：**

- PyTorch 基础：Dataset、DataLoader、Transform、分布式/多进程读取基础。
- 多模态数据格式：JSONL、Parquet、HDF5、Zarr、WebDataset、MCAP、ROS bag。
- 数据管线：Airflow 或 Prefect 二选一，能做可运行 Demo。
- 对象存储：S3 / MinIO 基础，数据版本与元数据索引。
- 数据版本管理：DVC 或 LakeFS 基础。
- 标注与质检：Label Studio / CVAT / FiftyOne 基础。
- 视觉模型工具：Segment Anything、GroundingDINO、YOLO/Detectron2、OpenMMLab 基础使用。
- MLOps 观测：MLflow 或 Weights & Biases 基础。

**中期补强：**

- 机器人数据格式：ROS bag / MCAP 到训练样本的数据转换。
- 轨迹数据表示：状态、动作、观察、奖励、语言指令、episode、timestamp 对齐。
- 仿真数据采集：Isaac Sim / Isaac Lab 输出 RGB、Depth、Segmentation、Pose、Joint State。
- 数据质量指标：完整性、准确性、覆盖度、去重率、时序一致性、可学习性、异常率。
- 3D/场景：NeRF、Gaussian Splatting、3D reconstruction 只需理解管线和岗位语言，暂不硬包装为经验。

## 7. 可补做 Demo

### Demo 1：机器人多模态数据集构建 Pipeline

目标：用公开数据或自造 Isaac/ROS 示例数据，构建一个从原始数据到训练样本的最小闭环。

组件：

- 输入：ROS bag / MCAP / JSONL / 图片视频文件。
- 处理：解析、清洗、切分 episode、抽取 metadata、去重、质量检查。
- 输出：JSONL + Parquet / WebDataset。
- 管理：DVC 或 MinIO + manifest。
- 评测：统计完整性、帧率、缺失字段、时间戳一致性。

### Demo 2：具身智能数据质量评估 Dashboard

目标：展示你能把数据质量变成工程系统。

指标：

- 数据完整性、字段缺失、重复样本、episode 长度分布、传感器同步偏差、轨迹异常、标签覆盖。
- 可视化：Streamlit / FastAPI + simple frontend。

### Demo 3：机器人知识数据 + 轨迹数据 Evidence API

目标：把你的 RAG / Evidence API 优势迁移到具身数据。

能力：

- 查询某个异常样本或任务失败 episode。
- 返回相关日志、状态、动作片段、文档依据、FAQ、历史问题。
- 形成“样本 -> 证据 -> 诊断 -> 回流”的闭环。

## 8. 面试叙事

### 60 秒自我介绍骨架

我是韦东波，南方科技大学智能制造与机器人硕士，目前在机器人关节模组公司做机器人软件和企业 AI 系统。我一方面参与 eRob 关节 SDK、EtherCAT/CANopen、ROS2/MoveIt/URDF、实时 Linux 和多关节通信问题排查，理解机器人状态、控制指令、通信日志、错误码和仿真数据从哪里来；另一方面从 0 到 1 搭建了机器人行业知识数据平台和 RAG/Agent 系统，把产品手册、通信协议、FAQ、客户问题、表格图片等多源工程资料治理成可检索、可引用、可评测的数据资产，并建立了标准测试集、Evidence API 和失败样本回流机制。现在我希望把这套“机器人系统理解 + AI 数据治理 + 评测闭环”的经验迁移到具身智能训练数据基础设施方向，做多模态数据治理、数据质量评估和数据-训练-评估闭环。

### 3 分钟项目介绍骨架

主讲 ZeroErr GPT / TechChat，但不要说成客服问答系统。

结构：

1. 背景：机器人关节公司有大量工程数据，分散在产品手册、通信协议、FAQ、对象字典、错误码、客户问题和研发经验里。
2. 问题：数据不可检索、不可评测、不可追溯，技术支持和研发重复消耗。
3. 方案：做知识数据治理、文档解析、结构化切分、混合检索、重排、Evidence API、测试集、自动化评测、失败样本回流。
4. 结果：标准测试集约 1000 条，Top-10 召回率约 98%，售前售后重复咨询减少约 50%。
5. 迁移：具身智能训练数据也有类似问题，需要把分散的多模态数据变成可管理、可评测、可回流的数据资产。

## 9. 投递判断标准

**强投：**

- JD 出现“具身智能 + 数据治理 / 数据平台 / 数据闭环 / 多模态数据 / 训练数据”。
- JD 需要机器人基础，同时不强制要求资深大数据平台经验。
- JD 重视 Python、API 编排、数据处理、评测、工具链和跨团队协作。

**谨慎投：**

- 强制 3 年以上纯大数据平台，要求 Spark/Flink/Hive/Kafka 大规模生产经验。
- 强制 CV 算法研究，要求检测/分割/3D 重建论文和模型训练成果。
- 强制资深机器人学习算法，要求模仿学习/强化学习/SAC/PPO/BC 生产经验。

**可冲刺：**

- 腾讯数据引擎工程师（具身智能）：匹配叙事强，但短板在大规模 DataOps、视觉模型工具和具身训练数据实战。需要补 Demo 和面试准备。

## 10. Sources

- Tencent 数据引擎工程师（具身智能）：https://jobs.niuqizp.com/job-vUr555tMa.html
- Tencent Robotics X 具身智能平台研发工程师：https://www.linkedtour.com/jobview/72069
- Matrix 具身大模型数据工程师：https://www.matrixrobotics.ai/careers/%E5%85%B7%E8%BA%AB%E5%A4%A7%E6%A8%A1%E5%9E%8B%E6%95%B0%E6%8D%AE%E5%B7%A5%E7%A8%8B%E5%B8%88
- Robotics Data Infrastructure Engineer example：https://www.indeed.com/viewjob?jk=f4924db68b030c58
- Robotics Data Platform Engineer example：https://www.indeed.com/viewjob?jk=6c8a6b6744212463
- 2026 具身智能数据行业研究白皮书：https://dtzed.com/wp-content/uploads/2026/03/%E5%9B%BD%E5%85%88%E4%B8%AD%E5%BF%832026%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD%E6%95%B0%E6%8D%AE%E8%A1%8C%E4%B8%9A%E7%A0%94%E7%A9%B6%E7%99%BD%E7%9A%AE%E4%B9%A6.pdf
