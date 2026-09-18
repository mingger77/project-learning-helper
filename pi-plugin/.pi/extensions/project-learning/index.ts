/**
 * pi-project-learning —— 问题驱动 · 做中学（以 Lab 为中心）的 Pi 插件入口。
 *
 * 职责：
 *   1. 学习模式开关（/learning、--project-learning、/profile /read /lab 触发）；
 *   2. 学习模式下向 systemPrompt 注入常驻规范片段（before_agent_start）；
 *   3. 硬性写入守卫：learning_plan/ 之外一律拦截，且保护 LAB.md / lab.config.json / autograder/**（R9）；
 *   4. 状态栏与 /learning status；
 *   5. 五个学习工具（learning_status / learning_log / learning_lab / learning_grade / learning_profile）。
 *
 * 非学习会话零影响：不注入提示、不拦截、无状态栏。
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { decideWrite, isGitCommitCommand } from "./guard.ts";
import { formatStatusLine, formatStatusReport, summarize } from "./plan.ts";
import { buildModeBlock } from "./prompt.ts";
import { LearningRuntime } from "./runtime.ts";
import { clearStatus, refreshStatus } from "./status.ts";
import { registerLearningTools } from "./tools.ts";

const TEMPLATE_COMMANDS = ["profile", "read", "lab"];

/** 自然语言触发语（无命令面时的等价入口）。 */
const NATURAL_TRIGGERS: Array<{ re: RegExp; command: string }> = [
  { re: /^(学习|阅读|读懂|看懂)(这个|该|此)?项目/, command: "/read" },
  { re: /(采集|更新|重新).{0,4}(画像|profile)/i, command: "/profile" },
  { re: /(做一个?|设计一个?|下一个?)\s*(lab|实验)/i, command: "/lab new" },
  { re: /^(跑分|评分|打分|grade)$/i, command: "/lab grade" },
  { re: /^(复盘|review)$/i, command: "/lab review" },
];

function pathOf(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  if (typeof record.path === "string") return record.path;
  if (typeof record.file_path === "string") return record.file_path;
  return undefined;
}

function touchesPlanDoc(input: unknown): boolean {
  const path = pathOf(input);
  if (!path) return false;
  return /(^|[\\/])(MAP|LOG|PROFILE|LAB|REPORT)\.md$/.test(path);
}

function templateCommandOf(text: string): { command: string; rest: string } | undefined {
  const match = /^\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match) return undefined;
  if (!TEMPLATE_COMMANDS.includes(match[1])) return undefined;
  return { command: match[1], rest: (match[2] ?? "").trim() };
}

export default function projectLearning(pi: ExtensionAPI): void {
  pi.registerFlag("project-learning", {
    description: "启动即进入项目学习模式（项目学习插件）",
    type: "boolean",
    default: false,
  });
  pi.registerFlag("learning-plan-dir", {
    description: "项目学习产物目录名（默认 learning_plan）",
    type: "string",
    default: "learning_plan",
  });

  const flagPlanDir = pi.getFlag("learning-plan-dir");
  const runtime = new LearningRuntime(
    pi,
    typeof flagPlanDir === "string" && flagPlanDir.trim() !== "" ? flagPlanDir : undefined,
  );

  const refresh = (ctx: ExtensionContext) => refreshStatus(ctx, runtime.planDir, runtime.project());

  registerLearningTools(pi, runtime, refresh);

  /* ── 会话开始：恢复模式 + 状态栏 ── */
  pi.on("session_start", async (_event, ctx) => {
    runtime.applyStartupFlags();
    runtime.restore(ctx);
    if (runtime.isActive()) refresh(ctx);
    else clearStatus(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearStatus(ctx);
  });

  /* ── 学习模式：注入常驻规范 ── */
  pi.on("before_agent_start", async (event, ctx) => {
    if (!runtime.isActive()) return;
    const summary = summarize(ctx.cwd, runtime.planDir, runtime.project());
    const block = buildModeBlock(summary, runtime.snapshot());
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  /* ── 硬性写入守卫（R1 + R9） ── */
  pi.on("tool_call", async (event, ctx) => {
    if (!runtime.guardEnabled()) return;

    if (event.toolName === "write" || event.toolName === "edit") {
      const decision = decideWrite(pathOf(event.input), ctx.cwd, runtime.planDir);
      if (!decision.allow) {
        return { block: true, reason: decision.reason ?? "项目学习模式下禁止写入该路径。" };
      }
      return;
    }

    if (event.toolName === "bash" && isToolCallEventType("bash", event)) {
      if (!isGitCommitCommand(event.input.command)) return;
      if (!ctx.hasUI) return;
      const ok = await ctx.ui.confirm("提交代码？", "项目学习约定「一 Lab 一提交」。确认由你执行这次 git commit？");
      if (!ok) return { block: true, reason: "已取消：提交需学习者确认（一 Lab 一提交）。" };
    }
  });

  /* ── 文档改动后刷新状态栏 ── */
  pi.on("tool_result", async (event, ctx) => {
    if (!runtime.isActive()) return;
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    if (!touchesPlanDoc(event.input)) return;
    refresh(ctx);
  });

  /* ── 输入入口：命令触发 + 自然语言触发 ── */
  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive" && event.source !== "rpc") return;

    const text = event.text.trim();
    const template = templateCommandOf(text);
    if (template) {
      if (template.command === "profile" && template.rest !== "") {
        runtime.activate(template.rest.split(/\s+/)[0]);
      } else {
        runtime.activate();
      }
      refresh(ctx);
      return { action: "continue" };
    }

    for (const trigger of NATURAL_TRIGGERS) {
      if (trigger.re.test(text)) {
        runtime.activate();
        refresh(ctx);
        return { action: "transform", text: trigger.command };
      }
    }

    return { action: "continue" };
  });

  /* ── /learning：模式控制与状态 ── */
  pi.registerCommand("learning", {
    description: "项目学习模式控制：status | on | off | project <名> | guard on|off",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items: AutocompleteItem[] = [
        { value: "status", label: "status", description: "显示模式、项目、Lab 进度与分数" },
        { value: "on", label: "on", description: "开启学习模式（注入规范 + 启用写入守卫）" },
        { value: "off", label: "off", description: "关闭学习模式（恢复普通编码行为）" },
        { value: "project", label: "project <名>", description: "固定活动项目" },
        { value: "guard", label: "guard on|off", description: "开关写入守卫" },
      ];
      const filtered = items.filter((item) => item.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const [sub, ...rest] = args.trim().split(/\s+/).filter(Boolean);
      switch (sub ?? "status") {
        case "on": {
          runtime.activate();
          refresh(ctx);
          ctx.ui.notify("已开启项目学习模式（写 learning_plan/，评分文件受保护）。", "info");
          return;
        }
        case "off": {
          runtime.deactivate();
          clearStatus(ctx);
          ctx.ui.notify("已关闭项目学习模式；写入守卫与规范注入已停止。", "info");
          return;
        }
        case "project": {
          const name = rest.join(" ").trim();
          if (name === "") {
            ctx.ui.notify("用法：/learning project <项目名>", "warning");
            return;
          }
          runtime.setProject(name);
          refresh(ctx);
          ctx.ui.notify(`活动项目已切换为：${name}`, "info");
          return;
        }
        case "guard": {
          const value = (rest[0] ?? "").toLowerCase();
          if (value !== "on" && value !== "off") {
            ctx.ui.notify("用法：/learning guard on|off", "warning");
            return;
          }
          runtime.setGuard(value === "on");
          ctx.ui.notify(`写入守卫已${value === "on" ? "开启" : "关闭"}。`, "info");
          return;
        }
        case "status":
        default: {
          const summary = summarize(ctx.cwd, runtime.planDir, runtime.project());
          const report = [
            `模式：${runtime.isActive() ? "已开启" : "未开启"}｜守卫：${runtime.snapshot().guard ? "开" : "关"}`,
            formatStatusReport(summary),
          ].join("\n");
          if (ctx.hasUI) {
            await ctx.ui.editor("项目学习状态（只读预览，关闭即可）", report);
          } else {
            ctx.ui.notify(formatStatusLine(summary), "info");
          }
          return;
        }
      }
    },
  });
}
