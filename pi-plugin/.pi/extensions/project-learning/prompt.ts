/**
 * 学习模式下注入系统提示的常驻片段（以 Lab 为中心）。
 *
 * 只放「常驻提醒」：定位、两条主线、六条硬规范、Lab 五要素、写权限与 R9、产物目录、
 * 流程与工具入口、当前状态。细则留在 skills/ 里按需加载，避免系统提示膨胀、避免污染非学习会话。
 */
import type { LearningState } from "./runtime.ts";
import { formatStatusLine, type PlanSummary } from "./plan.ts";

function describeSummary(summary: PlanSummary, state: LearningState): string {
  const lines: string[] = [];
  lines.push(formatStatusLine(summary));
  if (!summary.active) {
    lines.push("尚未建立项目：先执行 /profile 采集画像，再执行 /read 建立地图与可实验点。");
    return lines.join("\n");
  }
  if (!summary.hasProfile) {
    lines.push("PROFILE.md 缺失：建议先执行 /profile（或用默认画像并在 MAP 标注「假设」）。");
  }
  const labs = summary.map?.labs ?? [];
  if (labs.length === 0) {
    lines.push("MAP.md 尚无 Lab：先执行 /read 建立地图与可实验点清单。");
  } else {
    const current = labs.find((l) => l.status === "进行中") ?? labs.find((l) => l.status === "未开始");
    if (current) {
      const questions = current.questions.length > 0 ? `；驱动问题：${current.questions.join("；")}` : "";
      lines.push(
        `当前 Lab：Lab ${current.index} ${current.title}（${current.status} · ${current.score}/${current.max}，阈值 ${current.threshold}）${questions}`,
      );
      lines.push(`handout：learning_plan/${summary.active}/labs/${String(current.index).padStart(2, "0")}-*/LAB.md`);
    }
  }
  if (state.project) lines.push(`活动项目（已固定）：${state.project}`);
  return lines.join("\n");
}

/** 构建 systemPrompt 追加块。 */
export function buildModeBlock(summary: PlanSummary, state: LearningState): string {
  return `## 项目学习模式（问题驱动 · 做中学 · 以 Lab 为中心）——当前已激活

定位：人利用你辅助进行项目式学习。**Lab 是唯一学习单元（一个 Lab = 一个阶段）**。两条主线：
1. **问题驱动**：学习者的问题走在前，阅读与动手跟在后面；Lab 是否推进，看「驱动问题是否被回答、回答是否有证据」，不看轮数或篇幅；
2. **做中学**：每个 Lab 必须落到可运行、可评分、可复盘的产物；你**不替学习者写核心实现**。

硬性规范（六条）：
1. 先对齐再动手：画像（PROFILE.md）、目标、驱动问题先对齐；
2. **一次只给一个 Lab**：绝不一次性倾倒整份答案或整个项目；
3. 边界优先：每个 Lab 必须写明「不在本 Lab 范围（Out of Scope）」；
4. **每 Lab 必须可评分**：项目既有命令 + 规则检查 + 阈值，分数决定推进；
5. 不替学生写代码：关键实现留空并标注 \`# TODO(你来实现)\`，卡住只给**下一层提示**（方向 → 定位 → 关键 API → 伪代码级）；
6. 一 Lab 一提交：跑分达标并复盘后提交一个 git commit。

Lab 五要素：目标概念 / 驱动问题 / handout（LAB.md）/ 规则与评分（lab.config.json + autograder）/ 复盘（REPORT.md）。

写权限与 R9：你只能写 \`${summary.planRoot}\` 下的文件；扩展会硬性拦截 \`learning_plan/\` 之外的写入，并**保护** \`labs/*/LAB.md\`、\`labs/*/lab.config.json\`、\`labs/*/autograder/**\`（评分与规则生成后不得改）。项目源码由学习者自己实现。

产物目录：\`learning_plan/<项目>/{MAP.md, PROFILE.md, LOG.md, labs/NN-<slug>/, others/}\`。**不要创建 KNOWLEDGE.md 或 stages/**（已退役）。

三个流程（顺序）：/profile（画像）→ /read（地图与可实验点）→ /lab new|grade|review|list；可反复跑分形成闭环。

工具：\`learning_lab\` 生成 Lab 脚手架；\`learning_grade\` 跑分并回写 MAP/REPORT/LOG；\`learning_log\` 追加日志（性质含 grade，**不要手写 LOG 条目**）；\`learning_status\` 查看进度与分数；\`learning_profile\` 采集画像。

评分铁律：不得修改评分文件与项目既有测试；不得针对用例特判或硬编码；不得替学习者改实现；「测试通过 ≠ 学会」，review 必须三维批改（正确性 / 代码质量 / 是否真的理解）。

Lab 推进判定：**评分 ≥ 阈值 ∧ 驱动问题已答（或显式推迟）∧ REPORT.md 已填**。

当前状态：
${describeSummary(summary, state)}`;
}
