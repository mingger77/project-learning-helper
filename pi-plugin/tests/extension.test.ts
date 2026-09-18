import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import projectLearning from "../.pi/extensions/project-learning/index.ts";
import { formatMapLabBlock } from "../.pi/extensions/project-learning/plan.ts";

type Handler = (event: any, ctx: any) => any | Promise<any>;

function createMockPi(flags: Record<string, unknown> = {}) {
  const handlers = new Map<string, Handler[]>();
  const tools: any[] = [];
  const commands: any[] = [];
  const registeredFlags: string[] = [];
  const entries: any[] = [];
  const pi = {
    on: (event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerTool: (definition: any) => tools.push(definition),
    registerCommand: (name: string, options: any) => commands.push({ name, options }),
    registerFlag: (name: string) => registeredFlags.push(name),
    getFlag: (name: string) => flags[name],
    appendEntry: (customType: string, data?: unknown) => entries.push({ type: "custom", customType, data }),
    exec: async (command: string, args: string[], options?: { timeout?: number }) => {
      const result = spawnSync(command, args, {
        timeout: options?.timeout,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: result.status, killed: false };
    },
  };
  return {
    pi,
    tools,
    commands,
    registeredFlags,
    entries,
    emit: async (event: string, payload: any, ctx: any) => {
      let result: any;
      for (const handler of handlers.get(event) ?? []) result = await handler(payload, ctx);
      return result;
    },
  };
}

function createMockCtx(cwd: string, hasUI = true) {
  const statuses: Array<[string, string | undefined]> = [];
  const notifications: string[] = [];
  return {
    cwd,
    hasUI,
    mode: "tui",
    signal: undefined,
    sessionManager: { getEntries: () => [], getBranch: () => [] },
    ui: {
      setStatus: (key: string, value: string | undefined) => statuses.push([key, value]),
      notify: (message: string) => notifications.push(message),
      confirm: async () => true,
      select: async () => "能独立写小项目",
      input: async () => "看懂主链路",
      editor: async () => undefined,
    },
    statuses,
    notifications,
  };
}

function seedMap(cwd: string, title = "e2e Lab"): void {
  const dir = join(cwd, "learning_plan", "demo");
  mkdirSync(dir, { recursive: true });
  const block = formatMapLabBlock({ index: 1, title, questions: ["Q1 怎么跑"], threshold: 100, dirName: "01-e2e" });
  writeFileSync(join(dir, "MAP.md"), `# MAP.md\n\n## Labs\n\n${block}`, "utf8");
  writeFileSync(join(dir, "PROFILE.md"), "## 2. 实验与评分偏好\n\n- 严格度：达标即止\n", "utf8");
}

test("扩展注册 5 个工具、1 个命令、2 个 flag", () => {
  const { pi, tools, commands, registeredFlags } = createMockPi();
  projectLearning(pi as any);
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["learning_grade", "learning_lab", "learning_log", "learning_profile", "learning_status"],
  );
  assert.deepEqual(commands.map((c) => c.name), ["learning"]);
  assert.deepEqual(registeredFlags.sort(), ["learning-plan-dir", "project-learning"]);
  for (const tool of tools) {
    assert.equal(typeof tool.promptSnippet, "string", `${tool.name} 应有 promptSnippet`);
    for (const guideline of tool.promptGuidelines ?? []) {
      assert.match(guideline, new RegExp(tool.name), `${tool.name} 的 promptGuidelines 应点名工具`);
    }
  }
});

test("学习模式激活后注入 Lab 中心规范；未激活不注入", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    const { pi, emit } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    await emit("session_start", { reason: "startup" }, ctx);
    assert.equal(await emit("before_agent_start", { systemPrompt: "BASE" }, ctx), undefined);

    await emit("input", { source: "interactive", text: "/profile demo" }, ctx);
    const active = await emit("before_agent_start", { systemPrompt: "BASE" }, ctx);
    assert.match(active.systemPrompt, /BASE/);
    assert.match(active.systemPrompt, /以 Lab 为中心/);
    assert.match(active.systemPrompt, /当前状态/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("触发语映射 /profile /read /lab，且 /ask /build 不再触发", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    const { pi, emit } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    assert.deepEqual(await emit("input", { source: "interactive", text: "学习这个项目" }, ctx), {
      action: "transform",
      text: "/read",
    });
    assert.deepEqual(await emit("input", { source: "interactive", text: "设计一个 Lab" }, ctx), {
      action: "transform",
      text: "/lab new",
    });
    assert.deepEqual(await emit("input", { source: "interactive", text: "复盘" }, ctx), {
      action: "transform",
      text: "/lab review",
    });
    assert.deepEqual(await emit("input", { source: "interactive", text: "/lab grade" }, ctx), { action: "continue" });
    assert.deepEqual(await emit("input", { source: "interactive", text: "/build 1" }, ctx), { action: "continue" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("守卫拦截越界写入与评分文件，放行 Lab 其它文件，/learning off 解除", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    const { pi, emit, commands } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    await emit("session_start", { reason: "startup" }, ctx);
    await emit("input", { source: "interactive", text: "/read" }, ctx);

    const outside = await emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx);
    assert.equal(outside.block, true);
    assert.match(outside.reason, /learning_plan/);

    const protectedFile = await emit(
      "tool_call",
      { toolName: "edit", input: { path: "learning_plan/demo/labs/01-x/autograder/grade.mjs" } },
      ctx,
    );
    assert.equal(protectedFile.block, true);
    assert.match(protectedFile.reason, /不得修改/);

    const allowed = await emit(
      "tool_call",
      { toolName: "edit", input: { path: "learning_plan/demo/labs/01-x/REPORT.md" } },
      ctx,
    );
    assert.equal(allowed, undefined);

    await commands[0].options.handler("off", ctx);
    assert.equal(await emit("tool_call", { toolName: "write", input: { path: "src/a.ts" } }, ctx), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("端到端：learning_lab 生成 Lab → learning_grade 跑分并回写 MAP/REPORT/LOG", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    seedMap(cwd);
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0", scripts: { test: 'node -e "process.exit(0)"' } }),
      "utf8",
    );
    const { pi, tools } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    const lab = tools.find((t) => t.name === "learning_lab");
    const grade = tools.find((t) => t.name === "learning_grade");

    const created = await lab.execute(
      "id",
      {
        project: "demo",
        index: 1,
        slug: "e2e",
        title: "e2e Lab",
        concept: "能跑通 demo 项目",
        task: "背景与任务说明",
        questions: ["Q1 怎么跑"],
        path: "package.json → npm test",
        outOfScope: "不改源码",
        deliverable: "一次通过的 npm test",
        rules: ["不许改测试"],
        hints: ["看 package.json", "看 scripts.test", "运行 npm test", "确认 exit code 为 0"],
        tests: [{ label: "项目测试", command: 'node -e "process.exit(0)"', weight: 1 }],
        forbiddenPaths: ["test/**"],
        requiredFiles: ["package.json"],
        forbiddenPatterns: ["TODO\\(你来实现\\)"],
      },
      undefined,
      undefined,
      ctx,
    );
    assert.match(created.content[0].text, /已创建 Lab 脚手架/);
    const dir = join(cwd, "learning_plan", "demo", "labs", "01-e2e");
    assert.equal(existsSync(join(dir, "LAB.md")), true);

    const graded = await grade.execute("id", { project: "demo", index: 1 }, undefined, undefined, ctx);
    assert.match(graded.content[0].text, /100\/100/);
    assert.equal(graded.details.passed, true);
    assert.equal(graded.details.score, 100);

    const result = JSON.parse(readFileSync(join(dir, "autograder", "last-result.json"), "utf8"));
    assert.equal(result.score, 100);
    assert.equal(result.passed, true);
    assert.equal(result.checks.length, 4);

    const map = readFileSync(join(cwd, "learning_plan", "demo", "MAP.md"), "utf8");
    assert.match(map, /- \*\*评分\*\*：100\/100（阈值 100）/);

    const report = readFileSync(join(dir, "REPORT.md"), "utf8");
    assert.match(report, /100\/100（阈值 100）已通过/);

    const log = readFileSync(join(cwd, "learning_plan", "demo", "LOG.md"), "utf8");
    assert.match(log, /- 性质： grade/);
    assert.match(log, /100\/100（阈值 100）已达标/);
    assert.equal(ctx.statuses.at(-1)?.[1]?.includes("100/100"), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("learning_grade：Lab 不存在时抛错；未达阈值不抛错", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    seedMap(cwd);
    const { pi, tools } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    const lab = tools.find((t) => t.name === "learning_lab");
    const grade = tools.find((t) => t.name === "learning_grade");

    await assert.rejects(() => grade.execute("id", { project: "demo", index: 7 }, undefined, undefined, ctx), /未找到 Lab 07/);

    await lab.execute(
      "id",
      {
        project: "demo",
        index: 1,
        slug: "e2e",
        title: "e2e Lab",
        concept: "x",
        task: "x",
        questions: ["Q1"],
        path: "x",
        outOfScope: "x",
        deliverable: "x",
        rules: ["不许改测试"],
        hints: ["a", "b", "c", "d"],
        tests: [{ label: "必败", command: 'node -e "process.exit(1)"' }],
        requiredFiles: ["package.json"],
      },
      undefined,
      undefined,
      ctx,
    );
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "demo" }), "utf8");

    const graded = await grade.execute("id", { project: "demo", index: 1 }, undefined, undefined, ctx);
    assert.equal(graded.details.passed, false);
    assert.ok(graded.details.score < 100);
    assert.match(graded.content[0].text, /未达阈值（正常）/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("learning_log 追加并校验字段", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-pl-ext-"));
  try {
    const { pi, tools } = createMockPi();
    projectLearning(pi as any);
    const ctx = createMockCtx(cwd);
    const log = tools.find((t) => t.name === "learning_log");
    const ok = await log.execute(
      "id",
      { project: "demo", matter: "采集画像", kind: "onboarding", refs: "画像", evidence: "PROFILE.md" },
      undefined,
      undefined,
      ctx,
    );
    assert.match(ok.content[0].text, /第 1 条/);
    await assert.rejects(
      () => log.execute("id", { project: "demo", matter: "x", kind: "grade", refs: "", evidence: "" }, undefined, undefined, ctx),
      /refs 不能为空/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
