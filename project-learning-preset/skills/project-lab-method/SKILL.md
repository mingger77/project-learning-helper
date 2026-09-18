---
name: project-lab-method
description: Lab 设计方法论（CSAPP 实验思想）：从项目结构提炼 Lab、五要素写法、handout 模板、规则设计（允许/禁止/上限/不得改动）、评分设计（项目既有命令 + 规则检查 + 阈值）、autograder 规范、分层提示（hint ladder）、防特判、Lab 粒度与依赖顺序、复盘要求。`/lab` 流程必须加载本技能。
license: MIT
---

# project-lab-method（Lab 设计方法论）

目标：把一个真实项目拆成若干**可运行、可评分、可复盘**的 Lab。参考 CSAPP 实验的组织方式：自包含 handout、明确规则、可运行评分、迭代跑分、写报告。

## 一、从项目提炼 Lab

输入：`PROFILE.md`（画像与偏好）、`MAP.md`（总目标与驱动问题）、`others/项目解析.md`（结构 / 入口 / 主链路 / 扩展点 / **验证命令清单** / **可实验点清单**）。

提炼顺序：

1. **先跑通，再改得动，再看内部**：第一个 Lab 通常是「让项目按既有方式跑起来并看懂主链路」的高性价比改造点；
2. **每个 Lab 绑定一个真实扩展点/入口/既有测试**：能在项目里找到落点（`文件::符号`），不做凭空造的练习；
3. **每个 Lab 一个能力**，粒度以「能在 1-3 小时内跑出分数」为准；太大就拆，太小就并入相邻 Lab；
4. **依赖顺序**：后一个 Lab 允许依赖前一个 Lab 的产物，但不得要求学习者提前完成未排到的 Lab；
5. **可评分性筛查**：找不到任何项目命令或可判定规则的点，不要做成 Lab（写成导航卡片放进 `others/`）。

一个项目 2-8 个 Lab（微型/小型 2-4，中型 4-8，大型/巨型按圈定子系统）。

## 二、Lab 五要素

| 要素 | 落点 | 要求 |
|---|---|---|
| 目标概念 | `LAB.md`「目标概念」 | 一句话能力，可验证（「能独立注册一个新指令」） |
| 驱动问题 | `LAB.md`「驱动问题」+ `MAP.md` | 1-3 个，编号接全局 `Qn` |
| handout | `LAB.md` | 目标 / 背景与概念 / 任务 / 规则 / 评分 / 分层提示 |
| 规则与评分 | `lab.config.json` + `autograder/` | 机器可读，跑一次就能出分 |
| 复盘 | `REPORT.md` | 做法 / 分数与逐项结果 / 卡点 / 学到的概念 / 遗留 |

## 三、handout（LAB.md）

用 `references/LAB.template.md` 填充。硬性要求：

- **背景与概念**：讲清"为什么需要这个能力"，概念解释 2-3 句 + 一个最小例子 + 常见误区；概念要能被检验（≥1 真实网址 + 一道复述题/小测，禁止编造 URL）。
- **规则与约束**：写死"允许 / 禁止 / 上限 / 不得改动"（见第四节）——这是 Lab 与"随便练练"的分界线。
- **分层提示**：写成 4 层，卡住时按层给（见第六节），**不要把答案写在 handout 里**。
- **起步文件**：`scaffold/` 里放带签名、注释、示例的骨架，关键实现留空并标注 `# TODO(你来实现)`。

## 四、规则设计（CSAPP `dlc` 精神）

规则要**机器可查**，写进 `lab.config.json.rules`，与 `LAB.md`「规则与约束」文字一一对应：

| 类型 | 字段 | 用途示例 |
|---|---|---|
| 禁止路径 | `forbiddenPaths` | 不许改测试、不许改构建配置、不许动其它 Lab |
| 必须文件 | `requiredFiles` | 实现必须落在指定文件（如 `src/command.ts`） |
| 禁止写法 | `forbiddenPatterns` | 不许留 `# TODO(你来实现)`、不许针对样例特判 |
| 规模上限 | `maxAddedLines` | 可选：限制新增行数（需要 git） |

写作原则：

- **每条规则都要能解释"为什么"**（防作弊 / 防范围蔓延 / 保证可维护），写进 `LAB.md`；
- 规则只针对**项目源码**（`autograder` 会自动跳过 `learning_plan/`）；
- 规则数量 2-5 条，宁少勿滥；规则也要给学习者留出合法的实现自由。

## 五、评分设计

### lab.config.json

完整示例见 `references/lab-config.example.json`。字段：

- `repoRoot`：从 Lab 目录回到项目根的相对路径（工具生成时算好，手写时按 `<项目>/learning_plan/<项目>/labs/NN-slug` 推 4 层）；
- `tests[]`：`{ id, label, command, cwd, weight?, timeoutMs? }`，`command` 是**项目既有命令**（`npm test` / `make test` / `pytest` / `cargo test`…），`cwd` 相对 `repoRoot`；
- `rules`：见第四节；
- `threshold`：达标线（默认 100）；
- `rulesWeight`：规则检查占多少分（默认 15，其余归测试）。

### 分数口径

`max = 100`；测试总分 = `100 - rulesWeight`，按 `weight` 归一化分配；规则检查在 `rulesWeight` 内均分。`score/max` 与逐项结果写进 `autograder/last-result.json`：

```json
{ "version": 1, "at": "ISO", "score": 85, "max": 100, "threshold": 100, "passed": false,
  "checks": [ { "id": "unit", "label": "项目单元测试", "kind": "test", "pass": true, "points": 60, "maxPoints": 60, "detail": "exit 0" } ] }
```

### 生成与运行

- **Pi**：用 `learning_lab` 工具生成（自动写好 LAB.md / lab.config.json / autograder / scaffold / REPORT.md），用 `learning_grade` 跑分并回写。
- **OpenCode / DSH**：把 `references/{LAB.template.md, REPORT.template.md, check-rules.mjs, grade.mjs}` 复制到 `labs/NN-<slug>/`（`check-rules.mjs` 与 `grade.mjs` 放 `autograder/`），按本地项目改 `lab.config.json`；跑分用 `node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs`，然后读 `last-result.json` 回写。

`grade.mjs` 退出码：达标 0 / 未达标 1 / 配置错误 2。**未达标不是错误**，要按逐项结果给下一层提示。

### 阈值

默认 `threshold = 100`（项目命令全过 + 规则全过）。只在以下情况调低并写明理由：项目既有测试本身不稳定、或 Lab 明确只要求部分命令通过。调低必须同时改 `LAB.md` 的阈值说明。

## 六、分层提示（hint ladder）

`LAB.md` 的提示固定四层，卡住时**一次只给下一层**：

1. **方向**：指出该看哪个文件/哪个概念（不指符号）；
2. **定位**：指出具体文件 + 符号名（`文件::符号`）；
3. **关键 API**：指出要用的函数/字段签名与语义，但仍不写实现；
4. **伪代码级**：给出步骤骨架（仍是伪代码，关键行留空）。

任何一层都**不得给出可直接粘贴的完整实现**。

## 七、防特判与"测试通过 ≠ 学会"

- 规则里的 `forbiddenPatterns` 要能识别"针对样例特判"的迹象（硬编码期望输出、绕过分支、写死返回值）；
- `/lab review` 必须做**三维批改**：正确性（真跑通）、代码质量（命名/边界/错误处理）、是否真的理解（能否脱离代码复述原理、能否应对一个小变体）；
- 发现特判：分数作废，重写；只有测试通过但讲不出原理，不得判为完成。

## 八、复盘（REPORT.md）

用 `references/REPORT.template.md`。「分数与逐项结果」区块由评分工具维护（`<!-- grading:start -->…<!-- grading:end -->`），其余由学习者填写。复盘必须回答：

- 我实际怎么做的（含踩的坑）；
- 用了第几层提示、哪一层最关键；
- 学到的概念（1-3 条，用自己的话 + 依据）；
- 遗留问题。

复盘完成后，把结论同步到：`LOG.md`（`completion`）、`MAP.md`（状态 → 已通过）、相关概念写进 `LAB.md` 的背景或下一 Lab 的前置自检（`PROFILE.md` §3）。

## 九、Lab 目录清单（生成后自检）

```text
labs/NN-<slug>/
├── LAB.md              # 含目标概念/驱动问题/背景/规则/评分/四层提示
├── lab.config.json     # tests + rules + threshold + repoRoot
├── scaffold/           # 起步文件，关键实现 # TODO(你来实现)
├── autograder/
│   ├── check-rules.mjs # 规则检查（零依赖）
│   ├── grade.mjs       # 跑命令 + 规则，写 last-result.json
│   └── last-result.json# 最近一次评分结果（工具生成）
└── REPORT.md           # 复盘（含 grading 区块）
```

缺任何一项都不算一个合格的 Lab；缺评分的"Lab"只是练习。
