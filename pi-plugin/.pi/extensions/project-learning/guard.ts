/**
 * 写入守卫：决定「学习模式下，模型的某个 write/edit 目标是否放行」。
 *
 * 纯函数，便于单测；不做任何 IO。对应元规则 R1 与 R9：
 *   1. 只许写 `<cwd>/<learningPlanDir>/`；
 *   2. 其中 `labs/<NN>/LAB.md`、`labs/<NN>/lab.config.json`、`labs/<NN>/autograder/**` 只读
 *      （评分与规则由 learning_lab 一次性生成，AI 不得修改）。
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

/** 默认产物目录名（可用 --learning-plan-dir 覆盖）。 */
export const DEFAULT_PLAN_DIR = "learning_plan";

export interface WriteDecision {
  /** 是否放行 */
  allow: boolean;
  /** 归一化后的绝对目标路径 */
  path: string;
  /** 拒绝原因（allow=false 时给出，面向模型，中文） */
  reason?: string;
  /** 拒绝类别：越界 / 评分文件保护 */
  kind?: "outside" | "protected";
}

/** 评分与规则文件（相对 `learning_plan/<项目>/` 的 posix 路径）。 */
const PROTECTED_LAB_PATTERNS: RegExp[] = [
  /^[^/]+\/labs\/[^/]+\/LAB\.md$/i,
  /^[^/]+\/labs\/[^/]+\/lab\.config\.json$/i,
  /^[^/]+\/labs\/[^/]+\/autograder(\/|$)/i,
];

/**
 * 去掉模型偶尔带上的前导 `@`，并把相对路径解析成绝对路径。
 * 空字符串按 cwd 处理。
 */
export function normalizeToolPath(rawPath: string | undefined, cwd: string): string {
  if (typeof rawPath !== "string") return resolve(cwd);
  let p = rawPath.trim();
  while (p.startsWith("@")) p = p.slice(1);
  if (p === "") return resolve(cwd);
  return resolve(cwd, p);
}

/** `<cwd>/<planDir>` 的绝对路径。 */
export function resolvePlanRoot(cwd: string, planDir: string = DEFAULT_PLAN_DIR): string {
  return resolve(cwd, planDir);
}

/**
 * target 是否位于 root 之内（含 root 自身）。
 * caseInsensitive 用于 Windows：路径比较不区分大小写。
 */
export function isInside(root: string, target: string, caseInsensitive = false): boolean {
  const norm = (p: string) => (caseInsensitive ? p.toLowerCase() : p);
  const rel = relative(norm(root), norm(target));
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  if (rel === "..") return false;
  if (rel.startsWith(`..${sep}`)) return false;
  // 兼容在 POSIX 上测试 Windows 分隔符的场景
  if (rel.startsWith("../") || rel.startsWith("..\\")) return false;
  return true;
}

/** 相对 planRoot 的 posix 路径。 */
export function planRelPath(planRoot: string, target: string, caseInsensitive = false): string {
  const norm = (p: string) => (caseInsensitive ? p.toLowerCase() : p);
  return relative(norm(planRoot), norm(target)).split(sep).join("/");
}

/** 是否是受保护的评分/规则文件。 */
export function isProtectedLabFile(relPath: string): boolean {
  return PROTECTED_LAB_PATTERNS.some((re) => re.test(relPath));
}

/** 判定一次写入是否被放行。 */
export function decideWrite(
  rawPath: string | undefined,
  cwd: string,
  planDir: string = DEFAULT_PLAN_DIR,
  caseInsensitive: boolean = process.platform === "win32",
): WriteDecision {
  const target = normalizeToolPath(rawPath, cwd);
  const root = resolvePlanRoot(cwd, planDir);
  if (!isInside(root, target, caseInsensitive)) {
    return {
      allow: false,
      kind: "outside",
      path: target,
      reason:
        `项目学习模式下 AI 只写 ${planDir}/：项目源码与其余文件一律只读，关键实现请由学习者自己完成。` +
        `若确实需要修改项目代码，请先 /learning off 退出学习模式。`,
    };
  }
  const rel = planRelPath(root, target, caseInsensitive);
  if (isProtectedLabFile(rel)) {
    return {
      allow: false,
      kind: "protected",
      path: target,
      reason:
        `评分与规则文件（LAB.md / lab.config.json / autograder/**）由 learning_lab 生成，AI 不得修改（元规则 R9）。` +
        `如需修正规则，请说明原因并让学习者决定是否重开该 Lab。`,
    };
  }
  return { allow: true, path: target };
}

/** 学习模式下需要确认的 bash 命令（一 Lab 一提交，提交需确认）。 */
export function isGitCommitCommand(command: string | undefined): boolean {
  if (typeof command !== "string") return false;
  return /(^|[;&|]\s*)git\s+commit(\s|$)/.test(command);
}
