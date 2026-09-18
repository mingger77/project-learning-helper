/**
 * 零依赖规则检查器（Node >= 18）。
 *
 * 由 labs/NN-<slug>/autograder/grade.mjs 调用：
 *   import { check } from "./check-rules.mjs"
 *   const checks = check(config, repoRoot)
 *
 * 规则只针对**项目源码**：默认跳过 `learning_plan/`（脚手架里合法地含有 TODO 字样，
 * 不应触发 forbiddenPatterns）与常见生成物目录。
 *
 * 返回：Array<{ id, label, pass, detail }>
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "vendor", ".next", "target",
  "coverage", ".cache", ".venv", "__pycache__", ".idea", ".vscode", ".turbo",
]);

const MAX_FILE_BYTES = 1024 * 1024; // 1MB，超过不扫描内容

function toPosix(p) {
  return p.split(sep).join("/");
}

/** 列出 repoRoot 下所有文件（相对 posix 路径），跳过生成物与产物目录。 */
function walk(repoRoot, planDir = "learning_plan") {
  const out = [];
  const visit = (absDir, relDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (relDir === "" && entry.name === planDir) continue; // 产物目录不参与规则检查
        visit(join(absDir, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  };
  visit(repoRoot, "");
  return out;
}

/** 简易 glob → RegExp：支持 ** / * / ?，针对 posix 相对路径。 */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const after = glob[i + 2];
        if (after === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

function readText(absPath) {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    const text = readFileSync(absPath, "utf8");
    return text.includes("\u0000") ? undefined : text;
  } catch {
    return undefined;
  }
}

function tail(text, max = 600) {
  const t = String(text ?? "").trim();
  return t.length <= max ? t : `…${t.slice(-max)}`;
}

export { tail as tailText };

export function check(config, repoRoot) {
  const rules = config?.rules ?? {};
  const planDir = config?.planDir ?? "learning_plan";
  const files = walk(repoRoot, planDir);
  const checks = [];
  let n = 0;
  const id = (kind) => `${kind}-${(n += 1)}`;

  /* forbiddenPaths：这些路径不允许存在（学习模式下不得改测试/评分器） */
  for (const pattern of rules.forbiddenPaths ?? []) {
    const hits = files.filter((f) => globToRegExp(pattern).test(f));
    checks.push({
      id: id("forbidden-path"),
      label: `禁止存在/改动：${pattern}`,
      pass: hits.length === 0,
      detail: hits.length === 0 ? "ok" : `命中 ${hits.length} 个：${hits.slice(0, 5).join("、")}`,
    });
  }

  /* requiredFiles：必须存在的文件（每个 pattern 至少命中一个） */
  for (const pattern of rules.requiredFiles ?? []) {
    const hits = files.filter((f) => globToRegExp(pattern).test(f));
    checks.push({
      id: id("required-file"),
      label: `必须存在：${pattern}`,
      pass: hits.length > 0,
      detail: hits.length > 0 ? `命中：${hits.slice(0, 5).join("、")}` : "未找到匹配文件",
    });
  }

  /* forbiddenPatterns：源码里的禁止写法（如仍是 TODO、或针对样例特判） */
  for (const entry of rules.forbiddenPatterns ?? []) {
    const pattern = typeof entry === "string" ? entry : entry.pattern;
    const glob = (typeof entry === "object" && entry.glob) || "**/*";
    const message = (typeof entry === "object" && entry.message) || `命中禁止写法：${pattern}`;
    let re;
    try {
      re = new RegExp(pattern);
    } catch {
      checks.push({ id: id("forbidden-pattern"), label: message, pass: false, detail: `正则非法：${pattern}` });
      continue;
    }
    const hits = [];
    for (const file of files) {
      if (!globToRegExp(glob).test(file)) continue;
      const text = readText(join(repoRoot, file));
      if (text === undefined) continue;
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (re.test(lines[i])) hits.push(`${file}:${i + 1}`);
        if (hits.length >= 20) break;
      }
      if (hits.length >= 20) break;
    }
    checks.push({
      id: id("forbidden-pattern"),
      label: message,
      pass: hits.length === 0,
      detail: hits.length === 0 ? "ok" : `命中：${hits.slice(0, 5).join("、")}`,
    });
  }

  /* maxAddedLines：可选，基于 git diff（需要 git 与仓库） */
  if (typeof rules.maxAddedLines === "number") {
    let added = undefined;
    try {
      const out = execFileSync("git", ["diff", "--numstat", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      added = out
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "")
        .reduce((sum, line) => {
          const field = line.split("\t")[0];
          const value = Number(field);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
    } catch {
      added = undefined;
    }
    checks.push({
      id: id("max-added-lines"),
      label: `新增行数 ≤ ${rules.maxAddedLines}`,
      pass: added === undefined || added <= rules.maxAddedLines,
      detail: added === undefined ? "skipped（git 不可用）" : `git diff 新增 ${added} 行`,
    });
  }

  /* 没配任何规则时，给一条信息性通过项，避免 rules 预算无人认领 */
  if (checks.length === 0) {
    checks.push({ id: "rules-none", label: "未配置规则检查", pass: true, detail: "no rules" });
  }
  return checks;
}

export { walk as listProjectFiles };
