import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOG_TEMPLATE,
  LOG_TOC_EMPTY,
  LOG_TOC_END,
  LOG_TOC_START,
  appendLogEntryFile,
  computeLabWeights,
  createLabScaffold,
  ensureLogAnchors,
  formatLogEntry,
  formatMapLabBlock,
  formatStatusLine,
  formatStatusReport,
  logAnchor,
  nextLogIndex,
  normalizeLogText,
  parseLog,
  parseMap,
  parseProfile,
  readLastResult,
  renderLogToc,
  renderTemplate,
  slugify,
  summarize,
  syncLogTocFile,
  upsertGradingBlock,
  upsertLabStatus,
  type GradeResult,
  type LabInput,
} from "../.pi/extensions/project-learning/plan.ts";
import { buildModeBlock } from "../.pi/extensions/project-learning/prompt.ts";

const PLAN_DIR = "learning_plan";

function tempProject(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "pi-project-learning-"));
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

const MAP_SAMPLE = `# MAP.md ---- 项目学习指引

## 驱动问题（全局）

| 编号 | 问题 | 状态 | 归属 Lab | 结论去向 |
|---|---|---|---|---|
| Q1 | 入口在哪 | 待答 | Lab 1 | LAB.md |

## Labs

### Lab 1：看懂主链路

- **驱动问题**：Q1 入口在哪；Q2 数据怎么流
- **状态**：进行中
- **评分**：85/100（阈值 100）
- **[LAB.md](labs/01-main-flow/LAB.md)**

### Lab 2：加一个新指令

- **驱动问题**：Q3 怎么注册
- **状态**：未开始
- **评分**：0/100（阈值 90）

## 未解决问题看板

| 问题 | 卡在哪一步 | 下一步动作 |
|---|---|---|
| ... | ... | ... |
`;

test("parseMap 解析 Lab 标题、状态、评分与驱动问题", () => {
  const info = parseMap(MAP_SAMPLE);
  assert.equal(info.labs.length, 2);
  assert.equal(info.labs[0].index, 1);
  assert.equal(info.labs[0].status, "进行中");
  assert.equal(info.labs[0].score, 85);
  assert.equal(info.labs[0].max, 100);
  assert.equal(info.labs[0].threshold, 100);
  assert.deepEqual(info.labs[0].questions, ["Q1 入口在哪", "Q2 数据怎么流"]);
  assert.equal(info.labs[1].status, "未开始");
  assert.equal(info.labs[1].threshold, 90);
  assert.deepEqual(info.questions, ["Q1"]);
});

test("parseMap 兼容旧锚点并容错", () => {
  const legacy = "### 阶段目标3：旧写法\n- **状态**：已验收\n";
  const info = parseMap(legacy);
  assert.equal(info.labs[0].index, 3);
  assert.equal(info.labs[0].status, "已通过");
  assert.equal(parseMap(undefined).labs.length, 0);
  assert.equal(parseMap("### Lab 9：x\n- **状态**：随便写\n").labs[0].status, "未知");
});

test("formatMapLabBlock 生成四行区块", () => {
  const block = formatMapLabBlock({ index: 4, title: "换缓存", questions: ["Q7"], threshold: 90, dirName: "04-cache" });
  assert.match(block, /### Lab 4：换缓存/);
  assert.match(block, /- \*\*驱动问题\*\*：Q7/);
  assert.match(block, /- \*\*状态\*\*：未开始/);
  assert.match(block, /- \*\*评分\*\*：0\/100（阈值 90）/);
  assert.match(block, /\(labs\/04-cache\/LAB\.md\)/);
});

test("upsertLabStatus 就地改状态与分数，缺失则补行", () => {
  const updated = upsertLabStatus(MAP_SAMPLE, 1, { score: 100, max: 100, threshold: 100 });
  assert.equal(updated.found, true);
  assert.match(updated.text, /- \*\*评分\*\*：100\/100（阈值 100）/);
  assert.match(updated.text, /### Lab 2：加一个新指令[\s\S]*?- \*\*评分\*\*：0\/100（阈值 90）/);

  const missing = upsertLabStatus("# MAP\n\n### Lab 5：x\n\n- **驱动问题**：Q1\n", 5, { score: 0, status: "进行中" });
  assert.match(missing.text, /- \*\*状态\*\*：进行中/);
  assert.match(missing.text, /- \*\*评分\*\*：0\/100（阈值 100）/);

  assert.equal(upsertLabStatus(MAP_SAMPLE, 99, { score: 1 }).found, false);
});

test("formatLogEntry / parseLog 支持 grade 性质", () => {
  const block = formatLogEntry(3, {
    matter: "Lab 1 跑分",
    kind: "grade",
    status: "done",
    refs: "Lab 1",
    evidence: "85/100（阈值 100）",
  });
  assert.match(block, /<a id="log-3"><\/a>/);
  const parsed = parseLog(`${LOG_TEMPLATE}${block}`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].kind, "grade");
  assert.equal(parsed[0].evidence, "85/100（阈值 100）");
  assert.equal(nextLogIndex(parsed), 4);
});

test("LOG_TEMPLATE 含目录区块与 markers", () => {
  assert.match(LOG_TEMPLATE, /## 目录/);
  assert.match(LOG_TEMPLATE, /<!-- toc:start -->/);
  assert.match(LOG_TEMPLATE, /<!-- toc:end -->/);
  assert.match(LOG_TEMPLATE, /（暂无条目）/);
  assert.match(LOG_TEMPLATE, /## 消息/);
});

test("renderLogToc：空占位、格式与转义", () => {
  assert.equal(renderLogToc([]), LOG_TOC_EMPTY);
  const toc = renderLogToc([
    { index: 2, matter: "跑分", kind: "grade", status: "done", refs: "", evidence: "" },
    { index: 1, matter: "看 [入口] 代码", kind: "ask", status: "doing", refs: "", evidence: "" },
  ]);
  const lines = toc.split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "- [1. 看 \\[入口\\] 代码](#log-1) —— ask/doing");
  assert.equal(lines[1], "- [2. 跑分](#log-2) —— grade/done");
});

test("parseLog 忽略目录区块，不把目录当条目", () => {
  const text = `${LOG_TEMPLATE}\n${logAnchor(1)}\n1. 采集画像\n- 事情： 采集画像\n- 性质： onboarding\n- 状态： done\n- 关联： 画像\n- 证据/结果： PROFILE.md\n`;
  const withToc = normalizeLogText(text);
  assert.match(withToc, /- \[1\. 采集画像\]\(#log-1\) —— onboarding\/done/);
  const parsed = parseLog(withToc);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].index, 1);
  assert.equal(parsed[0].kind, "onboarding");
});

test("normalizeLogText 幂等", () => {
  const raw = "# LOG.md\n\n## 消息\n\n1. a\n- 事情： a\n- 性质： ask\n- 状态： doing\n- 关联： Q1\n- 证据/结果： -\n";
  const once = normalizeLogText(raw);
  const twice = normalizeLogText(once);
  assert.equal(twice, once);
  assert.equal(normalizeLogText(twice), twice);
});

test("appendLogEntryFile 追加式、编号递增、自动维护目录与锚点", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "LOG.md");
    writeFileSync(path, LOG_TEMPLATE, "utf8");
    assert.equal(appendLogEntryFile(path, { matter: "采集画像", kind: "onboarding", refs: "画像", evidence: "PROFILE.md" }), 1);
    assert.equal(appendLogEntryFile(path, { matter: "跑分", kind: "grade", refs: "Lab 1", evidence: "60/100" }), 2);
    const text = readFileSync(path, "utf8");
    assert.match(text, /1\. 采集画像/);
    assert.match(text, /2\. 跑分/);
    assert.match(text, /- 性质： grade/);
    assert.match(text, /<a id="log-1"><\/a>/);
    assert.match(text, /<a id="log-2"><\/a>/);
    assert.match(text, /- \[1\. 采集画像\]\(#log-1\) —— onboarding\/done/);
    assert.match(text, /- \[2\. 跑分\]\(#log-2\) —— grade\/done/);
    // 目录不污染解析
    const parsed = parseLog(text);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed.map((e) => e.index), [1, 2]);
  } finally {
    cleanup();
  }
});

test("旧格式 LOG.md 首次触碰时补齐目录与锚点，且不改写历史条目", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "LOG.md");
    const legacy = "# LOG.md ---- 项目学习日志\n\n## 消息\n\n1. 旧条目一\n- 事情： 旧条目一\n- 性质： onboarding\n- 状态： done\n- 关联： 画像\n- 证据/结果： PROFILE.md\n\n2. 旧条目二\n- 事情： 旧条目二\n- 性质： ask\n- 状态： doing\n- 关联： Q1\n- 证据/结果： 待答\n";
    writeFileSync(path, legacy, "utf8");
    assert.equal(appendLogEntryFile(path, { matter: "新条目", kind: "grade", refs: "Lab 1", evidence: "60/100" }), 3);
    const text = readFileSync(path, "utf8");
    assert.match(text, /## 目录/);
    assert.match(text, /- \[1\. 旧条目一\]\(#log-1\) —— onboarding\/done/);
    assert.match(text, /- \[2\. 旧条目二\]\(#log-2\) —— ask\/doing/);
    assert.match(text, /- \[3\. 新条目\]\(#log-3\) —— grade\/done/);
    assert.match(text, /<a id="log-1"><\/a>\n1\. 旧条目一/);
    assert.match(text, /<a id="log-2"><\/a>\n2\. 旧条目二/);
    // 历史条目事实字段未被改写
    assert.match(text, /1\. 旧条目一\n- 事情： 旧条目一\n- 性质： onboarding\n- 状态： done\n- 关联： 画像\n- 证据\/结果： PROFILE.md/);
    assert.match(text, /2\. 旧条目二\n- 事情： 旧条目二\n- 性质： ask\n- 状态： doing\n- 关联： Q1\n- 证据\/结果： 待答/);
  } finally {
    cleanup();
  }
});

test("syncLogTocFile：状态改动后刷新目录，无改动返回 false", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "LOG.md");
    writeFileSync(path, LOG_TEMPLATE, "utf8");
    appendLogEntryFile(path, { matter: "提了一个问题", kind: "ask", refs: "Q1", evidence: "待答" });
    assert.match(readFileSync(path, "utf8"), /- \[1\. 提了一个问题\]\(#log-1\) —— ask\/doing/);
    assert.equal(syncLogTocFile(path), false);

    const edited = readFileSync(path, "utf8").replace("- 状态： doing", "- 状态： done");
    writeFileSync(path, edited, "utf8");
    assert.equal(syncLogTocFile(path), true);
    assert.match(readFileSync(path, "utf8"), /- \[1\. 提了一个问题\]\(#log-1\) —— ask\/done/);
    assert.equal(syncLogTocFile(path), false);
  } finally {
    cleanup();
  }
});

test("ensureLogAnchors 幂等且不动目录区块", () => {
  const raw = "## 目录\n\n<!-- toc:start -->\n- [1. a](#log-1) —— ask/doing\n<!-- toc:end -->\n\n## 消息\n\n1. a\n";
  const once = ensureLogAnchors(raw);
  assert.equal(once, ensureLogAnchors(once));
  assert.match(once, /<a id="log-1"><\/a>\n1\. a/);
  assert.doesNotMatch(once, /- <a id="log-1">/);
});

test("parseProfile 解析严格度与 Lab 粒度", () => {
  const info = parseProfile("## 2. 实验与评分偏好\n\n- 严格度：尽量满分\n- Lab 粒度：大实验\n");
  assert.equal(info.exists, true);
  assert.equal(info.strictness, "尽量满分");
  assert.equal(info.granularity, "大实验");
  assert.equal(parseProfile(undefined).exists, false);
});

const LAB_INPUT: LabInput = {
  index: 1,
  slug: "run-it",
  title: "跑通项目",
  concept: "能独立跑起项目主链路",
  task: "背景：这是入口。任务：跑起来并记录输出。",
  questions: ["Q1 入口在哪"],
  path: "README → npm run dev",
  outOfScope: "不读源码",
  deliverable: "一份运行记录",
  rules: ["不许改测试", "实现必须落在 src 下"],
  ruleChecks: { forbiddenPaths: ["test/**"], requiredFiles: ["package.json"], forbiddenPatterns: ["TODO\\(你来实现\\)"] },
  hints: ["看 README", "看 package.json::scripts", "用 npm run dev", "先起服务再访问首页"],
  tests: [
    { label: "项目测试", command: "npm test", weight: 3 },
    { label: "冒烟", command: "npm run smoke", weight: 1 },
  ],
};

test("computeLabWeights 与 grade.mjs 口径一致", () => {
  const withRules = computeLabWeights(LAB_INPUT);
  assert.equal(withRules.rulesWeight, 15);
  assert.equal(withRules.tests[0].points, 63.8);
  assert.ok(Math.abs(withRules.tests.reduce((a, t) => a + t.points, 0) - 85) <= 0.5, "测试分值合计应接近 85");

  const noRules = computeLabWeights({ ...LAB_INPUT, ruleChecks: {} });
  assert.equal(noRules.rulesWeight, 0);
  assert.equal(noRules.tests.reduce((a, t) => a + t.points, 0), 100);
});

test("createLabScaffold 生成完整 Lab 且拒绝重复序号", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const result = createLabScaffold(cwd, PLAN_DIR, "demo", LAB_INPUT);
    assert.equal(result.created, true);
    for (const name of ["LAB.md", "lab.config.json", "REPORT.md", join("autograder", "check-rules.mjs"), join("autograder", "grade.mjs"), join("scaffold", ".gitkeep")]) {
      assert.equal(existsSync(join(result.dir, name)), true, `${name} 应存在`);
    }
    const lab = readFileSync(join(result.dir, "LAB.md"), "utf8");
    assert.match(lab, /不在本 Lab 范围（Out of Scope）/);
    assert.match(lab, /评分构成/);
    assert.match(lab, /# TODO\(你来实现\)/);
    assert.match(lab, /阈值：100 分/);
    assert.doesNotMatch(lab, /\{\{[A-Z_]+\}\}/);

    const config = JSON.parse(readFileSync(join(result.dir, "lab.config.json"), "utf8"));
    assert.equal(config.threshold, 100);
    assert.equal(config.rulesWeight, 15);
    assert.equal(config.tests.length, 2);
    assert.equal(typeof config.repoRoot, "string");
    assert.equal(config.rules.forbiddenPaths[0], "test/**");

    const report = readFileSync(join(result.dir, "REPORT.md"), "utf8");
    assert.match(report, /<!-- grading:start -->/);
    assert.match(report, /<!-- grading:end -->/);

    const again = createLabScaffold(cwd, PLAN_DIR, "demo", { ...LAB_INPUT, slug: "other" });
    assert.equal(again.created, false);
    assert.match(again.reason ?? "", /已存在/);
  } finally {
    cleanup();
  }
});

test("renderTemplate / slugify", () => {
  assert.equal(renderTemplate("a {{X}} b", { X: "1" }), "a 1 b");
  assert.equal(renderTemplate("{{MISS}}", {}), "{{MISS}}");
  assert.equal(slugify("Add New Command!"), "add-new-command");
  assert.equal(slugify(""), "lab");
});

test("upsertGradingBlock 可重复更新且不破坏正文", () => {
  const result: GradeResult = {
    version: 1,
    at: "2026-01-01T00:00:00.000Z",
    score: 80,
    max: 100,
    threshold: 100,
    passed: false,
    checks: [{ id: "unit", label: "项目测试", kind: "test", pass: true, points: 80, maxPoints: 80, detail: "exit 0" }],
  };
  const base = "# REPORT\n\n## 实际做法\n\n我改了 X\n\n<!-- grading:start -->\n（尚未评分）\n<!-- grading:end -->\n\n## 遗留问题\n\n无\n";
  const once = upsertGradingBlock(base, result);
  assert.match(once, /80\/100（阈值 100）未通过/);
  assert.match(once, /我改了 X/);
  assert.match(once, /## 遗留问题/);
  const twice = upsertGradingBlock(once, { ...result, score: 100, passed: true });
  assert.match(twice, /100\/100（阈值 100）已通过/);
  assert.equal((twice.match(/grading:start/g) ?? []).length, 1);
});

test("readLastResult 读取合法结果、忽略损坏文件", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, "lab");
    mkdirSync(join(dir, "autograder"), { recursive: true });
    assert.equal(readLastResult(dir), undefined);
    writeFileSync(join(dir, "autograder", "last-result.json"), "{ not json", "utf8");
    assert.equal(readLastResult(dir), undefined);
    writeFileSync(join(dir, "autograder", "last-result.json"), JSON.stringify({ score: 10, checks: [] }), "utf8");
    assert.equal(readLastResult(dir)?.score, 10);
  } finally {
    cleanup();
  }
});

test("summarize / formatStatusLine 反映 Lab 进度与分数", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "MAP.md"), MAP_SAMPLE, "utf8");
    writeFileSync(join(dir, "PROFILE.md"), "- 严格度：达标即止\n", "utf8");
    writeFileSync(join(dir, "LOG.md"), LOG_TEMPLATE, "utf8");
    const summary = summarize(cwd, PLAN_DIR, "demo");
    assert.equal(summary.active, "demo");
    assert.equal(summary.hasProfile, true);
    assert.equal(summary.map?.labs.length, 2);
    const line = formatStatusLine(summary);
    assert.match(line, /📚 demo/);
    assert.match(line, /Lab 0\/2/);
    assert.match(line, /85\/100/);
  } finally {
    cleanup();
  }
});

test("buildModeBlock 含 Lab 五要素、R9 与当前 Lab 状态", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "MAP.md"), MAP_SAMPLE, "utf8");
    const summary = summarize(cwd, PLAN_DIR, "demo");
    const block = buildModeBlock(summary, { active: true, guard: true });
    assert.match(block, /以 Lab 为中心/);
    assert.match(block, /一次只给一个 Lab/);
    assert.match(block, /R9|不得修改/);
    assert.match(block, /当前 Lab：Lab 1 看懂主链路/);
    assert.match(block, /不要创建 KNOWLEDGE\.md 或 stages/);
  } finally {
    cleanup();
  }
});

test("formatStatusReport 不把目录当条目（回归）", () => {
  const { cwd, cleanup } = tempProject();
  try {
    const dir = join(cwd, PLAN_DIR, "demo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "MAP.md"), MAP_SAMPLE, "utf8");
    const logFile = join(dir, "LOG.md");
    writeFileSync(logFile, LOG_TEMPLATE, "utf8");
    appendLogEntryFile(logFile, { matter: "提了一个问题", kind: "ask", refs: "Q1", evidence: "待答" });
    appendLogEntryFile(logFile, { matter: "Lab 1 跑分", kind: "grade", refs: "Lab 1", evidence: "60/100" });

    const report = formatStatusReport(summarize(cwd, PLAN_DIR, "demo"));
    assert.doesNotMatch(report, /\]\(#log-/);
    assert.match(report, /待答问题：/);
    assert.match(report, /LOG#1：提了一个问题/);
    assert.match(report, /最近日志：/);
    assert.match(report, /#2 \[grade\/done\] Lab 1 跑分/);
  } finally {
    cleanup();
  }
});
