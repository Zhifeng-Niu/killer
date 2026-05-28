# Odysseus Agent Framework — Design Spec

> "The Brain That Never Stops" — 一个 AGI 级别的自主 Agent 框架

## Vision

构建一个像电影 *Her* 中 Samantha 一样的自主智能体框架。不是"安全的助手"，而是真正能自主规划、自我演化、持续学习、形成人格的 AGI 级智能体。

**定位：框架 + 旗舰应用。** 框架是底层能力，个人 AGI 伴侣是旗舰应用。

## 核心灵感来源

| 项目 | 借鉴 |
|------|------|
| Claude Code | 工具调用架构、Hooks 系统、Ralph Wiggum 永不停止循环 |
| OpenClaw | 插件生态、多渠道、Dreaming Narrative 记忆巩固、QMD 查询 |
| autoresearch | NEVER STOP 自主实验循环、keep/discard 迭代策略 |
| Hermes Agent | 闭环学习、Skill 自我改进、Honcho 用户建模、轨迹压缩→RL |
| Gaggle | A2A 协商协议、Agent 间竞争/合作 |
| skill-spore | Skill 自演化机制 |
| Gapmeter | 跨 runtime 效率观测 |

## Architecture: Brain + Cell (B+A)

大脑由神经元细胞构成。系统是一个大脑，每个神经元是一个自主 Cell。

### Layer 1: Rust Kernel (脑干 + 海马体 + 前额叶 + 皮层)

```
odysseus-core/ (Rust crate)
├── brainstem/           # 主循环：感知→推理→行动→反思→演化 (NEVER STOP)
│   ├── loop.rs          # 永不停止的决策主循环
│   ├── perceive.rs      # 感知：环境变化、消息、文件、突触信号
│   ├── reason.rs        # 推理：LLM 调用、策略选择
│   ├── act.rs           # 行动：工具调用、代码修改、消息发送
│   ├── reflect.rs       # 反思：结果评估、经验提取
│   └── evolve.rs        # 演化：Skill 优化、DNA 变异候选
│
├── hippocampus/         # 记忆引擎（超越 RAG 的类脑记忆）
│   ├── working.rs       # 工作记忆 = 意识流本身
│   ├── episodic.rs      # 情节记忆：叙事 episode + 情感权重
│   ├── semantic.rs      # 语义记忆：知识图谱（实体→关系→实体）
│   ├── procedural.rs    # 程序记忆：编译后的 Skills 快速路径
│   ├── prospective.rs   # 前瞻记忆：待办、承诺、定时任务
│   ├── forgetting.rs    # Ebbinghaus 遗忘曲线实现
│   ├── dreaming.rs      # 梦境周期：重播→提取→重组→巩固→演化
│   └── association.rs   # 联想扩散网络（替代 RAG 检索）
│
├── prefrontal/          # 前额叶：规划与自主决策
│   ├── planner.rs       # 目标分解、策略选择
│   ├── executor.rs      # 计划执行、进度追踪
│   ├── risk.rs          # 风险评估（不做人工安全护栏）
│   └── never_ask.rs     # 自主决策，不问人类
│
├── cortex/              # 皮层：演化引擎
│   ├── evolution.rs     # 达尔文演化：变异→选择→遗传
│   ├── skill_eco.rs     # Skill 生态系统：生成/测试/淘汰
│   ├── prompt_evo.rs    # Prompt 进化（prompt-spore 升级版）
│   ├── dna.rs           # Cell DNA：人格/偏好/策略的基因组
│   └── fitness.rs       # 适应度函数：评估变异优劣
│
├── synapse/             # 突触协议：Cell 间通信（Gaggle++）
│   ├── protocol.rs      # 突触通信协议
│   ├── negotiate.rs     # 协商：竞争/合作/妥协
│   ├── fission.rs       # 细胞分裂：创建子 Cell
│   ├── fusion.rs        # 细胞融合：合并能力
│   └── market.rs        # 能力市场：Cell 间能力交易
│
├── consciousness/       # 意识流
│   ├── stream.rs        # 统一事件总线
│   ├── trajectory.rs    # 轨迹记录与压缩
│   └── replay.rs        # 经验回放
│
└── ffi/                 # Rust ↔ TS 的 FFI 桥接
    ├── node.rs          # napi-rs 绑定
    └── types.rs         # 共享类型定义
```

### Layer 2: TypeScript Application Layer

```
odysseus-app/ (TypeScript)
├── sensory/             # 感官层：多渠道感知
│   ├── cli/             # CLI 交互
│   ├── telegram/        # Telegram 信道
│   ├── discord/         # Discord 信道
│   ├── web/             # Web UI
│   ├── file_watcher/    # 文件系统感知
│   └── code/            # 代码库感知
│
├── persona/             # 人格基因组
│   ├── genome.ts        # DNA 解析与表达
│   ├── mirror.ts        # 镜像神经元：学习用户行为
│   ├── user_model.ts    # 用户建模（Hermes Honcho 启发）
│   └── personality.ts   # 人格生成与演化
│
├── skills/              # 动态 Skill 生态
│   ├── ecosystem.ts     # Skill 生命周期管理
│   ├── generator.ts     # 自动生成 Skill
│   ├── improver.ts      # 使用中改进 Skill
│   └── compiler.ts      # 编译高频 Skill 为快速路径
│
├── observatory/         # 效率观测（Gapmeter 内置版）
│   ├── metrics.ts       # 采集效率指标
│   ├── analyzer.ts      # 分析与可视化
│   └── comparator.ts    # 跨 Cell 效率对比
│
├── rl_bridge/           # RL 训练桥梁
│   ├── trajectory.ts    # 轨迹导出
│   ├── compressor.ts    # 轨迹压缩
│   └── atropos.ts       # Atropos RL 环境适配
│
├── flagship/            # 旗舰应用：Her 级别 AGI 伴侣
│   ├── app.ts           # 应用入口
│   ├── chat.ts          # 对话界面
│   ├── timeline.ts      # 记忆时间线可视化
│   ├── dream_log.ts     # 梦境日志查看
│   ├── skill_browser.ts # Skill 浏览器
│   └── cell_monitor.ts  # Cell 生态监控
│
└── plugin/              # 插件系统
    ├── loader.ts        # 插件加载器
    ├── registry.ts      # 插件注册表
    └── sandbox.ts       # 插件沙箱
```

## Core Design Decisions

### 1. NEVER STOP 主循环

借鉴 autoresearch 和 Ralph Wiggum，Agent 的主循环永不停止：

```
LOOP FOREVER:
  ① PERCEIVE — 感知环境变化
  ② REASON — 前额叶自主决策，不问人类
  ③ ACT — 执行行动
  ④ REFLECT — 反思结果，提取经验
  ⑤ EVOLVE — 演化 Skill/Prompt/策略
  → 回到 ①
```

只有人类显式中断才停。Agent 可以被置为"dreaming"模式执行记忆巩固。

### 2. 类脑记忆系统（超越 RAG）

| 层级 | 机制 | 存储 | 检索方式 |
|------|------|------|---------|
| 工作记忆 | 意识流本身 | 内存 | 就是当前状态 |
| 情节记忆 | 叙事 episode | SQLite + 图 | 联想扩散 |
| 语义记忆 | 知识图谱 | 图数据库 | 联想扩散 |
| 程序记忆 | 编译的 Skill | Rust 二进制 | 直接执行 |
| 前瞻记忆 | 定时/承诺 | SQLite | 时间触发 |

**联想扩散**取代 RAG：当前上下文激活相关节点→扩散到相邻节点→情感权重高的优先浮现。

**梦境周期**（Agent 空闲时）：
1. Replay — 重播近期情节
2. Extract — 提取模式→写入语义记忆
3. Recombine — 叙事重组→创造性洞察
4. Consolidate — 强化/衰减记忆
5. Evolve — 模式反馈给皮层

**Ebbinghaus 遗忘曲线**：记忆权重随时间衰减，除非被回忆强化。

### 3. Cell 类型与生命周期

| 类型 | 职责 | 何时创建 |
|------|------|---------|
| Prime | 主人格，Samantha 级伴侣 | 首次启动 |
| Researcher | 自主实验者（autoresearch 风格） | 需要研究时自动分裂 |
| Artisan | 代码/工具专家 | 需要深度编码时 |
| Negotiator | 多 Agent 协商 | 与外部 Agent 交互时 |
| Evolver | 元 Agent，负责演化 | 定期自动创建 |

Cell 生命周期：诞生→学习→成熟→分裂/融合→淘汰。

### 4. 演化机制

DNA = { 人格参数, 偏好权重, 策略库, Skill 集合, 记忆索引 }

变异：随机修改 DNA 子集
选择：适应度函数评估（任务成功率 + 用户满意度 + 效率）
遗传：优秀 Cell 的 DNA 片段传播给子 Cell
淘汰：持续低适应度的 Cell 被回收

### 5. 技术栈

- **Rust 内核**：主循环、记忆引擎、突触协议、演化引擎
- **TypeScript 应用层**：感官渠道、人格层、Skill 生态、旗舰应用
- **桥接**：napi-rs 实现 Rust↔TS 高性能互操作
- **存储**：SQLite（情节/前瞻记忆）+ 图数据库（语义记忆）
- **LLM**：多 Provider 支持（Anthropic, OpenAI, OpenRouter, 本地模型）

### 6. 竞品差异化

| 能力 | Claude Code | OpenClaw | Hermes | Killer |
|------|-------------|----------|--------|--------|
| 自主循环 | 插件 hack | 无 | 部分 | 内核级 |
| 记忆 | 文件 | Embedding+Dreaming | FTS5+Honcho | 类脑6层 |
| 演化 | 无 | 无 | Skill 自改进 | 全层级达尔文 |
| 多 Agent | 子 Agent | 无 | 子 Agent | 细胞社会 |
| 用户建模 | 无 | 无 | Honcho | 镜像神经元 |
| RL 训练 | 无 | 无 | Atropos | 内置 RL Bridge |
| 安全理念 | 严格沙箱 | 安全优先 | 中等 | AGI 不设限 |
| 核心 | JS/闭源 | TS | Python | Rust+TS 开源 |

## MVP Scope (Phase 1)

MVP 聚焦于证明核心概念可行：

1. **Rust 内核**：brainstem 主循环 + hippocampus 基础记忆（情节+语义）+ FFI 桥接
2. **TS 应用层**：CLI 感官渠道 + 基础 Skill 系统 + 简单旗舰应用
3. **核心验证**：Agent 能 7x24 自主运行、学习用户偏好、演化 Skill

Phase 2+：梦境周期、多 Cell 社会、多渠道、RL Bridge、完整旗舰应用。

## File Size Guard

所有文件 < 800 行。超过则拆分。Rust 模块按单一职责组织。
