import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function frontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

test("七个技能都是合法 SKILL.md（name/description/license）", () => {
  const skillsDir = join(root, ".pi", "skills");
  const dirs = readdirSync(skillsDir).sort();
  assert.deepEqual(dirs, [
    "project-doc-log",
    "project-doc-map",
    "project-doc-profile",
    "project-lab-method",
    "project-learning-main",
    "project-learning-regulation",
    "project-reading-method",
  ]);
  for (const dir of dirs) {
    const text = readFileSync(join(skillsDir, dir, "SKILL.md"), "utf8");
    const fm = frontmatter(text);
    assert.equal(fm.name, dir, `${dir}: name 应与目录一致`);
    assert.match(fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${dir}: name 命名规则`);
    assert.ok(fm.description && fm.description.length <= 1024, `${dir}: description 必填且 ≤1024`);
    assert.equal(fm.license, "MIT", `${dir}: license`);
    assert.match(text, /\n# /, `${dir}: 应有正文标题`);
  }
});

test("三个 prompt template 都有 description 与 argument-hint", () => {
  const promptsDir = join(root, ".pi", "prompts");
  const files = readdirSync(promptsDir).sort();
  assert.deepEqual(files, ["lab.md", "profile.md", "read.md"]);
  for (const file of files) {
    const fm = frontmatter(readFileSync(join(promptsDir, file), "utf8"));
    assert.ok(fm.description && fm.description.length > 0, `${file}: description 必填`);
    assert.ok(fm["argument-hint"], `${file}: argument-hint 必填`);
  }
});

test("Lab 模板与 autograder 参考文件齐备", () => {
  const refs = join(root, ".pi", "skills", "project-lab-method", "references");
  for (const name of ["LAB.template.md", "REPORT.template.md", "lab-config.example.json", "check-rules.mjs", "grade.mjs"]) {
    assert.equal(existsSync(join(refs, name)), true, `${name} 应存在`);
  }
  const labTemplate = readFileSync(join(refs, "LAB.template.md"), "utf8");
  for (const key of ["{{INDEX}}", "{{TITLE}}", "{{CONCEPT}}", "{{QUESTIONS}}", "{{RULES}}", "{{GRADING}}", "{{HINTS}}", "{{THRESHOLD}}"]) {
    assert.match(labTemplate, new RegExp(key.replace(/[{}]/g, "\\$&")), `模板应含 ${key}`);
  }
  const grade = readFileSync(join(refs, "grade.mjs"), "utf8");
  assert.match(grade, /last-result\.json/);
  assert.match(grade, /check-rules\.mjs/);
  const example = JSON.parse(readFileSync(join(refs, "lab-config.example.json"), "utf8"));
  assert.equal(example.threshold, 100);
  assert.ok(Array.isArray(example.tests) && example.tests.length > 0);
});

test("package.json 的 pi 清单指向存在的资源", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.deepEqual(pkg.pi.extensions, ["./.pi/extensions/project-learning/index.ts"]);
  assert.deepEqual(pkg.pi.skills, ["./.pi/skills"]);
  assert.deepEqual(pkg.pi.prompts, ["./.pi/prompts"]);
  for (const tool of ["learning_status", "learning_log", "learning_lab", "learning_grade", "learning_profile"]) {
    assert.match(readFileSync(join(root, ".pi", "extensions", "project-learning", "tools.ts"), "utf8"), new RegExp(tool));
  }
});
