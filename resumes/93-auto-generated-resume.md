# 韦东波 - 机器人系统工程师 【 深圳-南山区 】 50-75k·15薪 3-5年 统招本科

深圳 | 2 年工作经验 | 181 7224 4940 | 12132301@mail.sustech.edu.cn | github.com/ZeroErrControl

## 个人摘要

机器人软件工程师，南方科技大学智能制造与机器人硕士、广西科技大学车辆工程本科。现任深圳市零差云控科技有限公司机器人软件工程师 / 企业级 AI 负责人，主要参与 eRob 机器人关节通信 SDK、EtherCAT / CANopen / CAN、ROS2 / MoveIt / URDF 软件生态建设，并围绕多关节 EtherCAT 通信稳定性、掉 OP、首次启动无法进入 OP、主站掉线、多电机 CSP 异常等问题开展复现、测试分析与跨团队闭环。熟悉机器人关节模组、工业实时通信、CiA402 状态机、PDO / SDO、SOEM / IGH EtherCAT、RT-Linux、DC Sync / SM Sync 等机器人系统工程问题，可支持机器人系统集成、通信稳定性测试、SDK 接入和开发者生态建设。

## 核心技能

- 机器人系统：机器人关节模组、机械臂系统集成、ROS2、MoveIt、URDF、Isaac Sim / Isaac Lab 生态探索
- 工业通信：EtherCAT、CANopen、CAN、SOEM、IGH EtherCAT、CiA402、PDO / SDO、对象字典、控制字 / 状态字
- 运动控制与实时调试：CSP、CST、PP、PT、DC Sync、SM Sync、1kHz 控制周期、RT-Linux、CPU 隔离、Intel I350 网卡
- SDK 与工程化：Python、C/C++、Shell、Linux、Git、Demo 工程、技术文档、开源仓库维护、客户接入支持
- AI 与知识工程：RAG、Agent、FastAPI、OpenAI-compatible API、知识治理、评测集、Evidence API、失败样本回流
- 数据与具身智能方向：机器人运行日志、状态、动作、轨迹、图像 / 视频、多模态数据 Pipeline、DVC、MinIO、Label Studio、ROS bag / MCAP

## 项目经历

### EtherCAT 掉 OP / 多关节通信稳定性测试

- 参与多关节 EtherCAT 通信稳定性测试，围绕掉 OP、首次启动无法进入 OP、0xA000 主站掉线、多电机 CSP 异常等问题开展复现、测试分析和问题闭环。
- 覆盖 SOEM / IGH EtherCAT 主站、CiA402 状态机、PDO / SDO 通信、DC Sync、SM Sync、RT-Linux 等关键链路，分析周期时间、主站调度、从站状态切换、AL Status / AL Control 等稳定性相关变量。
- 测试 1ms / 2ms 周期、1kHz 收发、实时内核、CPU 隔离、Intel I350 网卡等工程配置对多关节通信稳定性的影响。
- 协同研发、技术支持和客户侧推进问题定位与解决方案形成，并将现场问题沉淀为内部文档、FAQ 和知识库数据。

### eRob 机器人关节通信 SDK 与开源生态

- 围绕 eRob 机器人关节模组建设软件接入能力，覆盖 EtherCAT、CANopen、CAN、ROS2、MoveIt、URDF、Demo 和开发者文档。
- 基于 SOEM / IGH EtherCAT 主站开发 eRob EtherCAT 上位机示例和工程，支持 CSP、CST、PP、PT 等运动模式。
- 沉淀设备初始化、CiA402 状态机、控制模式切换、控制字 / 状态字、PDO / SDO 通信、对象字典和故障处理等可复用工程能力。
- 维护 GitHub 开源仓库与技术文档，仓库周下载量 50+，月均下载量约 240，支持客户进行机器人关节 SDK 接入与调试。

### ZeroErr GPT / TechChat 企业级售后知识问答系统

- 从 0 到 1 搭建面向机器人关节产品的企业级售前售后 RAG / Agent 系统，将产品手册、通信协议、FAQ、售后经验、表格和图片资料治理为可检索、可引用、可评测的知识服务。
- 负责文档解析、知识切分、标题增强、混合检索、重排、Evidence API、评测集建设和失败样本回流，提升机器人产品知识沉淀与复用效率。
- 建立约 1000 条标准测试集，Top-10 召回率约 98.0%，售前售后重复产品咨询减少约 50%。
- 将 EtherCAT、CANopen、对象字典、错误码、现场问题和客户高频问题沉淀为结构化知识资产，辅助研发、技术支持和客户接入支持。

### 机器人多模态数据 Pipeline Demo

- 自建 / 规划机器人多模态数据 Pipeline Demo，目标是将机器人日志、状态、动作、轨迹、图像 / 视频和问题样本沉淀为可版本化、可质检、可评测的数据闭环。
- 规划使用 Python、ROS2 / rosbag2 / MCAP、DVC、MinIO、Label Studio / CVAT、PyTorch Dataset / DataLoader 等工具链，覆盖数据清洗、质检、版本管理和统计报告生成。
- 可复用 EtherCAT 日志、错误码、对象字典、状态和轨迹数据作为样本来源，用于补强具身智能数据基建与机器人系统问题分析能力。
- 当前项目处于自建 Demo / 证据补充阶段，未写成生产交付成果。

### 机器人仿真与 NVIDIA / Isaac 生态探索

- 参与 eRob 机器人关节在 NVIDIA / Isaac 生态中的导入与展示，涉及 URDF / STL 模型整理、Isaac Sim / Isaac Lab / ROS2 / MoveIt 集成探索。
- 支持 AI 展区机械臂项目调试、实时内核系统安装和交付支持。
- 相关经历用于补充机器人整机软件、仿真验证、开发者生态和具身智能工具链理解。

## 工作经历

### 深圳市零差云控科技有限公司

机器人软件工程师 / 企业级 AI 负责人 | 2024.07 - 至今

- 负责 eRob 机器人关节通信 SDK 与软件生态建设，覆盖 CAN、CANopen、EtherCAT、ROS2 / MoveIt / URDF / Isaac 生态接入。
- 参与 EtherCAT 通讯层稳定性测试与复杂现场问题闭环，围绕掉 OP、首次启动无法进入 OP、主站掉线、多电机 CSP 异常等问题推动研发、技术支持和客户形成可执行解决方案。
- 维护开源 SDK、Demo 工程和开发者文档，支持客户进行机器人关节通信接入、调试和问题排查。
- 搭建企业级 AI / RAG / Agent 系统，将机器人产品手册、通信协议、对象字典、FAQ 和现场问题沉淀为可复用工程知识。

## 教育背景

南方科技大学 | 智能制造与机器人专业 · 硕士 | 2021 - 2024.07

广西科技大学 | 车辆工程 · 本科 | 2016 - 2020

- 全国大学生智能车竞赛全国二等奖（组内排名第一）
- NVIDIA Inception 2025 荣耀企业 Top 10 / 340
- EES 等顶刊论文 2 篇；国家发明专利 2 项、实用新型专利 2 项

## 待人工确认

- 目标岗位 JD 目前仅有“具身智能、机器人系统、深圳南山区、50-75k·15薪、3-5年、统招本科”等爬虫信号，需人工打开链接复核职责、薪资、年限和真实匹配度。
- EtherCAT 项目需补充从站数量、控制周期、复现次数、日志证据、最终定位结论和客户侧结果。
- eRob SDK 项目需补充接口边界、错误处理机制、测试脚本、示例工程数量和可公开 GitHub 链接。
- 机器人多模态数据 Pipeline 目前为自建 / 规划 Demo，需补充可运行 Demo、样本数据、数据版本、标注质检和评测截图后再强化为项目成果。
- 荣誉、论文、专利和 NVIDIA Inception 信息来自当前基础简历，投递前建议核对公开表述、时间和证明材料。
