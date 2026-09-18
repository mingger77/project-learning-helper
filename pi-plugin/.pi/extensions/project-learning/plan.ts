/**
 * learning_plan 文档层（以 Lab 为中心）：定位、解析、渲染与追加。
 *
 * 解析与渲染是纯函数（便于单测），文件读写集中在少数 IO 帮助函数里。
 * Lab 的 handout / autograder 模板从 `skills/project-lab-method/references/` 读取，
 * 保证「技能里写的规范」与「工具生成的产物」是同一份。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve, sep } from "node:path";
import { DEFAULT_PLAN_DIR, resolvePlanRoot } from "./guard.ts";

export { DEFAULT_PLAN_DIR, resolvePlanRoot };

/* ────────────────────────────── 类型 ────────────────────────────── */

export type LogKind = "onboarding" | "ask" | "grade" | "completion" | "commit";
export type LogStatus = "doing" | "done";
export type LabStatus = "未开始" | "进行中" | "已通过" | "未知";

export interface LabInfo {
  index: number;
  title: string;
  status: LabStatus;
  questions: string[];
  score: number;
  max: number;
  threshold: number;
}

export interface MapInfo {
  labs: LabInfo[];
  /** 全局驱动问题编号（Q1、Q2 …） */
  questions: string[];
}

export interface LogEntry {
  index: number;
  matter: string;
  kind: string;
  status: string;
  refs: string;
  evidence: string;
}

export interface LogEntryInput {
  matter: string;
  kind: LogKind;
  status?: LogStatus;
  refs: string;
  evidence: string;
}

export interface LabTestInput {
  id?: string;
  label: string;
  command: string;
  cwd?: string;
  weight?: number;
  timeoutMs?: number;
}

export interface LabForbiddenPattern {
  pattern: string;
  glob?: string;
  message?: string;
}

export interface LabRuleChecks {
  forbiddenPaths?: string[];
  requiredFiles?: string[];
  forbiddenPatterns?: Array<string | LabForbiddenPattern>;
  maxAddedLines?: number | null;
}

export interface LabInput {
  index: number;
  slug: string;
  title: string;
  concept: string;
  task: string;
  questions: string[];
  path: string;
  outOfScope: string;
  deliverable: string;
  /** 人类可读的规则与约束（写进 LAB.md，逐条） */
  rules: string[];
  /** 机器可查的规则（写进 lab.config.json） */
  ruleChecks?: LabRuleChecks;
  /** 分层提示（建议 4 层） */
  hints: string[];
  tests: LabTestInput[];
  threshold?: number;
  rulesWeight?: number;
}

export interface GradeCheck {
  id: string;
  label: string;
  kind: "test" | "rule" | string;
  pass: boolean;
  points: number;
  maxPoints: number;
  detail?: string;
}

export interface GradeResult {
  version: number;
  at: string;
  lab?: { index?: number | null; slug?: string | null; title?: string | null };
  repoRoot?: string;
  score: number;
  max: number;
  threshold: number;
  passed: boolean;
  checks: GradeCheck[];
}

export interface PlanSummary {
  planRoot: string;
  projects: string[];
  active?: string;
  map?: MapInfo;
  log: LogEntry[];
  hasProfile: boolean;
  profile: ProfileInfo;
}

export interface ProfileInfo {
  exists: boolean;
  /** §2 严格度 */
  strictness?: string;
  /** §2 Lab 粒度 */
  granularity?: string;
}

/* ─────────────────────────── 通用工具 ─────────────────────────── */

export function padIndex(index: number): string {
  return String(Math.max(0, Math.trunc(index))).padStart(2, "0");
}

/** 生成目录名 slug：保留字母/数字/汉字，其余折叠为 '-'。 */
export function slugify(input: string): string {
  const s = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "lab" : s.slice(0, 48);
}

function readIfExists(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/* ─────────────────────────── 定位 ─────────────────────────── */

export function projectDir(cwd: string, planDir: string, project: string): string {
  return join(resolvePlanRoot(cwd, planDir), project);
}

export function mapPath(cwd: string, planDir: string, project: string): string {
  return join(projectDir(cwd, planDir, project), "MAP.md");
}

export function logPath(cwd: string, planDir: string, project: string): string {
  return join(projectDir(cwd, planDir, project), "LOG.md");
}

export function profilePath(cwd: string, planDir: string, project: string): string {
  return join(projectDir(cwd, planDir, project), "PROFILE.md");
}

export function labsDir(cwd: string, planDir: string, project: string): string {
  return join(projectDir(cwd, planDir, project), "labs");
}

export function labDir(cwd: string, planDir: string, project: string, dirName: string): string {
  return join(labsDir(cwd, planDir, project), dirName);
}

/** 列出 learning_plan/ 下的项目目录名（字典序）。 */
export function listProjects(cwd: string, planDir: string = DEFAULT_PLAN_DIR): string[] {
  const root = resolvePlanRoot(cwd, planDir);
  try {
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((name) => {
        try {
          return statSync(join(root, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

/* ─────────────────────────── MAP 解析 ─────────────────────────── */

const LAB_HEADING = /^#{2,4}\s*(?:Lab|阶段目标)\s*(\d+)\s*[：:、.]?\s*(.*)$/;
const STATUS_LINE = /^[-*]\s*\*\*状态\*\*\s*[：:]\s*(.+?)\s*$/;
const SCORE_LINE = /^[-*]\s*\*\*评分\*\*\s*[：:]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*(?:[（(]阈值\s*(\d+)\s*[)）])?/;
const QUESTIONS_LINE = /^[-*]\s*\*\*驱动问题\*\*\s*[：:]\s*(.+?)\s*$/;
const QUESTION_ROW = /^\|\s*(Q\d+)\s*\|/;

export function normalizeLabStatus(raw: string): LabStatus {
  if (raw.includes("已通过") || raw.includes("已验收")) return "已通过";
  if (raw.includes("进行中")) return "进行中";
  if (raw.includes("未开始")) return "未开始";
  return "未知";
}

/** 解析 MAP.md；无法识别时返回空结果，不抛异常。 */
export function parseMap(markdown: string | undefined): MapInfo {
  const info: MapInfo = { labs: [], questions: [] };
  if (typeof markdown !== "string" || markdown.trim() === "") return info;

  let current: LabInfo | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = LAB_HEADING.exec(line);
    if (heading) {
      current = {
        index: Number(heading[1]),
        title: (heading[2] ?? "").trim(),
        status: "未知",
        questions: [],
        score: 0,
        max: 100,
        threshold: 100,
      };
      info.labs.push(current);
      continue;
    }
    if (current) {
      const status = STATUS_LINE.exec(line);
      if (status) {
        current.status = normalizeLabStatus(status[1] ?? "");
        continue;
      }
      const score = SCORE_LINE.exec(line);
      if (score) {
        current.score = Number(score[1]);
        current.max = Number(score[2]);
        if (score[3]) current.threshold = Number(score[3]);
        continue;
      }
      const questions = QUESTIONS_LINE.exec(line);
      if (questions) {
        current.questions = (questions[1] ?? "")
          .split(/[；;、,，]/)
          .map((q) => q.trim())
          .filter((q) => q !== "");
        continue;
      }
    }
    const row = QUESTION_ROW.exec(line);
    if (row && !info.questions.includes(row[1])) info.questions.push(row[1]);
  }
  return info;
}

export function readMap(cwd: string, planDir: string, project: string): MapInfo | undefined {
  const text = readIfExists(mapPath(cwd, planDir, project));
  if (text === undefined) return undefined;
  return parseMap(text);
}

/* ─────────────────────────── LOG 解析/渲染 ─────────────────────────── */

export const LOG_TOC_START = "<!-- toc:start -->";
export const LOG_TOC_END = "<!-- toc:end -->";
/** 空目录占位文本。 */
export const LOG_TOC_EMPTY = "（暂无条目）";

export const LOG_TEMPLATE = `# LOG.md ---- 项目学习日志

> 本文档为项目 <项目名> 的学习日志：按时间追加，不删改历史。
> 性质五类：onboarding（画像）/ ask（提问）/ grade（跑分）/ completion（完成）/ commit（提交）。
> 优先用 learning_log 工具追加条目，避免手写破坏格式。

## 目录

${LOG_TOC_START}
${LOG_TOC_EMPTY}
${LOG_TOC_END}

## 消息

`;

const ENTRY_HEAD = /^(\d+)\.\s*(.*)$/;
const FIELD_LINE = /^[-*]\s*(事情|性质|状态|关联|证据\/结果)\s*[：:]\s*(.*)$/;
const TOC_HEADING = /^##\s*目录\s*$/;

export function formatLogEntry(index: number, entry: LogEntryInput): string {
  const status = entry.status ?? (entry.kind === "ask" ? "doing" : "done");
  return [
    logAnchor(index),
    `${index}. ${entry.matter}`,
    `- 事情： ${entry.matter}`,
    `- 性质： ${entry.kind}`,
    `- 状态： ${status}`,
    `- 关联： ${entry.refs}`,
    `- 证据/结果： ${entry.evidence}`,
    "",
    "",
  ].join("\n");
}

/** 解析 LOG.md 条目；容错，无法识别时返回已解析部分。 */
export function parseLog(markdown: string | undefined): LogEntry[] {
  const entries: LogEntry[] = [];
  if (typeof markdown !== "string" || markdown.trim() === "") return entries;

  let current: LogEntry | undefined;
  let inToc = false;
  const push = () => {
    if (current) entries.push(current);
    current = undefined;
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (line.trim() === LOG_TOC_START) {
      inToc = true;
      continue;
    }
    if (line.trim() === LOG_TOC_END) {
      inToc = false;
      continue;
    }
    if (inToc) continue;
    const head = ENTRY_HEAD.exec(line);
    if (head) {
      push();
      current = {
        index: Number(head[1]),
        matter: (head[2] ?? "").trim(),
        kind: "",
        status: "",
        refs: "",
        evidence: "",
      };
      continue;
    }
    if (!current) continue;
    const field = FIELD_LINE.exec(line);
    if (!field) continue;
    const value = (field[2] ?? "").trim();
    switch (field[1]) {
      case "事情":
        current.matter = value || current.matter;
        break;
      case "性质":
        current.kind = value;
        break;
      case "状态":
        current.status = value;
        break;
      case "关联":
        current.refs = value;
        break;
      case "证据/结果":
        current.evidence = value;
        break;
    }
  }
  push();
  return entries;
}

export function readLog(cwd: string, planDir: string, project: string): LogEntry[] {
  return parseLog(readIfExists(logPath(cwd, planDir, project)));
}

export function nextLogIndex(entries: LogEntry[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.index), 0) + 1;
}

/** 确保 LOG.md 存在；返回是否为新建。 */
export function ensureLogFile(cwd: string, planDir: string, project: string): boolean {
  const path = logPath(cwd, planDir, project);
  if (existsSync(path)) return false;
  mkdirSync(projectDir(cwd, planDir, project), { recursive: true });
  writeFileSync(path, LOG_TEMPLATE, "utf8");
  return true;
}

/* ────────────────── LOG 目录（跳转链接，自动维护） ────────────────── */

/** 条目的 HTML 锚点行（GitHub / VSCode / Typora 均稳定）。 */
export function logAnchor(index: number): string {
  return `<a id="log-${index}"></a>`;
}

function escapeLinkText(text: string, max = 80): string {
  const flat = String(text ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** 渲染目录正文（不含 markers）。 */
export function renderLogToc(entries: LogEntry[]): string {
  if (entries.length === 0) return LOG_TOC_EMPTY;
  return entries
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => {
      const kind = entry.kind || "—";
      const status = entry.status || "—";
      const label = escapeLinkText(entry.matter || `条目 ${entry.index}`);
      return `- [${entry.index}. ${label}](#log-${entry.index}) —— ${kind}/${status}`;
    })
    .join("\n");
}

/** 幂等地更新/插入「## 目录」区块（用 markers 定位）。 */
export function upsertLogToc(text: string, entries: LogEntry[]): string {
  const body = `${LOG_TOC_START}\n${renderLogToc(entries)}\n${LOG_TOC_END}`;
  const start = text.indexOf(LOG_TOC_START);
  const end = text.indexOf(LOG_TOC_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${text.slice(0, start)}${body}${text.slice(end + LOG_TOC_END.length)}`;
  }

  const lines = text.split(/\r?\n/);
  const tocIdx = lines.findIndex((line) => TOC_HEADING.test(line));
  if (tocIdx !== -1) {
    // 已有「## 目录」但没有 markers：整段替换（到下一个 1~2 级标题为止）
    let endIdx = lines.length;
    for (let i = tocIdx + 1; i < lines.length; i += 1) {
      if (/^#{1,2}\s/.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    const head = lines.slice(0, tocIdx);
    const tail = lines.slice(endIdx);
    return [...head, "## 目录", "", ...body.split("\n"), "", ...tail].join("\n");
  }

  // 全新插入：置于第一个「## 」标题（通常是「## 消息」）之前
  let insertIdx = lines.findIndex((line) => /^##\s/.test(line));
  if (insertIdx === -1) insertIdx = lines.length;
  const head = lines.slice(0, insertIdx);
  while (head.length > 0 && head[head.length - 1].trim() === "") head.pop();
  const tail = lines.slice(insertIdx);
  return [...head, "", "## 目录", "", ...body.split("\n"), "", ...tail].join("\n");
}

/** 为缺少锚点的条目补一行 `<a id="log-N"></a>`（目录区块内不动）。 */
export function ensureLogAnchors(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inToc = false;
  for (const line of lines) {
    if (line.trim() === LOG_TOC_START) {
      inToc = true;
      out.push(line);
      continue;
    }
    if (line.trim() === LOG_TOC_END) {
      inToc = false;
      out.push(line);
      continue;
    }
    if (!inToc) {
      const head = ENTRY_HEAD.exec(line);
      if (head) {
        const anchor = logAnchor(Number(head[1]));
        let prev = out.length - 1;
        while (prev >= 0 && out[prev].trim() === "") prev -= 1;
        if (prev < 0 || out[prev].trim() !== anchor) out.push(anchor);
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

/** 幂等归一化：补锚点 + 重算目录（不改写任何历史条目文本）。 */
export function normalizeLogText(text: string): string {
  const anchored = ensureLogAnchors(text);
  return upsertLogToc(anchored, parseLog(anchored));
}

/** 同步某个 LOG.md 的目录；返回是否发生改动。 */
export function syncLogTocFile(path: string): boolean {
  const text = readIfExists(path);
  if (text === undefined) return false;
  const next = normalizeLogText(text);
  if (next === text) return false;
  writeFileSync(path, next, "utf8");
  return true;
}

/** 追加一条 LOG 条目；返回条目编号。调用方负责用文件队列包裹（见 tools.ts）。 */
export function appendLogEntryFile(path: string, entry: LogEntryInput): number {
  const existing = parseLog(readIfExists(path));
  const index = nextLogIndex(existing);
  const block = formatLogEntry(index, entry);
  const text = readIfExists(path) ?? LOG_TEMPLATE;
  const needsNewline = text.endsWith("\n") ? "" : "\n";
  writeFileSync(path, normalizeLogText(`${text}${needsNewline}${block}`), "utf8");
  return index;
}

/* ─────────────────────────── PROFILE 解析 ─────────────────────────── */

export function parseProfile(markdown: string | undefined): ProfileInfo {
  if (typeof markdown !== "string" || markdown.trim() === "") return { exists: false };
  const info: ProfileInfo = { exists: true };
  const pick = (label: string) => {
    const re = new RegExp(`^-\\s*${label}\\s*[：:]\\s*(.+?)\\s*$`, "m");
    const m = re.exec(markdown);
    if (m) return m[1].replace(/^<|>$/g, "").trim();
    return undefined;
  };
  info.strictness = pick("严格度");
  info.granularity = pick("Lab 粒度");
  return info;
}

export function readProfile(cwd: string, planDir: string, project: string): ProfileInfo {
  return parseProfile(readIfExists(profilePath(cwd, planDir, project)));
}

/* ─────────────────────────── Lab 模板与脚手架 ─────────────────────────── */

const TEMPLATE_DIR = fileURLToPath(new URL("../../skills/project-lab-method/references/", import.meta.url));

/** 读取 Lab 模板（与技能里的 references 是同一份文件）。 */
export function readLabTemplate(name: string): string {
  const path = join(TEMPLATE_DIR, name);
  const text = readIfExists(path);
  if (text === undefined) {
    throw new Error(
      `找不到 Lab 模板 ${name}（期望在 ${TEMPLATE_DIR}）。请确认已完整安装本插件（skills/ 与 extensions/ 必须同时存在）。`,
    );
  }
  return text;
}

/** `{{KEY}}` 占位符替换。 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export function labDirName(index: number, slug: string): string {
  return `${padIndex(index)}-${slugify(slug)}`;
}

function bulletList(items: string[], empty: string): string {
  const list = items.map((s) => s.trim()).filter((s) => s !== "");
  return list.length > 0 ? list.map((s) => `- ${s}`).join("\n") : `- ${empty}`;
}

function numberedList(items: string[], empty: string): string {
  const list = items.map((s) => s.trim()).filter((s) => s !== "");
  return list.length > 0 ? list.map((s, i) => `${i + 1}. ${s}`).join("\n") : `1. ${empty}`;
}

export interface LabWeights {
  rulesWeight: number;
  tests: Array<{ input: LabTestInput; points: number }>;
}

/** 与 grade.mjs 完全一致的分值口径：测试占 100-rulesWeight，规则检查占 rulesWeight。 */
export function computeLabWeights(input: LabInput): LabWeights {
  const hasRules =
    (input.ruleChecks?.forbiddenPaths?.length ?? 0) > 0 ||
    (input.ruleChecks?.requiredFiles?.length ?? 0) > 0 ||
    (input.ruleChecks?.forbiddenPatterns?.length ?? 0) > 0 ||
    typeof input.ruleChecks?.maxAddedLines === "number";
  const rulesWeight = hasRules
    ? Number.isFinite(input.rulesWeight)
      ? Math.max(0, Math.min(100, Number(input.rulesWeight)))
      : 15
    : 0;
  const testsBudget = 100 - rulesWeight;
  const declared = input.tests.map((t) => (Number.isFinite(t.weight) && Number(t.weight) > 0 ? Number(t.weight) : 1));
  const sum = declared.reduce((a, b) => a + b, 0) || 1;
  return {
    rulesWeight,
    tests: input.tests.map((t, i) => ({ input: t, points: Math.round(((testsBudget * declared[i]) / sum) * 10) / 10 })),
  };
}

export function labGradingText(input: LabInput): string {
  const { rulesWeight, tests } = computeLabWeights(input);
  const lines = tests.map((t) => `- 项目命令「${t.input.label}」：\`${t.input.command}\`（${t.points} 分）`);
  if (rulesWeight > 0) lines.push(`- 规则检查（不得改动 / 必须存在 / 禁止写法）：${rulesWeight} 分`);
  lines.push(`- 合计 100 分。`);
  return lines.join("\n");
}

export function buildLabConfig(cwd: string, planDir: string, project: string, input: LabInput, dirName: string) {
  const dir = labDir(cwd, planDir, project, dirName);
  const repoRootRel = relative(dir, resolve(cwd)).split(sep).join("/") || ".";
  const { rulesWeight } = computeLabWeights(input);
  return {
    version: 1,
    repoRoot: repoRootRel,
    lab: { index: input.index, slug: slugify(input.slug), title: input.title },
    threshold: input.threshold ?? 100,
    rulesWeight,
    planDir,
    tests: input.tests.map((t, i) => ({
      id: t.id ?? `test-${i + 1}`,
      label: t.label,
      command: t.command,
      cwd: t.cwd ?? ".",
      weight: Number.isFinite(t.weight) && Number(t.weight) > 0 ? Number(t.weight) : 1,
      timeoutMs: Number.isFinite(t.timeoutMs) ? Number(t.timeoutMs) : 120000,
    })),
    rules: {
      forbiddenPaths: input.ruleChecks?.forbiddenPaths ?? [],
      requiredFiles: input.ruleChecks?.requiredFiles ?? [],
      forbiddenPatterns: input.ruleChecks?.forbiddenPatterns ?? [],
      maxAddedLines: input.ruleChecks?.maxAddedLines ?? null,
    },
  };
}

/**
 * 创建 Lab 脚手架（LAB.md / lab.config.json / autograder / scaffold / REPORT.md）。
 * 已存在同 NN 前缀目录时拒绝。
 */
export function createLabScaffold(
  cwd: string,
  planDir: string,
  project: string,
  input: LabInput,
): { created: boolean; dir: string; files: string[]; reason?: string } {
  const base = labsDir(cwd, planDir, project);
  const nn = padIndex(input.index);
  try {
    if (existsSync(base)) {
      const clash = readdirSync(base).find((name) => name.startsWith(`${nn}-`));
      if (clash) {
        return { created: false, dir: join(base, clash), files: [], reason: `Lab ${nn} 已存在：labs/${clash}` };
      }
    }
  } catch {
    /* 目录不可读则继续尝试创建 */
  }

  const dirName = labDirName(input.index, input.slug);
  const dir = join(base, dirName);
  const agDir = join(dir, "autograder");
  mkdirSync(join(dir, "scaffold"), { recursive: true });
  mkdirSync(agDir, { recursive: true });

  const labMd = renderTemplate(readLabTemplate("LAB.template.md"), {
    INDEX: padIndex(input.index),
    TITLE: input.title,
    CONCEPT: input.concept,
    QUESTIONS: bulletList(input.questions, "（待补：本 Lab 必须回答的问题）"),
    TASK: input.task,
    PATH: input.path,
    OUT_OF_SCOPE: input.outOfScope,
    RULES: bulletList(input.rules, "（待补：允许 / 禁止 / 上限 / 不得改动）"),
    GRADING: labGradingText(input),
    THRESHOLD: String(input.threshold ?? 100),
    HINTS: numberedList(input.hints, "（待补：方向 → 定位 → 关键 API → 伪代码级）"),
    DELIVERABLE: input.deliverable,
    PROJECT: project,
    NN_SLUG: dirName,
  });
  const reportMd = renderTemplate(readLabTemplate("REPORT.template.md"), {
    INDEX: padIndex(input.index),
    TITLE: input.title,
  });
  const checkRules = readLabTemplate("check-rules.mjs");
  const grade = readLabTemplate("grade.mjs");
  const config = buildLabConfig(cwd, planDir, project, input, dirName);

  const files = {
    lab: join(dir, "LAB.md"),
    config: join(dir, "lab.config.json"),
    checkRules: join(agDir, "check-rules.mjs"),
    grade: join(agDir, "grade.mjs"),
    report: join(dir, "REPORT.md"),
    keep: join(dir, "scaffold", ".gitkeep"),
  };
  writeFileSync(files.lab, labMd, "utf8");
  writeFileSync(files.config, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  writeFileSync(files.checkRules, checkRules, "utf8");
  writeFileSync(files.grade, grade, "utf8");
  writeFileSync(files.report, reportMd, "utf8");
  writeFileSync(files.keep, "", "utf8");

  return { created: true, dir, files: Object.values(files) };
}

/* ─────────────────────────── 评分结果 ─────────────────────────── */

export function gradingBlock(result: GradeResult): string {
  const lines: string[] = [];
  lines.push(`**${result.score}/${result.max}（阈值 ${result.threshold}）${result.passed ? "已通过" : "未通过"}** —— ${result.at}`);
  lines.push("");
  lines.push("| 检查项 | 类型 | 结果 | 得分 | 说明 |");
  lines.push("|---|---|---|---|---|");
  for (const c of result.checks) {
    const detail = (c.detail ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 160);
    lines.push(`| ${c.label} | ${c.kind === "rule" ? "规则" : "命令"} | ${c.pass ? "✓" : "✗"} | ${c.points}/${c.maxPoints} | ${detail} |`);
  }
  return lines.join("\n");
}

const GRADING_START = "<!-- grading:start -->";
const GRADING_END = "<!-- grading:end -->";

/** 更新 REPORT.md 的 grading 区块（不存在则追加到末尾）。 */
export function upsertGradingBlock(reportText: string, result: GradeResult): string {
  const block = `${GRADING_START}\n${gradingBlock(result)}\n${GRADING_END}`;
  const start = reportText.indexOf(GRADING_START);
  const end = reportText.indexOf(GRADING_END);
  if (start !== -1 && end !== -1 && end > start) {
    return `${reportText.slice(0, start)}${block}${reportText.slice(end + GRADING_END.length)}`;
  }
  const sep = reportText.endsWith("\n") ? "\n" : "\n\n";
  return `${reportText}${sep}${block}\n`;
}

/** 生成 MAP.md 里一个 Lab 的区块（供 /lab new 插入到「## Labs」下）。 */
export function formatMapLabBlock(input: Pick<LabInput, "index" | "title" | "questions" | "threshold"> & { dirName: string }): string {
  const questions = input.questions.length > 0 ? input.questions.join("；") : "Q？（待补）";
  return [
    `### Lab ${input.index}：${input.title}`,
    "",
    `- **驱动问题**：${questions}`,
    "- **状态**：未开始",
    `- **评分**：0/100（阈值 ${input.threshold ?? 100}）`,
    `- **[LAB.md](labs/${input.dirName}/LAB.md)**`,
    "",
  ].join("\n");
}

/**
 * 更新 MAP.md 中某个 Lab 的「状态」/「评分」行（不存在则在标题后插入）。
 * 找不到该 Lab 时原样返回（不报错，由调用方提示）。
 */
export function upsertLabStatus(
  markdown: string,
  index: number,
  patch: { status?: LabStatus; score?: number; max?: number; threshold?: number },
): { text: string; found: boolean } {
  const lines = markdown.split(/\r?\n/);
  const headingRe = new RegExp(`^#{2,4}\\s*(?:Lab|阶段目标)\\s*${index}\\s*[：:、.]`);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (headingRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return { text: markdown, found: false };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{2,4}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }

  const scoreLine = (s: number, max: number, threshold: number) =>
    `- **评分**：${s}/${max}（阈值 ${threshold}）`;
  const current = parseMap(lines.slice(start, end).join("\n")).labs[0];
  const status = patch.status ?? current?.status ?? "进行中";
  const max = patch.max ?? current?.max ?? 100;
  const threshold = patch.threshold ?? current?.threshold ?? 100;
  const score = patch.score ?? current?.score ?? 0;

  let statusIdx = -1;
  let scoreIdx = -1;
  for (let i = start + 1; i < end; i += 1) {
    if (STATUS_LINE.test(lines[i])) statusIdx = i;
    else if (SCORE_LINE.test(lines[i])) scoreIdx = i;
  }
  if (statusIdx !== -1) lines[statusIdx] = `- **状态**：${status === "未知" ? "进行中" : status}`;
  if (scoreIdx !== -1) lines[scoreIdx] = scoreLine(score, max, threshold);

  // 缺行则在标题之后补（保持「驱动问题 / 状态 / 评分」顺序）
  const insert: string[] = [];
  if (statusIdx === -1) insert.push(`- **状态**：${status === "未知" ? "进行中" : status}`);
  if (scoreIdx === -1) insert.push(scoreLine(score, max, threshold));
  if (insert.length > 0) lines.splice(start + 1, 0, ...insert);

  return { text: lines.join("\n"), found: true };
}

/** 读取 lab 的评分结果（无/损坏返回 undefined）。 */
export function readLastResult(dir: string): GradeResult | undefined {
  const text = readIfExists(join(dir, "autograder", "last-result.json"));
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as GradeResult;
    if (typeof parsed?.score !== "number" || !Array.isArray(parsed.checks)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** 人类可读的评分摘要（工具返回给模型）。 */
export function formatGradeResultText(result: GradeResult, labTitle?: string): string {
  const head = `Lab ${result.lab?.index ?? ""} ${labTitle ?? result.lab?.title ?? ""} —— ${result.score}/${result.max}（阈值 ${result.threshold}）${result.passed ? "已通过" : "未通过"}`;
  const rows = result.checks.map((c) => {
    const mark = c.pass ? "✓" : "✗";
    const kind = c.kind === "rule" ? "[规则]" : "[命令]";
    const detail = (c.detail ?? "").replace(/\r?\n/g, " ").slice(0, 300);
    return `${mark} ${kind} ${c.label}  ${c.points}/${c.maxPoints}  ${detail}`;
  });
  return [head, ...rows].join("\n");
}

/* ─────────────────────────── 汇总 ─────────────────────────── */

export function summarize(cwd: string, planDir: string, requestedProject?: string): PlanSummary {
  const projects = listProjects(cwd, planDir);
  const active = requestedProject && requestedProject !== "" ? requestedProject : projects[0];
  const summary: PlanSummary = {
    planRoot: resolvePlanRoot(cwd, planDir),
    projects,
    log: [],
    hasProfile: false,
    profile: { exists: false },
  };
  if (!active) return summary;
  summary.active = active;
  summary.map = readMap(cwd, planDir, active);
  summary.log = readLog(cwd, planDir, active);
  summary.profile = readProfile(cwd, planDir, active);
  summary.hasProfile = summary.profile.exists;
  return summary;
}

/** 一行状态栏文本。 */
export function formatStatusLine(summary: PlanSummary): string {
  if (!summary.active) return "📚 项目学习模式（待 /profile 或 /read）";
  const labs = summary.map?.labs ?? [];
  const passed = labs.filter((l) => l.status === "已通过").length;
  const current = labs.find((l) => l.status === "进行中");
  const pending = summary.log.filter((e) => e.kind === "ask" && e.status !== "done").length;
  const parts = [`📚 ${summary.active}`];
  if (labs.length > 0) {
    parts.push(`Lab ${passed}/${labs.length}${current ? " 进行中" : ""}`);
    if (current) parts.push(`${current.score}/${current.max}`);
  } else {
    parts.push("待 /read");
  }
  if (pending > 0) parts.push(`待答 ${pending}`);
  return parts.join(" · ");
}

/** 多行状态报告（/learning status 与 learning_status 工具共用）。 */
export function formatStatusReport(summary: PlanSummary): string {
  const lines: string[] = [];
  lines.push(`产物根目录：${summary.planRoot}`);
  lines.push(`项目：${summary.projects.length > 0 ? summary.projects.join("、") : "（无）"}`);
  if (!summary.active) {
    lines.push("");
    lines.push("尚未建立项目：先执行 /profile 采集画像，再执行 /read 建立地图与可实验点。");
    return lines.join("\n");
  }
  lines.push(`活动项目：${summary.active}`);
  lines.push(`画像：${summary.hasProfile ? `PROFILE.md${summary.profile.strictness ? `（严格度：${summary.profile.strictness}）` : ""}` : "缺失（建议先 /profile）"}`);
  const labs = summary.map?.labs ?? [];
  lines.push("");
  lines.push("Labs：");
  if (labs.length === 0) {
    lines.push("- （MAP.md 尚无 Lab；先执行 /read）");
  } else {
    for (const lab of labs) {
      const q = lab.questions.length > 0 ? ` ｜驱动问题：${lab.questions.join("；")}` : "";
      lines.push(`- Lab ${lab.index} ${lab.title} —— ${lab.status} · ${lab.score}/${lab.max}（阈值 ${lab.threshold}）${q}`);
    }
  }
  const questions = summary.map?.questions ?? [];
  if (questions.length > 0) lines.push(`全局驱动问题：${questions.join("、")}`);
  const pending = summary.log.filter((e) => e.kind === "ask" && e.status !== "done");
  if (pending.length > 0) {
    lines.push("");
    lines.push("待答问题：");
    for (const entry of pending) lines.push(`- LOG#${entry.index}：${entry.matter}`);
  }
  const recent = summary.log.slice(-3);
  if (recent.length > 0) {
    lines.push("");
    lines.push("最近日志：");
    for (const entry of recent) lines.push(`- #${entry.index} [${entry.kind}/${entry.status}] ${entry.matter}`);
  }
  return lines.join("\n");
}
