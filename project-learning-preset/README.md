# 项目学习模式（project-learning preset · v0.2）

人利用 AI 辅助进行项目式学习的 DeepSeek Harness Agent 预设——**以 Lab 为中心**（一个 Lab = 一个阶段）：
每个 Lab 都有 handout（`LAB.md`）、明确的规则与约束、**可运行的评分**（项目既有命令 + 规则检查）与复盘（`REPORT.md`），
用分数决定是否推进。除 `learning_plan/` 外，项目其余文件一律只读；**评分与规则文件生成后不得修改**。

## 组成

- `agent.cordis.yml` —— 预设组合（以 `standard` 为基线；差异：项目学习 persona、`skills/` 挂载、`tool-web` 关闭 fetch）
- `preset.yml` —— 预设元数据（name / description / order: 7）
- `skills/` —— 7 个技能（**与 Pi / OpenCode 变体逐字节相同**）：
  - `project-learning-main` —— 总纲：两条主线、六条硬规范、AI 职责边界、三个流程与顺序、Lab 五要素、推进判定、产物目录、Harness 差异表
  - `project-learning-regulation` —— 元规则 R1~R9（写权限、一次一个 Lab、不替写核心实现、证据、检验禁编造、文档一致性、推进判定、**R9 Lab 规则铁律**）
  - `project-lab-method` —— Lab 设计方法论：从项目提炼 Lab、五要素、规则设计、评分设计、autograder 规范、分层提示、防特判、复盘
  - `project-reading-method` —— 复杂度分档判据 + 五档阅读策略 + 导演式阅读五轮法 + 验证命令/可实验点两份清单
  - `project-doc-map` —— `MAP.md` 规范（总目标 / 驱动问题 / `## Labs` 四行区块 / 锚点）
  - `project-doc-profile` —— `PROFILE.md` 规范（画像 + 实验评分偏好 + 前置自检 + 增量更新）
  - `project-doc-log` —— `LOG.md` 规范（五字段 + 性质五类含 `grade`）
  - `project-lab-method/references/` —— `LAB.template.md`、`REPORT.template.md`、`lab-config.example.json`、`check-rules.mjs`、`grade.mjs`
- `LICENSE` —— MIT

> 本 preset 无斜杠命令（DSH 自定义命令需插件实现）：三个流程用**触发语**启动，详见下文与 persona。

## 安装

1. 将本目录复制到 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/project-learning/`（每个预设一个同级目录，id 与目录名一致）。
2. 挂载校验：`agentPresets.standingKeyFor('project-learning')` 返回 `mounted OK` 即生效。
3. 在 Web GUI 新开会话，预设选择「项目学习模式」。

从 v2 升级：直接覆盖整个目录即可（v2 的 `STUDENT.md`/`TEACHER.md`/`QUESTION.md`/`KNOWLEDGE.md` 与 `project-doc-student|teacher|question|knowledge` 技能已全部退役）。

## 使用（触发语）

| 触发语 | 流程 | 产物 |
|---|---|---|
| 「采集画像 / 更新画像 / 我是谁来着」 | 画像 | `PROFILE.md`（画像 + 实验评分偏好 + 前置自检）、`LOG.md` 首条（onboarding） |
| 「学习 / 阅读 / 读懂这个项目」 | 阅读 | `MAP.md` 骨架、`PROFILE.md` §3 前置自检、`others/项目解析.md`（含验证命令清单 + 可实验点清单） |
| 「设计一个 Lab / 下一个 Lab」 | 设计实验 | `labs/NN-<slug>/`（LAB.md + lab.config.json + autograder + scaffold + REPORT.md） |
| 「跑分 / 评分」 | 评分 | 运行 `autograder/grade.mjs`，分数写回 MAP / REPORT / LOG |
| 「复盘」 | 复盘 | 三维批改 + `REPORT.md` + `MAP.md` 状态「已通过」 |
| 「列出 Lab」 | 列表 | 各 Lab 的标题 / 状态 / 分数 / 阈值 |

产物目录（AI 唯一可写区）：

```text
learning_plan/<项目名>/
├── MAP.md        # 指路：总目标 / 驱动问题 / ## Labs（驱动问题·状态·评分·LAB.md 链接）
├── PROFILE.md    # 我是谁：画像 + 实验评分偏好 + 前置自检
├── LOG.md        # 发生了什么：追加式（含「## 目录」跳转，按 project-doc-log 规范维护；onboarding|ask|grade|completion|commit）
├── labs/NN-<slug>/{LAB.md, lab.config.json, scaffold/, autograder/{check-rules.mjs,grade.mjs,last-result.json}, REPORT.md}
└── others/       # 项目解析.md：事实层 + 验证命令清单 + 可实验点清单 + 概念速查
```

## 评分怎么跑

`labs/NN-<slug>/autograder/grade.mjs` 是零依赖 Node 脚本（模板来自 `skills/project-lab-method/references/`）：

```bash
node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs
```

它跑 `lab.config.json` 里的项目既有命令（`npm test` / `make test` / `pytest`…）与规则检查，写出 `last-result.json`
（`score/max/threshold/passed/checks`），退出码 0/1/2 = 达标/未达标/配置错误。**未达标不是错误**，AI 应按逐项结果给下一层提示。

## 权限

本预设通过 persona + 元规则（`project-learning-regulation`）实施**模型级**纪律：

- 只写 `learning_plan/`，其余一律只读；
- `labs/*/LAB.md`、`labs/*/lab.config.json`、`labs/*/autograder/**` 与项目既有测试**生成后不得修改**（R9）；
- 不替学习者写核心实现；不得针对用例特判；「测试通过 ≠ 学会」。

> 硬性 fs 写保护需要宿主侧 tool guard（可选增强，不在本预设内）。Pi 变体已用扩展实现该硬拦截。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
