# pi-project-learning（Pi 项目学习插件 · 以 Lab 为中心 · 开箱即用 `.pi/` 版）

> **问题驱动 · 做中学 · 以 Lab 为中心**的 Pi 插件：一个 Lab = 一个阶段。每个 Lab 都有 handout、明确的规则与约束、
> **可运行的评分**（项目既有命令 + 规则检查）与复盘，**用分数决定是否推进**。
> AI 只写 `learning_plan/`，项目源码由学习者**自己动手实现**；评分与规则文件生成后**不得修改**。

**开箱即用**：把本仓库的 `.pi/` 文件夹复制到你的项目根目录即可（无需 npm、无需构建），Pi 会在项目可信后自动加载。

本插件是「项目学习模式 v0.2（问题驱动 · 做中学 · 以 Lab 为中心）」在 **Pi** 上的落地，与 OpenCode / DSH 变体**共用同一套技能正文**。

## 30 秒上手

```powershell
# 1) 装进你的项目（Windows PowerShell）
.\pi-plugin\scripts\install.ps1 -Target D:\path\to\your-project
```

```bash
# macOS / Linux
./pi-plugin/scripts/install.sh /path/to/your-project
```

```powershell
# 2) 启动（首次会询问是否信任项目 → 选 yes；或加 --approve）
cd D:\path\to\your-project
pi --approve
```

```text
# 3) 开始学习
/profile        # 采集画像与前置自检 → PROFILE.md
/read           # 分档阅读 → MAP.md 骨架 + 前置自检 + others/项目解析.md
/lab new        # 生成一个 Lab（handout + 规则 + autograder + 脚手架）
/lab grade      # 学习者自己写完后跑分（写回 MAP / REPORT / LOG）
/lab review     # 三维批改 + 复盘 → 状态「已通过」
/lab list       # 列出所有 Lab 与分数
/learning status  # 查看进度；/learning off 退出学习模式
```

> 说明：Pi 的 `.pi/` 属于**项目级资源**，只在项目被信任后加载。首次运行会弹信任提示（或 `pi --approve`、或 `/trust` 永久记住）。
> 把 `.pi/` 提交进目标项目的 git，队友也能直接获得同一套插件。

## 插件本体：`.pi/`

```text
.pi/
├── extensions/project-learning/     # 扩展（Pi 用 jiti 直接加载 TS，无需构建）
│   ├── index.ts                     # 入口：模式开关 / 提示注入 / 写入守卫 / 状态栏 / 命令
│   ├── runtime.ts                   # 会话级状态（激活、活动项目、守卫开关，随会话持久化）
│   ├── plan.ts                      # learning_plan 文档层（定位/解析/渲染/Lab 脚手架/评分回写）
│   ├── guard.ts                     # 写入守卫的纯函数策略（越界 + 评分文件保护，可单测）
│   ├── tools.ts                     # learning_status / learning_log / learning_lab / learning_grade / learning_profile
│   ├── prompt.ts                    # 学习模式 systemPrompt 片段（Lab 五要素 + R9）
│   └── status.ts                    # footer 状态栏
├── prompts/                         # 三个命令（Prompt Templates，带 argument-hint）
│   ├── profile.md  read.md  lab.md
└── skills/                          # 七个技能（与 OpenCode / DSH 变体逐字节相同）
    ├── project-learning-main/SKILL.md
    ├── project-learning-regulation/SKILL.md
    ├── project-lab-method/SKILL.md + references/{LAB.template.md, REPORT.template.md, lab-config.example.json, check-rules.mjs, grade.mjs}
    ├── project-reading-method/SKILL.md
    ├── project-doc-map/SKILL.md
    ├── project-doc-profile/SKILL.md
    └── project-doc-log/SKILL.md
```

> `learning_lab` 直接从 `skills/project-lab-method/references/` 读取模板生成 Lab —— **技能里写的规范就是工具生成的产物**，不会漂移。

## 命令、工具与产物

| 入口 | 作用 | 产物 |
|---|---|---|
| `/profile [项目名]` | 画像向导（基础 / 目标 / 文档偏好 / **实验与评分偏好**） | `PROFILE.md` + `LOG.md` 首条（onboarding） |
| `/read [子系统]` | 复杂度分档阅读 | `MAP.md` 骨架、`PROFILE.md` §3 前置自检、`others/项目解析.md`（含验证命令 + 可实验点清单） |
| `/lab new [编号]` | 生成本 Lab（handout + lab.config.json + autograder + scaffold + REPORT.md） | `labs/NN-<slug>/` |
| `/lab grade` | 跑分并回写 | 分数写回 `MAP.md`、`REPORT.md`（grading 区块）、`LOG.md`（grade） |
| `/lab review` | 三维批改 + 复盘门槛 | `MAP.md` 状态「已通过」+ `LOG.md`（completion） |
| `/lab list` | 列出 Lab 与分数 | — |
| `/learning status\|on\|off\|project <名>\|guard on\|off` | 模式控制面 | — |
| `learning_lab` 工具 | 创建 Lab 脚手架（模板来自技能 references） | `labs/NN-<slug>/` |
| `learning_grade` 工具 | 跑 `autograder/grade.mjs` + 解析 `last-result.json` + 回写 | `MAP/REPORT/LOG` |
| `learning_log` / `learning_status` / `learning_profile` | 日志 / 状态 / 画像 | `LOG.md` / 只读 / 画像卡 |

产物目录（AI 唯一可写区）：

```text
learning_plan/<项目名>/
├── MAP.md        # 指路：总目标 / 驱动问题 / ## Labs（驱动问题·状态·评分·LAB.md 链接）
├── PROFILE.md    # 我是谁：画像 + 实验评分偏好 + 前置自检
├── LOG.md        # 发生了什么：性质 onboarding|ask|grade|completion|commit
├── labs/NN-<slug>/{LAB.md, lab.config.json, scaffold/, autograder/{check-rules.mjs,grade.mjs,last-result.json}, REPORT.md}
└── others/       # 项目解析.md：事实层 + 验证命令清单 + 可实验点清单 + 概念速查
```

## 评分怎么跑

`autograder/grade.mjs` 是零依赖 Node 脚本：读 `lab.config.json` → 跑项目既有命令（`npm test` / `make test` / `pytest`…）+ 规则检查
（不得改测试、必须文件、禁止写法、可选新增行数上限）→ 写 `last-result.json`（`score/max/threshold/passed/checks`）。
`max = 100`；测试占 `100 - rulesWeight`，规则检查占 `rulesWeight`（默认 15）；`threshold` 默认 100。退出码 0/1/2 = 达标/未达标/配置错误。
**未达标不是错误**：AI 按逐项结果给下一层提示（方向 → 定位 → 关键 API → 伪代码级）。

## Pi 特有优化

1. **命令即 Prompt Template**：`/profile` `/read` `/lab` 是 Pi 原生模板，带 `argument-hint`，不写一行命令代码。
2. **写入守卫（硬约束）**：学习模式下 `write`/`edit` 落在 `learning_plan/` 之外会被 `tool_call` 直接拦截；`labs/*/LAB.md`、`labs/*/lab.config.json`、`labs/*/autograder/**` **额外受保护**（R9，防「改评分器」）。
3. **常驻规范注入**：`before_agent_start` 只在学习模式激活时追加系统提示（Lab 五要素 + R9 + 当前 Lab 与分数），**普通编码会话零影响**。
4. **确定性文档层**：Lab 脚手架、日志编号、MAP 评分回写、REPORT grading 区块都由代码保证，模型专注内容。
5. **交互式画像向导**：`learning_profile` 用 `ctx.ui` 采集画像；`-p`/JSON 模式自动降级为对话提问。
6. **状态栏**：footer 实时显示 `📚 <项目> · Lab x/y 进行中 · 85/100 · 待答 n`。
7. **自然语言触发**：「学习/阅读这个项目」→ `/read`；「设计一个 Lab」→ `/lab new`；「跑分」→ `/lab grade`；「复盘」→ `/lab review`。
8. **零依赖**：只用 Pi 内置能力与 `typebox`，不联网、不起后台进程。

## 其他安装方式

1. **包安装**（走 `package.json` 的 `pi` 清单，同样加载 `.pi/` 下资源）：

   ```bash
   pi install ./pi-plugin
   pi install git:github.com/<你>/pi-project-learning
   pi install npm:pi-project-learning
   ```

2. **全局目录**（对所有项目生效）：把 `.pi/extensions/project-learning`、`.pi/skills/*`、`.pi/prompts/*.md` 分别复制到
   `~/.pi/agent/extensions/`、`~/.pi/agent/skills/`、`~/.pi/agent/prompts/`（扩展按相对路径 `../../skills/...` 找模板，三个布局都成立）。

## 权限与安全

- 扩展**只在学习模式激活时**拦截写入；`/learning off` 立即恢复普通编码行为。
- 守卫是「模型侧」约束：它阻止 **AI** 改你的源码与评分文件；你自己在编辑器里的改动不受影响。
- 学习模式下 `git commit` 会请求确认（一 Lab 一提交）。
- 扩展不联网、不执行外部命令；`bash` 仍走 Pi 常规确认流程。

## 配置

| Flag | 默认 | 说明 |
|---|---|---|
| `--project-learning` | false | 启动即进入学习模式 |
| `--learning-plan-dir <dir>` | `learning_plan` | 产物目录名 |

## 验收清单

- [ ] 把 `.pi/` 复制到项目根并 `pi --approve` 后：`/` 可见 `/profile` `/read` `/lab` `/learning`；`/skill:project-learning-main` 可加载；7 个技能出现在系统提示中（无 `project-doc-knowledge`）。
- [ ] `/profile`：画像向导 → `PROFILE.md`（四节）+ `LOG.md`（`onboarding/done`）；状态栏出现项目名。
- [ ] `/read`（微型测试仓库）：MAP 骨架 + `PROFILE.md` §3 前置自检 + `others/项目解析.md`（含验证命令清单与可实验点清单），结论带 `文件::符号`；画像缺失时不臆造 Lab。
- [ ] `/lab new 1`：`labs/01-<slug>/` 六个产物齐备；`LAB.md` 含 Out of Scope、评分构成、四层提示与 `# TODO(你来实现)`；无完整实现。
- [ ] `/lab grade`：`last-result.json` 生成；`MAP.md` 评分行、`REPORT.md` grading 区块、`LOG.md`（`grade`）同步；状态栏显示分数；未达阈值不报错。
- [ ] `/lab review`：三维批改 + `REPORT.md` 已填后状态改「已通过」并记 `completion`。
- [ ] 守卫：学习模式下要求 AI 改 `src/` 文件被拒；改 `labs/*/autograder/grade.mjs` 被拒（R9）；改 `REPORT.md` 成功；`/learning off` 后放行。
- [ ] 普通会话：不注入提示、不拦截、无状态栏。
- [ ] `pi -p "..."`（无 UI）：`learning_profile` 降级为对话提问；守卫仍生效。
- [ ] `/reload` 与 `/resume` 后模式与状态栏恢复。

## 开发

```bash
cd pi-plugin
npm install
npm test                  # 33 项：守卫策略、文档解析/渲染、Lab 脚手架、评分端到端、资源契约
npm run typecheck         # tsc --noEmit
node scripts/sync-variants.mjs --check   # 校验三个变体的技能一致
```

> `npm install` 仅用于开发（测试/类型检查）；**使用插件不需要安装任何依赖**。

## 三个变体

| 变体 | 目录 | 命令面 | 写权限落地 |
|---|---|---|---|
| Pi | `pi-plugin/.pi/` | `/profile` `/read` `/lab`（Prompt Templates）+ `/learning` | 扩展**硬拦截** + 评分文件保护 |
| OpenCode | `opencode-variant/.opencode/` | `/profile` `/read` `/lab`（commands） | agent permission（`edit` 仅 `learning_plan/**`，评分文件显式 deny） |
| DSH | `project-learning-preset/` | 无命令，用触发语 | persona + 元规则（纪律） |

三个变体的 7 个技能**逐字节相同**，由 `pi-plugin/scripts/sync-variants.mjs` 从 Pi（canonical）同步。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
