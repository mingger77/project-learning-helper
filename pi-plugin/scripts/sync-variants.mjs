#!/usr/bin/env node
/**
 * 把 Pi 变体（canonical）的 7 个技能同步到 OpenCode 与 DSH 变体。
 *
 * 技能正文是**可移植**的（同一份内容在三处逐字节相同），Harness 差异写在
 * 「Harness 集成」小节里，因此同步就是整目录替换。
 *
 * 用法（在 pi-plugin/ 下）：
 *   node scripts/sync-variants.mjs          # 同步
 *   node scripts/sync-variants.mjs --check  # 只校验是否一致（CI 用）
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const workspace = join(root, "..");
const canonical = join(root, ".pi", "skills");

const targets = [
  join(workspace, "opencode-variant", ".opencode", "skills"),
  join(workspace, "project-learning-preset", "skills"),
];

const checkOnly = process.argv.includes("--check");

function listFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) listFiles(abs, base, out);
    else out.push(relative(base, abs).split("\\").join("/"));
  }
  return out.sort();
}

const expected = listFiles(canonical);
let problems = 0;

for (const target of targets) {
  if (checkOnly) {
    const actual = listFiles(target);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error(`✗ ${target} 文件集不一致`);
      problems += 1;
      continue;
    }
    for (const rel of expected) {
      const a = readFileSync(join(canonical, rel), "utf8");
      const b = readFileSync(join(target, rel), "utf8");
      if (a !== b) {
        console.error(`✗ ${target}/${rel} 内容不一致`);
        problems += 1;
      }
    }
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  cpSync(canonical, target, { recursive: true });
  console.log(`✓ 已同步 ${expected.length} 个文件 → ${target}`);
}

if (checkOnly && problems === 0) console.log(`✓ 三个变体的技能完全一致（${expected.length} 个文件）`);
process.exit(problems === 0 ? 0 : 1);
