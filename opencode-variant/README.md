# project-learning for OpenCode（项目学习模式 · OpenCode 亚种 v0.2）

**问题驱动 · 做中学 · 以 Lab 为中心**的 OpenCode 亚种：一个 Lab = 一个阶段，每个 Lab 都有 handout、规则、**可运行评分**与复盘，用分数决定推进。
AI 只写 `learning_plan/`，项目源码由学习者**自己动手实现**；评分与规则文件生成后不得修改。

- 要求：OpenCode ≥ 1.18（以 1.18.x 官方文档的 skills/permission 语法为准）。
- 组成：`agents/`（主代理 `project-learning` + 只读子代理 `module-reader`）、`commands/`（`/profile` `/read` `/lab`）、`skills/`（7 个技能，与 Pi / DSH 变体逐字节相同）。

## 命令与产物

| 命令 | 职责 | 产物 |
|---|---|---|
| `/profile` | 采集/更新学习者画像与前置自检 | `PROFILE.md`、`LOG.md` 首条（onboarding） |
| `/read` | 按复杂度分档阅读项目 | `MAP.md` 骨架、`PROFILE.md` §3 前置自检、`others/项目解析.md`（验证命令 + 可实验点清单） |
| `/lab [new\|grade\|review\|list]` | 设计 / 跑分 / 复盘 / 列出 Lab | `labs/NN-<slug>/`、`MAP.md` 分数与状态、`LOG.md`（grade/completion） |

顺序：`/profile` → `/read` → `/lab`；`/lab` 可反复执行形成跑分闭环。

产物目录（AI 唯一可写区）：

```text
learning_plan/<项目名>/
├── MAP.md        # 指路：总目标 / 驱动问题 / ## Labs（驱动问题·状态·评分·LAB.md 链接）
├── PROFILE.md    # 我是谁：画像 + 实验评分偏好 + 前置自检
├── LOG.md        # 发生了什么：追加式流水（含「## 目录」跳转，按 project-doc-log 规范维护）；性质 onboarding|ask|grade|completion|commit
├── labs/NN-<slug>/{LAB.md, lab.config.json, scaffold/, autograder/{check-rules.mjs,grade.mjs,last-result.json}, REPORT.md}
└── others/       # 项目解析.md：事实层 + 验证命令清单 + 可实验点清单 + 概念速查
```

## 技能（7 个）

- `project-learning-main` —— 总纲：两条主线、六条硬规范、AI 职责边界、三流程、Lab 五要素、推进判定、产物目录、Harness 差异表；
- `project-learning-regulation` —— 元规则 R1~R9（含 **R9 Lab 规则铁律**：不得改评分文件/测试、不得特判）；
- `project-lab-method` —— Lab 设计方法论 + `references/`（LAB/REPORT 模板、`lab-config.example.json`、`check-rules.mjs`、`grade.mjs`）；
- `project-reading-method` —— 复杂度分档 + 五档阅读策略 + 导演式阅读五轮法 + 两份清单；
- `project-doc-map` / `project-doc-profile` / `project-doc-log` —— 三份文档规范。

## 安装

### 方式 A：全局安装（推荐）

```bash
# Windows (PowerShell)
Copy-Item -Recurse -Force .opencode\agents\*   "$env:USERPROFILE\.config\opencode\agents\"
Copy-Item -Recurse -Force .opencode\commands\* "$env:USERPROFILE\.config\opencode\commands\"
Copy-Item -Recurse -Force .opencode\skills\*   "$env:USERPROFILE\.config\opencode\skills\"
```

若从 v0.1/v3 升级：请先删除全局目录中已废弃的 `commands/{ask,build,answer}.md` 与 `skills/project-doc-knowledge/`。

### 方式 B：按项目安装

把 `.opencode/` 复制到目标项目根（与 `learning_plan/` 同级），该项目会话即生效。

## 使用

1. 从项目根目录启动 `opencode`（权限 `learning_plan/**` 按工作区相对路径匹配，请从项目根启动）；
2. 按 **Tab** 切到主代理 `project-learning`；
3. 依次 `/profile` → `/read` → `/lab new`；
4. 学习者自己写实现（`scaffold/` 中 `# TODO(你来实现)` 处）→ `/lab` 让 AI 跑分（或手动 `node .../autograder/grade.mjs`）→ 未达标继续改；
5. 达标后 `/lab review`（三维批改 + `REPORT.md`）→ 提交一个 commit；
6. 大型/巨型项目：主代理可调用 `@module-reader` 做只读模块笔记。

## 权限（主代理内置）

- `edit`：仅 `learning_plan/**` 允许；`labs/*/LAB.md`、`labs/*/lab.config.json`、`labs/*/autograder/**` 显式 deny（R9）；
- `bash`：`ask`（跑分与验证命令需你确认）；
- `websearch`：允许（检验网址须来自真实检索）；`webfetch`：拒绝。

## 评分怎么跑

`autograder/grade.mjs` 是零依赖 Node 脚本（模板见 `skills/project-lab-method/references/grade.mjs`）：

```bash
node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs
```

跑 `lab.config.json` 里的项目既有命令 + 规则检查，输出 `last-result.json`（`score/max/threshold/passed/checks`），退出码 0/1/2。
未达阈值不是错误：按逐项结果给下一层提示即可。

## 验收清单

- [ ] Tab 可切到 `project-learning`；`skill` 工具列出 7 个技能（含 `project-lab-method`、`project-doc-profile`，无 `project-doc-knowledge`）
- [ ] `/profile`、`/read`、`/lab` 三个命令可用；`@module-reader` 可调用；旧的 `/ask`、`/build`、`/answer` 已不存在
- [ ] 在 `learning_plan/` 外 `edit`/`write` 被拒；`autograder/**` 被拒；`MAP.md`/`REPORT.md` 可写
- [ ] 端到端：`/profile` 出 `PROFILE.md` → `/read` 出 MAP 骨架 + 自检 + `others/项目解析.md`（含两份清单）→ `/lab new` 出 Lab（无实现）→ 自己写 → `/lab grade` 出分数并回写 MAP/REPORT/LOG → 达标 → `/lab review` 状态「已通过」
- [ ] 阶段推进判定生效：评分 ≥ 阈值 ∧ 驱动问题已答 ∧ `REPORT.md` 已填
- [ ] 项目源码零修改（AI 侧），且 `LAB.md`/`lab.config.json`/`autograder/**` 未被改动
