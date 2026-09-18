#!/usr/bin/env node
/**
 * 零依赖评分器（Node >= 18）。
 *
 * 用法（在项目任意位置）：
 *   node learning_plan/<项目>/labs/NN-<slug>/autograder/grade.mjs
 *
 * 职责：
 *   1. 读取同 Lab 目录下的 lab.config.json；
 *   2. 跑 tests[].command（项目既有命令，shell 执行，带超时）；
 *   3. 跑 rules（check-rules.mjs 的规则检查，只针对项目源码）；
 *   4. 汇总成分数写入同目录 last-result.json，并打印人类可读摘要。
 *
 * 退出码：达阈值 0，未达阈值 1，配置/环境错误 2。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./check-rules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const labDir = resolve(here, "..");
const configPath = resolve(labDir, "lab.config.json");
const resultPath = resolve(here, "last-result.json");

function fail(message) {
  console.error(`[grade] ${message}`);
  process.exit(2);
}

if (!existsSync(configPath)) fail(`找不到 lab.config.json：${configPath}`);

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  fail(`lab.config.json 解析失败：${error.message}`);
}

const repoRoot = resolve(labDir, config.repoRoot ?? "../../../..");
const threshold = Number.isFinite(config.threshold) ? config.threshold : 100;
const rulesChecks = check(config, repoRoot);
const hasRules = rulesChecks.length > 0 && !(rulesChecks.length === 1 && rulesChecks[0].id === "rules-none");
const rulesWeight = hasRules ? (Number.isFinite(config.rulesWeight) ? config.rulesWeight : 15) : 0;
const testsBudget = 100 - rulesWeight;

/* ── 跑项目命令 ── */
const tests = Array.isArray(config.tests) ? config.tests : [];
const declared = tests.map((t) => (Number.isFinite(t.weight) && t.weight > 0 ? t.weight : 1));
const sumDeclared = declared.reduce((a, b) => a + b, 0) || 1;

const checks = [];
let testPoints = 0;
tests.forEach((test, i) => {
  const weight = (testsBudget * declared[i]) / sumDeclared;
  const cwd = resolve(repoRoot, test.cwd ?? ".");
  const timeout = Number.isFinite(test.timeoutMs) ? test.timeoutMs : 120000;
  const started = Date.now();
  let pass = false;
  let detail = "";
  try {
    const result = spawnSync(test.command, {
      shell: true,
      cwd,
      timeout,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
    });
    pass = result.status === 0 && !result.error;
    const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    detail = result.error
      ? `error: ${result.error.message}`
      : `exit ${result.status}（${Date.now() - started}ms）${out ? ` | ${out.slice(-600)}` : ""}`;
  } catch (error) {
    detail = `error: ${error.message}`;
  }
  const points = pass ? weight : 0;
  testPoints += points;
  checks.push({
    id: test.id ?? `test-${i + 1}`,
    label: test.label ?? test.command,
    kind: "test",
    command: test.command,
    cwd: test.cwd ?? ".",
    pass,
    points: round(points),
    maxPoints: round(weight),
    detail,
  });
});

/* ── 规则检查 ── */
let rulePoints = 0;
if (hasRules) {
  const each = rulesWeight / rulesChecks.length;
  for (const rc of rulesChecks) {
    const points = rc.pass ? each : 0;
    rulePoints += points;
    checks.push({
      id: rc.id,
      label: rc.label,
      kind: "rule",
      pass: rc.pass,
      points: round(points),
      maxPoints: round(each),
      detail: rc.detail,
    });
  }
}

function round(value) {
  return Math.round(value * 10) / 10;
}

const score = Math.min(100, Math.round(testPoints + rulePoints));
const passed = score >= threshold;

const payload = {
  version: 1,
  at: new Date().toISOString(),
  lab: config.lab ?? { index: null, slug: null, title: null },
  repoRoot,
  score,
  max: 100,
  threshold,
  passed,
  checks,
};

try {
  writeFileSync(resultPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
} catch (error) {
  fail(`写 last-result.json 失败：${error.message}`);
}

/* ── 人类可读摘要 ── */
const title = config.lab?.title ?? config.lab?.slug ?? "Lab";
console.log(`Lab ${config.lab?.index ?? ""} ${title} —— ${score}/100（阈值 ${threshold}）${passed ? "已通过" : "未通过"}`);
for (const c of checks) {
  const mark = c.pass ? "✓" : "✗";
  const label = `${c.kind === "rule" ? "[规则]" : "[命令]"} ${c.label}`;
  console.log(`${mark} ${label}  ${c.points}/${c.maxPoints}  ${c.detail}`);
}
console.log(`结果已写入：${resultPath}`);

process.exit(passed ? 0 : 1);
