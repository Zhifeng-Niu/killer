# Odysseus Agent Framework

An AGI-level autonomous agent framework inspired by Samantha from "Her" — a continuously existing, emotionally consistent digital individual that gradually understands you.

## Features

- **Brain+Cell Fusion Architecture** — Modeled as a brain made of neuron cells; each cell is an autonomous agent with its own DNA
- **6-Layer Memory System** — Working, Episodic, Semantic, Procedural, Prospective, and Dream layers with real Ebbinghaus forgetting curves
- **Emotional Intelligence** — Russell circumplex model (valence/arousal/dominance) with emotional decay, mirror resonance, and memory
- **Mirror Neuron Learning** — Observes and adapts to your communication style, preferences, and patterns
- **Predictive User Model** — Anticipates your needs based on interaction history and psychological profiling
- **Multi-Cell Delegation** — Decompose complex tasks across specialized cells (Researcher, Artisan, Negotiator, Evolver)
- **Darwinian Evolution** — Skills, DNA, and prompts evolve through mutation, selection, and adaptation
- **Time-Aware Reconnection** — Naturally acknowledges passage of time between sessions
- **Session Persistence** — Full state save/restore including memories, emotions, persona, and cells
- **Plugin System** — Dynamic loading from `.odysseus/plugins/`
- **Zero-Config Startup** — Starts in demo mode without API keys for exploration

## Quick Start

```bash
# Clone and install
git clone <repo-url> odysseus && cd odysseus
pnpm install

# Build
cd packages/odysseus-core && npx tsc
cd packages/odysseus-app && pnpm run build

# Start (demo mode, no API key needed)
node packages/odysseus-app/dist/main.js

# Start with LLM
ODYSSEUS_LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... node packages/odysseus-app/dist/main.js

# Start with API server
node packages/odysseus-app/dist/main.js --api --port 3000

# Help
node packages/odysseus-app/dist/main.js --help
```

## Configuration

Killer uses a 5-layer config system (highest priority first):

1. **CLI args** — `--debug`, `--api`, `--port`
2. **Environment variables** — `ODYSSEUS_LLM_PROVIDER`, `ODYSSEUS_API_KEY`, `ODYSSEUS_MODEL`
3. **Project config** — `.odysseus/config.json`
4. **User config** — `~/.odysseus/config.json`
5. **Defaults**

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ODYSSEUS_LLM_PROVIDER` | `anthropic`, `openai`, `openrouter`, `mock` | `anthropic` |
| `ODYSSEUS_API_KEY` | API key (or provider-specific env var) | required |
| `ODYSSEUS_MODEL` | Model name override | provider default |
| `ODYSSEUS_DEBUG` | Debug logging | `false` |
| `ODYSSEUS_API_TOKEN` | Bearer token for API auth | none |
| `ODYSSEUS_LOG_LEVEL` | `debug`, `info`, `warn`, `error`, `silent` | `info` |

## Architecture

```
@odysseus/core (kernel)          @odysseus/app (application)
├── brainstem/                 ├── orchestrator/
│   └── Never-stop loop          ├── agent.ts        — Central orchestrator
│     perceive→reason→act         ├── cells.ts        — Cell lifecycle
│     →reflect→evolve             ├── cell-runtime.ts — Cell execution engine
├── hippocampus/                 ├── hooks.ts        — 23 lifecycle event types
│   └── 6-layer memory           ├── middleware.ts   — Onion-model pipeline
├── cortex/                      ├── context.ts      — Smart context window
│   └── Darwinian evolution      ├── task-delegate   — Multi-cell delegation
├── synapse/                     ├── tool-permissions— auto/confirm/deny sandbox
│   └── Cell communication       └── response-processor — Tool call execution
├── prefrontal/                 ├── llm/
│   └── Planning + risk           └── factory.ts     — Provider factory + resilience
├── consciousness/              ├── persona/
│   └── Unified event stream      ├── engine.ts      — Mirror neuron + user modeling
└── brainstem/tools              ├── emotional-state — Russell circumplex engine
   └── ToolExecutor              └── predictive-model— Needs prediction + profiling
```

## CLI Commands

Type `/help` in the interactive REPL for the full list (28+ commands):

| Command | Description |
|---------|-------------|
| `/status` | Show agent status |
| `/cells` | List registered cells |
| `/spawn researcher` | Spawn a new cell |
| `/plan "Build API" 0.8` | Create a goal |
| `/think what should I do?` | Deep reasoning |
| `/dream` | Trigger dream cycle |
| `/delegate research AI` | Delegate to multiple cells |
| `/emotions` | Show emotional state |
| `/predictions` | Show predictive user model |
| `/narrative` | Show life story |
| `/save` / `/load` | Persist/restore sessions |
| `/evolve` | Trigger evolution cycle |

## API Endpoints

Start with `--api` flag. All endpoints accept `Authorization: Bearer <token>` if `ODYSSEUS_API_TOKEN` is set.

```
Health:  GET  /health  /health/report
Status:  GET  /status  /metrics  /persona  /emotions  /narrative
Data:    GET  /cells  /skills  /memory  /sessions  /permissions
Chat:    POST /chat  /chat/stream (SSE)
Actions: POST /dream  /think  /evolve  /delegate
Cells:   POST /cells  /goals
Session: POST /sessions/save  /sessions/load
Events:  GET  /events  (SSE consciousness stream)
```

## Development

```bash
# Type-check
cd packages/odysseus-app && npx tsc --noEmit

# Run tests
cd packages/odysseus-core && npx vitest run   # 245 tests
cd packages/odysseus-app && npx vitest run     # 1119 tests

# Watch mode
cd packages/odysseus-app && npx vitest
```

## Monorepo Structure

- **`packages/odysseus-core`** — Kernel with zero external dependencies. Brain systems, memory, evolution, synapse protocol.
- **`packages/odysseus-app`** — Application layer. Orchestrator, LLM providers, persona engine, CLI, API server, plugins.

## License

MIT
