/**
 * 状态栏刷新：把 learning_plan 的当前进度映射到 Pi footer 状态。
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatStatusLine, summarize } from "./plan.ts";

export const STATUS_KEY = "project-learning";

/** 刷新状态栏；无 UI 时静默。 */
export function refreshStatus(ctx: ExtensionContext, planDir: string, project?: string): void {
  if (!ctx.hasUI) return;
  try {
    const summary = summarize(ctx.cwd, planDir, project);
    ctx.ui.setStatus(STATUS_KEY, formatStatusLine(summary));
  } catch {
    /* 解析失败不阻断 */
  }
}

/** 清除状态栏。 */
export function clearStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  try {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  } catch {
    /* 忽略 */
  }
}
