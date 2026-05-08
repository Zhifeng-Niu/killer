# Contributing to Killer Agent

Thank you for your interest in contributing! Here's how to get started.

## Development Setup

**Prerequisites:** Node.js >= 20, pnpm

```bash
# Clone and install
git clone https://github.com/Zhifeng-Niu/killer.git
cd killer
pnpm install

# Build
pnpm build

# Verify
pnpm test
```

## Development Workflow

```bash
# Watch mode (TypeScript)
cd packages/killer-app && npx tsc --watch

# Watch mode (tests)
cd packages/killer-app && npx vitest

# Type-check only
cd packages/killer-app && npx tsc --noEmit
cd packages/killer-core && npx tsc --noEmit
```

## Project Structure

```
killer/
├── packages/killer-core/   # Kernel: brainstem, hippocampus, cortex, synapse
├── packages/killer-app/    # Application: orchestrator, LLM, CLI, API, persona
├── killer.mjs              # Zero-config entry point
├── install.sh              # One-line installer
└── start.sh                # Docker launcher
```

## Commit Convention

```
<type>: <description>

[optional body]
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

## Pull Request Process

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes and add tests
3. Ensure all tests pass: `pnpm test`
4. Ensure type-check passes: `pnpm build`
5. Open a PR with a clear description

## Code Style

- TypeScript strict mode with ESM (`"type": "module"`)
- Imports use `.js` extension for ESM resolution
- Logger: `Logger.getInstance().child('module-name')` — never `console.log` in production
- No `as any` — use proper type narrowing
- Immutable patterns: prefer `const`, spread operators

## Testing

- All new features require tests
- Use `MockLLMProvider` for LLM-dependent tests
- Run: `pnpm test` or `pnpm test:coverage`

## Reporting Issues

- Use GitHub Issues
- Include: OS, Node.js version, steps to reproduce, expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
