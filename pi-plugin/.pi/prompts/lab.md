---
description: 设计/跑分/复盘一个 Lab（labs/NN-<slug>/：LAB.md + lab.config.json + autograder + scaffold + REPORT.md），关键实现留给学习者
argument-hint: "[new|grade|review|list] [阶段编号或主题]"
---
先 `read` 加载 `project-lab-method` 与 `project-doc-map`、`project-doc-log` 技能，然后执行「/lab」（参数：$ARGUMENTS）。

子动作（默认 `new`）：

## new —— 设计一个 Lab（一次只给一个）

1. 用 `learning_status` 读状态，取第一个「未开始」的 Lab；参数可指定编号或主题；
2. 从 `others/项目解析.md` 取**验证命令清单**与**可实验点清单**；缺失则先用只读命令探测（`npm test` / `make test` / `cargo test` / `pytest` 等），并回写清单（未验证的标「未验证」）；
3. 用 `learning_lab` 工具生成 `labs/NN-<slug>/`：LAB.md（handout）+ lab.config.json（tests/rules/threshold）+ autograder（check-rules.mjs / grade.mjs）+ scaffold/ + REPORT.md；
4. 在 `scaffold/` 写起步文件（签名、注释、示例），**关键实现留空并标注 `# TODO(你来实现)`**；
5. 更新 `MAP.md` 的 Lab 区块（驱动问题 / 状态 `进行中` / 评分 `0/100（阈值 t）` / LAB.md 链接）；
6. **不给实现**：只给 handout、脚手架与四层提示（方向 → 定位 → 关键 API → 伪代码级）。

## grade —— 跑分

1. 用 `learning_grade` 工具（或 `node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs`）；
2. 呈现逐项结果（哪条命令/哪条规则过了、多少分）；把分数写回 `MAP.md`、`REPORT.md` 的 grading 区块，并用 `learning_log` 记 `grade`；
3. **未达阈值不是错误**：按逐项结果给**下一层提示**，不修改学习者的实现；达到阈值则提示进入 `review`。

## review —— 复盘（门槛）

1. 三维批改：正确性（真跑通）/ 代码质量（命名·边界·错误处理）/ 是否真的理解（脱离代码复述原理 + 应对一个小变体）；
2. 检查 `REPORT.md` 是否已填（实际做法 / 卡点 / 学到的概念 / 遗留）；未填则要求补；
3. 通过后：`learning_log` 记 `completion`（含分数与验证输出）、`MAP.md` 状态改「已通过」、概念写进 `LAB.md`「背景与概念」或下一 Lab 的前置自检；
4. 发现特判（硬编码答案、针对用例分支）：分数作废，要求重写。

## list —— 列表

列出所有 Lab 的标题 / 状态 / 分数 / 阈值（读 `MAP.md` + `last-result.json`）。

## 铁律（R9）

不得修改 `LAB.md`、`lab.config.json`、`autograder/**` 与项目既有测试；不得削弱规则检查；不得替学习者改实现。Lab 推进判定：**评分 ≥ 阈值 ∧ 驱动问题已答（或显式推迟）∧ `REPORT.md` 已填**。
