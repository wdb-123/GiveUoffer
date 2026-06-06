# 韦东波 - 机器人具身智能软件工程师-系统集成

深圳 | 2 年工作经验 | 181 7224 4940 | 12132301@mail.sustech.edu.cn | github.com/ZeroErrControl

## 个人摘要

南方科技大学智能制造与机器人硕士，现任机器人关节模组企业机器人软件工程师 / 企业级 AI 负责人。主要参与 eRob 机器人关节通信 SDK 与软件生态建设，覆盖 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Demo 和开发者文档；熟悉 CiA402 状态机、PDO / SDO 通信、控制模式切换、SOEM / IGH EtherCAT、RT-Linux、DC Sync、SM Sync 等机器人系统集成与工业通信问题。具备多关节 EtherCAT 稳定性测试、掉 OP / 主站掉线 / 多电机 CSP 异常问题复现定位、客户问题闭环、技术文档沉淀和企业级 RAG / Agent 知识系统建设经验，能够支撑机器人 SDK 接入、系统联调、工程知识治理与具身智能相关软件工具链建设。

## 核心技能

- 机器人软件与系统集成：ROS2、MoveIt、URDF、机器人关节模组、机械臂系统集成、Demo 工程、开发者文档
- 工业通信与运动控制：EtherCAT、CANopen、CAN、SOEM、IGH EtherCAT、CiA402、PDO / SDO、CSP、CST、PP、PT
- 实时系统与稳定性调试：RT-Linux、DC Sync、SM Sync、1kHz 控制周期、CPU 隔离、Intel I350 网卡、多关节同步、掉 OP 问题排查
- 编程与工程化：Python、C / C++、Shell、Linux、Git、SDK 接入、API 示例、技术支持问题闭环
- AI 与知识工程：RAG、Agent、FastAPI、OpenAI-compatible API、混合检索、重排、Evidence API、评测集、失败样本回流
- 数据与工具链方向：机器人日志、状态、动作、图像 / 视频数据、ROS bag、DataOps、DVC、MinIO、Label Studio

## 项目经历

### eRob 机器人关节通信 SDK 与开源生态

- 围绕 eRob 机器人关节模组建设软件接入能力，覆盖 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Demo 和开发者文档。
- 基于 SOEM / IGH EtherCAT 主站沉淀设备初始化、CiA402 状态机、控制字 / 状态字、PDO / SDO 通信、对象字典、控制模式切换和故障处理等可复用工程能力。
- 支持 CSP、CST、PP、PT 等运动模式相关示例和上位机工程，面向机器人关节客户提供 SDK 接入与技术支持。
- 维护 GitHub 开源仓库与开发者资料，仓库周下载量 50+，月均约 240。
- 项目技术栈覆盖 Python、C / C++、SOEM、IGH EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Linux。

### EtherCAT 掉 OP / 多关节通信稳定性测试

- 参与多关节 EtherCAT 通信稳定性测试，围绕掉 OP、首次启动无法进入 OP、0xA000 主站掉线、多电机 CSP 异常等问题开展复现、分析和闭环。
- 分析 SOEM / IGH 主站、DC 同步、SM 同步、CiA402 状态机、PDO / SDO、AL Status / AL Control、周期时间、主站调度和从站状态切换等关键变量。
- 测试 1ms / 2ms 周期、1kHz 收发、实时内核、CPU 隔离、Intel I350 网卡等工程配置对通信稳定性的影响。
- 协同研发、技术支持和客户侧推进问题定位与解决方案，并将现场问题沉淀为内部文档、FAQ 和知识库数据。

### ZeroErr GPT / TechChat 企业级售后知识问答系统

- 从 0 到 1 搭建面向机器人关节产品的售前售后 RAG / Agent 系统，将产品手册、通信协议、FAQ、售后经验、表格和图片资料治理为可检索、可引用、可评测的知识服务。
- 负责文档解析、知识切分、标题增强、混合检索、重排、Evidence API、评测集建设和失败样本回流等核心环节。
- 建立约 1000 条标准测试集，Top-10 召回率约 98.0%。
- 通过知识系统沉淀产品协议、对象字典、错误码、现场问题和技术支持经验，减少售前售后重复产品咨询约 50%。
- 技术栈包括 Python、FastAPI、OpenAI-compatible API、向量检索、重排模型、OpenWebUI / Dify / LangChain、vLLM、Qwen、DeepSeek。

### 机器人多模态数据 Pipeline Demo

- 围绕具身智能数据基建方向，设计机器人多模态数据集构建 Pipeline Demo，目标是将机器人日志、状态、动作、轨迹、图像 / 视频和问题样本沉淀为可质检、可版本化、可评测的数据闭环。
- 规划使用 ROS bag / MCAP、DVC / MinIO、Label Studio / CVAT、PyTorch Dataset / DataLoader 等工具链，支持数据清洗、质检、版本管理与统计报告生成。
- 可复用 EtherCAT 日志、错误码、对象字典、状态和轨迹理解作为数据来源，用于补强具身智能训练数据、机器人运行数据治理和问题样本回流能力。
- 当前为自建规划 / Demo 阶段，尚需补齐可运行样本、数据版本、标注质检和评测截图后再作为完成项目投递。

## 工作经历

### 深圳市零差云控科技有限公司

机器人软件工程师 / 企业级 AI 负责人 | 2024.07 - 至今

- 负责 eRob 机器人关节通信 SDK 与软件生态建设，覆盖 CAN、CANopen、EtherCAT、ROS2 / MoveIt / URDF / Isaac 生态接入。
- 参与 EtherCAT 通信层稳定性测试与复杂现场问题闭环，围绕掉 OP、首次启动失败、主站掉线、多电机 CSP 异常等问题协同研发、技术支持和客户推进解决方案。
- 建设 GitHub 开源仓库、技术文档、Demo 工程和客户接入资料，提升机器人关节模组的软件可接入性和开发者使用效率。
- 搭建企业级 AI / RAG / Agent 系统，将机器人产品手册、通信协议、对象字典、错误码和现场问题沉淀为可复用工程知识。
- 支持 eRob 机器人关节在 NVIDIA / Isaac 生态中的导入与展示，涉及 URDF / STL 模型整理、Isaac Sim / Isaac Lab / ROS2 / MoveIt 集成探索。
- 支持 AI 展区机械臂项目调试、实时内核系统安装和交付支持。

## 教育背景

南方科技大学 | 智能制造与机器人专业 · 硕士 | 2021 - 2024.07

广西科技大学 | 车辆工程 · 本科 | 2016 - 2020

## 待人工确认

- 目标岗位信号包含“三年以上工作经验”，当前基础简历为 2 年工作经验，需确认是否有可计入的研究生项目、实习或机器人相关工程经历可合规补充。
- SDK 项目需补充具体模块边界、API 数量、Demo 数量、测试脚本、错误处理策略、客户接入案例和文档链接。
- EtherCAT 稳定性项目需补充从站数量、测试周期、复现次数、日志证据、最终定位结论和客户侧改进结果。
- 机器人多模态数据 Pipeline 目前为规划 / Demo 阶段，需补齐可运行 demo、样本数据、版本管理、标注质检和评测截图后再强化表达。
- ZeroErr GPT / TechChat 项目需确认可公开架构图、评测截图、API 文档和脱敏真实问题闭环案例。
- NVIDIA Inception 2025 荣耀企业 Top 10 / 340、智能车竞赛、论文和专利信息如用于正式投递，需确认与候选人个人贡献和公开表述边界。
