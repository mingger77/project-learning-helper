# 项目学习模式（project-learning preset）

人利用 AI 辅助进行项目式学习的 DeepSeek Harness Agent 预设：以模块数/业务复杂度分档阅读项目，在项目根 `learning_plan/<项目名>/` 下产出四份文档——`STUDENT.md`（学生学案）、`TEACHER.md`（老师/AI 备课解析）、`QUESTION.md`（问答日志）、`KNOWLEDGE.md`（前置知识详解，每知识点附真实检验网址）；除 `learning_plan/` 目录外，项目其余文件一律只读。

## 组成

- `agent.cordis.yml` —— 预设组合（以 `standard` 为基线；差异：项目学习 persona、`skills/` 挂载、`tool-web` 关闭 fetch、补回 `command-goal`）
- `preset.yml` —— 预设元数据（name / description / order: 7）
- `skills/` —— 7 个技能：
  - `project-learning-main` —— 顶层调度（分档 → 询问与双确认 → 五档策略 → 产出四文件）
  - `project-learning-regulation` —— 元规则（证据可追溯、只读 + `learning_plan/` 唯一可写、输出命名、范围协商、`/goal` 作答规则、检验网址规则 R9）
  - `project-reading-method` —— 复杂度判据与五档阅读策略 + 「导演式阅读」五轮法
  - `project-doc-student` —— `STUDENT.md` 学案规范（11 节；§3 前置知识单链接指向 KNOWLEDGE.md）
  - `project-doc-teacher` —— `TEACHER.md` 备课解析规范（9 节）
  - `project-doc-question` —— `QUESTION.md` 问答日志规范（含 `/goal` 模式 `<请回答>` 作答规则）
  - `project-doc-knowledge` —— `KNOWLEDGE.md` 前置知识详解规范（6 节，每知识点附真实检验网址）
- `LICENSE` —— MIT

## 安装

1. 将本目录复制到 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/project-learning/`（每个预设一个同级目录，id 与目录名一致）。
2. 挂载校验：`agentPresets.standingKeyFor('project-learning')` 返回 `mounted OK` 即生效。
3. 在 Web GUI 新开会话，预设选择「项目学习模式」。

## 使用

对目标项目说「学习/阅读这个项目」，Agent 将执行：复杂度分档（判据写入 `TEACHER.md` §0/§1）→ 询问学习者背景（编程水平/目标/想学知识/已有经验/文档偏好）与双确认 → 按档位策略阅读 → 产出 `learning_plan/<项目名>/` 四份文档（TEACHER → KNOWLEDGE → STUDENT → QUESTION）。

学生先做 `KNOWLEDGE.md` §1 知识自检，缺失项按详解学习并用检验网址自测；提问在 `QUESTION.md` 中追加；AI 仅在 `/goal` 模式且问题标注 `<请回答>` 时回答。

## 许可证

MIT License，详见 [LICENSE](LICENSE)。
