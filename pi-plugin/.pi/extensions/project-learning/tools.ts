/**
 * 面向模型的学习工具（以 Lab 为中心）：状态查询、日志追加、Lab 脚手架、评分、画像采集。
 *
 * 这些工具把「机械且易错」的操作从模型手里收回来（编号、格式、字段完整性、目录冲突、
 * 跑分与回写），让模型专注内容；写操作全部落在 learning_plan/ 内。
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import {
  appendLogEntryFile,
  computeLabWeights,
  createLabScaffold,
  ensureLogFile,
  formatGradeResultText,
  formatMapLabBlock,
  formatStatusReport,
  labDir,
  labDirName,
  labsDir,
  logPath,
  mapPath,
  padIndex,
  projectDir,
  readLastResult,
  summarize,
  upsertGradingBlock,
  upsertLabStatus,
  type LabRuleChecks,
  type LabTestInput,
  type LogKind,
  type LogStatus,
} from "./plan.ts";
import type { LearningRuntime } from "./runtime.ts";

export type RefreshFn = (ctx: ExtensionContext) => void;

const LOG_KINDS: readonly LogKind[] = ["onboarding", "ask", "grade", "completion", "commit"];
const LOG_STATUSES: readonly LogStatus[] = ["doing", "done"];

function asLogKind(value: string): LogKind {
  if ((LOG_KINDS as readonly string[]).includes(value)) return value as LogKind;
  throw new Error(`learning_log 的 kind 必须是 ${LOG_KINDS.join(" / ")} 之一。`);
}

function asLogStatus(value: string | undefined): LogStatus | undefined {
  if (value === undefined || value === "") return undefined;
  if ((LOG_STATUSES as readonly string[]).includes(value)) return value as LogStatus;
  throw new Error("learning_log 的 status 只能是 doing 或 done。");
}

function resolveProject(ctx: ExtensionContext, runtime: LearningRuntime, requested?: string): string {
  const name = requested && requested.trim() !== "" ? requested.trim() : runtime.project();
  if (name) return name;
  const summary = summarize(ctx.cwd, runtime.planDir);
  if (summary.active) return summary.active;
  throw new Error(
    "未指定项目：请先执行 /profile 建立项目，或用 project 参数指明 learning_plan/<项目>/ 下的项目名。",
  );
}

function findLabDir(cwd: string, planDir: string, project: string, index?: number, dir?: string): string {
  const base = labsDir(cwd, planDir, project);
  if (dir && dir.trim() !== "") return labDir(cwd, planDir, project, dir.trim());
  if (!Number.isFinite(index)) throw new Error("请提供 Lab 序号（index）。");
  const nn = padIndex(Number(index));
  try {
    const hit = readdirSync(base).find((name) => name.startsWith(`${nn}-`));
    if (hit) return join(base, hit);
  } catch {
    /* fallthrough */
  }
  throw new Error(`未找到 Lab ${nn}：${base} 下没有以 ${nn}- 开头的目录。`);
}

async function collectProfile(ctx: ExtensionContext): Promise<string | undefined> {
  const level =
    (await ctx.ui.select("你的编程水平？", [
      "没写过代码",
      "学过一门语言入门",
      "能独立写小项目",
      "熟悉该语言栈",
    ])) ?? "";
  if (level === "" && !(await ctx.ui.confirm("跳过画像向导？", "将使用默认画像（中等 / 看懂并上手 / 例子驱动）"))) {
    return undefined;
  }
  const topics = (await ctx.ui.input("学习目标与想学的知识", "例：看懂项目主链路 / 想学会怎么加一个新指令")) ?? "";
  const prefs = (await ctx.ui.input("文档偏好", "语言 / 篇幅 / 风格，例：中文 / 标准 / 例子驱动")) ?? "";
  const way = (await ctx.ui.select("学习方式偏好", ["先读后做", "边读边做", "任务驱动"])) ?? "";
  const strict = (await ctx.ui.select("实验严格度", ["达标即止（到阈值就下一个）", "尽量满分"])) ?? "";
  const grain = (await ctx.ui.select("Lab 粒度", ["小步快跑（多个小 Lab）", "大实验（少量大 Lab）"])) ?? "";
  return [
    "## 1. 基本信息",
    "",
    `- 编程水平：${level || "中等（默认，假设）"}`,
    `- 相关经验：${topics || "未填写（假设：无相关经验）"}`,
    `- 学习目标：${way || "看懂并上手（默认，假设）"}`,
    `- 希望学到的知识：${topics || "未指定（假设）"}`,
    `- 文档偏好：${prefs || "中文 / 标准 / 例子驱动（默认，假设）"}`,
    `- 学习方式偏好：${way || "边读边做（默认，假设）"}`,
    "",
    "## 2. 实验与评分偏好",
    "",
    `- 严格度：${strict || "达标即止（默认，假设）"}`,
    "- 规则检查：要",
    `- Lab 粒度：${grain || "小步快跑（默认，假设）"}`,
    "- 跑分节奏：每改必跑",
    "- 卡住时的偏好：先给提示梯度",
    "",
    "## 3. 前置自检",
    "",
    "| 知识点 | 我已具备？ | 检验（官方入口 / 小测） | 缺失时的去处 |",
    "|---|---|---|---|",
    "| （由 /read 依画像裁剪后补齐） | 不确定 | | |",
    "",
    "## 4. 假设与默认值",
    "",
    "- 未填写的项已用默认值补齐并标注「假设」，随时可反悔重写。",
  ].join("\n");
}

export function registerLearningTools(pi: ExtensionAPI, runtime: LearningRuntime, refresh: RefreshFn): void {
  pi.registerTool({
    name: "learning_status",
    label: "学习状态",
    description: "查看项目学习模式状态：画像、Lab 进度与分数、待答问题、最近日志。",
    promptSnippet: "查看项目学习模式状态（画像 / Lab / 分数 / 待答问题）",
    promptGuidelines: [
      "使用 learning_status 查看 Lab 进度与分数，而不是把 MAP.md 与 LOG.md 全文读一遍。",
    ],
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "项目名（缺省用当前活动项目）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = params.project && params.project !== "" ? params.project : runtime.project();
      const summary = summarize(ctx.cwd, runtime.planDir, project);
      const labs = summary.map?.labs.length ?? 0;
      return {
        content: [{ type: "text", text: formatStatusReport(summary) }],
        details: { active: summary.active, labs },
      };
    },
  });

  pi.registerTool({
    name: "learning_log",
    label: "学习日志",
    description:
      "向 learning_plan/<项目>/LOG.md 追加一条日志（五字段：事情/性质/状态/关联/证据结果）。追加式，不删改历史。",
    promptSnippet: "追加一条 LOG.md 日志条目（性质 onboarding|ask|grade|completion|commit）",
    promptGuidelines: ["使用 learning_log 追加 LOG.md 条目，不要手写 LOG.md 条目以免破坏编号与格式。"],
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "项目名（缺省用当前活动项目）" })),
      matter: Type.String({ description: "一句话概括这件事" }),
      kind: StringEnum(["onboarding", "ask", "grade", "completion", "commit"], {
        description: "性质：画像 / 提问 / 跑分 / 完成 / 提交",
      }),
      status: Type.Optional(StringEnum(["doing", "done"], { description: "状态；ask 缺省 doing，其余缺省 done" })),
      refs: Type.String({ description: "关联：Lab 编号、文件或问题编号 Qn（不允许留空）" }),
      evidence: Type.String({ description: "证据/结果：命令输出、分数、commit（不允许留空）" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = resolveProject(ctx, runtime, params.project);
      const refs = params.refs?.trim() ?? "";
      const evidence = params.evidence?.trim() ?? "";
      if (refs === "") throw new Error("learning_log 的 refs 不能为空：请写明 Lab 编号、文件或问题编号 Qn。");
      if (evidence === "") throw new Error("learning_log 的 evidence 不能为空：请写明结果、分数或 commit。");
      ensureLogFile(ctx.cwd, runtime.planDir, project);
      const path = logPath(ctx.cwd, runtime.planDir, project);
      const index = await withFileMutationQueue(path, async () =>
        appendLogEntryFile(path, {
          matter: params.matter,
          kind: asLogKind(params.kind),
          status: asLogStatus(params.status),
          refs,
          evidence,
        }),
      );
      refresh(ctx);
      return {
        content: [{ type: "text", text: `已追加 LOG.md 第 ${index} 条（性质 ${params.kind}）。路径：${path}` }],
        details: { entry: index, path },
      };
    },
  });

  pi.registerTool({
    name: "learning_lab",
    label: "Lab 脚手架",
    description:
      "创建 learning_plan/<项目>/labs/NN-slug/ 脚手架：LAB.md（handout）+ lab.config.json（tests/rules/threshold）+ autograder/{check-rules.mjs,grade.mjs} + scaffold/ + REPORT.md。不提供任何实现。",
    promptSnippet: "创建 Lab 脚手架 labs/NN-slug/（LAB.md + lab.config.json + autograder + scaffold + REPORT）",
    promptGuidelines: [
      "使用 learning_lab 创建 Lab 脚手架；关键实现必须留空并标注 # TODO(你来实现)，不要替学习者写实现。",
      "learning_lab 生成的 LAB.md / lab.config.json / autograder/** 之后不得修改（元规则 R9）。",
    ],
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "项目名（缺省用当前活动项目）" })),
      index: Type.Number({ description: "Lab 序号（1 起）" }),
      slug: Type.String({ description: "Lab 短名（用于目录名 NN-slug）" }),
      title: Type.String({ description: "Lab 标题（一句话能力）" }),
      concept: Type.String({ description: "目标概念（一句话，可验证）" }),
      task: Type.String({ description: "背景与概念 + 任务：为什么需要、要做什么（可含最小例子与常见误区）" }),
      questions: Type.Array(Type.String(), { description: "本 Lab 必须回答的驱动问题（1-3 个，编号接全局 Qn）" }),
      path: Type.String({ description: "学习路径：读哪些文件 → 做什么 → 用什么命令" }),
      outOfScope: Type.String({ description: "不在本 Lab 范围（Out of Scope）" }),
      deliverable: Type.String({ description: "交付物说明" }),
      rules: Type.Array(Type.String(), { description: "人类可读的规则与约束（允许/禁止/上限/不得改动）" }),
      hints: Type.Array(Type.String(), { description: "分层提示，按 方向→定位→关键API→伪代码级 顺序给 4 条" }),
      tests: Type.Array(
        Type.Object({
          id: Type.Optional(Type.String({ description: "稳定 id（缺省 test-N）" })),
          label: Type.String({ description: "人类可读名称，如「项目单元测试」" }),
          command: Type.String({ description: "项目既有命令，如 npm test" }),
          cwd: Type.Optional(Type.String({ description: "相对项目根的工作目录（缺省 .）" })),
          weight: Type.Optional(Type.Number({ description: "相对权重（缺省 1）" })),
          timeoutMs: Type.Optional(Type.Number({ description: "超时毫秒（缺省 120000）" })),
        }),
        { description: "评分命令（必须来自项目既有测试/构建/冒烟命令）" },
      ),
      forbiddenPaths: Type.Optional(Type.Array(Type.String(), { description: "规则：禁止存在/改动的路径 glob" })),
      requiredFiles: Type.Optional(Type.Array(Type.String(), { description: "规则：必须存在的文件 glob" })),
      forbiddenPatterns: Type.Optional(
        Type.Array(Type.String(), { description: "规则：源码中禁止出现的正则（如 TODO\\\\(你来实现\\\\)）" }),
      ),
      maxAddedLines: Type.Optional(Type.Number({ description: "规则：最多新增行数（需要 git，可省略）" })),
      threshold: Type.Optional(Type.Number({ description: "达标阈值（缺省 100）" })),
      rulesWeight: Type.Optional(Type.Number({ description: "规则检查占分（缺省有规则时 15）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = resolveProject(ctx, runtime, params.project);
      const ruleChecks: LabRuleChecks = {
        forbiddenPaths: params.forbiddenPaths ?? [],
        requiredFiles: params.requiredFiles ?? [],
        forbiddenPatterns: params.forbiddenPatterns ?? [],
        maxAddedLines: typeof params.maxAddedLines === "number" ? params.maxAddedLines : null,
      };
      const tests = (params.tests ?? []) as LabTestInput[];
      if (tests.length === 0) {
        throw new Error("至少需要一条 tests：Lab 的评分必须来自项目既有命令（否则不是 Lab，只是练习）。");
      }
      const input = {
        index: params.index,
        slug: params.slug,
        title: params.title,
        concept: params.concept,
        task: params.task,
        questions: params.questions ?? [],
        path: params.path,
        outOfScope: params.outOfScope,
        deliverable: params.deliverable,
        rules: params.rules ?? [],
        ruleChecks,
        hints: params.hints ?? [],
        tests,
        threshold: params.threshold,
        rulesWeight: params.rulesWeight,
      };
      const result = createLabScaffold(ctx.cwd, runtime.planDir, project, input);
      if (!result.created) {
        throw new Error(`${result.reason ?? "Lab 已存在"}；请换一个序号或先处理已有 Lab。`);
      }
      const weights = computeLabWeights(input);
      const dirName = labDirName(params.index, params.slug);
      const mapBlock = formatMapLabBlock({
        index: params.index,
        title: params.title,
        questions: input.questions,
        threshold: input.threshold,
        dirName,
      });
      refresh(ctx);
      return {
        content: [
          {
            type: "text",
            text: [
              `已创建 Lab 脚手架：${result.dir}`,
              "- LAB.md：目标概念 / 驱动问题 / 背景 / 学习路径 / Out of Scope / 规则 / 评分构成 / 四层提示 / 交付物",
              "- lab.config.json：tests + rules + threshold（评分口径）",
              "- autograder/{check-rules.mjs,grade.mjs}：跑项目命令 + 规则检查，输出 last-result.json",
              "- scaffold/：起步文件放这里，关键实现留空并标注 # TODO(你来实现)",
              `- 分值：规则 ${weights.rulesWeight} 分，测试 ${100 - weights.rulesWeight} 分；阈值 ${input.threshold ?? 100}`,
              "",
              "下一步（不要跳过）：",
              `1. 把下面的方块插入 MAP.md 的「## Labs」（若尚无该节则先建）：\n\n${mapBlock}`,
              "2. 在 scaffold/ 写起步文件（签名/注释/示例），关键实现留空标 TODO；",
              "3. 提示学习者自己实现，然后执行 /lab grade。",
            ].join("\n"),
          },
        ],
        details: { dir: result.dir, files: result.files, projectDir: projectDir(ctx.cwd, runtime.planDir, project), threshold: input.threshold ?? 100 },
      };
    },
  });

  pi.registerTool({
    name: "learning_grade",
    label: "Lab 评分",
    description:
      "运行 labs/NN-slug/autograder/grade.mjs（项目既有命令 + 规则检查），读取 last-result.json，回写 MAP.md 评分、REPORT.md 的 grading 区块与 LOG.md（性质 grade）。未达阈值不算错误。",
    promptSnippet: "运行 Lab autograder 并回写分数（MAP / REPORT / LOG）",
    promptGuidelines: [
      "使用 learning_grade 跑分；不要自己手算分数，也不要修改学习者实现或评分文件。",
      "learning_grade 未达阈值时不要报错或改实现，应按逐项结果给出下一层提示。",
    ],
    parameters: Type.Object({
      project: Type.Optional(Type.String({ description: "项目名（缺省用当前活动项目）" })),
      index: Type.Number({ description: "Lab 序号" }),
      dir: Type.Optional(Type.String({ description: "直接指定 Lab 目录名（缺省按序号前缀查找）" })),
      timeoutMs: Type.Optional(Type.Number({ description: "评分脚本超时（缺省 300000）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const project = resolveProject(ctx, runtime, params.project);
      const dir = findLabDir(ctx.cwd, runtime.planDir, project, params.index, params.dir);
      const gradeScript = join(dir, "autograder", "grade.mjs");
      const timeout = Number.isFinite(params.timeoutMs) ? Number(params.timeoutMs) : 300000;
      let run: Awaited<ReturnType<typeof pi.exec>>;
      try {
        run = await pi.exec("node", [gradeScript], { timeout });
      } catch (error) {
        throw new Error(`无法运行评分脚本（${gradeScript}）：${(error as Error).message}`);
      }
      const result = readLastResult(dir);
      if (!result) {
        const tail = `${run?.stdout ?? ""}\n${run?.stderr ?? ""}`.trim().slice(-800);
        throw new Error(`评分未产出 last-result.json（exit ${run?.code ?? "?"}）。输出尾部：\n${tail}`);
      }

      // 1) MAP.md：评分 + 状态（已通过只在 /lab review 时置位）
      const mapFile = mapPath(ctx.cwd, runtime.planDir, project);
      let mapUpdated = false;
      await withFileMutationQueue(mapFile, async () => {
        const text = readFileSync(mapFile, "utf8");
        const patched = upsertLabStatus(text, params.index, {
          score: result.score,
          max: result.max,
          threshold: result.threshold,
          status: "进行中",
        });
        mapUpdated = patched.found;
        if (patched.found) writeFileSync(mapFile, patched.text, "utf8");
      });
      const mapWarning = mapUpdated ? "" : `\n注意：MAP.md 中未找到 Lab ${params.index} 的区块，分数未回写 MAP（请先把 Lab 区块插入「## Labs」）。`;

      // 2) REPORT.md：grading 区块
      const reportFile = join(dir, "REPORT.md");
      await withFileMutationQueue(reportFile, async () => {
        let text = "";
        try {
          text = readFileSync(reportFile, "utf8");
        } catch {
          text = "# REPORT.md\n";
        }
        writeFileSync(reportFile, upsertGradingBlock(text, result), "utf8");
      });

      // 3) LOG.md：grade 条目
      ensureLogFile(ctx.cwd, runtime.planDir, project);
      const log = logPath(ctx.cwd, runtime.planDir, project);
      const entry = await withFileMutationQueue(log, async () =>
        appendLogEntryFile(log, {
          matter: `Lab ${params.index} 跑分：${result.score}/${result.max}`,
          kind: "grade",
          status: "done",
          refs: `Lab ${params.index}`,
          evidence: `${result.score}/${result.max}（阈值 ${result.threshold}）${result.passed ? "已达标" : "未达标"}；命令 node autograder/grade.mjs；结果 ${join(dir, "autograder", "last-result.json")}`,
        }),
      );

      refresh(ctx);
      const nextStep = result.passed
        ? "已达阈值：请执行 /lab review（三维批改 + 确认 REPORT 已填），通过后再把 MAP 状态改为「已通过」并记 completion。"
        : "未达阈值（正常）：按逐项结果给**下一层提示**，不要修改学习者实现。";
      return {
        content: [{ type: "text", text: `${formatGradeResultText(result)}\n\n${nextStep}${mapWarning}` }],
        details: {
          score: result.score,
          max: result.max,
          threshold: result.threshold,
          passed: result.passed,
          logEntry: entry,
          resultPath: join(dir, "autograder", "last-result.json"),
        },
      };
    },
  });

  pi.registerTool({
    name: "learning_profile",
    label: "学习者画像向导",
    description:
      "交互式采集学习者画像（基础 / 目标 / 文档偏好 / 实验与评分偏好），返回可写入 PROFILE.md 的画像卡。无 UI 时返回对话提问指引。",
    promptSnippet: "采集学习者画像（基础 / 目标 / 偏好 / 实验评分偏好）",
    promptGuidelines: [
      "使用 learning_profile 采集画像；返回的画像卡写入 PROFILE.md §1/§2，并用 learning_log 记 onboarding 条目。",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text: [
                "当前无交互 UI，请直接在对话中逐项询问：",
                "1. 编程水平与相关经验；",
                "2. 学习目标与希望学到的知识；",
                "3. 文档偏好（语言 / 篇幅 / 风格）与学习方式偏好；",
                "4. 实验与评分偏好（严格度 / 规则检查 / Lab 粒度 / 跑分节奏 / 卡住时的偏好）。",
                "用户不想回答细节时用默认值（中等 / 看懂并上手 / 例子驱动 / 达标即止）并在 §4 标注「假设」。",
              ].join("\n"),
            },
          ],
          details: { collected: false },
        };
      }
      const profile = await collectProfile(ctx);
      if (!profile) {
        return {
          content: [{ type: "text", text: "画像采集已取消；可改为在对话中逐项询问，或使用默认画像。" }],
          details: { collected: false },
        };
      }
      return { content: [{ type: "text", text: profile }], details: { collected: true } };
    },
  });
}
