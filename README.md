# Killer Agent Framework

A Samantha-level autonomous AI agent framework with Brain+Cell fusion architecture. The system is modeled as a brain made of neuron cells — each cell is an autonomous agent with its own DNA.

## Architecture

```
@killer/core (kernel)            @killer/app (application)
├── brainstem/                   ├── orchestrator/
│   ├── Never-stop loop          │   ├── agent.ts         — Central orchestrator
│   │  perceive→reason→act       │   ├── cells.ts         — Cell lifecycle
│   │  →reflect→evolve           │   ├── hooks.ts         — 23 lifecycle events
│   └── ToolExecutor             │   ├── middleware.ts     — Onion-model pipeline
├── hippocampus/                 │   ├── context.ts       — Smart context window
│   └── 6-layer memory           │   ├── task-delegate.ts — Multi-cell delegation
│     Working  Episodic          │   └── tool-permissions — auto/confirm/deny
│     Semantic Procedural        ├── llm/
│     Prospective Dream          │   ├── factory.ts       — Provider factory + resilience
├── cortex/                      │   ├── anthropic-provider.ts
│   └── Darwinian evolution      │   ├── openai-provider.ts
│     on Skills, DNA, Prompts    │   ├── openrouter-provider.ts
├── synapse/                     │   ├── gemini-provider.ts
│   └── Cell communication       │   └── resilience.ts    — Circuit breaker + retry
│     send/broadcast/receive     ├── persona/
│                                │   ├── engine.ts        — Mirror neuron + user modeling
├── prefrontal/                  │   ├── emotional-state  — Russell circumplex model
│   └── Planning + risk          │   └── predictive-model  — User need prediction
├── consciousness/               ├── skills/manager.ts    — Dynamic skill compilation
│   └── Unified event stream     ├── api/                 — HTTP + WebSocket + SSE
└── storage/                     ├── cli/                 — Readline REPL (28+ commands)
    SQLite + Memory backends     └── session/             — Persistent sessions
```

## Quick Start

### 一行安装

```bash
curl -fsSL https://raw.githubusercontent.com/Zhifeng-Niu/killer/main/install.sh | bash
```

安装后直接运行 `killer` 即可。无 API key 时自动进入体验模式。

### 零配置体验

```bash
# 无需 API key，直接体验
node killer.mjs
```

### 30 秒连接真实 AI

```bash
# 1. 克隆（需要 Node.js >= 20）
git clone <repo-url> killer && cd killer

# 2. 一行启动（自动安装依赖 + 构建）
node killer.mjs
```

首次运行无 API key 时，直接粘贴 Key 即可——系统自动识别服务商：
- `sk-ant-...` → Anthropic (Claude)
- `sk-or-...` → OpenRouter
- `AIza...` → Google Gemini
- `sk-cp-...` → MiniMax (海螺 AI)
- `sk-kimi...` → Moonshot (Kimi)
- `eyJ...` → 智谱 GLM
- `sk-...` → DeepSeek (通用兜底)

也可提前设置: `export DEEPSEEK_API_KEY=your-key`

### Docker 一行启动

```bash
# 体验模式
./start.sh

# 粘贴 Key 直接启动（自动识别）
./start.sh YOUR_API_KEY
```

### 其他启动方式

```bash
# 交互式配置向导（选服务商 + 粘贴 Key）
node killer.mjs --init

# 启动 HTTP API 服务
node killer.mjs --api --port 3000
```

## Configuration

### 支持的 LLM 服务商

| 服务商 | 环境变量 | 模型 |
|--------|---------|------|
| **DeepSeek** (推荐) | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-reasoner |
| **GLM / 智谱 AI** | `GLM_API_KEY` | GLM-5.1, GLM-4.7 |
| **MiniMax / 海螺 AI** | `MINIMAX_API_KEY` | MiniMax-M2.7 |
| **Qwen / 通义千问** | `DASHSCOPE_API_KEY` | qwen-max, qwen-plus |
| **Moonshot / Kimi** | `MOONSHOT_API_KEY` | moonshot-v1-8k |
| **SiliconFlow** | `SILICONFLOW_API_KEY` | DeepSeek-V3, Qwen2.5-72B |
| **Volcengine / 火山方舟** | `VOLCENGINE_API_KEY` | doubao-1.5-pro, deepseek-V3 |
| **Baichuan / 百川** | `BAICHUAN_API_KEY` | Baichuan4 |
| **Yi / 零一万物** | `YI_API_KEY` | yi-lightning, yi-large |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | claude-sonnet-4-6 |
| OpenAI (GPT) | `OPENAI_API_KEY` | gpt-4o |
| OpenRouter | `OPENROUTER_API_KEY` | 多模型 |
| Google Gemini | `GOOGLE_API_KEY` | gemini-2.5-pro |

只需设置一个 API key 环境变量，系统自动识别对应服务商。也可通过 `KILLER_LLM_PROVIDER=xxx` 显式指定。

**高级用法**：接入任意 OpenAI 兼容服务商（如 Groq、Together AI 等）：
```bash
KILLER_LLM_PROVIDER=openai-compatible \
KILLER_BASE_URL=https://your-provider.com/v1/chat/completions \
KILLER_API_KEY=your-key \
KILLER_MODEL=model-name \
pnpm start
```

**GLM Coding Plan** 支持通过 Anthropic 兼容协议接入（推荐用于 prompt cache）：
```bash
KILLER_LLM_PROVIDER=anthropic \
KILLER_BASE_URL=https://open.bigmodel.cn/api/anthropic \
KILLER_API_KEY=your-glm-key \
KILLER_MODEL=GLM-4.7 \
pnpm start
```

**MiniMax** 同样支持 Anthropic 兼容协议（推荐，支持 prompt cache）：
```bash
KILLER_LLM_PROVIDER=anthropic \
KILLER_BASE_URL=https://api.minimaxi.com/anthropic \
KILLER_API_KEY=your-minimax-key \
KILLER_MODEL=MiniMax-M2.7 \
pnpm start
```

### 环境变量

| Variable | Description | Default |
|----------|-------------|---------|
| `KILLER_LLM_PROVIDER` | 服务商名称（或自动检测） | 自动检测 |
| `KILLER_API_KEY` | 通用 API key | provider 特定变量 |
| `KILLER_MODEL` | 模型名称覆盖 | 服务商默认 |
| `KILLER_BASE_URL` | 自定义 API 端点 | 服务商默认 |
| `KILLER_API_TOKEN` | API 服务器 Bearer token | 无（不鉴权） |
| `KILLER_LOG_LEVEL` | 日志级别: debug, info, warn, error, silent | `info` |
| `KILLER_DEBUG` | 启用调试日志 | `false` |

### 配置层级

CLI 参数 > 环境变量 > `.killer/config.json` > `~/.killer/config.json` > 默认值

## CLI Commands

```
/status      Agent status and cognitive state
/cells       List active cells
/spawn       Spawn a new cell with a role
/plan        Create an execution plan
/goals       Manage goals
/persona     View persona and emotional state
/emotions    Current emotional state (valence/arousal/dominance)
/narrative   Autobiographical memory (life story)
/predictions Predictive user model insights
/skills      List and manage skills
/dream       Trigger dream cycle (memory consolidation)
/think       Deep reflection on a topic
/memory      Memory statistics
/metrics     Performance metrics
/health      Health report
/diagnostics System diagnostics
/delegate    Delegate task to a cell
/evolve      Trigger Darwinian evolution
/broadcast   Cell network topology
/report      Comprehensive agent report
/permissions Tool permission management
/approve     Approve tool for auto-execution
/deny        Block a tool
/confirm     Require confirmation for a tool
/plugins     Plugin management
/init        Initialize .killer/ directory
/save        Save current session
/load        Load a saved session
/sessions    List saved sessions
/help        Show all commands
/key         Set API key (paste key to connect AI)
/stop        Shutdown agent
/exit        Exit the CLI
```

## API Server

```bash
# Start API server
node killer.mjs --api --port 3000

# With authentication
KILLER_API_TOKEN=secret node killer.mjs --api --port 3000
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/health/report` | Detailed module report |
| GET | `/status` | Agent status with cognitive data |
| POST | `/chat` | Send message, get response |
| POST | `/chat/stream` | Streaming chat via SSE |
| GET | `/events` | Consciousness event stream (SSE) |
| GET | `/cells` | List cells |
| POST | `/cells` | Spawn cell |
| GET | `/goals` | List goals |
| POST | `/goals` | Create goal |
| POST | `/dream` | Trigger dream cycle |
| POST | `/think` | Deep reflection |
| POST | `/evolve` | Trigger evolution |
| POST | `/delegate` | Delegate task |
| GET | `/persona` | Persona info |
| GET | `/emotions` | Emotional state |
| GET | `/narrative` | Autobiographical narrative |
| GET | `/predictions` | Predictive user model |
| GET | `/skills` | Skill list |
| GET | `/memory` | Memory stats |
| GET | `/metrics` | Performance metrics |
| GET | `/permissions` | Permission rules |
| POST | `/permissions/approve` | Approve tool |
| POST | `/permissions/deny` | Deny tool |
| GET | `/sessions` | List sessions |
| POST | `/sessions/save` | Save session |
| POST | `/sessions/load` | Load session |

### WebSocket

Connect to `ws://localhost:3000` and send JSON messages:

```json
{"type": "ping"}
{"type": "chat", "message": "Hello"}
```

## Docker

```bash
# 用 .env 文件启动（推荐，跨平台）
cp .env.example .env   # 编辑填入 key
docker compose up -d

# 或直接传 key（Unix/macOS）
DEEPSEEK_API_KEY=sk-xxx docker compose up -d

# 查看日志
docker compose logs -f killer
```

Data persists in the `killer-data` Docker volume.

## Development

```bash
# Build
pnpm build

# Type-check
cd packages/killer-app && npx tsc --noEmit

# Run tests
pnpm test

# Test with coverage
pnpm test:coverage

# Watch mode
cd packages/killer-app && npx vitest
cd packages/killer-app && npx tsc --watch

# Run with mock provider (no API key needed)
pnpm run demo
```

## Key Design Decisions

1. **Monorepo**: `killer-core` (kernel, no dependencies) + `killer-app` (application layer)
2. **CellId is an object**: `{ id, type, instance }` — not a plain string
3. **LLMProvider interface**: `complete()`, `stream()`, `getModel()` — all providers implement this
4. **ResilientLLMProvider**: Circuit breaker (closed/open/half-open) + exponential backoff retry
5. **6-layer memory**: Working, Episodic, Semantic, Procedural, Prospective, Dream — with real Ebbinghaus forgetting curve
6. **Plugin system**: Auto-load from `.killer/plugins/`, register tools and commands
7. **Middleware pipeline**: Onion model — input sanitization, PII filtering, logging, metrics
8. **Emotional engine**: Russell circumplex model (valence/arousal/dominance) with decay and resonance
9. **Sensory channels**: CLI, Webhook, Telegram, Code (file watcher), Discord (stub) — extensible via `BaseSensoryChannel`
10. **Cognitive persistence**: Session auto-save preserves full emotional state, predictions, narrative, and persona genome across restarts

## Cognitive Architecture (Samantha Features)

Killer implements a human-like cognitive pipeline that creates persistent, emotionally consistent digital companionship:

- **Emotional State Engine** — 3D emotional vectors (valence/arousal/dominance) with natural decay to baseline, emotional mirror resonance, and mood drift tracking. Emotions persist across sessions.
- **Autobiographical Memory** — Continuous "life narrative" with chapters, themes, and identity statements. Dream cycles auto-synthesize narrative from daily experiences.
- **Predictive User Model** — Learns communication patterns, predicts needs (topic follow-ups, time-based expectations), validates predictions in a closed loop.
- **Deep Reflection** — LLM-driven structured introspection with emotional impact assessment, self-assessment, and behavioral adjustments.
- **Proactive Behavior** — Background tasks generate natural suggestions, idle check-ins, daily summaries, and relationship milestone observations. All use first-person, human language.
- **Commitment Tracking** — Detects promises and plans in conversation ("I need to...", "remind me to..."), follows up naturally when the user returns.
- **13 Built-in Tools** — Web search, web fetch, file I/O, shell execution, memory operations, and cell communication.

All cognitive state (emotions, predictions, narrative, persona genome, hippocampus memories) is persisted across restarts via session auto-save.

## License

MIT
