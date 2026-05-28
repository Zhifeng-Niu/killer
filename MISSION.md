---
orientation: engineer
status: active
started_at: 2026-05-28T09:57:23Z
expedition_branch: odyssey/20260528-175723
baseline_metric: null
best_metric: null
total_waypoints: 1
consecutive_discards: 0
---

# Mission: Runtime Self-Evolution — Agent Modifies Its Own Source, Adds Tools, Changes Architecture

## Goal

Enable Odysseus Agent to evolve at runtime by:
1. **Self-modifying source code** — Agent can write/edit its own TypeScript modules, compile, and hot-reload
2. **Adding new tools dynamically** — Agent invents new tools at runtime (not just using pre-built ones)
3. **Architectural mutation** — Agent can restructure its own module graph, add new subsystems, replace implementations

This is NOT parameter tuning or prompt engineering. This is a code-level self-evolution loop: perceive gap → reason about fix → write/modify source → compile → hot-reload → verify → continue.

## Context

Odysseus is a Brain+Cell fusion architecture with:
- **cortex/** — Darwinian evolution on Skills, DNA, Prompts (currently static config)
- **brainstem/tools/** — ToolExecutor with registered tools (currently all pre-compiled)
- **plugins/** — Dynamic plugin loading from filesystem (closest to runtime extension)
- **hippocampus/** — 6-layer memory (Procedural layer already stores learned patterns)

The plugin system is the closest existing mechanism to runtime extension, but plugins are still human-written files placed in a directory. The agent cannot create them itself.

### Key Insight

The jump from "agent uses tools" to "agent creates tools" is the same as the jump from "organism uses sticks" to "organism makes tools". This is the threshold of intentional self-improvement.

## Scope

### Modifiable
- `packages/odysseus-core/src/cortex/` — Evolution engine (currently static, needs runtime capability)
- `packages/odysseus-core/src/brainstem/tools/` — Tool system (needs self-registration API)
- `packages/odysseus-app/src/skills/` — Skill compilation (needs runtime compilation)
- `packages/odysseus-app/src/plugins/` — Plugin loading (needs in-memory plugin creation)
- New: `packages/odysseus-core/src/evolution/` — Self-modification subsystem
- New: `packages/odysseus-app/src/tools/evolution/` — Evolution-related tools

### Read-Only (PROTECTED)
- `packages/odysseus-core/src/consciousness/` — Event types must remain stable
- `packages/odysseus-core/src/synapse/` — Cell communication protocol
- Existing test files (tests define correctness)

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | cd packages/odysseus-app && npx tsc --noEmit 2>&1 | lower |
| evolution_capability_score | 0-10 | Manual eval: can agent create+register+use a new tool at runtime? | higher |
| self_modification_roundtrip | pass/fail | Agent writes code → compiles → loads → executes → verified | higher |

## Guard
```bash
cd packages/odysseus-app && npx tsc --noEmit 2>&1
```

## Termination
- Agent can successfully: (1) identify a capability gap, (2) write TypeScript source for a new tool, (3) compile it, (4) register it at runtime, (5) use it in subsequent turns
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)

## Waypoint Plan

### WP1: Architecture Research — Self-Evolution Subsystem Design
- Study existing plugin system, skill compilation, and tool registration
- Design the evolution subsystem API surface
- Identify minimal changes needed for runtime code generation + loading

### WP2: Runtime Code Compilation — TypeScript → JS at Runtime
- Implement runtime TypeScript compilation (using esbuild or ts.transpileModule)
- Sandbox compiled code for safety
- Hot-reload mechanism that doesn't crash on syntax errors

### WP3: Dynamic Tool Registration — Agent Creates Tools
- ToolDefinition builder API (name, description, parameters, execute function)
- In-memory tool registration (no filesystem required, but optional persist)
- Validation: generated tools must conform to Tool interface

### WP4: Self-Modification Loop — The Evolution Cycle
- Perceive: agent detects capability gap (failed tool call, user request for new ability)
- Reason: LLM generates TypeScript source for the new capability
- Compile: runtime transpilation + type checking
- Load: register the new tool/skill/module
- Verify: test the new capability in sandbox
- Integrate: if verified, make available; if not, rollback

### WP5: Source Code Mutation — Editing Existing Modules
- Read own source (tool to read source files)
- Targeted editing (tool to modify specific functions/modules)
- Safe reload with rollback on failure
- Diff visualization for human oversight

### WP6: Architecture Evolution — Adding/Replacing Subsystems
- Dynamic module loading beyond tools (new middleware, new cognitive processes)
- Architecture validation before applying changes
- Snapshot + rollback for architectural mutations

### WP7: Safety & Guardrails — Preventing Self-Destruction
- Mutation sandbox: never run unverified code in main process
- Core module protection: certain modules cannot be modified
- Human approval flow for high-risk mutations
- Rollback mechanism with checkpointing

### WP8: Integration Testing — End-to-End Evolution
- Scenario: agent encounters task it can't do → creates tool → uses it → succeeds
- Scenario: agent identifies inefficiency → modifies own module → improves
- Type safety verification after all mutations

## What's Been Tried

### Wins
- **WP1 (Architecture Research)**: Discovered Odysseus already has ToolForge, SelfModifyTools, EssenceForge — the building blocks for self-evolution exist but aren't connected into an autonomous loop
- **WP2-4 (SelfEvolutionEngine)**: Created the missing piece — a closed-loop engine: audit → reason (LLM) → forge (generate code) → validate → integrate → verify. 1070 lines added across 3 new files. All 759 tests pass.
- **Key insight**: The gap was NOT in low-level capabilities (ToolForge already does dynamic tool creation with hot-swap). The gap was the orchestration layer — nothing connected "I can't do X" → "let me create a tool for X" autonomously.

### Dead Ends
{Auto-updated by engine.}

### Surprises
{Unexpected findings. Auto-updated in creative mode.}

## Current Best
- metric: SelfEvolutionEngine operational — 12/12 tests pass, agent can audit gaps + evolve tools autonomously
- Baseline: No autonomous evolution loop existed before

## Ideas Backlog
{Auto-populated. Can be manually edited.}
