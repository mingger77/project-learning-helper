---
name: project-doc-log
description: LOG.md 撰写规范：追加式学习日志——消息五字段（事情/性质/状态/关联/证据结果）、性质五类 onboarding·ask·grade·completion·commit（grade 为每次跑分）；优先用 learning_log 工具追加，不删改历史。`/lab` 流程加载本技能。
license: MIT
---

# project-doc-log（LOG.md 撰写规范）

定位：**项目学习日志**——问题、跑分与任务的流水。按时间追加，**不删改历史**；它是「这个项目我到底做了什么、问过什么、跑了多少分、提交了什么」的唯一流水账。

## 首选做法：用 `learning_log` 工具

追加条目前**优先调用 `learning_log`**（Pi）或按同样格式手写（OpenCode / DSH）：它负责条目编号、五字段格式、字段完整性校验与文件串行化。只有需要改既有条目的「状态」时才直接 `edit`。

## 性质五类（必须选一个）

| 性质 | 何时记 | 典型证据/结果 |
|---|---|---|
| `onboarding` | `/profile` 完成时 | 画像摘要 + `PROFILE.md` 路径 |
| `ask` | 记录了一个值得留痕的问题时（可选） | 问题 + 结论去向（`LAB.md` / `REPORT.md`） |
| `grade` | **每次 `/lab grade` 跑分后** | `score/max（阈值 t）`、执行的命令、`last-result.json` 路径 |
| `completion` | Lab 达阈值且复盘完成时 | 分数 + 逐项结果 + commit |
| `commit` | 提交代码时 | commit hash、变更说明 |

## 状态

`doing`（进行中）/ `done`（已完成）。`ask` 类先 `doing`，回答后改 `done`；`grade` / `completion` / `commit` 一般直接 `done`。

## 结构模板

```markdown
# LOG.md ---- 项目学习日志

> 本文档为项目 <项目名> 的学习日志：按时间追加，不删改历史。
> 性质五类：onboarding / ask / grade（跑分）/ completion / commit。
> 优先用 learning_log 工具追加条目，避免手写破坏格式。

## 消息

1. message1
- 事情： <一句话概括>
- 性质： < onboarding / ask / grade / completion / commit >
- 状态： < doing/done >
- 关联： <Lab 编号、文件或问题编号 Qn>
- 证据/结果： <命令输出、分数、改动文件、commit>

2. message2
- 事情： <...>
- 性质： <...>
- 状态： <...>
- 关联： <...>
- 证据/结果： <...>
```

## 稳定锚点（状态栏与工具依赖，勿改格式）

- 条目以 `N. <事情>` 起头（`N` 递增，不复用）；
- 五个字段各占一行：`- 事情： …`、`- 性质： …`、`- 状态： …`、`- 关联： …`、`- 证据/结果： …`。

## 规则

- **追加式**：只新增条目、只改「状态」，不改写历史条目的事实描述。
- 每条必须回答：「这件事属于哪个 Lab / 哪个问题（`Qn`）？结果是什么？」——`关联` 与 `证据/结果` 不允许留空。
- `grade` 条目必须含：分数（`score/max（阈值 t）`）、执行的命令、`last-result.json` 路径；同一 Lab 多次跑分就多条记录，形成迭代轨迹。
- `completion` 条目必须写明验收方式与实际输出；与 `MAP.md` Lab 状态、`labs/*/REPORT.md`、`last-result.json` 四处一致。
- 不要在本文件写教程或分析长文——那是 `LAB.md`（背景/提示）与 `REPORT.md`（复盘）的职责；本文件只记「事件 + 结果」。
