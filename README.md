# 项目学习模式（以 Lab 为中心）—— 三端实现

**问题驱动 · 做中学 · 以 Lab 为中心**的项目学习模式，同一套方法论分别落地到三个 Harness：

| 变体 | 目录 | 交付形态 | 命令面 | 写权限落地 |
|---|---|---|---|---|
| **Pi** | `pi-plugin/.pi/` | 开箱即用 `.pi/` 文件夹（+ 可选 npm/git 包） | `/profile` `/read` `/lab`（Prompt Templates）+ `/learning` | 扩展**硬拦截**越界写入 + 保护评分文件（R9） |
| **OpenCode** | `opencode-variant/.opencode/` | 全局或按项目安装的 `.opencode/` | `/profile` `/read` `/lab`（commands） | agent permission（`edit` 仅 `learning_plan/**`，评分文件显式 deny） |
| **DSH** | `project-learning-preset/` | Agent 预设（复制到 `.agent-presets/`） | 无斜杠命令，用**触发语** | persona + 元规则（模型级纪律） |

## 设计要点（v0.2 · 以 Lab 为中心）

1. **一个 Lab = 一个阶段**：每个 Lab 都具备 handout、规则、可运行评分与复盘，用分数决定是否推进。
2. **Lab 五要素**：目标概念 / 驱动问题 / handout（`LAB.md`）/ 规则与评分（`lab.config.json` + `autograder/`）/ 复盘（`REPORT.md`）。
3. **评分 = 项目既有命令 + 规则检查**：不造 bespoke 测试题库、不设隐藏测试；`threshold` 默认 100，结果写 `autograder/last-result.json`。
4. **三个流程**：`/profile`（画像）→ `/read`（地图与可实验点）→ `/lab`（new / grade / review / list，可反复跑分形成闭环）。
5. **推进判定**：`评分 ≥ 阈值` ∧ `驱动问题已答（或显式推迟）` ∧ `REPORT.md` 已填——由状态与分数决定，不看轮数或篇幅。
6. **写权限**：AI 只写 `learning_plan/`；`labs/*/LAB.md`、`labs/*/lab.config.json`、`labs/*/autograder/**` 与项目既有测试生成后**不得修改**（元规则 R9）。
7. **做减法**：文档只留 `MAP.md` / `PROFILE.md` / `LOG.md` / `others/项目解析.md` + 每个 Lab 自己的目录；`KNOWLEDGE.md`、`stages/`、`/ask`、`/build`、`/answer` 均已退役（内容已迁移，未丢失）。
8. **单一技能源**：7 个技能的正文可移植，canonical 源在 `pi-plugin/.pi/skills/`，由 `pi-plugin/scripts/sync-variants.mjs` 同步到三端。

## 核心约定

```text
learning_plan/<项目名>/
├── MAP.md        # 指路：总目标 / 驱动问题 / ## Labs（驱动问题·状态·评分·LAB.md 链接）
├── PROFILE.md    # 我是谁：画像 + 实验评分偏好 + 前置自检（与 MAP 同等重要）
├── LOG.md        # 发生了什么：性质 onboarding|ask|grade|completion|commit
├── labs/NN-<slug>/
│   ├── LAB.md              # handout（目标概念/驱动问题/背景/规则/评分构成/四层提示/交付物）
│   ├── lab.config.json     # tests + rules + threshold + repoRoot（生成后 AI 不得改）
│   ├── scaffold/           # 起步文件，关键实现 # TODO(你来实现)
│   ├── autograder/         # check-rules.mjs / grade.mjs / last-result.json（零依赖）
│   └── REPORT.md           # 复盘（含 grading 区块）
└── others/       # 项目解析.md：事实层 + 验证命令清单 + 可实验点清单 + 概念速查
```

- **一次一个 Lab**；Lab 推进判定 = `评分 ≥ 阈值` ∧ `驱动问题已答（或显式推迟）` ∧ `REPORT.md 已填`。
- 评分 = **项目既有命令** + 规则检查（不得改测试/必须文件/禁止写法），`threshold` 默认 100，结果写 `autograder/last-result.json`。
- 7 个技能：`project-learning-main`、`project-learning-regulation`、`project-lab-method`、`project-reading-method`、`project-doc-map`、`project-doc-profile`、`project-doc-log`。
- `KNOWLEDGE.md`、`stages/`、`/ask`、`/build`、`/answer` 均已退役。

## 单一技能源 + 同步

7 个技能的正文是**可移植**的，canonical 源在 **`pi-plugin/.pi/skills/`**：

```bash
cd pi-plugin
node scripts/sync-variants.mjs          # 同步到 opencode-variant 与 project-learning-preset
node scripts/sync-variants.mjs --check  # 校验三处逐字节一致
```

Harness 差异全部写在技能的「Harness 集成」小节里，因此同步就是整目录替换，不需要按端改写。

## 快速验证

```bash
# Pi：类型 + 单测（33 项）+ 真实加载
cd pi-plugin && npm run typecheck && npm test
pi --mode rpc -e ./pi-plugin   # 发 {"type":"get_commands"} 可见 /profile /read /lab + 7 技能

# OpenCode：技能 / 代理 / 命令面
cd ../opencode-variant && opencode debug skill && opencode debug agent project-learning && opencode debug config

# DSH：预设 YAML 与行集合
#   复制 project-learning-preset/ 到 ${DSH_HOME:-~/.dsh}/.agent-presets/project-learning/
#   agentPresets.standingKeyFor('project-learning') === 'mounted OK'
```
