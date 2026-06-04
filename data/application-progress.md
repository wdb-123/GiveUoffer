# 投递进度看板

更新时间：2026-05-31

## 当前结论

- 已投递岗位：0 个
- 已评估岗位：11 个
- 重点待沟通：4 个
- 值得问清楚后再投：3 个
- 备选/低优先级：4 个

没有明确证据显示已经点击 Boss「立即沟通」或完成投递，所以当前所有岗位都保留为 `Evaluated`。确认投递后，再把 `data/applications.md` 对应行的 `Status` 改成 `Applied`。

## 已投递岗位

| Date | Company | Role | Status | Next Follow-up | Notes |
|---|---|---|---|---|---|
| - | - | - | - | - | 暂无已确认投递记录 |

## 待投递 / 待沟通优先级

| Priority | Tracker | Company | Role | Score | Progress | Next Action | Resume |
|---:|---|---|---|---:|---|---|---|
| 1 | #002 | 远桌科技 | 机器人软件系统工程师 | 4.3 | 待打开详情/沟通 | 确认 C++、ROS2、SDK、运动控制占比；薪资锚定 35K-45K | `resumes/02-robotics-software-sdk-engineer.md` |
| 2 | #004 | 深圳市探真智能科技 | 机器人系统工程师 | 4.1 | 待打开详情/沟通 | 用机器人 SDK + EtherCAT + ROS2 项目切入；解释 3-5 年要求 | `resumes/01-robotics-system-engineer.md` |
| 3 | #005 | 润物科技 | ROS/机器人软件系统工程师 | 4.0 | 待打开详情/沟通 | 确认 ROS/ROS2、MoveIt、C++ 深度；突出 ROS2 生态接入 | `resumes/02-robotics-software-sdk-engineer.md` |
| 4 | #003 | 某大型智能硬件公司（猎头） | 机器人系统工程师（大牛带队+行业头部） | 4.2 | 待问真实公司 | 先问公司、产品、团队、技术栈、汇报线，再决定是否发简历 | `resumes/01-robotics-system-engineer.md` |
| 5 | #007 | 某中型人工智能公司（猎头） | 机器人系统工程师（应用开发&SDK） | 3.8 | 待问真实公司 | 重点问 SDK 是机器人控制 SDK 还是应用平台 SDK；防虚高 | `resumes/02-robotics-software-sdk-engineer.md` |
| 6 | #008 | 妙动科技 | 机器人系统工程师(A93407) | 3.8 | 待看详情 | 确认岗位是否软件系统/系统集成，而不是测试交付 | `resumes/01-robotics-system-engineer.md` |
| 7 | #009 | 北京某中型互联网公司（猎头） | 机器人系统工程师（大厂/初创 急招 核心） | 3.7 | 待问真实公司 | 判断是否真实具身/机器人团队，还是泛化候选池 | `resumes/01-robotics-system-engineer.md` |
| 8 | #010 | 具身风暴 | 机器人系统工程师 | 3.6 | 备选 | 如果 JD 涉及具身数据/机器人系统，可转用具身方向简历 | `resumes/03-embodied-ai-application-engineer.md` |
| 9 | #011 | 星灿机器人 | 机器人系统工程师 | 3.6 | 备选 | 薪资偏低，只有技术内容足够系统化时再投 | `resumes/01-robotics-system-engineer.md` |
| 10 | #006 | 深圳某中型电子/半导体/集成电路公司（猎头） | 机器人系统工程师负责人 | 3.9 | 冲刺/风险高 | 先问是否有非负责人岗位；避免硬包装成整机控制负责人 | `resumes/01-robotics-system-engineer.md` |
| 11 | #001 | 自变量机器人 | 机器人系统工程师（应用）(A46790) | 3.2 | 低优先级 | 只作为打开公司沟通入口；薪资/职级明显偏低 | `resumes/02-robotics-software-sdk-engineer.md` |

## 状态规则

- `Evaluated`：已评估，尚未投递或沟通。
- `Applied`：已点击投递/立即沟通，或已发送简历。
- `Responded`：招聘方有回复，并且你已经回复。
- `Interview`：进入面试流程。
- `Offer`：拿到 offer。
- `Rejected`：被拒。
- `Discarded`：你主动放弃。
- `SKIP`：明确不投。

## 下一步建议

优先处理 #002、#004、#005、#003。先打开岗位详情，把 JD 复制进 `jds/`，再用对应方向简历做一次定向改写。确认要沟通后，再把 `Status` 改为 `Applied` 并记录沟通日期。
