# 方向化简历库

这个目录用于长期维护不同投递方向的简历。原则是：事实一致，叙事不同；不要为了匹配 JD 伪造没有做过的技术。

## 文件说明

| 文件 | 适用方向 | 主叙事 |
|---|---|---|
| `01-robotics-system-engineer.md` | 机器人系统工程师、控制系统工程师、整机系统工程师 | 机器人系统、工业通信、复杂问题闭环 |
| `02-robotics-software-sdk-engineer.md` | 机器人软件工程师、SDK 工程师、ROS2 工程师 | SDK、ROS2、MoveIt、开发者生态 |
| `03-embodied-ai-application-engineer.md` | 具身智能应用工程师、仿真应用、机器人 AI 系统 | Isaac / ROS2 / MoveIt / 具身智能应用验证 |
| `04-embodied-data-infra-engineer.md` | 具身智能数据基建、机器人训练数据平台、多模态数据平台 | 机器人数据来源 + AI 数据治理 + 评测闭环 |
| `05-ai-robotics-solution-engineer.md` | AI + 机器人解决方案、售前/售后技术产品、机器人解决方案架构 | 客户问题、交付、知识库、AI 工程化 |
| `06-enterprise-ai-rag-engineer.md` | RAG 工程师、Agent 工程师、企业知识库、LLM 应用开发 | RAG / Agent / Evidence API / 评测体系 |

## 方向线索

`direction-clues.json` 记录每个方向的 JD 信号、关键词、项目排序、强化表达、禁止夸大的内容、证据和短板。简历可视化页面会读取这个文件，在选择方向简历时同步显示优化线索。

维护原则：

- 新看到的 JD 线索先沉淀到 `direction-clues.json`。
- 多次出现的线索再反向更新方向母版。
- 只把真实证据写入项目成果；没有项目支撑的内容放到 `gaps` 或“正在补强”。

## 更新规则

- 看到具体 JD 后，只改对应方向的简历。
- 每次新增事实，先放入 `article-digest.md`，再同步到方向简历。
- 如果一个 JD 同时跨两个方向，优先复制最接近的一份另存为 `target-{company}-{role}.md`。
- 不把 Spark/Flink/Hive、CV 算法论文、强化学习训练经验写成已完成项目；这些只能写在“正在补强”或“可快速学习”里。
