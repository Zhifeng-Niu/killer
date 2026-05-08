# Killer Agent Framework

An AGI-level autonomous agent framework inspired by Samantha from "Her", built with a Brain+Cell fusion architecture. The system is modeled as a brain made of neuron cells — each cell is an autonomous Agent with its own DNA.

## Architecture

```
@killer/core (kernel)          @killer/app (application)
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

# Type-check only
cd packages/killer-app && npx tsc --noEmit

# Run tests
pnpm test

# Run CLI
pnpm run demo           # Demo mode (no API key)
pnpm start              # Start with configured provider
node killer.mjs --init  # Interactive setup wizard
node packages/killer-app/dist/main.js --api --port 3000

# Watch mode
cd packages/killer-app && npx vitest
cd packages/killer-app && npx tsc --watch
```

## Key Design Decisions

1. **Monorepo**: `killer-core` is the kernel (no dependencies), `killer-app` is the application layer. killer-app imports from `@killer/core` via workspace symlink. No `paths` in tsconfig.

2. **CellId is an object**: `{ id: string; type: CellType; instance: number }` — not a plain string. All cell references use this shape.

3. **LLMProvider interface**: `complete(prompt, context?)`, `stream(prompt, context?)`, `getModel()`. All providers implement this. MockLLMProvider is used in tests.

4. **ResilientLLMProvider**: Wraps all non-mock providers in factory.ts with circuit breaker (closed/open/half-open) + exponential backoff retry.

5. **Configuration layering**: CLI args > env vars > project `.killer/config.json` > `~/.killer/config.json` > defaults.

6. **Plugin system**: Plugins auto-load from `.killer/plugins/` and `~/.killer/plugins/` during agent boot. They register tools and commands into the agent's execution pipeline.

7. **Middleware pipeline**: Onion model wrapping `processInput`. Built-in: input sanitization, structured logging, metrics, auth (Bearer token), rate limiting. Extensible: custom middleware.

8. **Context window**: Smart history management — recent turns kept full, old turns summarized via LLM background summarization (with non-LLM fallback), key facts extracted separately, tool results truncated.

9. **SSE streaming**: All LLM providers (Anthropic, OpenAI, OpenRouter, Gemini) implement true SSE streaming with token-by-token yield. Circuit breaker wraps all providers.

10. **Cognitive subsystem**: Emotional state engine (Russell circumplex model), autobiographical memory, predictive user model, and deep reflection are integrated into the cognitive pipeline. Persona expression adapts based on emotional state.

11. **Real web search**: Built-in WebSearchTool uses DuckDuckGo HTML search (no API key needed). No external dependencies beyond `fetch`.

12. **Session auto-save**: SessionManager tracks dirty state, triggers auto-save every 5 messages via callback injection pattern.

13. **Concurrency protection**: `processInput` uses a processing lock + FIFO queue. Concurrent calls are queued, not rejected — no user input is ever lost.

14. **Structured errors**: Custom error hierarchy (`KillerError` → `ValidationError`, `LLMError`, `APIError`, `ToolError`) with `code`, `recoverable`, and `timestamp` fields. Used in resilience layer and API validation responses.

15. **API rate limiting**: Per-IP sliding window (100 req/min). Applied to all endpoints except `/health`. Returns 429 with `retryAfter` when exceeded.

16. **WebSocket heartbeat**: Server pings all WS connections every 30s. Unresponsive connections are auto-cleaned. Ping/pong frames handled at protocol level.

17. **Configurable CORS**: APIServer accepts `corsOrigin` parameter. Defaults to `*` (development), set specific origin for production.

18. **Process signal handling**: SIGTERM (containers), unhandledRejection, and uncaughtException handlers ensure graceful shutdown in all scenarios.

19. **Sensory channels**: 5 channel types (CLI, Webhook, Telegram, Code/FileWatcher, Discord stub). Each extends `BaseSensoryChannel` and implements `start()/stop()/send()`. Router multiplexes inputs; OutputManager formats outputs.

20. **Command parity**: CommandHandler (sensory pipeline) and CLI (readline) both support all 34 commands. Extended deps are optional — commands gracefully report "not available" when deps are missing.

21. **WebSocket structured commands**: WS connections support `type: 'command'` messages for programmatic agent control. Commands: status, health, goals, memory, persona, emotions, narrative, predictions, skills, cells, metrics, dream, think, evolve. Query commands return synchronously; action commands (dream, think, evolve) execute asynchronously.

22. **Consciousness event type safety**: All event types and sources are declared in `EventType` and `EventSource` unions in `killer-core/src/consciousness/types.ts`. Production code never uses `as never` for event emissions — only for JSON deserialization of hippocampus data. New cognitive events (emotion.update, prediction.update, proactive.suggestion, narrative.update, etc.) are first-class members of the type system.

23. **Proactive suggestion humanization**: Background task `generateProactiveSuggestions` uses natural first-person language, not algorithmic patterns. Suggestion templates are randomized, emotional care is warm but non-intrusive, and relationship milestones use genuine-sounding observations. Rate-limited to one suggestion per cycle to avoid spam.

24. **Zero `as any` in production**: Production code has no `as any` type casts. Readline internal history access uses `ReadlineWithHistory` interface. Cell topology uses typed `CellId.id` access. Only `as never` remains for hippocampus JSON deserialization (3 instances).

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
| `KILLER_LLM_PROVIDER` | LLM provider (anthropic/openai/openrouter/gemini/mock) | anthropic |
| `KILLER_API_KEY` | API key (or provider-specific env var) | required |
| `KILLER_MODEL` | Model name override | provider default |
| `KILLER_DEBUG` | Debug logging | false |
| `KILLER_API_TOKEN` | Bearer token for API auth | none (no auth) |
| `KILLER_LOG_LEVEL` | Log level (debug/info/warn/error/silent) | info |

## CLI Commands

`/status` `/cells` `/spawn` `/plan` `/goals` `/plans` `/persona` `/skills` `/dream` `/think` `/memory` `/metrics` `/delegate` `/permissions` `/approve` `/deny` `/confirm` `/broadcast` `/report` `/plugins` `/plugin-unload` `/init` `/diagnostics` `/evolve` `/save` `/load` `/sessions` `/narrative` `/predictions` `/emotions` `/health` `/help` `/key` `/stop` `/exit`

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
