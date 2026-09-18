/**
 * 会话级学习模式状态：激活/关闭、活动项目、写入守卫开关。
 *
 * 状态随会话持久化（pi.appendEntry），`/resume` / `/reload` 后从当前分支恢复。
 * 恢复顺序：会话条目 > 启动 flag。
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_PLAN_DIR } from "./guard.ts";

export const STATE_ENTRY = "project-learning/state";

export interface LearningState {
  /** 学习模式是否激活 */
  active: boolean;
  /** 活动项目名（learning_plan/<project>/）；未指定时取第一个项目 */
  project?: string;
  /** 写入守卫是否开启（学习模式内生效） */
  guard: boolean;
}

export const DEFAULT_STATE: LearningState = { active: false, guard: true };

function coerceState(value: unknown, fallback: LearningState): LearningState {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<LearningState>;
  return {
    active: typeof raw.active === "boolean" ? raw.active : fallback.active,
    project: typeof raw.project === "string" && raw.project !== "" ? raw.project : fallback.project,
    guard: typeof raw.guard === "boolean" ? raw.guard : fallback.guard,
  };
}

export class LearningRuntime {
  private state: LearningState;
  planDir: string;

  constructor(
    private readonly pi: ExtensionAPI,
    planDir?: string,
  ) {
    this.planDir = planDir && planDir.trim() !== "" ? planDir.trim() : DEFAULT_PLAN_DIR;
    this.state = { ...DEFAULT_STATE };
  }

  snapshot(): Readonly<LearningState> {
    return { ...this.state };
  }

  isActive(): boolean {
    return this.state.active;
  }

  guardEnabled(): boolean {
    return this.state.active && this.state.guard;
  }

  project(): string | undefined {
    return this.state.project;
  }

  /** 由启动 flag 初始化（在 session_start 之前调用）。 */
  applyStartupFlags(): void {
    if (this.pi.getFlag("project-learning") === true) this.state.active = true;
    const dir = this.pi.getFlag("learning-plan-dir");
    if (typeof dir === "string" && dir.trim() !== "") this.planDir = dir.trim();
  }

  activate(project?: string): void {
    this.state.active = true;
    if (project && project !== "") this.state.project = project;
    this.persist();
  }

  deactivate(): void {
    this.state.active = false;
    this.persist();
  }

  setProject(project: string | undefined): void {
    this.state.project = project && project !== "" ? project : undefined;
    this.persist();
  }

  setGuard(enabled: boolean): void {
    this.state.guard = enabled;
    this.persist();
  }

  /** 从会话条目恢复（取最新一条）；无条目时保留当前状态。 */
  restore(ctx: ExtensionContext): void {
    const entries = ctx.sessionManager.getEntries();
    let restored: LearningState | undefined;
    for (const entry of entries) {
      const e = entry as { type?: string; customType?: string; data?: unknown };
      if (e.type === "custom" && e.customType === STATE_ENTRY) {
        restored = coerceState(e.data, this.state);
      }
    }
    if (restored) this.state = restored;
  }

  private persist(): void {
    try {
      this.pi.appendEntry(STATE_ENTRY, { ...this.state });
    } catch {
      /* 持久化失败不阻断主流程 */
    }
  }
}
