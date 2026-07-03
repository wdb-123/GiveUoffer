# 韦东波

深圳 | 2 年工作经验 | 181 7224 4940 | 12132301@mail.sustech.edu.cn | github.com/ZeroErrControl

## 目标职位

机器人系统工程师 | 机器人软件 / SDK 工程师 | 具身智能应用工程师 | AI + 机器人解决方案工程师

## 个人概述

南方科技大学智能制造与机器人硕士，现任机器人关节模组企业机器人软件工程师 / 企业级 AI 负责人。主线经验覆盖 eRob 关节通信 SDK、EtherCAT / CANopen / CAN、ROS2 / MoveIt / URDF / Isaac 生态接入、通信稳定性问题闭环，以及机器人行业企业级 RAG / Agent 系统建设。

参与掉 OP、首次启动无法进入 OP、多电机 CSP 异常、主站掉线等 EtherCAT 通信问题的复现、测试和方案推进；同时从 0 到 1 建设公司 AI 系统，覆盖模型部署、数据清洗、知识库、Evidence API、自动化评测与核心 RAG / Agent 研发。自研 RAG 在内部测试集 Top-10 召回率约 98.0%，推动售前售后重复产品咨询减少约 50%。在校以共同第一作者发表 Energy & Environmental Science 等顶刊论文，具备机器人系统、工业通信、AI 数据治理和复杂问题闭环的复合背景。

## 核心能力

- 机器人软件系统：ROS2、MoveIt、URDF、Isaac Sim、Isaac Lab、关节控制、软件生态集成
- 工业通信与稳定性：EtherCAT、SOEM、IGH EtherCAT、CANopen、CAN、CiA402、PDO、SDO、CSP、CST、PP、PT、掉 OP 问题排查
- 实时系统与调试：RT-Linux、1kHz 控制周期、DC Sync、SM Sync、CPU 隔离、Intel I350 网卡、多关节同步
- 企业级 AI 系统：机房建设、模型部署、全栈架构、数据清洗、知识库、RAG、Agent、Evidence API、私有评测体系
- AI 原生研发与协作：使用 Codex、Claude Code、Cursor、GPT、Manus 等工具进行需求拆解、代码生成、调试重构、测试样例设计、文档生成和自动化工作流搭建
- 项目推进与生态合作：跨部门协同、复杂问题闭环、开源生态、NVIDIA 伙伴渠道、技术成果转化

## 工作经历

### 深圳市零差云控科技有限公司

机器人软件工程师 / 企业级 AI 负责人 | 2024.07 - 至今

- 负责 eRob 关节通信 SDK 与软件生态建设，覆盖 CAN、CANopen、EtherCAT 等协议方向，并推进 ROS2 / MoveIt / URDF / Isaac 生态接入、Demo 与技术文档沉淀。
- 参与关节 EtherCAT 通讯层运行稳定性测试，针对掉 OP、首次启动无法进入 OP、多电机 CSP 异常、主站掉线等问题开展复现、定位与方案推进，协同研发及技术支持快速闭环复杂现场问题。
- 作为企业级 AI 系统负责人，主导模型部署、系统架构、数据清洗管道、知识库、Evidence API 与核心 RAG / Agent 研发；推动售前售后重复产品咨询减少约 50%。
- 建立约 1000 条标准测试集、自动化评测与失败样本回流机制，自研 RAG 在内部测试集实现 Top-10 召回率约 98.0%，提升专有知识问答的可靠性与响应效率。
- 独立完成关节产品 SDK 从零开源，覆盖 Linux 下 CAN、CANopen、EtherCAT 三大协议，GitHub 仓库周下载量超过 50 次、月均下载量约 240 次，已实现低维护成本稳定运营。
- 负责 NVIDIA Inception 申报、路演与生态合作推进，推动公司在 340 家参评企业中进入 Top 10 并获荣耀企业认证；协助搭建 NVIDIA 生态伙伴渠道，提升资本与产业客户曝光，为融资沟通及重点客户长期合作提供支持。

## 代表项目

### eRob 关节模组通信 SDK 与开源生态建设

项目负责人 / 核心开发

- 面向关节模组客户建设统一 SDK 与示例工程，覆盖 EtherCAT、CANopen、CAN 等主要通信方向。
- 基于 SOEM / IGH EtherCAT 主站开发 eRob EtherCAT 上位机示例和工程，支持 CSP、CST、PP、PT 等运动模式。
- 沉淀设备初始化、CiA402 状态机、控制模式切换、PDO / SDO 通信、故障处理等可复用工程能力。
- 完善 GitHub 开源仓库、技术文档与 Demo 工程，仓库周下载量超过 50 次，降低重复技术支持成本。

### 关节 EtherCAT 通讯层掉 OP 测试与解决

问题分析 / 方案推进

- 参与关节 EtherCAT 通讯层运行过程中的掉 OP、首次启动无法进入 OP、多电机 CSP 异常等问题测试，推动现场异常转化为可复现、可验证的问题链路。
- 结合 SOEM / IGH 主站、DC 同步、SM 同步、1ms / 2ms 周期、1kHz 收发、实时内核、CPU 隔离、网卡配置、从站状态变化与多关节运行场景，协同研发完成问题定位与方案推进。
- 具备在信息不完整、交付节奏快、跨团队协作要求高的情境下快速推进技术问题闭环的能力。

### ZeroErr GPT 企业级 AI 售前售后系统

系统负责人 / 架构与核心研发

- 负责企业 AI 系统整体设计与建设，覆盖模型部署、AI 系统架构、全栈设计、数据清洗管道、知识库与核心 RAG / Agent 能力。
- 系统面向售前与售后业务落地，支撑咨询分流、知识回流、问题分析与运营效率优化，形成企业专有知识服务底座。
- 设计多路检索、重排、Evidence API、约 1000 条标准测试集、自动化评测和失败样本回流机制，围绕召回质量、知识覆盖与回答可靠性持续优化 RAG，在内部评测集上实现 Top-10 召回率约 98.0%。

### 机器人仿真与强化学习 Demo 搭建

方案验证 / 技术预研

- 参与基于 NVIDIA 机器人仿真平台的强化学习 Demo 搭建，完成关节模型导入、仿真环境配置与基础训练流程验证。
- 探索公司关节产品在机器人仿真、强化学习训练与智能控制展示场景中的应用，为后续具身智能方向预研提供基础。

## 教育背景

### 南方科技大学

智能制造与机器人专业 · 硕士 | 2021 - 2024.07

- 研究方向：长时储能与机器学习相关研究。
- 共同第一作者在 Energy & Environmental Science 等顶级期刊发表论文 2 篇。
- 已授权国家发明专利 2 项、实用新型专利 2 项。

### 广西科技大学

车辆工程 · 本科 | 2016 - 2020

- 系统学习机械设计、车辆工程、控制基础和工程实践相关课程，为后续机器人系统、机电系统和智能制造方向打下工程基础。

## 学术成果

### A novel high-performance all-liquid formic acid redox fuel cell: simultaneously generating electricity and restoring the capacity of flow batteries

共同第一作者 | Energy & Environmental Science, 2024, Vol.17, pp.8545-8556 | DOI: 10.1039/D4EE02450H

- 提出全液态甲酸氧化还原燃料电池新体系，峰值功率较传统方案提升 235.1%，达甲酸燃料电池领域最高记录，并可将钒液流电池容量恢复至 97.6%。
- 研究方向覆盖液流电池、燃料电池等电化学器件高性能催化剂及系统性能衰减机理。

## 荣誉与证书

- NVIDIA Inception 2025 荣耀企业：独立筹备和推动公司从 340 家参评企业中进入 Top 10。
- 全国大学生智能车竞赛全国二等奖（组内排名第一）。
- 全国大学生励志奖学金。

## 技能

- 编程语言：Python、C/C++、Shell
- 机器人与系统：ROS2、MoveIt、URDF、Isaac Sim、Isaac Lab、CAN、CANopen、EtherCAT、Linux、RT-Linux
- 工业通信：SOEM、IGH EtherCAT、CiA402、PDO、SDO、CSP、CST、PP、PT、DC Sync、SM Sync、关节控制、通信稳定性测试
- AI 与 Agent：Claude Code、Cursor、Codex、GPT、Manus、多 Agent 协作、RAG、Agent、Evidence API、模型部署与运维
- AI 工具研发能力：熟练使用 AI 编程工具进行需求拆解、代码生成、问题定位、自动化脚本开发、文档生成、测试样例设计和复杂系统方案推演
- 全栈与运维：FastAPI、OpenAI-compatible API、CLI、vLLM、Qwen、DeepSeek、OpenWebUI、Dify、LangChain、数据清洗、知识库治理
- 生态与合作：开源社区运营、开发者生态、合作伙伴拓展、路演与生态合作推进
