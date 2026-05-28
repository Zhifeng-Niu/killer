# Odysseus Agent Framework

An AGI-level autonomous agent framework inspired by Samantha from "Her", built with a Brain+Cell fusion architecture. The system is modeled as a brain made of neuron cells — each cell is an autonomous Agent with its own DNA.

## Architecture

```
@odysseus/core (kernel)          @odysseus/app (application)
├── brainstem/loop             ├── orchestrator/
│   └── Never-stop loop          ├── agent.ts        — Central orchestrator
│     perceive→reason→act         ├── cells.ts        — Cell lifecycle
│     →reflect→evolve             ├── hooks.ts        — Lifecycle events (23 types)
├── hippocampus/               ├── middleware.ts    — Onion-model pipeline
│   └── 6-layer memory           ├── context.ts      — Smart context window
│     Working, Episodic,          ├── task-delegate   — Multi-cell delegation
│     Semantic, Procedural,       ├── tool-permissions— auto/confirm/deny sandbox
│     Prospective, Dream          └── commands.ts     — CLI command routing
├── cortex/                    ├── llm/
│   └── Darwinian evolution      ├── factory.ts      — Provider factory + resilience
│     on Skills, DNA, Prompts     ├── anthropic-provider.ts
├── synapse/                   ├── openai-provider.ts
│   └── Cell communication       ├── openrouter-provider.ts
│     send/broadcast/             └── resilience.ts   — Circuit breaker + retry
│     receive/negotiate         ├── plugins/           — Dynamic plugin loading
├── prefrontal/                ├── persona/engine.ts  — Mirror neuron + user modeling
│   └── Planning + risk           skills/manager.ts   — Dynamic skill compilation
├── consciousness/             ├── api/               — HTTP + WebSocket + SSE server
│   └── Unified event stream    ├── cli/               — Readline REPL (28+ commands)
└── brainstem/tools            ├── config/             — 5-layer config system
   └── ToolExecutor            ├── log/                — Structured module logger
                                ├── metrics/            — Counter/Gauge/Histogram
                                └── session/            — Persistent sessions
```

## Build & Test

```bash
# Build both packages (cross-platform)
pnpm build

# Bundle into self-contained CLI (esbuild — inlines @odysseus/core)
pnpm bundle

# Type-check only
cd packages/odysseus-app && npx tsc --noEmit

# Run tests
pnpm test

# Run CLI
pnpm run demo           # Demo mode (no API key)
pnpm start              # Start with TUI (default) + configured provider
pnpm start -- --cli     # Classic readline mode
node odysseus.mjs --init  # Interactive setup wizard
node packages/odysseus-app/dist/main.js --api --port 3000

# Watch mode
cd packages/odysseus-app && npx vitest
cd packages/odysseus-app && npx tsc --watch
```

## Key Design Decisions

1. **Monorepo**: `odysseus-core` is the kernel (no dependencies), `odysseus-app` is the application layer. odysseus-app imports from `@odysseus/core` via workspace symlink. No `paths` in tsconfig.

2. **CellId is an object**: `{ id: string; type: CellType; instance: number }` — not a plain string. All cell references use this shape.

3. **LLMProvider interface**: `complete(prompt, context?)`, `stream(prompt, context?)`, `getModel()`. All providers implement this. MockLLMProvider is used in tests.

4. **ResilientLLMProvider**: Wraps all non-mock providers in factory.ts with circuit breaker (closed/open/half-open) + exponential backoff retry.

5. **Configuration layering**: CLI args > env vars > project `.odysseus/config.json` > `~/.odysseus/config.json` > defaults.

6. **Plugin system**: Plugins auto-load from `.odysseus/plugins/` and `~/.odysseus/plugins/` during agent boot. They register tools and commands into the agent's execution pipeline.

7. **Middleware pipeline**: Onion model wrapping `processInput`. Built-in: input sanitization, structured logging, metrics, auth (Bearer token), rate limiting. Extensible: custom middleware.

8. **Context window**: Smart history management — recent turns kept full, old turns summarized via LLM background summarization (with non-LLM fallback), key facts extracted separately, tool results truncated.

9. **SSE streaming**: All LLM providers (Anthropic, OpenAI, OpenRouter, Gemini) implement true SSE streaming with token-by-token yield. Circuit breaker wraps all providers.

10. **Cognitive subsystem**: Emotional state engine (Russell circumplex model), autobiographical memory, predictive user model, and deep reflection are integrated into the cognitive pipeline. Persona expression adapts based on emotional state.

11. **Real web search**: Built-in WebSearchTool uses DuckDuckGo HTML search (no API key needed). No external dependencies beyond `fetch`.

12. **Session auto-save**: SessionManager tracks dirty state, triggers auto-save every 5 messages via callback injection pattern.

13. **Concurrency protection**: `processInput` uses a processing lock + FIFO queue. Concurrent calls are queued, not rejected — no user input is ever lost.

14. **Structured errors**: Custom error hierarchy (`OdysseusError` → `ValidationError`, `LLMError`, `APIError`, `ToolError`) with `code`, `recoverable`, and `timestamp` fields. Used in resilience layer and API validation responses.

15. **API rate limiting**: Per-IP sliding window (100 req/min). Applied to all endpoints except `/health`. Returns 429 with `retryAfter` when exceeded.

16. **WebSocket heartbeat**: Server pings all WS connections every 30s. Unresponsive connections are auto-cleaned. Ping/pong frames handled at protocol level.

17. **Configurable CORS**: APIServer accepts `corsOrigin` parameter. Defaults to `*` (development), set specific origin for production.

18. **Process signal handling**: SIGTERM (containers), unhandledRejection, and uncaughtException handlers ensure graceful shutdown in all scenarios.

19. **Sensory channels**: 5 channel types (CLI, Webhook, Telegram, Code/FileWatcher, Discord stub). Each extends `BaseSensoryChannel` and implements `start()/stop()/send()`. Router multiplexes inputs; OutputManager formats outputs.

20. **Command parity**: CommandHandler (sensory pipeline) and CLI (readline) both support all 34 commands. Extended deps are optional — commands gracefully report "not available" when deps are missing.

21. **WebSocket structured commands**: WS connections support `type: 'command'` messages for programmatic agent control. Commands: status, health, goals, memory, persona, emotions, narrative, predictions, skills, cells, metrics, dream, think, evolve. Query commands return synchronously; action commands (dream, think, evolve) execute asynchronously.

22. **Consciousness event type safety**: All event types and sources are declared in `EventType` and `EventSource` unions in `odysseus-core/src/consciousness/types.ts`. Production code never uses `as never` for event emissions — only for JSON deserialization of hippocampus data. New cognitive events (emotion.update, prediction.update, proactive.suggestion, narrative.update, etc.) are first-class members of the type system.

23. **Proactive suggestion humanization**: Background task `generateProactiveSuggestions` uses natural first-person language, not algorithmic patterns. Suggestion templates are randomized, emotional care is warm but non-intrusive, and relationship milestones use genuine-sounding observations. Rate-limited to one suggestion per cycle to avoid spam.

24. **Zero `as any` in production**: Production code has no `as any` type casts. Readline internal history access uses `ReadlineWithHistory` interface. Cell topology uses typed `CellId.id` access. Only `as never` remains for hippocampus JSON deserialization (3 instances).

25. **Dual-protocol provider support**: MiniMax and GLM expose both OpenAI-compatible (`/v1/chat/completions`) and Anthropic-compatible (`/anthropic/v1/messages`) endpoints on the same API key. The factory routes to `AnthropicProvider` or `OpenAICompatibleProvider` based on `config.protocol` (explicit), URL pattern detection (`/anthropic/` → anthropic), or default OpenAI. Set via `ODYSSEUS_PROTOCOL` env var. Init wizard offers protocol selection for dual-protocol providers.

26. **Consumer-grade first-run**: When no API key or config exists, `validateConfig()` auto-triggers the init wizard instead of silently falling back to mock mode. After wizard saves config, the system re-loads and connects to the real provider seamlessly.

27. **TUI (ink 7 + React 19)**: Default UI mode uses ink for declarative terminal rendering. Layout: Header (model/uptime/messages/demo badge) → Chat + Sidebar → InputArea. Sidebar auto-hides below 80 columns. Files: `src/tui/{index,app,chat-panel,sidebar,input-area,theme}.tsx`. Dependencies: ink 7, react 19, ink-text-input 6, ink-spinner 5.

28. **TUI keyboard shortcuts**: ↑↓ input history (200 items, draft preserved), Tab command completion (27 commands), Esc cancel streaming, Ctrl+C graceful shutdown (saves session). All handled via ink's `useInput` hook.

29. **TUI viewport awareness**: ChatPanel uses `useStdout()` to get terminal dimensions, estimates message height, trims old messages to keep input area visible. Shows "↑ 还有 N 条更早的消息" truncation indicator.

30. **Self-contained CLI bundle**: `pnpm bundle` uses esbuild to inline `@odysseus/core` into a single `dist/cli.js` (682KB). External deps: `react`, `ink`, `ink-spinner`, `ink-text-input` (runtime deps), `better-sqlite3` (optional native addon). `@odysseus/app`'s bin points to `dist/cli.js`. Root `odysseus.mjs` auto-detects and prefers the bundle. After `npm link`, `odysseus` command works globally from any directory.

31. **npm publishing**: `@odysseus/app` is the publishable package. `prepublishOnly` runs esbuild bundle. `@odysseus/core` is a devDependency (only needed for types/tests during development). Users install via `npm i -g @odysseus/app` or run ad-hoc via `npx @odysseus/app`. `publishConfig.access: "public"` for scoped package.

## Code Conventions

- TypeScript with ESM (`"type": "module"`), strict mode
- Imports use `.js` extension for ESM resolution
- Logger: `Logger.getInstance().child('module-name')` — never `console.log` in production code
- Metrics: `MetricsCollector.getInstance().counter('name').inc()`
- Hooks: `this.hooks.emit('event:name', { payload })`
- Errors: always catch and return structured error, never throw unhandled
- Immutability: prefer `const`, spread operators, never mutate input params

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ODYSSEUS_LLM_PROVIDER` | LLM provider (anthropic/openai/openrouter/gemini/mock + 9 Chinese providers) | anthropic |
| `ODYSSEUS_API_KEY` | API key (or provider-specific env var) | required |
| `ODYSSEUS_MODEL` | Model name override | provider default |
| `ODYSSEUS_BASE_URL` | Custom API endpoint (for openai-compatible) | provider default |
| `ODYSSEUS_PROTOCOL` | Communication protocol: openai \| anthropic (dual-protocol providers) | openai |
| `ODYSSEUS_DEBUG` | Debug logging | false |
| `ODYSSEUS_API_TOKEN` | Bearer token for API auth | none (no auth) |
| `ODYSSEUS_LOG_LEVEL` | Log level (debug/info/warn/error/silent) | info |

## CLI Commands

`/status` `/cells` `/spawn` `/plan` `/goals` `/plans` `/persona` `/skills` `/dream` `/think` `/memory` `/metrics` `/delegate` `/permissions` `/approve` `/deny` `/confirm` `/broadcast` `/report` `/plugins` `/plugin-unload` `/init` `/diagnostics` `/evolve` `/save` `/load` `/sessions` `/narrative` `/predictions` `/emotions` `/health` `/help` `/key` `/find` `/retry` `/clear` `/mission` `/stop` `/exit`

TUI keyboard: `↑↓` history (200 items) │ `Tab` command completion │ `Esc` cancel streaming │ `Ctrl+C` graceful shutdown

## API Endpoints

Health: `GET /health` `GET /health/report` (detailed module report)
Status: `GET /status` (includes cognitive state)
Chat: `POST /chat` `POST /chat/stream` (SSE)
Cells: `GET /cells` `POST /cells`
Goals: `GET /goals` `POST /goals`
Memory: `GET /memory`
Metrics: `GET /metrics`
Plugins: via PluginManager
Persona: `GET /persona`
Emotions: `GET /emotions` (emotional state)
Narrative: `GET /narrative` (autobiographical memory)
Predictions: `GET /predictions` (predictive user model)
Skills: `GET /skills`
Sessions: `GET /sessions` `POST /sessions/save` `POST /sessions/load`
Permissions: `GET /permissions` `POST /permissions/approve` `POST /permissions/deny`
Events: `GET /events` (SSE consciousness stream — includes emotion, narrative, prediction events)
Dream: `POST /dream`
Think: `POST /think`
Evolve: `POST /evolve`
Delegate: `POST /delegate`

## TUI Mode

Default interactive mode using ink (React for CLI). Started automatically unless `--cli` flag is provided.

**Layout**: Header bar → Chat panel (left, markdown rendering, streaming) + Sidebar (right, agent status/cells/memory/goals) → Input area (bottom, command support).

**Components** (`src/tui/`): `app.tsx` (main layout + command handler), `chat-panel.tsx` (messages + markdown), `sidebar.tsx` (real-time agent state), `input-area.tsx` (text input), `theme.ts` (Catppuccin colors + icons).

**Key behaviors**: Boot greeting from `generateBootGreeting()`, consciousness stream proactive suggestions, Esc to cancel streaming, 23 commands (/help /status /cells /goals /memory /emotions /persona /narrative /predictions /dream /think /evolve /spawn /delegate /diagnostics /health /metrics /sessions /save /load /mission /exit).

**Dependencies**: `ink` 7.x, `react` 19.x, `ink-text-input` 6.x, `ink-spinner` 5.x. JSX configured via `"jsx": "react-jsx"` in tsconfig.
