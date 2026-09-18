# Lab {{INDEX}}：{{TITLE}}

> handout（实验说明）。评分与规则由同目录 `lab.config.json` 与 `autograder/` 决定；**本文件与评分文件在学习过程中不得修改**。
> 复盘写进同目录 [`REPORT.md`](REPORT.md)。实现由你自己在**项目源码**中完成。

## 目标概念

{{CONCEPT}}

## 驱动问题

{{QUESTIONS}}

## 背景与概念

{{TASK}}

## 学习路径

{{PATH}}

## 不在本 Lab 范围（Out of Scope）

{{OUT_OF_SCOPE}}

## 规则与约束

{{RULES}}

## 评分构成

{{GRADING}}

- 阈值：{{THRESHOLD}} 分（`lab.config.json` 的 `threshold`）。
- 跑分：`node learning_plan/{{PROJECT}}/labs/{{NN_SLUG}}/autograder/grade.mjs`（或 `/lab grade`）。
- 分数记录在 `autograder/last-result.json`，并写回 `MAP.md`、`REPORT.md`、`LOG.md`。

## 分层提示（卡住时按顺序看，不要一次读完）

{{HINTS}}

## 起步文件

见同目录 `scaffold/`：关键实现留空并标注 `# TODO(你来实现)`，由你自己完成。实现写进**项目源码**，不要把 scaffold 当成交付物。

## 交付物

{{DELIVERABLE}}

## 提交要求

跑分 ≥ 阈值、驱动问题已答、`REPORT.md` 已填后，提交一个 git commit（一 Lab 一提交），并记录到 `LOG.md`。
