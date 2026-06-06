# 韦东波 - AI工具链生态研发工程师

深圳 | 2 年工作经验 | 181 7224 4940 | 12132301@mail.sustech.edu.cn | github.com/ZeroErrControl

## 个人摘要

南方科技大学智能制造与机器人硕士，现任机器人软件工程师 / 企业级 AI 负责人，具备机器人软件生态、SDK、开发者文档、企业级 RAG / Agent 系统和技术知识库建设经验。参与 eRob 机器人关节通信 SDK 与开源生态建设，覆盖 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Demo 和开发者文档，沉淀设备初始化、CiA402 状态机、控制模式切换、PDO / SDO 通信和故障处理等工程能力。负责 ZeroErr GPT / TechChat 企业级售前售后知识问答系统，将机器人产品手册、通信协议、FAQ、售后经验、表格和图片资料治理为可检索、可引用、可评测的知识服务，建立约 1000 条标准测试集，Top-10 召回率约 98.0%，重复产品咨询减少约 50%。目标方向为 AI 工具链、机器人生态研发、开发者工具和机器人知识库 / RAG 工程化。

## 核心技能

- AI 工具链与知识治理：RAG、Agent、Evidence API、混合检索、重排、评测集、失败样本回流、产品知识库、技术问答系统
- AI 工程化：Python、FastAPI、OpenAI-compatible API、OpenWebUI、Dify、LangChain、vLLM、Qwen、DeepSeek
- 机器人软件生态：机器人关节、SDK、ROS2、MoveIt、URDF、Demo 工程、开发者文档、开源仓库维护
- 工业通信与运动控制：EtherCAT、CANopen、CAN、SOEM、IGH EtherCAT、CiA402、PDO / SDO、对象字典、控制字 / 状态字
- 稳定性测试与问题闭环：CSP、CST、PP、PT、DC Sync、SM Sync、RT-Linux、1kHz 控制周期、CPU 隔离、Intel I350 网卡
- 开发与协作：C / C++、Shell、Linux、Git、技术文档、客户接入支持、研发与技术支持协同

## 项目经历

### ZeroErr GPT / TechChat 企业级售前售后知识问答系统

角色：AI 系统负责人 / RAG 与知识治理负责人

- 从 0 到 1 搭建面向 eRob 机器人关节产品的售前售后 RAG / Agent 系统，将产品手册、通信协议、FAQ、售后经验、表格和图片资料治理为统一知识入口。
- 参与文档解析、知识切分、标题增强、混合检索、重排、Evidence API、评测集建设和失败样本回流等能力建设。
- 将机器人通信协议、对象字典、错误码、产品手册和现场问题沉淀为可检索、可引用、可评测的工程知识服务。
- 建立约 1000 条标准测试集，Top-10 召回率约 98.0%。
- 通过知识库和问答系统支持售前售后技术咨询，重复产品咨询减少约 50%。
- 技术栈包括 Python、FastAPI、OpenAI-compatible API、OpenWebUI、Dify、LangChain、vLLM、Qwen、DeepSeek。

### eRob 机器人关节通信 SDK 与开源生态

角色：SDK 建设、开源维护与客户接入支持

- 围绕 eRob 机器人关节模组建设软件接入能力，覆盖 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Demo 和开发者文档。
- 基于 SOEM / IGH EtherCAT 主站开发 eRob EtherCAT 上位机示例和工程，支持 CSP、CST、PP、PT 等运动模式。
- 沉淀设备初始化、CiA402 状态机、控制模式切换、控制字 / 状态字、PDO / SDO 通信、对象字典和故障处理等可复用工程能力。
- 维护 GitHub 开源仓库与技术文档，仓库周下载量 50+，月均约 240。
- 面向机器人客户接入场景，支持通信协议、示例工程、开发者文档和问题排查材料的持续完善。

### EtherCAT 掉 OP / 多关节通信稳定性测试

角色：问题复现、测试分析、研发与技术支持协同

- 参与多关节 EtherCAT 通信稳定性测试，围绕掉 OP、首次启动无法进入 OP、0xA000 主站掉线、多电机 CSP 异常等问题开展复现、分析和闭环。
- 分析 SOEM / IGH 主站、DC 同步、SM 同步、周期时间、主站调度、从站状态切换、AL Status / AL Control 等关键变量。
- 测试 1ms / 2ms 周期、1kHz 收发、实时内核、CPU 隔离、Intel I350 网卡等工程配置对系统稳定性的影响。
- 覆盖 CiA402 状态机、PDO / SDO、DC Sync、SM Sync、RT-Linux 和多从站调度等机器人底层通信链路。
- 协同研发、技术支持和客户形成可执行解决方案，并将现场问题沉淀为内部文档、FAQ 和知识库数据。

### 机器人多模态数据 Pipeline Demo

角色：数据闭环 Demo 设计与实现

- 自建机器人多模态数据 Pipeline Demo 方向规划，目标是将机器人日志、状态、动作、图像和问题样本沉淀为可版本化、可评测的数据闭环。
- 方案覆盖机器人运行日志、状态、轨迹、图像 / 视频等数据的清洗、质检、版本管理与统计报告生成。
- 可复用 EtherCAT 日志、错误码、对象字典、状态和轨迹理解作为数据来源。
- 技术方向包括 Python、ROS2 / rosbag2 / MCAP、DVC、MinIO、Label Studio / CVAT、PyTorch Dataset / DataLoader。
- 当前为自建 Demo / 规划阶段项目线索，未表述为已生产落地成果。

### 机器人仿真与 NVIDIA / Isaac 生态探索

- 参与 eRob 机器人关节在 NVIDIA / Isaac 生态中的导入与展示，涉及 URDF / STL 模型整理、Isaac Sim、Isaac Lab、ROS2、MoveIt 集成探索。
- 支持 AI 展区机械臂项目调试、实时内核系统安装和交付支持。

## 工作经历

### 深圳市零差云控科技有限公司

机器人软件工程师 / 企业级 AI 负责人 | 2024.07 - 至今

- 负责 eRob 关节通信 SDK 与软件生态建设，覆盖 CAN、CANopen、EtherCAT、ROS2、MoveIt、URDF 和 Isaac 生态接入。
- 参与 EtherCAT 通讯层稳定性测试与复杂现场问题闭环，推动研发、技术支持和客户形成可执行解决方案。
- 搭建企业级 AI / RAG / Agent 系统，将机器人产品手册、通信协议、FAQ 和现场问题沉淀为可复用工程知识。
- 维护开源仓库、技术文档和 Demo 工程，支持机器人关节客户的软件接入与问题排查。

## 教育背景

### 南方科技大学

智能制造与机器人专业 · 硕士 | 2021 - 2024.07

### 广西科技大学

车辆工程 · 本科 | 2016 - 2020

- 全国大学生智能车竞赛全国二等奖，组内排名第一。
- EES 等顶刊论文 2 篇。
- 国家发明专利 2 项、实用新型专利 2 项。
- NVIDIA Inception 2025 荣耀企业 Top 10 / 340。

## 待人工确认

- 目标岗位可能关注 AI 工具链研发、自动化工作流和开发者工具，需要补充是否有可公开的工具链界面、CLI、API 文档、自动化脚本或开发者接入案例。
- 当前明确工作经验为 2 年，如岗位要求三年以上经验，需确认是否可计入研究生项目、实习、科研或长期工程项目经历。
- eRob SDK 需补充具体 API 模块、接口边界、错误处理机制、测试脚本、示例工程数量、客户接入案例和文档链接。
- EtherCAT 稳定性测试需补充从站数量、控制周期、复现次数、日志证据、最终定位结论和客户侧建议。
- ZeroErr GPT / TechChat 需补充可公开架构图、评测截图、API 文档、部署记录和真实问题闭环案例。
- 机器人多模态数据 Pipeline Demo 目前为规划 / Demo 阶段，需补齐可运行 Demo、样本数据、数据版本、标注质检规则、评测截图和 GitHub / 流程图证据后再强化表达。
- 荣誉、论文、专利和 NVIDIA Inception 信息需在正式投递前确认是否适合放入该岗位版本，并补充可验证链接或证明材料。
