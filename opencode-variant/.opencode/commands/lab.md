---
description: 设计/跑分/复盘一个 Lab（labs/NN-slug/：LAB.md + lab.config.json + autograder + scaffold + REPORT.md）
agent: project-learning
---
用 `skill` 工具加载 `project-lab-method`、`project-doc-map`、`project-doc-log`，然后执行「/lab」（`$ARGUMENTS`：`new|grade|review|list` [+ 编号或主题]，默认 `new`）。

## new —— 设计一个 Lab（一次只给一个）

1. 读 `MAP.md`，取第一个「未开始」的 Lab；`$ARGUMENTS` 可指定编号或主题。
2. 从 `others/项目解析.md` 取**验证命令清单**与**可实验点清单**；缺失则先用只读命令探测（`npm test` / `make test` / `cargo test` / `pytest` 等），并回写清单（未验证的标「未验证」）。
3. 在 `learning_plan/<项目>/labs/NN-<slug>/` 下生成：
   - `LAB.md`（用 `project-lab-method/references/LAB.template.md` 填充：目标概念 / 驱动问题 / 背景与概念 / 学习路径 / Out of Scope / 规则与约束 / 评分构成 / 四层提示 / 交付物 / 提交要求）；
   - `lab.config.json`（tests + rules + threshold + repoRoot，格式见 `references/lab-config.example.json`）；
   - `autograder/check-rules.mjs` 与 `autograder/grade.mjs`（从 `references/` 原样复制，零依赖）；
   - `scaffold/`（起步文件：签名、注释、示例；**关键实现留空并标注 `# TODO(你来实现)`**）；
   - `REPORT.md`（用 `references/REPORT.template.md`）。
4. 把 Lab 区块插入 `MAP.md` 的「## Labs」（四行：驱动问题 / 状态 / 评分 / `LAB.md` 链接）。
5. **不给实现**：只给 handout、脚手架与四层提示。

## grade —— 跑分

1. 运行 `node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs`（bash 需用户确认）。
2. 读 `autograder/last-result.json`，呈现逐项结果；把分数写回 `MAP.md` 的评分行与 `REPORT.md` 的 `<!-- grading:start -->…<!-- grading:end -->` 区块；在 `LOG.md` 追加 `grade` 条目（含分数、命令、结果文件路径）。
3. **未达阈值不是错误**：按逐项结果给**下一层提示**，不得修改学习者实现。

## review —— 复盘（门槛）

三维批改（正确性 / 代码质量 / 是否真的理解）通过且 `REPORT.md` 已填后：`LOG.md` 记 `completion`、`MAP.md` 状态改「已通过」、概念写进 `LAB.md`「背景与概念」或下一 Lab 的前置自检。发现特判（硬编码答案）则分数作废。

## list —— 列表

列出所有 Lab 的标题 / 状态 / 分数 / 阈值。

## 铁律（R9）

不得修改 `LAB.md`、`lab.config.json`、`autograder/**` 与项目既有测试；不得削弱规则检查；不得替学习者改实现。Lab 推进判定：**评分 ≥ 阈值 ∧ 驱动问题已答（或显式推迟）∧ `REPORT.md` 已填**。
