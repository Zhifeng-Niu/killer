# Odysseus v2 — Spike Phase Design

**Date**: 2026-07-18
**Status**: Approved (pending spec review)
**Supersedes**: v1 (current `packages/odysseus-app` + `packages/odysseus-core` monorepo, to be tagged `v1-final` and replaced)

---

## 1. Background & Motivation

### 1.1 v1 Audit Findings

Audit of v1 (95k LOC, 262 TS files) revealed:

- **Architecture is real but uneven**: Brain regions (`Cerebellum`, `Consciousness`, `Hippocampus`, etc.) are actually wired in `agent.ts:188-220`, not stubs. But value density is low — only ~15% of code is irreplaceable innovation.
- **v1/v2 limbo**: Elixir+Rust v2 was decided 2026-05-30 but never materialized beyond a single BEAM boot crash (`erl_crash.dump`). v1 has received only tactical polishing since.
- **Test debt**: 134 tests failing across 21 files (8.43% failure rate) including core e2e and context-window tests.
- **File-size violations**: `background-tasks.ts` (8116 lines), `agent.ts` (6032 lines) far exceed 800-line limit.
- **Brain metaphor overhead**: "6-layer hippocampus" is RAG + summarization with extra naming; Cell/Synapse in single-process TS adds indirection without distributed value; emotion engine is decorative.

### 1.2 Strategic Pivot

**Discard everything from v1 except the irreducible innovations**: Cerebellum experimentation mechanism, Consciousness event-bus concept (simplified), provider-protocol adaptation.

**Restart as a focused Coding Agent** where the agent's own coding ability is the foundational capability that derives all others (self-bootstrap).

### 1.3 Why Spike First?

Before committing to product-level features (TUI, multi-provider, plugin system, etc.), validate the central bet: **does Cerebellum-style checkpoint-verify-rollback produce measurable capability gains when an agent edits its own code?**

If yes → productize.
If partial → targeted remediation based on which scorecard dimension missed.
If no → publish the negative result, redirect to other approaches.

---

## 2. Goal & Success Criteria

### 2.1 Job-To-Be-Done

A coding agent where Cerebellum experimentation is the core mechanism, and where the agent uses its own coding ability to extend itself.

### 2.2 Spike Claim (Falsifiable)

> An agent equipped with Cerebellum (checkpoint → verify → rollback, with strategy selection) can iteratively improve its own codebase, producing measurable capability gains without regressions, and can self-generate capabilities it did not originally have.

### 2.3 Three-Dimensional Scorecard

Spike outcome is measured on three orthogonal dimensions, not a single pass/fail:

| Dimension | Measure | Pass Threshold |
|---|---|---|
| **Efficacy (效益)** | Either: (a) ≥3 PRs that would pass human code review without substantive comments (produced by agent self-editing), OR (b) ≥20% improvement on a fixed 10-task held-out set (tasks drawn from a curated list of small TypeScript coding problems: add-a-tool, refactor-a-function, fix-a-bug categories) | Either sub-target |
| **Breakthrough (突破)** | Agent self-designs + implements + verifies a capability that did not exist in Iteration 0 seed AND was not pre-listed as an iteration candidate in Section 8.1 (genuine novelty, not just executing the planned roadmap) | ≥1 capability |
| **Stability (稳定)** | Original test suite passes 100% across all iterations (zero regression) | 100% |

**Decision matrix at spike end**:
- 3/3 dimensions hit → Cerebellum validated → enter productization phase
- 2/3 hit → Partial validation → identify missing dimension, targeted re-investigation
- 1/3 or 0/3 hit → Bet failed → publish data, redirect

The most likely outcome is 2/3. Pre-accepting this enables rational decision-making at spike end.

---

## 3. Scope

### 3.1 In Scope (Spike Phase)

- Single TypeScript package, ESM only, strict mode
- ~300-500 line Iteration 0 seed (hand-written)
- Co-evolution: from Iteration 1 onward, agent uses Cerebellum to extend itself
- GLM-5.2 as sole LLM provider (OpenAI-compatible protocol)
- Four core tools: file-read, file-write, file-edit, git
- Minimal Cerebellum: waypoint, checkpoint, verify, rollback, strategy
- JSONL trace as spike data acquisition

### 3.2 Explicitly Out of Scope (Spike Phase)

- TUI (use CLI/REPL only)
- Multiple LLM providers (only GLM-5.2)
- Plugin system
- Session save/restore
- Persona / emotion / narrative engines (all decorative for spike)
- 6-layer hippocampus (replaced by simple conversation + project context)
- Cell / Synapse abstractions (no value in single-process)
- API server / WebSocket / SSE endpoints
- Brain metaphor naming in code
- Monorepo (core + app split)
- npm publishing

### 3.3 Reserved for Post-Spike (if Cerebellum validated)

- Additional providers (Claude, DeepSeek)
- TUI (ink-based)
- Long-term memory layer
- Skill system
- Multi-cell delegation
- npm publishing as `@odysseus/agent`

---

## 4. Architecture

### 4.1 Single Package, Five Directories

```
src/
├── agent/      Main perceive→reason→act loop
├── llm/        GLM-5.2 OpenAI-compatible client
├── tools/      File, bash, git + registry
├── cerebellum/ Five primitives: waypoint, checkpoint, verify, rollback, strategy
└── trace/      JSONL experiment log (spike data)
```

### 4.2 File Layout

```
odysseus/                            # Repo root (after v1 deletion)
├── src/
│   ├── index.ts                     # Entry: parse argv, start main loop
│   ├── agent/
│   │   ├── loop.ts                  # Main loop
│   │   ├── context.ts               # Conversation state, current waypoint
│   │   └── prompt.ts                # System prompt builder
│   ├── llm/
│   │   ├── provider.ts              # LLMProvider interface
│   │   ├── glm.ts                   # GLM-5.2 implementation
│   │   └── retry.ts                 # Exponential backoff
│   ├── tools/
│   │   ├── types.ts                 # Tool interface
│   │   ├── registry.ts              # Tool registration + dispatch
│   │   ├── file-read.ts
│   │   ├── file-write.ts
│   │   ├── file-edit.ts             # Exact-string replacement (Claude Code style)
│   │   ├── bash.ts                  # Shell execution — added in Iteration 1 (not in seed)
│   │   └── git.ts                   # git wrapper
│   ├── cerebellum/
│   │   ├── waypoint.ts              # Waypoint primitive
│   │   ├── checkpoint.ts            # git commit wrapper
│   │   ├── verify.ts                # tsc + vitest + eslint runner
│   │   ├── rollback.ts              # git reset --hard to checkpoint
│   │   ├── strategy.ts              # Strategy selector
│   │   └── orchestrator.ts          # Orchestrates the five primitives
│   └── trace/
│       └── jsonl.ts                 # Per-waypoint JSONL record
├── tests/
│   ├── unit/
│   │   ├── cerebellum.test.ts
│   │   ├── tools.test.ts
│   │   └── llm.test.ts
│   └── integration/
│       ├── self-edit.test.ts        # e2e: agent edits its own code
│       └── loop.test.ts             # Main loop e2e
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-07-18-odysseus-restart-design.md   # This document
├── package.json                     # type: "module"
├── tsconfig.json                    # strict: true
├── vitest.config.ts
├── .env.example
├── .gitignore
└── README.md
```

### 4.3 Estimated Code Volume (Iteration 0)

| Module | Lines (incl. comments) |
|---|---|
| `agent/` | ~120 |
| `llm/` | ~80 |
| `tools/` | ~150 (5 tools) |
| `cerebellum/` | ~120 (minimal five primitives) |
| `trace/` | ~30 |
| `index.ts` | ~30 |
| **Total** | **~530** |

### 4.4 Constraints

- Every file < 300 lines (violation triggers self-refactor waypoint)
- Zero-dependency preferred: HTTP via `undici` (Node built-in), git via `child_process`
- All LLM access through `LLMProvider` interface (future Claude/DeepSeek support without core changes)
- Configuration via environment variables only:
  - `ODYSSEUS_LLM_API_KEY` (required)
  - `ODYSSEUS_LLM_MODEL` (default: `glm-5.2`)
  - `ODYSSEUS_LLM_BASE_URL` (default: `https://open.bigmodel.cn/api/paas/v4`)
  - `ODYSSEUS_DEBUG` (default: false)

---

## 5. Data Flow

### 5.1 Outer Agent Loop

```
User Input
    ↓
[perceive] Parse intent: question / code edit / exploration
    ↓
[reason] LLM decides: which tools? enter waypoint?
    ↓
[act] Branch:
    ├─ Pure Q&A → LLM answers → return
    ├─ Single tool call → execute → return
    └─ Multi-step code change → enter Cerebellum loop ↓
    ↓
[reflect] Evaluate outcome, update context
```

### 5.2 Inner Cerebellum Loop

Every multi-step code change follows this exact sequence:

```
Waypoint { id, goal, strategy, parent_waypoint }
    ↓
CHECKPOINT — git add . && git commit -m "checkpoint/waypoint-{id}-start"
    ↓
STRATEGY SELECT — orientation (Iteration 0: engineer-only)
    ↓
ACT (multi-turn LLM ↔ Tool)
    while not done and iter < max:
        LLM call → tool_call
        tool_exec → result
        append to context
    ↓
VERIFY (4 layers, fail-fast):
    1. syntax  — tsc --noEmit
    2. lint    — eslint --max-warnings 0
    3. tests   — vitest run
    4. metric  — task-specific (e.g., line count, perf)
    ↓
    ├─ pass → COMMIT "waypoint-{id}-ok" + TRACE success
    └─ fail → ROLLBACK to checkpoint + TRACE failure
              ↓
              Strategy switch? → return to STRATEGY SELECT
              No switch → waypoint abandoned
```

**Critical design decision**: VERIFY is a hard gate. No LLM "confidence" can bypass it. This is what distinguishes Cerebellum from a vanilla agent loop.

### 5.3 TRACE JSONL Record Format

Every waypoint terminal state (success/failure/abandoned) appends one JSONL record:

```json
{
  "ts": "2026-07-18T14:23:01Z",
  "waypoint_id": "wp_001",
  "goal": "add bash tool to tools/registry",
  "strategy": "engineer",
  "parent": null,
  "outcome": "success",
  "checkpoint_sha": "abc1234",
  "iterations_used": 3,
  "tokens_consumed": {"input": 12450, "output": 2310},
  "verify_result": {
    "syntax": "pass",
    "lint": "pass",
    "tests": "52/52 pass",
    "metric": null
  },
  "fail_reason": null,
  "diff_summary": "+45 -12 across 3 files"
}
```

This JSONL is the spike's core data asset. All scorecard metrics aggregate from it.

### 5.4 Loop Integration Rule

When does outer loop invoke Cerebellum?

- **Enter Cerebellum**: input contains change-verbs (add/implement/refactor/fix) AND target is code
- **Skip Cerebellum**: pure Q&A, queries, single-file trivial edits

This rule is itself code the agent can improve in later iterations.

---

## 6. Error Handling

Cerebellum's verification gate replaces most error handling — failures auto-rollback rather than bubble up. Four explicit categories remain:

| Category | Source | Handling |
|---|---|---|
| **LLM failure** | Network / rate-limit / context-too-long | 3 retries with exponential backoff; persistent failure → waypoint `abandoned` |
| **Tool failure** | Non-zero exit / file-missing | Feed stderr back to LLM as next-turn context; max 5 attempts then abandon |
| **Verify failure** | tsc / eslint / vitest red | Auto-rollback, record `fail_reason`, decide strategy switch |
| **Checkpoint failure** | git operation failed (rare) | Safety net broken → terminate waypoint, alert, write crash trace |

**Principle**: Errors never propagate up, never silently swallowed. Every error becomes either a waypoint failure record or triggers a recoverable action.

### 6.1 Safety Perimeter

To prevent agent from bricking itself:

- **Manual review required** for edits to:
  - `src/cerebellum/orchestrator.ts` (the Cerebellum orchestrator itself)
  - `package.json`, `tsconfig.json`, `.gitignore`
- **Forbidden** for LLM to write:
  - Any `.env*` file
- **Restricted**:
  - `git reset --hard` only to SHAs created in current session

This is the "zeroth law" — the agent cannot disable its own safety net.

---

## 7. Testing Strategy

### 7.1 Test Pyramid

```
            ┌──────────────┐
            │  E2E (5%)    │  Agent edits its own code, full cycle
            ├──────────────┤
            │ Integration  │  Single waypoint: checkpoint → verify
            │    (20%)     │
            ├──────────────┤
            │  Unit (75%)  │  Five primitives + tools in isolation
            └──────────────┘
```

### 7.2 Key Test Cases

**Unit**:
- `checkpoint.ts`: commit succeeds / git not initialized / dirty working tree
- `verify.ts`: each of 4 layers pass/fail independently, composite failures
- `rollback.ts`: reset to checkpoint / non-existent SHA / uncommitted-changes warning
- `glm.ts`: mocked fetch → retry behavior / SSE streaming / API error codes

**Integration**:
- Create waypoint → checkpoint → simulate failure → rollback → verify state restored
- 4-layer verify behavior across constructed repo states

**E2E** (spike validation core):
- Real GLM call: agent adds a tool to a fixture project
- Verify outcome: new tool exists, tsc passes, tests pass, diff is reasonable
- Failure path: deliberately inject bad LLM output, verify rollback triggered

### 7.3 Baseline Comparison (for Efficacy Dimension)

In mid-to-late spike, run A/B comparison:

| Group | Config | Task Set |
|---|---|---|
| **Baseline** | Same code, but Cerebellum bypassed (direct LLM → apply, no checkpoint/verify/rollback) | 10 held-out small tasks |
| **Cerebellum** | Full pipeline | Same 10 tasks |

Compare: success rate, token cost, average iterations, regressions introduced.

### 7.4 Coverage Gate

- Iteration 0: ≥90% line coverage on core primitives
- Subsequent iterations: every capability addition must include tests, or verify gate fails
- This itself demonstrates Cerebellum's enforcement power

---

## 8. Co-Evolution Roadmap (Iteration Plan)

### 8.1 Iteration 0 (Hand-Written Seed, ~530 lines)

**Has**:
- GLM-5.2 client (non-streaming + streaming)
- 4 tools: file-read / file-write / file-edit / git (commit/reset/log)
- Minimal Cerebellum: `engineer` strategy only, verify = tsc only (no lint, no tests yet)
- Main loop: argv + REPL modes

**Deliberately missing** (Iteration 1+ candidates):
- bash tool → Iteration 1
- vitest integration in verify → Iteration 2
- eslint integration → Iteration 3
- Post-rollback strategy switch → Iteration 4
- Multiple orientations (creative / production) → Iteration 5
- Trace JSONL aggregator → Iteration 6
- A/B baseline comparison harness → Iteration 7

### 8.2 Why This Shape?

Seed is calibrated to "just barely runs, but lacks everything". Each Iteration N gives the agent one "add capability X" waypoint. Agent executes the Cerebellum loop — success commits, failure rolls back to try a different strategy.

These iterations' JSONL records **are the spike's core data**.

### 8.3 Iteration N Pattern

Each iteration follows this template:

1. User (or scheduler) issues waypoint: "Add capability X"
2. Agent enters Cerebellum loop
3. Checkpoint, strategy select (engineer initially), act (multi-turn LLM ↔ tool)
4. Verify (current 4-layer state)
5. Pass → commit; Fail → rollback + strategy switch
6. TRACE record appended
7. Iterate up to N attempts; abandon if all fail

---

## 9. Migration Plan (v1 → v2)

### 9.1 Pre-Migration

1. Commit any pending v1 work or stash
2. Tag current HEAD as `v1-final`: `git tag -a v1-final -m "v1 final state before v2 spike"`
3. Push tag: `git push origin v1-final`
4. Verify tag is restorable: `git checkout v1-final --dry-run`

### 9.2 Migration Steps

1. Delete v1 source: `rm -rf packages/ PROPOSAL-*.md CLAUDE.md odysseus.mjs build.mjs clean.mjs`
2. Delete v1 docs (keep `docs/superpowers/specs/`): `rm -rf docs/*` (except specs)
3. Delete v1 configs: `rm tsconfig.json pnpm-workspace.yaml pnpm-lock.yaml`
4. Reset `package.json` to minimal spike package
5. Rewrite `README.md` and `CLAUDE.md` for v2 - Spike Phase
6. Create new `src/` structure per Section 4.2
7. Create `.env.example` per Section 4.4
8. Initial commit: `feat: v2 spike phase — Iteration 0 seed`

### 9.3 Rollback Path

If spike fails entirely:
```
git reset --hard v1-final
```

If spike produces partial results worth preserving:
```
git checkout -b v2-spike-results
git checkout main
git reset --hard v1-final
# selectively cherry-pick spike insights
```

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| GLM-5.2 coding capability ceiling lower than expected | Medium | Efficacy dimension threshold can be re-calibrated; document actual ceiling in spike report |
| Agent bricks itself (modifies safety perimeter) | Low | Section 6.1 manual-review gate; CI-level enforcement |
| Iteration 0 seed wrong shape → all iterations struggle | Medium | First 3 iterations serve as calibration; if all fail, rewrite seed |
| JSONL trace insufficient for scorecard | Low | Schema is versioned; can be extended mid-spike without breaking |
| LLM cost runaway during A/B comparison | Medium | Hard cap on tokens per waypoint (e.g., 100k input); abort if exceeded |
| "Stability" dimension always 100% → uninformative | Medium | Add stress tests in later iterations that try to break stability |

---

## 11. Open Questions (to resolve in writing-plans phase)

1. **Iteration 0 seed authoring**: Solo by user? Pair with Claude? Pure Claude with user review?
2. **REPL vs argv mode**: Both in Iteration 0, or argv-only first?
3. **Waypoint trigger source**: Human-issued only? Or scheduler for autonomous iteration chains?
4. **Fixture project for E2E tests**: Use spike repo itself? Separate fixture? Both?
5. **Scorecard report cadence**: Per-iteration? Per-N-iterations? On-demand?
6. **Waypoint ID scheme**: Sequential (`wp_001`)? Goal-derived hash? UUID?

These will be settled during implementation planning, not now.

---

## 12. References

- v1 audit conversation (2026-07-18) — this session's earlier turns
- `PROPOSAL-odyssey-fusion.md` (v1, 2026-05-26) — Cerebellum original design
- Memory: `project-v2-brain-architecture.md` (2026-05-30) — superseded Elixir+Rust plan, formally invalidated by this design
- Memory: `project-odyssey-fusion.md` (2026-05-26) — historical context

---

## Appendix A: Glossary

- **Waypoint**: A single atomic improvement attempt. Has goal, strategy, and lifecycle (start → act → verify → commit/rollback).
- **Checkpoint**: A git commit marking the state before a waypoint's changes. Rollback target.
- **Verify**: 4-layer quality gate (syntax / lint / tests / metric). Fail-fast.
- **Rollback**: `git reset --hard` to last checkpoint, discarding failed changes.
- **Strategy (orientation)**: Approach flavor (engineer / creative / production). Iteration 0 has only engineer.
- **Iteration**: One cycle of self-improvement. Iteration 0 is hand-written; 1+ are agent-driven.
- **Scorecard**: Three-dimensional spike success framework (efficacy / breakthrough / stability).
