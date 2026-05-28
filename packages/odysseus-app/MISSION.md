---
orientation: [creative]
status: active
started_at: 2026-05-26T13:58:12Z
expedition_branch: null
baseline_metric: null
best_metric: null
total_waypoints: 11
consecutive_discards: 0
---

# Mission: 给odysseus加上一个最完美的TUI

## Goal
给odysseus加上一个最完美的TUI

## Context
Project type: typescript. Auto-detected guard: npm test 2>&1.

## Scope

### Modifiable
- (auto — all files not in Read-Only)

### Read-Only (PROTECTED)
- (none specified)

## Metrics

| Name | Unit | Measure Command | Direction |
|------|------|----------------|-----------|
| type_error_count | - | (auto-detected) | lower |

## Guard
```bash
npm test 2>&1
```

## Termination
- Task complete (all checks pass AND metric improved)
- OR stuck (10 consecutive discards)
- OR user interrupt (/odyssey-cancel)
- No iteration limit — runs until done

## What's Been Tried

### Wins
1. **ink 7 + React 19 TUI framework** — Split-pane layout: Chat + Sidebar + InputArea. 0 type errors, 1909 tests pass.
2. **Full integration** — Boot greeting, consciousness stream (proactive suggestions), command system, streaming with Esc cancel.
3. **Mode selection** — `--tui` (default) / `--cli` (classic readline) / `--api` flags.
4. **23 commands** — Full command parity with readline CLI: /status /cells /goals /memory /emotions /persona /narrative /predictions /dream /think /evolve /spawn /delegate /diagnostics /health /metrics /sessions /save /load /mission /exit.
5. **Animated spinner** — ink-spinner for thinking state, visual polish with Catppuccin color theme.
6. **Graceful exit** — /exit saves session, shows farewell with emotion emoji, clean shutdown.
7. **API key detection** — Auto-detects pasted keys (sk-, gsk_, AIza, JWT) and guides to /key command.
8. **Input history** — ↑↓ arrow navigation through last 200 inputs, draft preservation.
9. **Viewport-aware chat** — Estimates message height from terminal rows, auto-trims to keep input area visible.
10. **/key command** — Save API key to ~/.odysseus/config.json from within TUI session.
11. **Truncation indicator** — "↑ 还有 N 条更早的消息" when old messages are trimmed.
12. **Code block language labels** — Shows ```python, ```typescript etc. as header above code blocks.
13. **Tab completion** — Tab key auto-completes partial /commands.
14. **Ctrl+C graceful shutdown** — Saves session + agent.shutdown() before exit.
15. **Header message count** — Real-time message counter in header bar.
16. **Demo mode indicator** — "体验模式" badge in header when running mock provider.
17. **/find search** — Search message history by keyword, shows top 10 results with role + preview.
18. **Error border** — Error messages rendered with bold red left border for visibility.
19. **/retry and /clear** — Retry last message or clear chat display. /retry uses ref to avoid stale closure.
20. **Response duration** — Shows elapsed time (ms/s) after agent completes a response.
21. **Responsive sidebar** — Auto-hides sidebar when terminal width < 80 columns.
22. **TUI unit tests** — 19 tests covering looksLikeApiKey (12), emotionToEmoji (2), estimateMessageLines (5). 1928 total tests pass.
23. **Graceful shutdown fix** — startTUI returns ink Instance, main.ts uses waitUntilExit().then(shutdown) for proper cleanup.
24. **Header status indicator** — Shows ● 思考中/输出中/错误 in header bar when agent is active, visible even when sidebar is hidden.
25. **Code review fixes** — CRITICAL: consciousness event listener cleanup (use unsubscribe return). HIGH: /retry direct flow, AbortController leak prevention, try-catch in event handler.

#### Session 3 — Cognitive Pipeline Deep Cuts (WP90-96)

96. **Context Window Budget Optimizer** (WP90): Proportional token budget with keep/truncate/drop per section — 45 weights, MIN_SECTION_BUDGET=50
97. **Next-Turn Intent Prediction** (WP91): 9x9 transition matrix + knowledge graph influence + flow signals → predicted intent with actions
98. **Cross-Module Cognitive Feedback** (WP92): 13 interaction rules (amplify/suppress/trigger/conflict), synergy/conflict detection, health scoring
99. **Adaptive Tool Chain Orchestration** (WP93): Intent→tool chain templates (9 categories), learned pattern adjustment, step-skipping
100. **Conversation Momentum Tracking** (WP94): 5-dimension momentum (topic depth, info density, engagement, goal progress, composite) with pace advice
101. **Adaptive Persona Calibration** (WP95): 5 expression dimensions from 6 signals — formality/verbosity/empathy/technicalDepth/proactivity
102. **Proactive Knowledge Gap Detector** (WP96): Regex detection of unknown concepts, unresolved references, missing context — coverage scored, injected as KNOWLEDGE GAPS section

### Dead Ends
{None yet.}

### Surprises
- ink 7 worked seamlessly with ESM `"type": "module"` — just needed `"jsx": "react-jsx"` in tsconfig.

## Current Best
- metric: 0 type errors (improved from baseline)
- 1928 tests pass, TUI fully functional with 8 new files (7 components + 1 test)
- 27 commands, 24 UX wins, responsive layout, Catppuccin theme
- Graceful shutdown, input history, Tab completion, message search, retry, clear
- Demo mode indicator, response duration, header status, error styling
- Consciousness stream, proactive suggestions, boot greeting

## Ideas Backlog
{Auto-populated. Can be manually edited.}
