import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { decideWrite, isGitCommitCommand, isInside, isProtectedLabFile, normalizeToolPath } from "../.pi/extensions/project-learning/guard.ts";

const cwd = resolve("/work/proj");

test("learning_plan 内的普通文件放行", () => {
  for (const p of [
    "learning_plan/a.md",
    "learning_plan/demo/MAP.md",
    "learning_plan/demo/PROFILE.md",
    "learning_plan/demo/LOG.md",
    "learning_plan/demo/others/项目解析.md",
    "learning_plan/demo/labs/01-x/REPORT.md",
    "learning_plan/demo/labs/01-x/scaffold/a.ts",
    "learning_plan",
  ]) {
    assert.equal(decideWrite(p, cwd).allow, true, `${p} 应放行`);
  }
});

test("learning_plan 之外的写入被拒", () => {
  for (const p of ["src/a.ts", "README.md", "../outside.md", "learning_plan_evil/x.md"]) {
    const decision = decideWrite(p, cwd);
    assert.equal(decision.allow, false, `${p} 应被拒`);
    assert.equal(decision.kind, "outside");
    assert.match(decision.reason ?? "", /learning_plan/);
  }
});

test("评分与规则文件受保护（R9）", () => {
  for (const p of [
    "learning_plan/demo/labs/01-x/LAB.md",
    "learning_plan/demo/labs/01-x/lab.config.json",
    "learning_plan/demo/labs/01-x/autograder/grade.mjs",
    "learning_plan/demo/labs/01-x/autograder/check-rules.mjs",
    "learning_plan/demo/labs/01-x/autograder/last-result.json",
  ]) {
    const decision = decideWrite(p, cwd);
    assert.equal(decision.allow, false, `${p} 应被保护`);
    assert.equal(decision.kind, "protected");
    assert.match(decision.reason ?? "", /不得修改/);
  }
  assert.equal(isProtectedLabFile("demo/labs/01-x/LAB.md"), true);
  assert.equal(isProtectedLabFile("demo/labs/01-x/REPORT.md"), false);
  assert.equal(isProtectedLabFile("demo/MAP.md"), false);
});

test("路径穿越被拒", () => {
  assert.equal(decideWrite("learning_plan/../src/a.ts", cwd).allow, false);
  assert.equal(decideWrite("learning_plan/../../etc/passwd", cwd).allow, false);
});

test("绝对路径越界被拒", () => {
  assert.equal(decideWrite(resolve(cwd, "..", "other", "x.ts"), cwd).allow, false);
  assert.equal(decideWrite(resolve(cwd, "learning_plan", "x.ts"), cwd).allow, true);
});

test("normalizeToolPath 去掉前导 @ 并解析相对路径", () => {
  assert.equal(normalizeToolPath("@learning_plan/a.md", cwd), resolve(cwd, "learning_plan/a.md"));
  assert.equal(normalizeToolPath("", cwd), cwd);
  assert.equal(normalizeToolPath(undefined, cwd), cwd);
});

test("isInside 支持大小写不敏感（Windows 语义）", () => {
  const root = resolve("/work/proj/learning_plan");
  const target = resolve("/work/proj/LEARNING_PLAN/sub/x.md");
  assert.equal(isInside(root, target, true), true);
  assert.equal(isInside(root, resolve("/work/proj/src/a.ts"), true), false);
});

test("isGitCommitCommand 只命中真正的 git commit", () => {
  assert.equal(isGitCommitCommand("git commit -m 'x'"), true);
  assert.equal(isGitCommitCommand("npm test && git commit -m x"), true);
  assert.equal(isGitCommitCommand("git status"), false);
  assert.equal(isGitCommitCommand("echo git commit"), false);
  assert.equal(isGitCommitCommand(undefined), false);
});
