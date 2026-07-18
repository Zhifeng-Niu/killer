# Odysseus v2 Spike — Iteration 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hand-write the Iteration 0 seed (~530 LOC) — a focused coding agent with GLM-5.2 + minimal Cerebellum (engineer strategy, tsc-only verify), enabling co-evolution from Iteration 1 onward.

**Architecture:** Single TypeScript ESM package, strict mode. Five directories: `agent/`, `llm/`, `tools/`, `cerebellum/`, `trace/`. Every multi-step code change flows through waypoint → checkpoint → strategy → act → verify → commit/rollback. JSONL trace is the spike's core data asset.

**Tech Stack:** TypeScript 5, ESM, Node 22, GLM-5.2 (OpenAI-compatible), vitest, undici, `child_process.execFile` (never `exec`), git.

**Safety constraint (read before editing any task):** Every subprocess call goes through `src/util/exec.ts` (built in Task 7). Never call `child_process.exec()` — the safety hook will reject it. Pass arguments as `string[]`, never as a shell command string.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` | Base config |
| `src/llm/provider.ts` | LLMProvider interface, ChatMessage, ToolCall, LLMCompletion |
| `src/llm/retry.ts` | Exponential backoff with shouldRetry filter |
| `src/llm/glm.ts` | GLM-5.2 OpenAI-compatible implementation |
| `src/tools/types.ts`, `src/tools/registry.ts` | Tool interface + dispatch registry |
| `src/util/exec.ts` | `execFileNoThrow` — structured subprocess output, no shell, no throws |
| `src/tools/file.ts` | file-read / file-write / file-edit (exact-string replace) |
| `src/tools/git.ts` | git wrapper via execFileNoThrow |
| `src/cerebellum/waypoint.ts` | Waypoint primitive (id, goal, strategy, lifecycle) |
| `src/cerebellum/checkpoint.ts` | git commit wrapper returning SHA |
| `src/cerebellum/rollback.ts` | git reset --hard with session-scoped safety |
| `src/cerebellum/verify.ts` | tsc syntax gate (Iteration 0 baseline) |
| `src/cerebellum/strategy.ts` | engineer-only strategy selector |
| `src/trace/jsonl.ts` | append/read JSONL with defensive parsing |
| `src/cerebellum/orchestrator.ts` | SACRED: wires all primitives; manual review required |
| `src/agent/context.ts`, `src/agent/prompt.ts`, `src/agent/loop.ts` | Outer perceive-reason-act loop |
| `src/index.ts`, `src/config.ts` | argv entry + env-var config loader |
| `README.md`, `CLAUDE.md`, `LICENSE` | docs |

---

### Task 1: Migration — Tag v1-final and Clear the Workspace

**Files:**
- Read: `packages/` (current v1 source tree)
- Read: `git status`, `git log`
- Tag: `v1-final`
- Delete: `packages/`, `PROPOSAL-*.md`, `CLAUDE.md`, `odysseus.mjs`, `build.mjs`, `clean.mjs`, `tsconfig.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`

- [ ] **Step 1: Check working tree status**

Run: `git status`
Expected: shows modified files (LLM providers, etc.). These will be discarded since v2 starts fresh — confirm this is intended.

- [ ] **Step 2: Commit or stash pending v1 work**

For a clean `v1-final` tag, commit pending work:

```bash
git add -A
git commit -m "chore: v1 final tactical state before v2 spike" --allow-empty
```

If you prefer to keep v1 modifications unstaged for archaeology, stash instead: `git stash push -u -m "v1-modifications-pre-spike"`.

- [ ] **Step 3: Tag v1-final (safety net)**

```bash
git tag -a v1-final -m "v1 final state before v2 spike (2026-07-18)"
git push origin v1-final || echo "no remote — local tag only"
```

The tag is the rollback target. If spike fails: `git reset --hard v1-final`.

- [ ] **Step 4: Verify tag is restorable**

```bash
git tag --list v1-final
git rev-parse v1-final
```

Expected: tag exists and resolves to a SHA.

- [ ] **Step 5: Delete v1 source tree**

```bash
rm -rf packages/
rm -f PROPOSAL-*.md CLAUDE.md odysseus.mjs build.mjs clean.mjs
rm -f tsconfig.json pnpm-workspace.yaml pnpm-lock.yaml
rm -rf docs/*
rm -rf node_modules/
```

Then restore the spike artifacts that must survive:

```bash
git checkout v1-final -- docs/superpowers/
git checkout v1-final -- LICENSE 2>/dev/null || true
```

- [ ] **Step 6: Commit the migration**

```bash
git add -A
git commit -m "feat: v2 spike phase — clear v1 workspace (tag v1-final as safety net)"
```

---

### Task 2: Base Configuration Files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "odysseus",
  "version": "0.1.0",
  "description": "Cerebellum-driven self-bootstrapping coding agent — Spike Phase",
  "type": "module",
  "engines": { "node": ">=22" },
  "bin": {
    "odysseus": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "undici": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
```

- [ ] **Step 4: Write `.env.example`**

```bash
# Odysseus Spike Phase — environment variables
# Copy to .env and fill in your values

# Required: GLM-5.2 API key (from open.bigmodel.cn)
ODYSSEUS_LLM_API_KEY=

# Optional: Model name (default: glm-5.2)
ODYSSEUS_LLM_MODEL=glm-5.2

# Optional: API endpoint (default: https://open.bigmodel.cn/api/paas/v4)
ODYSSEUS_LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# Optional: Debug logging (default: false)
ODYSSEUS_DEBUG=false
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.odysseus/trace.jsonl
coverage/
.vitest-cache/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created.

- [ ] **Step 7: Verify TypeScript compiles (empty src)**

```bash
mkdir -p src
npm run typecheck
```

Expected: no errors (empty src compiles cleanly).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore
git commit -m "feat: spike base config — TypeScript ESM strict, vitest, GLM-5.2 env"
```

---

### Task 3: LLM Provider Interface

**Files:**
- Create: `src/llm/provider.ts`
- Test: `tests/unit/llm-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm-provider.test.ts
import { describe, test, expect } from 'vitest';
import type { LLMProvider, LLMCompletion, LLMCompleteOptions } from '../../src/llm/provider.js';

describe('LLMProvider interface contract', () => {
  test('LLMCompletion has the required shape', () => {
    const completion: LLMCompletion = {
      content: 'hello',
      model: 'glm-5.2',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    };
    expect(completion.content).toBe('hello');
    expect(completion.usage.inputTokens).toBe(10);
  });

  test('LLMCompleteOptions allows tools and history', () => {
    const opts: LLMCompleteOptions = {
      model: 'glm-5.2',
      maxTokens: 1024,
      temperature: 0.7,
      tools: [],
      history: [{ role: 'user', content: 'hi' }],
    };
    expect(opts.maxTokens).toBe(1024);
  });

  test('LLMProvider interface is structurally complete', () => {
    const provider: LLMProvider = {
      async complete() {
        return {
          content: '',
          model: 'mock',
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        };
      },
      async *stream() {
        yield '';
      },
      getModel() {
        return 'mock';
      },
    };
    expect(provider.getModel()).toBe('mock');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/llm-provider.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/provider.js'`.

- [ ] **Step 3: Write the provider interface**

```typescript
// src/llm/provider.ts

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMCompleteOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  history?: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LLMFinishReason = 'stop' | 'length' | 'tool_calls' | 'error';

export interface LLMCompletion {
  content: string;
  model: string;
  usage: LLMUsage;
  finishReason: LLMFinishReason;
  toolCalls?: ToolCall[];
}

export interface LLMProvider {
  complete(prompt: string, options?: LLMCompleteOptions): Promise<LLMCompletion>;
  stream(prompt: string, options?: LLMCompleteOptions): AsyncIterable<string>;
  getModel(): string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/llm-provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/provider.ts tests/unit/llm-provider.test.ts
git commit -m "feat(llm): provider interface — LLMProvider, ChatMessage, ToolCall, LLMCompletion"
```

---

### Task 4: LLM Retry with Exponential Backoff

**Files:**
- Create: `src/llm/retry.ts`
- Test: `tests/unit/llm-retry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm-retry.test.ts
import { describe, test, expect, vi } from 'vitest';
import { withRetry } from '../../src/llm/retry.js';

describe('withRetry', () => {
  test('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'));
    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('does not retry when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        shouldRetry: (err) => !err.message.includes('non-retryable'),
      })
    ).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/llm-retry.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/retry.js'`.

- [ ] **Step 3: Write the retry implementation**

```typescript
// src/llm/retry.ts

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number) => void;
}

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504')
    );
  }
  return true;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxDelay = options.maxDelayMs ?? 30_000;
  const shouldRetry = options.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= options.maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      options.onRetry?.(err, attempt);
      const delay = Math.min(maxDelay, options.baseDelayMs * 2 ** (attempt - 1));
      const jittered = Math.random() * delay;
      await sleep(jittered);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/llm-retry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/retry.ts tests/unit/llm-retry.test.ts
git commit -m "feat(llm): exponential backoff retry with shouldRetry filter"
```

---

### Task 5: GLM-5.2 Provider (OpenAI-compatible)

**Files:**
- Create: `src/llm/glm.ts`
- Test: `tests/unit/llm-glm.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/llm-glm.test.ts
import { describe, test, expect, vi, afterEach } from 'vitest';
import { GLMProvider } from '../../src/llm/glm.js';

describe('GLMProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('getModel returns configured model', () => {
    const provider = new GLMProvider({
      apiKey: 'test-key',
      model: 'glm-5.2',
      baseUrl: 'https://example.com/api/paas/v4',
    });
    expect(provider.getModel()).toBe('glm-5.2');
  });

  test('complete sends OpenAI-compatible request and parses response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-1',
        model: 'glm-5.2',
        choices: [
          {
            message: { role: 'assistant', content: 'hello world' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      }),
    } as unknown as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const provider = new GLMProvider({
      apiKey: 'test-key',
      model: 'glm-5.2',
      baseUrl: 'https://example.com/api/paas/v4',
    });

    const result = await provider.complete('Say hello');

    expect(result.content).toBe('hello world');
    expect(result.model).toBe('glm-5.2');
    expect(result.usage.inputTokens).toBe(5);
    expect(result.usage.outputTokens).toBe(2);
    expect(result.finishReason).toBe('stop');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.com/api/paas/v4/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('glm-5.2');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Say hello' });
  });

  test('complete throws LLMError on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid api key',
    } as unknown as Response);

    const provider = new GLMProvider({
      apiKey: 'bad',
      model: 'glm-5.2',
      baseUrl: 'https://example.com/api/paas/v4',
    });

    await expect(provider.complete('hi')).rejects.toThrow(/GLM API 401/);
  });

  test('stream yields chunks from SSE response', async () => {
    const encoder = new TextEncoder();
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"hel"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    } as unknown as Response);

    const provider = new GLMProvider({
      apiKey: 'test-key',
      model: 'glm-5.2',
      baseUrl: 'https://example.com/api/paas/v4',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.stream('hi')) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('hello');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/llm-glm.test.ts`
Expected: FAIL — `Cannot find module '../../src/llm/glm.js'`.

- [ ] **Step 3: Write the GLM provider**

```typescript
// src/llm/glm.ts
import type {
  LLMProvider,
  LLMCompletion,
  LLMCompleteOptions,
  ChatMessage,
  ToolCall,
} from './provider.js';
import { withRetry } from './retry.js';

export interface GLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  maxTokensDefault?: number;
  temperatureDefault?: number;
  requestTimeoutMs?: number;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

interface OpenAIChoice {
  message?: {
    role: string;
    content?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  delta?: { content?: string };
  finish_reason?: string;
  index: number;
}

interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class GLMProvider implements LLMProvider {
  private readonly config: Required<GLMConfig>;

  constructor(config: GLMConfig) {
    this.config = {
      maxTokensDefault: 4096,
      temperatureDefault: 0.7,
      requestTimeoutMs: 60_000,
      ...config,
    };
  }

  getModel(): string {
    return this.config.model;
  }

  async complete(prompt: string, options?: LLMCompleteOptions): Promise<LLMCompletion> {
    const body = this.buildRequestBody(prompt, options, false);
    return withRetry(
      async () => {
        const response = await this.fetchEndpoint('/chat/completions', body);
        return this.parseCompletionResponse(response);
      },
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        shouldRetry: (err) => {
          if (err instanceof LLMError) {
            return err.status >= 500 || err.status === 429;
          }
          return true;
        },
      }
    );
  }

  async *stream(prompt: string, options?: LLMCompleteOptions): AsyncIterable<string> {
    const body = this.buildRequestBody(prompt, options, true);
    const response = await this.fetchEndpoint('/chat/completions', body);

    if (!response.ok) {
      const text = await response.text();
      throw new LLMError(`GLM API ${response.status}`, response.status, text);
    }
    if (!response.body) {
      throw new LLMError('GLM stream: empty body', 0, '');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const parsed = JSON.parse(payload) as OpenAIResponse;
            const delta = parsed.choices[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(
    prompt: string,
    options: LLMCompleteOptions | undefined,
    stream: boolean
  ): Record<string, unknown> {
    const messages: ChatMessage[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    if (options?.history?.length) {
      messages.push(...options.history);
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model: options?.model ?? this.config.model,
      messages,
      stream,
      temperature: options?.temperature ?? this.config.temperatureDefault,
      max_tokens: options?.maxTokens ?? this.config.maxTokensDefault,
    };

    if (options?.tools?.length) {
      body.tools = options.tools;
      if (options.toolChoice) {
        body.tool_choice = options.toolChoice;
      }
    }

    return body;
  }

  private async fetchEndpoint(
    path: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseCompletionResponse(response: Response): Promise<LLMCompletion> {
    if (!response.ok) {
      const text = await response.text();
      throw new LLMError(`GLM API ${response.status}`, response.status, text);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];
    if (!choice) {
      throw new LLMError('GLM API: no choices in response', 0, JSON.stringify(data));
    }

    const message = choice.message;
    const toolCalls = message?.tool_calls?.map((tc): ToolCall => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));

    return {
      content: message?.content ?? '',
      model: data.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      finishReason: (choice.finish_reason as LLMCompletion['finishReason']) ?? 'stop',
      toolCalls,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/llm-glm.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/glm.ts tests/unit/llm-glm.test.ts
git commit -m "feat(llm): GLM-5.2 OpenAI-compatible provider with SSE streaming"
```

---

### Task 6: Tool Interface and Registry

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/registry.ts`
- Test: `tests/unit/tool-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tool-registry.test.ts
import { describe, test, expect } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { Tool, ToolContext, ToolResult } from '../../src/tools/types.js';

const makeTool = (name: string, result: string): Tool => ({
  name,
  description: `${name} tool`,
  parameters: {
    type: 'object',
    properties: { input: { type: 'string' } },
    required: ['input'],
  },
  async execute(_args: { input: string }, _ctx: ToolContext): Promise<ToolResult> {
    return { ok: true, value: result };
  },
});

describe('ToolRegistry', () => {
  test('register and dispatch by name', async () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('echo', 'echoed'));

    const result = await registry.dispatch('echo', { input: 'hi' }, { cwd: '/tmp' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('echoed');
  });

  test('unknown tool returns error result', async () => {
    const registry = new ToolRegistry();
    const result = await registry.dispatch('missing', {}, { cwd: '/tmp' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown tool/i);
  });

  test('list returns tool specs for LLM', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('echo', 'x'));
    registry.register(makeTool('cat', 'y'));

    const specs = registry.listSpecs();
    expect(specs).toHaveLength(2);
    expect(specs[0]).toEqual({
      type: 'function',
      function: {
        name: 'echo',
        description: 'echo tool',
        parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
      },
    });
  });

  test('dispatch catches tool errors and returns structured error', async () => {
    const registry = new ToolRegistry();
    const failing: Tool = {
      name: 'fail',
      description: 'always fails',
      parameters: { type: 'object', properties: {} },
      async execute() {
        throw new Error('boom');
      },
    };
    registry.register(failing);

    const result = await registry.dispatch('fail', {}, { cwd: '/tmp' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tool-registry.test.ts`
Expected: FAIL — `Cannot find module '../../src/tools/registry.js'`.

- [ ] **Step 3: Write the tool types**

```typescript
// src/tools/types.ts
import type { ToolSpec } from '../llm/provider.js';

export interface ToolContext {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ToolResultOk {
  ok: true;
  value: string;
}

export interface ToolResultErr {
  ok: false;
  error: string;
}

export type ToolResult = ToolResultOk | ToolResultErr;

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export type { ToolSpec };
```

- [ ] **Step 4: Write the registry**

```typescript
// src/tools/registry.ts
import type { Tool, ToolContext, ToolResult, ToolSpec } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listSpecs(): ToolSpec[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async dispatch(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/tool-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/tools/types.ts src/tools/registry.ts tests/unit/tool-registry.test.ts
git commit -m "feat(tools): Tool interface and dispatch registry with structured errors"
```

---

### Task 7: execFile Wrapper Utility

**Files:**
- Create: `src/util/exec.ts`
- Test: `tests/unit/util-exec.test.ts`

**Why this task exists:** `child_process.exec(command: string)` parses the command through a shell, exposing every caller to command injection. `execFile(file, args[])` bypasses the shell entirely. Cerebellum needs subprocess output without exceptions interrupting flow, so we wrap `execFile` to always resolve with a structured `ExecResult`. **All subsequent tasks that need subprocess access must import this module — never call `child_process.exec` directly.**

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/util-exec.test.ts
import { describe, test, expect } from 'vitest';
import { execFileNoThrow } from '../../src/util/exec.js';

describe('execFileNoThrow', () => {
  test('returns stdout on success', async () => {
    const result = await execFileNoThrow('node', ['-e', 'process.stdout.write("hi")']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hi');
    expect(result.stderr).toBe('');
  });

  test('captures stderr and exit code on non-zero exit', async () => {
    const result = await execFileNoThrow('node', [
      '-e',
      'process.stderr.write("oops"); process.exit(2)',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('oops');
  });

  test('does not throw — errors become structured results', async () => {
    const result = await execFileNoThrow('this-binary-does-not-exist', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/this-binary-does-not-exist|ENOENT/i);
  });

  test('passes cwd and env through to child process', async () => {
    const result = await execFileNoThrow(
      'node',
      ['-e', 'process.stdout.write(process.env.TEST_VAR ?? "")'],
      { env: { ...process.env, TEST_VAR: 'injected' } }
    );
    expect(result.stdout).toBe('injected');
  });

  test('respects timeoutMs option', async () => {
    const start = Date.now();
    const result = await execFileNoThrow('node', ['-e', 'setTimeout(()=>{}, 5000)'], {
      timeoutMs: 100,
    });
    const elapsed = Date.now() - start;
    expect(result.exitCode).not.toBe(0);
    expect(elapsed).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/util-exec.test.ts`
Expected: FAIL — `Cannot find module '../../src/util/exec.js'`.

- [ ] **Step 3: Write the exec wrapper**

```typescript
// src/util/exec.ts
import { execFile } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  args: readonly string[];
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB

export function execFileNoThrow(
  file: string,
  args: readonly string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        timeout: options.timeoutMs,
        signal: options.signal,
      },
      (err, stdout, stderr) => {
        if (err) {
          const errnoCode = (err as NodeJS.ErrnoException).code;
          resolve({
            exitCode: typeof err.code === 'number' ? err.code : -1,
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr:
              typeof stderr === 'string'
                ? stderr
                : `${errnoCode ?? 'error'}: ${err.message}`,
            command: file,
            args,
          });
        } else {
          resolve({
            exitCode: 0,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            command: file,
            args,
          });
        }
      }
    );
    if (options.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          child.kill('SIGTERM');
        },
        { once: true }
      );
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/util-exec.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/util/exec.ts tests/unit/util-exec.test.ts
git commit -m "feat(util): execFileNoThrow wrapper — structured output, no shell, no throws"
```

---

### Task 8: File Tools (read, write, edit)

**Files:**
- Create: `src/tools/file.ts`
- Test: `tests/unit/tools-file.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tools-file.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileReadTool, FileWriteTool, FileEditTool } from '../../src/tools/file.js';

describe('file tools', () => {
  let workdir: string;
  const writeTool = new FileWriteTool();

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-test-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('file-write writes content to a file', async () => {
    const path = join(workdir, 'hello.txt');
    const result = await writeTool.execute({ path, content: 'hello' }, { cwd: workdir });
    expect(result.ok).toBe(true);
    const written = await readFile(path, 'utf8');
    expect(written).toBe('hello');
  });

  test('file-read reads file content', async () => {
    const path = join(workdir, 'read.txt');
    await writeTool.execute({ path, content: 'data' }, { cwd: workdir });
    const tool = new FileReadTool();
    const result = await tool.execute({ path }, { cwd: workdir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('data');
  });

  test('file-read returns error on missing file', async () => {
    const tool = new FileReadTool();
    const result = await tool.execute({ path: join(workdir, 'nope.txt') }, { cwd: workdir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no such file|ENOENT/i);
  });

  test('file-edit replaces exact string match', async () => {
    const path = join(workdir, 'edit.txt');
    await writeTool.execute({ path, content: 'foo bar baz' }, { cwd: workdir });
    const tool = new FileEditTool();
    const result = await tool.execute(
      { path, oldString: 'bar', newString: 'qux' },
      { cwd: workdir }
    );
    expect(result.ok).toBe(true);
    const updated = await readFile(path, 'utf8');
    expect(updated).toBe('foo qux baz');
  });

  test('file-edit errors when oldString not found', async () => {
    const path = join(workdir, 'edit2.txt');
    await writeTool.execute({ path, content: 'unchanged' }, { cwd: workdir });
    const tool = new FileEditTool();
    const result = await tool.execute(
      { path, oldString: 'missing', newString: 'whatever' },
      { cwd: workdir }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });

  test('file-edit errors on ambiguous (multiple) match', async () => {
    const path = join(workdir, 'ambig.txt');
    await writeTool.execute({ path, content: 'x x x' }, { cwd: workdir });
    const tool = new FileEditTool();
    const result = await tool.execute(
      { path, oldString: 'x', newString: 'y' },
      { cwd: workdir }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/multiple|ambiguous/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tools-file.test.ts`
Expected: FAIL — `Cannot find module '../../src/tools/file.js'`.

- [ ] **Step 3: Write file tools**

```typescript
// src/tools/file.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Tool, ToolContext, ToolResult } from './types.js';

export class FileReadTool implements Tool {
  readonly name = 'file-read';
  readonly description = 'Read the contents of a file at the given path (UTF-8).';
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or cwd-relative path to read' },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const path = String(args.path ?? '');
    if (!path) return { ok: false, error: 'path required' };
    try {
      const content = await readFile(path, 'utf8');
      return { ok: true, value: content };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class FileWriteTool implements Tool {
  readonly name = 'file-write';
  readonly description = 'Write content to a file, creating parent directories if needed.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to write' },
      content: { type: 'string', description: 'Full content to write' },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const path = String(args.path ?? '');
    const content = String(args.content ?? '');
    if (!path) return { ok: false, error: 'path required' };
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
      return { ok: true, value: `wrote ${content.length} bytes to ${path}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class FileEditTool implements Tool {
  readonly name = 'file-edit';
  readonly description =
    'Replace the single occurrence of oldString with newString. Errors if zero or multiple matches.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
    },
    required: ['path', 'oldString', 'newString'],
  };

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const path = String(args.path ?? '');
    const oldString = String(args.oldString ?? '');
    const newString = String(args.newString ?? '');
    if (!path || !oldString) return { ok: false, error: 'path and oldString required' };

    try {
      const original = await readFile(path, 'utf8');
      const occurrences = original.split(oldString).length - 1;
      if (occurrences === 0) {
        return { ok: false, error: `oldString not found in ${path}` };
      }
      if (occurrences > 1) {
        return {
          ok: false,
          error: `oldString ambiguous: ${occurrences} matches in ${path}. Use file-write or include more context.`,
        };
      }
      const updated = original.replace(oldString, newString);
      await writeFile(path, updated, 'utf8');
      return { ok: true, value: `edited ${path}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tools-file.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/file.ts tests/unit/tools-file.test.ts
git commit -m "feat(tools): file-read, file-write, file-edit (exact-string replacement)"
```

---

### Task 9: Git Tool

**Files:**
- Create: `src/tools/git.ts`
- Test: `tests/unit/tools-git.test.ts`

**Note:** This tool uses `execFileNoThrow` from `src/util/exec.ts` (Task 7). Never call `child_process.exec` here — the safety hook will reject it.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tools-git.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileNoThrow } from '../../src/util/exec.js';
import { GitTool } from '../../src/tools/git.js';

async function initRepo(dir: string): Promise<void> {
  await execFileNoThrow('git', ['init'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.email', 'test@test.test'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

describe('GitTool', () => {
  let workdir: string;
  let tool: GitTool;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-git-'));
    await initRepo(workdir);
    tool = new GitTool();
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('commit creates a commit and returns its SHA', async () => {
    await writeFile(join(workdir, 'a.txt'), 'a');
    const result = await tool.execute(
      { operation: 'commit', message: 'first', addAll: true },
      { cwd: workdir }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatch(/^[0-9a-f]{7,40}$/);
  });

  test('log returns recent commit messages', async () => {
    await writeFile(join(workdir, 'b.txt'), 'b');
    await tool.execute({ operation: 'commit', message: 'commit one', addAll: true }, { cwd: workdir });
    await writeFile(join(workdir, 'b.txt'), 'bb');
    await tool.execute({ operation: 'commit', message: 'commit two', addAll: true }, { cwd: workdir });

    const result = await tool.execute({ operation: 'log', limit: 5 }, { cwd: workdir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('commit two');
      expect(result.value).toContain('commit one');
    }
  });

  test('reset --hard to a previous SHA', async () => {
    await writeFile(join(workdir, 'c.txt'), 'c');
    const first = await tool.execute(
      { operation: 'commit', message: 'first', addAll: true },
      { cwd: workdir }
    );
    const firstSha = first.ok ? first.value.trim() : '';
    await writeFile(join(workdir, 'c.txt'), 'changed');
    await tool.execute({ operation: 'commit', message: 'second', addAll: true }, { cwd: workdir });

    const result = await tool.execute(
      { operation: 'reset', target: firstSha, hard: true },
      { cwd: workdir }
    );
    expect(result.ok).toBe(true);

    const statusResult = await tool.execute({ operation: 'status' }, { cwd: workdir });
    if (statusResult.ok) expect(statusResult.value).toContain('nothing to commit');
  });

  test('status on dirty tree shows untracked files', async () => {
    await mkdir(join(workdir, 'sub'), { recursive: true });
    await writeFile(join(workdir, 'sub', 'new.txt'), 'new');
    const result = await tool.execute({ operation: 'status' }, { cwd: workdir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatch(/sub|new\.txt/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/tools-git.test.ts`
Expected: FAIL — `Cannot find module '../../src/tools/git.js'`.

- [ ] **Step 3: Write the git tool**

```typescript
// src/tools/git.ts
import { execFileNoThrow } from '../util/exec.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

type GitOperation = 'commit' | 'log' | 'reset' | 'status' | 'rev-parse' | 'diff';

export class GitTool implements Tool {
  readonly name = 'git';
  readonly description =
    'Git wrapper. Operations: commit, log, reset, status, rev-parse, diff. Uses execFile (no shell).';
  readonly parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['commit', 'log', 'reset', 'status', 'rev-parse', 'diff'],
      },
      message: { type: 'string', description: 'commit message (operation=commit)' },
      addAll: { type: 'boolean', description: 'git add -A before commit (operation=commit)' },
      target: { type: 'string', description: 'SHA or ref (operation=reset/diff)' },
      hard: { type: 'boolean', description: '--hard flag (operation=reset)' },
      limit: { type: 'number', description: 'commit count (operation=log)' },
      rev: { type: 'string', description: 'revision (operation=rev-parse, default HEAD)' },
    },
    required: ['operation'],
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const op = String(args.operation ?? '') as GitOperation;
    try {
      switch (op) {
        case 'commit':
          return await this.commit(args, ctx);
        case 'log':
          return await this.log(args, ctx);
        case 'reset':
          return await this.reset(args, ctx);
        case 'status':
          return await this.status(ctx);
        case 'rev-parse':
          return await this.revParse(args, ctx);
        case 'diff':
          return await this.diff(args, ctx);
        default:
          return { ok: false, error: `Unknown git operation: ${op}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async commit(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const message = String(args.message ?? '');
    if (!message) return { ok: false, error: 'commit message required' };

    if (args.addAll) {
      const addResult = await execFileNoThrow('git', ['add', '-A'], { cwd: ctx.cwd });
      if (addResult.exitCode !== 0) {
        return { ok: false, error: `git add failed: ${addResult.stderr}` };
      }
    }

    const diffResult = await execFileNoThrow('git', ['diff', '--cached', '--quiet'], {
      cwd: ctx.cwd,
    });
    if (diffResult.exitCode === 0) {
      return { ok: false, error: 'nothing staged to commit' };
    }

    const commitResult = await execFileNoThrow('git', ['commit', '-m', message], {
      cwd: ctx.cwd,
    });
    if (commitResult.exitCode !== 0) {
      return { ok: false, error: `git commit failed: ${commitResult.stderr}` };
    }

    const shaResult = await execFileNoThrow('git', ['rev-parse', 'HEAD'], { cwd: ctx.cwd });
    if (shaResult.exitCode !== 0) {
      return { ok: false, error: `git rev-parse failed: ${shaResult.stderr}` };
    }

    return { ok: true, value: shaResult.stdout.trim() };
  }

  private async log(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const limit = Number(args.limit ?? 10);
    const result = await execFileNoThrow(
      'git',
      ['log', '--pretty=format:%h %s', '-n', String(Math.max(1, Math.floor(limit)))],
      { cwd: ctx.cwd }
    );
    if (result.exitCode !== 0) {
      return { ok: false, error: `git log failed: ${result.stderr}` };
    }
    return { ok: true, value: result.stdout };
  }

  private async reset(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const target = String(args.target ?? 'HEAD');
    const cmd = args.hard ? ['reset', '--hard', target] : ['reset', target];
    const result = await execFileNoThrow('git', cmd, { cwd: ctx.cwd });
    if (result.exitCode !== 0) {
      return { ok: false, error: `git reset failed: ${result.stderr}` };
    }
    return { ok: true, value: `reset to ${target}` };
  }

  private async status(ctx: ToolContext): Promise<ToolResult> {
    const result = await execFileNoThrow('git', ['status', '--porcelain'], { cwd: ctx.cwd });
    if (result.exitCode !== 0) {
      return { ok: false, error: `git status failed: ${result.stderr}` };
    }
    if (result.stdout.trim() === '') {
      return { ok: true, value: 'nothing to commit, working tree clean' };
    }
    return { ok: true, value: result.stdout };
  }

  private async revParse(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const rev = String(args.rev ?? 'HEAD');
    const result = await execFileNoThrow('git', ['rev-parse', rev], { cwd: ctx.cwd });
    if (result.exitCode !== 0) {
      return { ok: false, error: `git rev-parse failed: ${result.stderr}` };
    }
    return { ok: true, value: result.stdout.trim() };
  }

  private async diff(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const target = args.target ? String(args.target) : 'HEAD';
    const result = await execFileNoThrow('git', ['diff', '--stat', target], { cwd: ctx.cwd });
    if (result.exitCode !== 0) {
      return { ok: false, error: `git diff failed: ${result.stderr}` };
    }
    return { ok: true, value: result.stdout };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/tools-git.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tools/git.ts tests/unit/tools-git.test.ts
git commit -m "feat(tools): git wrapper (commit/log/reset/status) via execFileNoThrow"
```

---

### Task 10: Cerebellum — Waypoint Primitive

**Files:**
- Create: `src/cerebellum/waypoint.ts`
- Test: `tests/unit/cerebellum-waypoint.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-waypoint.test.ts
import { describe, test, expect } from 'vitest';
import { createWaypoint } from '../../src/cerebellum/waypoint.js';

describe('createWaypoint', () => {
  test('creates a waypoint with defaults', () => {
    const wp = createWaypoint({ goal: 'add bash tool' });
    expect(wp.id).toMatch(/^wp_/);
    expect(wp.goal).toBe('add bash tool');
    expect(wp.strategy).toBe('engineer');
    expect(wp.status).toBe('pending');
    expect(wp.iterationsUsed).toBe(0);
    expect(wp.startedAt).toBeGreaterThan(0);
  });

  test('parent waypoint id is propagated', () => {
    const parent = createWaypoint({ goal: 'parent' });
    const child = createWaypoint({ goal: 'child', parentWaypointId: parent.id });
    expect(child.parentWaypointId).toBe(parent.id);
  });

  test('waypoint id is unique across calls', () => {
    const a = createWaypoint({ goal: 'a' });
    const b = createWaypoint({ goal: 'b' });
    expect(a.id).not.toBe(b.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-waypoint.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/waypoint.js'`.

- [ ] **Step 3: Write the waypoint module**

```typescript
// src/cerebellum/waypoint.ts
export type Strategy = 'engineer' | 'creative' | 'production';
export type WaypointStatus = 'pending' | 'active' | 'success' | 'failure' | 'abandoned';

export interface Waypoint {
  id: string;
  goal: string;
  strategy: Strategy;
  status: WaypointStatus;
  startedAt: number;
  endedAt?: number;
  parentWaypointId?: string;
  checkpointSha?: string;
  iterationsUsed: number;
  failureReason?: string;
}

export interface CreateWaypointInput {
  goal: string;
  strategy?: Strategy;
  parentWaypointId?: string;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  const stamp = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, '0');
  return `wp_${stamp}${seq}`;
}

export function createWaypoint(input: CreateWaypointInput): Waypoint {
  return {
    id: nextId(),
    goal: input.goal,
    strategy: input.strategy ?? 'engineer',
    status: 'pending',
    startedAt: Date.now(),
    parentWaypointId: input.parentWaypointId,
    iterationsUsed: 0,
  };
}

export function markActive(waypoint: Waypoint): Waypoint {
  return { ...waypoint, status: 'active' };
}

export function markSuccess(waypoint: Waypoint, checkpointSha: string): Waypoint {
  return {
    ...waypoint,
    status: 'success',
    checkpointSha,
    endedAt: Date.now(),
  };
}

export function markFailure(waypoint: Waypoint, reason: string): Waypoint {
  return {
    ...waypoint,
    status: 'failure',
    failureReason: reason,
    endedAt: Date.now(),
  };
}

export function markAbandoned(waypoint: Waypoint, reason: string): Waypoint {
  return {
    ...waypoint,
    status: 'abandoned',
    failureReason: reason,
    endedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-waypoint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/waypoint.ts tests/unit/cerebellum-waypoint.test.ts
git commit -m "feat(cerebellum): waypoint primitive — id/goal/strategy/lifecycle"
```

---

### Task 11: Cerebellum — Checkpoint (Git Commit)

**Files:**
- Create: `src/cerebellum/checkpoint.ts`
- Test: `tests/unit/cerebellum-checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-checkpoint.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileNoThrow } from '../../src/util/exec.js';
import { createCheckpoint } from '../../src/cerebellum/checkpoint.js';

async function initRepo(dir: string): Promise<void> {
  await execFileNoThrow('git', ['init'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.email', 'test@test.test'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

describe('createCheckpoint', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-cp-'));
    await initRepo(workdir);
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('commits current state and returns SHA', async () => {
    await writeFile(join(workdir, 'a.txt'), 'initial');
    const result = await createCheckpoint({ cwd: workdir, label: 'wp-001-start' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  test('creates empty commit when tree is clean', async () => {
    const first = await createCheckpoint({ cwd: workdir, label: 'first' });
    expect(first.ok).toBe(true);
    const second = await createCheckpoint({ cwd: workdir, label: 'second' });
    expect(second.ok).toBe(true);
  });

  test('returns error if git is not initialized', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'ody-nogit-'));
    try {
      const result = await createCheckpoint({ cwd: empty, label: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/git|repository/i);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-checkpoint.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/checkpoint.js'`.

- [ ] **Step 3: Write the checkpoint module**

```typescript
// src/cerebellum/checkpoint.ts
import { execFileNoThrow } from '../util/exec.js';

export interface CheckpointInput {
  cwd: string;
  label: string;
  allowEmpty?: boolean;
}

export interface CheckpointOk {
  ok: true;
  sha: string;
}

export interface CheckpointErr {
  ok: false;
  error: string;
}

export type CheckpointResult = CheckpointOk | CheckpointErr;

export async function createCheckpoint(input: CheckpointInput): Promise<CheckpointResult> {
  const revParse = await execFileNoThrow(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    { cwd: input.cwd }
  );
  if (revParse.exitCode !== 0) {
    return { ok: false, error: `not a git repository: ${revParse.stderr.trim()}` };
  }

  const add = await execFileNoThrow('git', ['add', '-A'], { cwd: input.cwd });
  if (add.exitCode !== 0) {
    return { ok: false, error: `git add failed: ${add.stderr.trim()}` };
  }

  const diff = await execFileNoThrow('git', ['diff', '--cached', '--quiet'], { cwd: input.cwd });
  const nothingStaged = diff.exitCode === 0;
  const allowEmpty = input.allowEmpty ?? true;

  if (nothingStaged && !allowEmpty) {
    return { ok: false, error: 'nothing to checkpoint (empty diff)' };
  }

  const args = ['commit', '-m', `checkpoint/${input.label}`];
  if (nothingStaged && allowEmpty) {
    args.push('--allow-empty');
  }

  const commit = await execFileNoThrow('git', args, { cwd: input.cwd });
  if (commit.exitCode !== 0) {
    return { ok: false, error: `git commit failed: ${commit.stderr.trim()}` };
  }

  const sha = await execFileNoThrow('git', ['rev-parse', 'HEAD'], { cwd: input.cwd });
  if (sha.exitCode !== 0) {
    return { ok: false, error: `git rev-parse HEAD failed: ${sha.stderr.trim()}` };
  }

  return { ok: true, sha: sha.stdout.trim() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-checkpoint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/checkpoint.ts tests/unit/cerebellum-checkpoint.test.ts
git commit -m "feat(cerebellum): checkpoint — git commit wrapper returning SHA"
```

---

### Task 12: Cerebellum — Rollback (Git Reset)

**Files:**
- Create: `src/cerebellum/rollback.ts`
- Test: `tests/unit/cerebellum-rollback.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-rollback.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileNoThrow } from '../../src/util/exec.js';
import { createCheckpoint } from '../../src/cerebellum/checkpoint.js';
import { rollbackTo } from '../../src/cerebellum/rollback.js';

async function initRepo(dir: string): Promise<void> {
  await execFileNoThrow('git', ['init'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.email', 'test@test.test'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.name', 'Test'], { cwd: dir });
}

describe('rollbackTo', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-rb-'));
    await initRepo(workdir);
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('resets working tree to a previous checkpoint SHA', async () => {
    await writeFile(join(workdir, 'file.txt'), 'v1');
    const cp = await createCheckpoint({ cwd: workdir, label: 'base' });
    if (!cp.ok) throw new Error('checkpoint failed');
    const baseSha = cp.sha;

    await writeFile(join(workdir, 'file.txt'), 'v2-bad');
    await createCheckpoint({ cwd: workdir, label: 'bad' });

    const result = await rollbackTo({ cwd: workdir, sha: baseSha });
    expect(result.ok).toBe(true);

    const after = await readFile(join(workdir, 'file.txt'), 'utf8');
    expect(after).toBe('v1');
  });

  test('refuses to roll back to a SHA not in allowedShas list', async () => {
    await writeFile(join(workdir, 'x.txt'), 'x');
    const result = await rollbackTo({
      cwd: workdir,
      sha: 'abc123',
      allowedShas: ['def456'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/safety|not in|forbidden/i);
  });

  test('non-existent SHA returns git error', async () => {
    await writeFile(join(workdir, 'x.txt'), 'x');
    const result = await rollbackTo({ cwd: workdir, sha: 'deadbeef' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-rollback.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/rollback.js'`.

- [ ] **Step 3: Write the rollback module**

```typescript
// src/cerebellum/rollback.ts
import { execFileNoThrow } from '../util/exec.js';

export interface RollbackInput {
  cwd: string;
  sha: string;
  /**
   * Zeroth-law guard: when provided, the target SHA must be in this list.
   * Prevents the agent from `git reset --hard` to arbitrary history
   * (which could wipe human-authored safety fixes).
   */
  allowedShas?: readonly string[];
}

export interface RollbackOk {
  ok: true;
  sha: string;
}

export interface RollbackErr {
  ok: false;
  error: string;
}

export type RollbackResult = RollbackOk | RollbackErr;

export async function rollbackTo(input: RollbackInput): Promise<RollbackResult> {
  if (input.allowedShas && !input.allowedShas.includes(input.sha)) {
    return {
      ok: false,
      error: `safety violation: SHA ${input.sha} is not in this session's allowed list`,
    };
  }

  const exists = await execFileNoThrow('git', ['cat-file', '-t', input.sha], {
    cwd: input.cwd,
  });
  if (exists.exitCode !== 0) {
    return { ok: false, error: `unknown revision ${input.sha}: ${exists.stderr.trim()}` };
  }

  const reset = await execFileNoThrow('git', ['reset', '--hard', input.sha], {
    cwd: input.cwd,
  });
  if (reset.exitCode !== 0) {
    return { ok: false, error: `git reset failed: ${reset.stderr.trim()}` };
  }

  return { ok: true, sha: input.sha };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-rollback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/rollback.ts tests/unit/cerebellum-rollback.test.ts
git commit -m "feat(cerebellum): rollback — git reset --hard with session-scoped safety"
```

---

### Task 13: Cerebellum — Verify (TypeScript Compile Gate)

**Files:**
- Create: `src/cerebellum/verify.ts`
- Test: `tests/unit/cerebellum-verify.test.ts`

**Note:** Iteration 0 ships verify with only the syntax layer (`tsc --noEmit`). Lint, tests, and metric layers land in later iterations as the agent self-extends.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-verify.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVerify } from '../../src/cerebellum/verify.js';

describe('runVerify (syntax layer only in Iteration 0)', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-verify-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('passes when tsc reports no errors', async () => {
    await writeFile(
      join(workdir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      })
    );
    await writeFile(join(workdir, 'ok.ts'), 'export const x: number = 1;\n');

    const result = await runVerify({ cwd: workdir, layers: ['syntax'] });
    expect(result.passed).toBe(true);
    expect(result.results.syntax).toBe('pass');
  });

  test('fails when tsc reports errors', async () => {
    await writeFile(
      join(workdir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      })
    );
    await writeFile(join(workdir, 'bad.ts'), 'export const x: number = "string";\n');

    const result = await runVerify({ cwd: workdir, layers: ['syntax'] });
    expect(result.passed).toBe(false);
    expect(result.results.syntax).toBe('fail');
  });

  test('fails when tsconfig.json is missing', async () => {
    await writeFile(join(workdir, 'orphan.ts'), 'export const x = 1;\n');
    const result = await runVerify({ cwd: workdir, layers: ['syntax'] });
    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-verify.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/verify.js'`.

- [ ] **Step 3: Write the verify module**

```typescript
// src/cerebellum/verify.ts
import { execFileNoThrow } from '../util/exec.js';

export type VerifyLayer = 'syntax' | 'lint' | 'tests' | 'metric';
export type VerifyLayerResult = 'pass' | 'fail' | 'skipped';

export interface VerifyInput {
  cwd: string;
  layers: readonly VerifyLayer[];
  env?: NodeJS.ProcessEnv;
}

export interface VerifyOutput {
  passed: boolean;
  results: Record<VerifyLayer, VerifyLayerResult>;
  detail?: string;
}

export async function runVerify(input: VerifyInput): Promise<VerifyOutput> {
  const results: Record<VerifyLayer, VerifyLayerResult> = {
    syntax: 'skipped',
    lint: 'skipped',
    tests: 'skipped',
    metric: 'skipped',
  };
  const details: string[] = [];

  for (const layer of input.layers) {
    if (layer === 'syntax') {
      const r = await execFileNoThrow('npx', ['tsc', '--noEmit'], {
        cwd: input.cwd,
        env: input.env ?? process.env,
      });
      results.syntax = r.exitCode === 0 ? 'pass' : 'fail';
      if (r.exitCode !== 0) {
        details.push(`--- syntax ---\n${r.stdout}\n${r.stderr}`);
      }
    }
    // lint, tests, metric layers land in Iteration 2+ via self-extension
  }

  const passed = input.layers.every((layer) => results[layer] === 'pass');
  return {
    passed,
    results,
    detail: details.length > 0 ? details.join('\n\n') : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-verify.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/verify.ts tests/unit/cerebellum-verify.test.ts
git commit -m "feat(cerebellum): verify — tsc syntax gate (Iteration 0 baseline)"
```

---

### Task 14: Cerebellum — Strategy Selector

**Files:**
- Create: `src/cerebellum/strategy.ts`
- Test: `tests/unit/cerebellum-strategy.test.ts`

**Note:** Iteration 0 ships only the `engineer` strategy. The selector exists so Iteration 4+ can add creative/production strategies without touching the orchestrator.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-strategy.test.ts
import { describe, test, expect } from 'vitest';
import { selectStrategy, ENGINEER_STRATEGY } from '../../src/cerebellum/strategy.js';

describe('selectStrategy (Iteration 0: engineer only)', () => {
  test('returns engineer strategy by default', () => {
    const result = selectStrategy({ goal: 'add a tool', allowedStrategies: ['engineer'] });
    expect(result.name).toBe('engineer');
    expect(result.systemPrompt.length).toBeGreaterThan(0);
  });

  test('respects explicit override when allowed', () => {
    const result = selectStrategy({
      goal: 'try something different',
      requestedStrategy: 'engineer',
      allowedStrategies: ['engineer'],
    });
    expect(result.name).toBe('engineer');
  });

  test('falls back to engineer if requested strategy is not in allowed list', () => {
    const result = selectStrategy({
      goal: 'x',
      requestedStrategy: 'creative',
      allowedStrategies: ['engineer'],
    });
    expect(result.name).toBe('engineer');
  });

  test('ENGINEER_STRATEGY has expected shape', () => {
    expect(ENGINEER_STRATEGY.name).toBe('engineer');
    expect(typeof ENGINEER_STRATEGY.systemPrompt).toBe('string');
    expect(typeof ENGINEER_STRATEGY.maxIterations).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-strategy.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/strategy.js'`.

- [ ] **Step 3: Write the strategy module**

```typescript
// src/cerebellum/strategy.ts
import type { Strategy } from './waypoint.js';

export interface StrategyDefinition {
  name: Strategy;
  systemPrompt: string;
  maxIterations: number;
}

export const ENGINEER_STRATEGY: StrategyDefinition = {
  name: 'engineer',
  systemPrompt: `You are Odysseus, a coding agent in engineer orientation.
Your job is to make the requested change with surgical precision.

Rules:
1. Read the relevant files before editing.
2. Make the smallest change that achieves the goal.
3. Never disable the safety perimeter (orchestrator, package.json, tsconfig.json).
4. After every edit, run the project's verify command mentally before declaring done.
5. If you encounter unexpected behavior, prefer to investigate over assuming.

You have access to file tools and git. Use them deliberately.
When you are confident the goal is achieved, respond with the single word: DONE`,
  maxIterations: 8,
};

export interface StrategySelectionInput {
  goal: string;
  requestedStrategy?: Strategy;
  allowedStrategies?: readonly Strategy[];
  previousFailures?: readonly Strategy[];
}

export function selectStrategy(input: StrategySelectionInput): StrategyDefinition {
  const allowed = input.allowedStrategies ?? ['engineer'];
  const requested = input.requestedStrategy ?? 'engineer';

  if (allowed.includes(requested) && !input.previousFailures?.includes(requested)) {
    return ENGINEER_STRATEGY; // Only engineer exists in Iteration 0
  }
  return ENGINEER_STRATEGY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-strategy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/strategy.ts tests/unit/cerebellum-strategy.test.ts
git commit -m "feat(cerebellum): strategy selector — engineer-only in Iteration 0"
```

---

### Task 15: Trace — JSONL Writer

**Files:**
- Create: `src/trace/jsonl.ts`
- Test: `tests/unit/trace-jsonl.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/trace-jsonl.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendTrace, readTrace } from '../../src/trace/jsonl.js';

describe('trace JSONL', () => {
  let workdir: string;
  let tracePath: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-trace-'));
    tracePath = join(workdir, 'trace.jsonl');
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('appendTrace writes one JSON line per record', async () => {
    await appendTrace(tracePath, { waypoint_id: 'wp_1', outcome: 'success' });
    await appendTrace(tracePath, { waypoint_id: 'wp_2', outcome: 'failure', fail_reason: 'tsc fail' });

    const raw = await readFile(tracePath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as { waypoint_id: string; outcome: string };
    const second = JSON.parse(lines[1]!) as { waypoint_id: string; outcome: string };
    expect(first.waypoint_id).toBe('wp_1');
    expect(second.waypoint_id).toBe('wp_2');
  });

  test('readTrace returns parsed records in order', async () => {
    await appendTrace(tracePath, { waypoint_id: 'a' });
    await appendTrace(tracePath, { waypoint_id: 'b' });
    await appendTrace(tracePath, { waypoint_id: 'c' });

    const records = await readTrace(tracePath);
    expect(records.map((r) => r.waypoint_id)).toEqual(['a', 'b', 'c']);
  });

  test('readTrace on missing file returns empty array', async () => {
    const records = await readTrace(join(workdir, 'does-not-exist.jsonl'));
    expect(records).toEqual([]);
  });

  test('readTrace skips malformed lines (defensive)', async () => {
    await appendTrace(tracePath, { waypoint_id: 'good' });
    await appendFile(tracePath, 'not-json\n', 'utf8');
    await appendTrace(tracePath, { waypoint_id: 'after' });

    const records = await readTrace(tracePath);
    expect(records.map((r) => r.waypoint_id)).toEqual(['good', 'after']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/trace-jsonl.test.ts`
Expected: FAIL — `Cannot find module '../../src/trace/jsonl.js'`.

- [ ] **Step 3: Write the trace module**

```typescript
// src/trace/jsonl.ts
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface TraceRecord {
  ts: string;
  waypoint_id: string;
  goal: string;
  strategy: string;
  parent: string | null;
  outcome: 'success' | 'failure' | 'abandoned';
  checkpoint_sha: string | null;
  iterations_used: number;
  tokens_consumed: { input: number; output: number };
  verify_result: Record<string, string>;
  fail_reason: string | null;
  diff_summary: string | null;
}

export async function appendTrace(
  path: string,
  partial: Partial<TraceRecord> & { waypoint_id: string }
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const record: TraceRecord = {
    ts: new Date().toISOString(),
    waypoint_id: partial.waypoint_id,
    goal: partial.goal ?? '',
    strategy: partial.strategy ?? 'engineer',
    parent: partial.parent ?? null,
    outcome: partial.outcome ?? 'success',
    checkpoint_sha: partial.checkpoint_sha ?? null,
    iterations_used: partial.iterations_used ?? 0,
    tokens_consumed: partial.tokens_consumed ?? { input: 0, output: 0 },
    verify_result: partial.verify_result ?? {},
    fail_reason: partial.fail_reason ?? null,
    diff_summary: partial.diff_summary ?? null,
  };
  const line = JSON.stringify(record) + '\n';
  await appendFile(path, line, 'utf8');
}

export async function readTrace(path: string): Promise<TraceRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const records: TraceRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as TraceRecord);
    } catch {
      // Skip malformed line (defensive: corruption must not break the spike)
    }
  }
  return records;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/trace-jsonl.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/trace/jsonl.ts tests/unit/trace-jsonl.test.ts
git commit -m "feat(trace): JSONL append/read with defensive parsing"
```

---

### Task 16: Cerebellum — Orchestrator (Sacred File)

**Files:**
- Create: `src/cerebellum/orchestrator.ts`
- Test: `tests/unit/cerebellum-orchestrator.test.ts`

**SACRED FILE.** Edits to this file require manual review per design spec Section 6.1. The orchestrator wires waypoint → checkpoint → strategy → act (LLM↔Tool loop) → verify → commit/rollback → trace. The verify gate is hard — no LLM "confidence" can bypass it.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/cerebellum-orchestrator.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileNoThrow } from '../../src/util/exec.js';
import { CerebellumOrchestrator } from '../../src/cerebellum/orchestrator.js';
import type { LLMProvider, LLMCompletion } from '../../src/llm/provider.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { FileWriteTool } from '../../src/tools/file.js';

async function initRepo(dir: string): Promise<void> {
  await execFileNoThrow('git', ['init'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.email', 't@t.t'], { cwd: dir });
  await execFileNoThrow('git', ['config', 'user.name', 'T'], { cwd: dir });
}

function makeMockProvider(responses: string[]): LLMProvider {
  let call = 0;
  return {
    async complete(): Promise<LLMCompletion> {
      const content = responses[Math.min(call, responses.length - 1)] ?? '';
      call += 1;
      return {
        content,
        model: 'mock',
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason: 'stop',
        toolCalls: content.startsWith('{') ? undefined : undefined,
      };
    },
    async *stream() {
      yield '';
    },
    getModel() {
      return 'mock';
    },
  };
}

describe('CerebellumOrchestrator', () => {
  let workdir: string;
  let tracePath: string;
  let registry: ToolRegistry;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'ody-orch-'));
    tracePath = join(workdir, 'trace.jsonl');
    await initRepo(workdir);
    registry = new ToolRegistry();
    registry.register(new FileWriteTool());
    await writeFile(
      join(workdir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      })
    );
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  test('happy path: writes a valid file, tsc passes, commits, traces success', async () => {
    const provider = makeMockProvider([
      JSON.stringify({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'file-write',
              arguments: JSON.stringify({
                path: join(workdir, 'out.ts'),
                content: 'export const v = 1;',
              }),
            },
          },
        ],
      }),
      'DONE',
    ]);

    const orch = new CerebellumOrchestrator({
      cwd: workdir,
      provider,
      registry,
      tracePath,
      verifyLayers: ['syntax'],
    });

    const result = await orch.runWaypoint({ goal: 'add a file with const v = 1' });

    expect(result.outcome).toBe('success');
    const written = await readFile(join(workdir, 'out.ts'), 'utf8');
    expect(written).toContain('export const v = 1;');
  });

  test('failure path: tsc fails, rolls back to checkpoint', async () => {
    const provider = makeMockProvider([
      JSON.stringify({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'file-write',
              arguments: JSON.stringify({
                path: join(workdir, 'bad.ts'),
                content: 'export const v: number = "wrong";',
              }),
            },
          },
        ],
      }),
      'DONE',
    ]);

    const orch = new CerebellumOrchestrator({
      cwd: workdir,
      provider,
      registry,
      tracePath,
      verifyLayers: ['syntax'],
    });

    const result = await orch.runWaypoint({ goal: 'add broken file' });

    expect(result.outcome).toBe('failure');
    expect(result.failReason ?? '').toMatch(/syntax|tsc|verify/i);
    await expect(readFile(join(workdir, 'bad.ts'), 'utf8')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/cerebellum-orchestrator.test.ts`
Expected: FAIL — `Cannot find module '../../src/cerebellum/orchestrator.js'`.

- [ ] **Step 3: Write the orchestrator**

```typescript
// src/cerebellum/orchestrator.ts
// SACRED FILE — manual review required for any change (design spec Section 6.1).
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileNoThrow } from '../util/exec.js';
import type { LLMProvider, ChatMessage, ToolCall } from '../llm/provider.js';
import type { ToolRegistry } from '../tools/registry.js';
import {
  createWaypoint,
  markActive,
  markSuccess,
  markFailure,
  markAbandoned,
  type Waypoint,
} from './waypoint.js';
import { createCheckpoint } from './checkpoint.js';
import { rollbackTo } from './rollback.js';
import { runVerify, type VerifyLayer } from './verify.js';
import { selectStrategy } from './strategy.js';
import { appendTrace } from '../trace/jsonl.js';

export interface OrchestratorConfig {
  cwd: string;
  provider: LLMProvider;
  registry: ToolRegistry;
  tracePath: string;
  verifyLayers: readonly VerifyLayer[];
  maxIterations?: number;
}

export interface RunWaypointInput {
  goal: string;
  parentWaypointId?: string;
}

export interface RunWaypointResult {
  waypoint: Waypoint;
  outcome: 'success' | 'failure' | 'abandoned';
  checkpointSha?: string;
  failReason?: string;
  iterationsUsed: number;
  tokensConsumed: { input: number; output: number };
}

interface OrchestratorState {
  allowedShas: Set<string>;
  totalInput: number;
  totalOutput: number;
}

export class CerebellumOrchestrator {
  private readonly state: OrchestratorState = {
    allowedShas: new Set(),
    totalInput: 0,
    totalOutput: 0,
  };

  constructor(private readonly config: OrchestratorConfig) {}

  async runWaypoint(input: RunWaypointInput): Promise<RunWaypointResult> {
    const waypoint = createWaypoint({
      goal: input.goal,
      parentWaypointId: input.parentWaypointId,
    });
    const strategy = selectStrategy({ goal: input.goal });

    // CHECKPOINT
    const checkpoint = await createCheckpoint({
      cwd: this.config.cwd,
      label: `${waypoint.id}-start`,
    });
    if (!checkpoint.ok) {
      const abandoned = markAbandoned(waypoint, `checkpoint failed: ${checkpoint.error}`);
      await this.trace(abandoned, null, null);
      return {
        waypoint: abandoned,
        outcome: 'abandoned',
        failReason: abandoned.failureReason,
        iterationsUsed: 0,
        tokensConsumed: { input: 0, output: 0 },
      };
    }
    this.state.allowedShas.add(checkpoint.sha);

    // ACT — LLM ↔ Tool loop
    const active = markActive({ ...waypoint, checkpointSha: checkpoint.sha });
    const maxIter = this.config.maxIterations ?? strategy.maxIterations;

    const history: ChatMessage[] = [
      { role: 'user', content: `${strategy.systemPrompt}\n\nGoal: ${input.goal}` },
    ];

    let iterationsUsed = 0;
    let lastAssistantContent = '';

    for (let iter = 1; iter <= maxIter; iter++) {
      iterationsUsed = iter;
      const lastUserText = history[history.length - 1]?.content ?? input.goal;
      const completion = await this.config.provider.complete(lastUserText, {
        systemPrompt: strategy.systemPrompt,
        history,
      });
      this.state.totalInput += completion.usage.inputTokens;
      this.state.totalOutput += completion.usage.outputTokens;

      if (completion.toolCalls && completion.toolCalls.length > 0) {
        for (const call of completion.toolCalls) {
          history.push({
            role: 'assistant',
            content: '',
            toolCalls: [call],
          });
          const args = this.parseToolArgs(call);
          const result = await this.config.registry.dispatch(call.function.name, args, {
            cwd: this.config.cwd,
          });
          history.push({
            role: 'tool',
            content: result.ok ? result.value : `ERROR: ${result.error}`,
            toolCallId: call.id,
          });
        }
        continue;
      }

      lastAssistantContent = completion.content;
      if (completion.content.trim().toUpperCase() === 'DONE') {
        break;
      }
      history.push({ role: 'assistant', content: completion.content });
    }

    // VERIFY — hard gate, no LLM confidence can bypass
    const verify = await runVerify({
      cwd: this.config.cwd,
      layers: this.config.verifyLayers,
    });

    if (verify.passed) {
      const commit = await this.commitWaypoint(waypoint.id);
      if (!commit.ok) {
        const failed = markFailure(active, `verify passed but commit failed: ${commit.error}`);
        await this.trace(failed, checkpoint.sha, null);
        return {
          waypoint: failed,
          outcome: 'failure',
          checkpointSha: checkpoint.sha,
          failReason: failed.failureReason,
          iterationsUsed,
          tokensConsumed: { input: this.state.totalInput, output: this.state.totalOutput },
        };
      }
      const succeeded = markSuccess(active, commit.sha);
      await this.trace(succeeded, checkpoint.sha, commit.sha);
      return {
        waypoint: succeeded,
        outcome: 'success',
        checkpointSha: commit.sha,
        iterationsUsed,
        tokensConsumed: { input: this.state.totalInput, output: this.state.totalOutput },
      };
    }

    // VERIFY FAILED — rollback
    const rollback = await rollbackTo({
      cwd: this.config.cwd,
      sha: checkpoint.sha,
      allowedShas: Array.from(this.state.allowedShas),
    });
    let failReason = verify.detail ?? 'verify failed';
    if (!rollback.ok) {
      failReason = `verify failed AND rollback failed: ${rollback.error}. Original: ${failReason}`;
    }
    if (lastAssistantContent && failReason.includes('syntax')) {
      failReason = `${failReason}\nLast assistant message: ${lastAssistantContent.slice(0, 200)}`;
    }
    const failed = markFailure(active, failReason);
    await this.trace(failed, checkpoint.sha, null);
    return {
      waypoint: failed,
      outcome: 'failure',
      checkpointSha: checkpoint.sha,
      failReason,
      iterationsUsed,
      tokensConsumed: { input: this.state.totalInput, output: this.state.totalOutput },
    };
  }

  private parseToolArgs(call: ToolCall): Record<string, unknown> {
    try {
      return JSON.parse(call.function.arguments) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async commitWaypoint(
    waypointId: string
  ): Promise<{ ok: true; sha: string } | { ok: false; error: string }> {
    const add = await execFileNoThrow('git', ['add', '-A'], { cwd: this.config.cwd });
    if (add.exitCode !== 0) return { ok: false, error: add.stderr };

    const diff = await execFileNoThrow('git', ['diff', '--cached', '--quiet'], {
      cwd: this.config.cwd,
    });
    const args = ['commit', '-m', `waypoint/${waypointId}-ok`];
    if (diff.exitCode === 0) {
      args.push('--allow-empty');
    }
    const commit = await execFileNoThrow('git', args, { cwd: this.config.cwd });
    if (commit.exitCode !== 0) return { ok: false, error: commit.stderr };

    const sha = await execFileNoThrow('git', ['rev-parse', 'HEAD'], {
      cwd: this.config.cwd,
    });
    if (sha.exitCode !== 0) return { ok: false, error: sha.stderr };
    return { ok: true, sha: sha.stdout.trim() };
  }

  private async trace(
    waypoint: Waypoint,
    checkpointSha: string | null,
    successSha: string | null
  ): Promise<void> {
    await mkdir(dirname(this.config.tracePath), { recursive: true });
    await appendTrace(this.config.tracePath, {
      waypoint_id: waypoint.id,
      goal: waypoint.goal,
      strategy: waypoint.strategy,
      parent: waypoint.parentWaypointId ?? null,
      outcome:
        waypoint.status === 'success'
          ? 'success'
          : waypoint.status === 'abandoned'
            ? 'abandoned'
            : 'failure',
      checkpoint_sha: checkpointSha,
      iterations_used: waypoint.iterationsUsed,
      tokens_consumed: { input: this.state.totalInput, output: this.state.totalOutput },
      verify_result: {},
      fail_reason: waypoint.failureReason ?? null,
      diff_summary: successSha ? `committed as ${successSha}` : null,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/cerebellum-orchestrator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cerebellum/orchestrator.ts tests/unit/cerebellum-orchestrator.test.ts
git commit -m "feat(cerebellum): orchestrator — checkpoint→act→verify→commit/rollback→trace

SACRED FILE: edits require manual review (design spec Section 6.1).
Verify gate is hard; LLM confidence cannot bypass it.
Session-scoped rollback safety (allowedShas) prevents arbitrary git reset."
```

---

### Task 17: Agent Layer — Context, Prompt, Loop

**Files:**
- Create: `src/agent/context.ts`
- Create: `src/agent/prompt.ts`
- Create: `src/agent/loop.ts`
- Test: `tests/unit/agent-loop.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/agent-loop.test.ts
import { describe, test, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/prompt.js';
import { AgentContext } from '../../src/agent/context.js';

describe('agent layer', () => {
  test('buildSystemPrompt includes mission and tool list', () => {
    const prompt = buildSystemPrompt({
      mission: 'Iterate on Odysseus spike',
      availableTools: ['file-read', 'file-write', 'file-edit', 'git'],
    });
    expect(prompt).toContain('Odysseus');
    expect(prompt).toContain('file-read');
    expect(prompt).toContain('file-write');
  });

  test('AgentContext stores and retrieves messages', () => {
    const ctx = new AgentContext({ mission: 'test' });
    ctx.append({ role: 'user', content: 'hi' });
    ctx.append({ role: 'assistant', content: 'hello' });
    const messages = ctx.messages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'user', content: 'hi' });
  });

  test('AgentContext does not mutate underlying array on append', () => {
    const ctx = new AgentContext({ mission: 'test' });
    ctx.append({ role: 'user', content: 'a' });
    const before = ctx.messages();
    ctx.append({ role: 'user', content: 'b' });
    expect(before).toHaveLength(1);
    expect(ctx.messages()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/agent-loop.test.ts`
Expected: FAIL — `Cannot find module '../../src/agent/prompt.js'`.

- [ ] **Step 3: Write context, prompt, loop**

```typescript
// src/agent/context.ts
import type { ChatMessage } from '../llm/provider.js';

export interface AgentContextInit {
  mission: string;
  initialMessages?: ChatMessage[];
}

export class AgentContext {
  private readonly mission: string;
  private readonly messagesRef: ChatMessage[];

  constructor(init: AgentContextInit) {
    this.mission = init.mission;
    this.messagesRef = init.initialMessages ? [...init.initialMessages] : [];
  }

  append(message: ChatMessage): void {
    this.messagesRef.push(message);
  }

  messages(): ChatMessage[] {
    return [...this.messagesRef];
  }

  getMission(): string {
    return this.mission;
  }
}
```

```typescript
// src/agent/prompt.ts
export interface PromptInput {
  mission: string;
  availableTools: readonly string[];
}

export function buildSystemPrompt(input: PromptInput): string {
  return `You are Odysseus, a self-bootstrapping coding agent.
Your mission: ${input.mission}

You operate through a Cerebellum loop: every change is checkpointed, verified, and rolled back on failure.
You cannot disable the safety perimeter.

Available tools: ${input.availableTools.join(', ')}

When you encounter a multi-step change, the orchestrator will guide you through checkpoint → act → verify → commit/rollback.
When you are confident the goal is achieved, respond with the single word: DONE
If you cannot proceed, describe the blocker and stop.`;
}
```

```typescript
// src/agent/loop.ts
import type { LLMProvider } from '../llm/provider.js';
import { AgentContext } from './context.js';
import { buildSystemPrompt } from './prompt.js';
import { CerebellumOrchestrator } from '../cerebellum/orchestrator.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { VerifyLayer } from '../cerebellum/verify.js';

const CEREBELLUM_TRIGGERS =
  /\b(add|implement|refactor|fix|remove|change|update|modify|extend|introduce)\b/i;

export interface AgentLoopConfig {
  cwd: string;
  provider: LLMProvider;
  registry: ToolRegistry;
  tracePath: string;
  verifyLayers: readonly VerifyLayer[];
  mission: string;
}

export interface AgentLoopResult {
  response: string;
  waypointOutcome?: 'success' | 'failure' | 'abandoned';
}

export async function runAgentTurn(
  userInput: string,
  config: AgentLoopConfig
): Promise<AgentLoopResult> {
  const ctx = new AgentContext({ mission: config.mission });
  ctx.append({ role: 'user', content: userInput });

  const isCodeChange = CEREBELLUM_TRIGGERS.test(userInput);

  if (isCodeChange) {
    const orchestrator = new CerebellumOrchestrator({
      cwd: config.cwd,
      provider: config.provider,
      registry: config.registry,
      tracePath: config.tracePath,
      verifyLayers: config.verifyLayers,
    });
    const result = await orchestrator.runWaypoint({ goal: userInput });
    return {
      response:
        result.outcome === 'success'
          ? `Waypoint succeeded (${result.iterationsUsed} iterations).`
          : `Waypoint ${result.outcome}: ${result.failReason ?? 'unknown'}`,
      waypointOutcome: result.outcome,
    };
  }

  const systemPrompt = buildSystemPrompt({
    mission: config.mission,
    availableTools: config.registry.listSpecs().map((s) => s.function.name),
  });

  const completion = await config.provider.complete(userInput, { systemPrompt });
  return { response: completion.content };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/agent-loop.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/context.ts src/agent/prompt.ts src/agent/loop.ts tests/unit/agent-loop.test.ts
git commit -m "feat(agent): context, prompt builder, single-turn loop with Cerebellum trigger"
```

---

### Task 18: Entry Point and Config Loader

**Files:**
- Create: `src/index.ts`
- Create: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/config.test.ts
import { describe, test, expect } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  test('reads required env vars with correct defaults', () => {
    const config = loadConfig({
      ODYSSEUS_LLM_API_KEY: 'fake-key',
    });
    expect(config.apiKey).toBe('fake-key');
    expect(config.model).toBe('glm-5.2');
    expect(config.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(config.debug).toBe(false);
  });

  test('throws when API key is missing', () => {
    expect(() => loadConfig({})).toThrow(/API_KEY/i);
  });

  test('honors explicit overrides', () => {
    const config = loadConfig({
      ODYSSEUS_LLM_API_KEY: 'k',
      ODYSSEUS_LLM_MODEL: 'glm-4-plus',
      ODYSSEUS_LLM_BASE_URL: 'https://other.example.com/v1',
      ODYSSEUS_DEBUG: 'true',
    });
    expect(config.model).toBe('glm-4-plus');
    expect(config.baseUrl).toBe('https://other.example.com/v1');
    expect(config.debug).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/config.test.ts`
Expected: FAIL — `Cannot find module '../../src/config.js'`.

- [ ] **Step 3: Write the config loader**

```typescript
// src/config.ts
export interface OdysseusConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  debug: boolean;
}

export interface RawEnv {
  ODYSSEUS_LLM_API_KEY?: string;
  ODYSSEUS_LLM_MODEL?: string;
  ODYSSEUS_LLM_BASE_URL?: string;
  ODYSSEUS_DEBUG?: string;
}

export function loadConfig(env: RawEnv = process.env): OdysseusConfig {
  const apiKey = env.ODYSSEUS_LLM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'ODYSSEUS_LLM_API_KEY is required. Copy .env.example to .env and fill in your GLM-5.2 API key.'
    );
  }

  return {
    apiKey,
    model: env.ODYSSEUS_LLM_MODEL?.trim() || 'glm-5.2',
    baseUrl: env.ODYSSEUS_LLM_BASE_URL?.trim() || 'https://open.bigmodel.cn/api/paas/v4',
    debug: parseBool(env.ODYSSEUS_DEBUG, false),
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}
```

- [ ] **Step 4: Write the entry point**

```typescript
// src/index.ts
import { loadConfig } from './config.js';
import { GLMProvider } from './llm/glm.js';
import { ToolRegistry } from './tools/registry.js';
import { FileReadTool, FileWriteTool, FileEditTool } from './tools/file.js';
import { GitTool } from './tools/git.js';
import { runAgentTurn } from './agent/loop.js';
import { join } from 'node:path';

async function main(): Promise<void> {
  const config = loadConfig();
  const provider = new GLMProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
  });

  const registry = new ToolRegistry();
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  registry.register(new FileEditTool());
  registry.register(new GitTool());

  const cwd = process.cwd();
  const tracePath = join(cwd, '.odysseus', 'trace.jsonl');

  // Iteration 0 ships argv-only; REPL is a candidate for a later iteration
  const userInput = process.argv.slice(2).join(' ').trim();
  if (!userInput) {
    console.error('Usage: odysseus <your request>');
    console.error('Example: odysseus add a bash tool to the tools registry');
    process.exit(1);
  }

  const result = await runAgentTurn(userInput, {
    cwd,
    provider,
    registry,
    tracePath,
    verifyLayers: ['syntax'],
    mission: 'Iterate on the Odysseus spike codebase (Iteration 0 seed → co-evolution)',
  });

  console.log(result.response);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Build the project to confirm end-to-end compilation**

Run: `npm run build`
Expected: `dist/index.js` and all `dist/**/*.js` produced, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/config.ts tests/unit/config.test.ts
git commit -m "feat: entry point + config loader — GLM-5.2 + 4 tools wired into agent loop"
```

---

### Task 19: README, CLAUDE.md, and LICENSE Restore

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `LICENSE` (restore from v1-final if it existed)

- [ ] **Step 1: Restore LICENSE from v1-final (if it existed)**

```bash
git show v1-final:LICENSE > LICENSE 2>/dev/null || echo "No LICENSE in v1-final — skip this step"
```

- [ ] **Step 2: Write `README.md`**

````markdown
# Odysseus — Spike Phase

A Cerebellum-driven, self-bootstrapping coding agent.

> This is the Spike Phase of Odysseus v2. It exists to answer one question: does Cerebellum-style checkpoint → verify → rollback produce measurable capability gains when an agent edits its own code? See [`docs/superpowers/specs/2026-07-18-odysseus-restart-design.md`](docs/superpowers/specs/2026-07-18-odysseus-restart-design.md).

## Quickstart

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your GLM-5.2 API key from https://open.bigmodel.cn

# 3. Build
npm run build

# 4. Run
node dist/index.js add a bash tool to the tools registry
```

## Architecture

```
src/
├── agent/      Perceive → reason → act outer loop
├── llm/        GLM-5.2 OpenAI-compatible provider
├── tools/      File tools + git + registry
├── cerebellum/ Waypoint, checkpoint, verify, rollback, strategy, orchestrator
├── trace/      JSONL experiment log (spike data)
└── util/       execFileNoThrow (shell-free subprocess)
```

## Iteration 0 Capabilities

- GLM-5.2 (non-streaming + streaming)
- 4 tools: `file-read`, `file-write`, `file-edit`, `git`
- Minimal Cerebellum: `engineer` strategy only, `syntax` verify only
- JSONL trace

## Iteration 1+ (co-evolution)

From Iteration 1 onward, the agent uses Cerebellum to extend itself. Each iteration's waypoints are recorded as JSONL — this is the spike's core data asset, aggregated into the 3-dimensional scorecard (efficacy / breakthrough / stability).

## Commands

```bash
npm test          # Run vitest
npm run typecheck # tsc --noEmit
npm run build     # Compile to dist/
npm run dev       # Run via tsx (no build step)
```

## Safety Perimeter

Per design spec Section 6.1, the following require manual review:
- `src/cerebellum/orchestrator.ts`
- `package.json`, `tsconfig.json`, `.gitignore`

The agent may not write any `.env*` file. `git reset --hard` is restricted to SHAs created in the current session.

## License

See [LICENSE](LICENSE).
````

- [ ] **Step 3: Write `CLAUDE.md`**

```markdown
# Odysseus Spike — Codebase Guide

## Project Status

Spike Phase of Odysseus v2. Iteration 0 is hand-written; from Iteration 1 the agent uses Cerebellum to extend itself.

## Architecture

Single TypeScript ESM package, ~530 LOC at Iteration 0:
- `src/agent/` — outer loop, context, prompt builder
- `src/llm/` — GLM-5.2 provider (OpenAI-compatible), retry
- `src/tools/` — registry, file tools, git tool
- `src/cerebellum/` — waypoint, checkpoint, verify, rollback, strategy, orchestrator
- `src/trace/` — JSONL writer
- `src/util/` — `execFileNoThrow` (shell-free subprocess)

## Key Constraints

- Every file < 300 lines (violation triggers self-refactor waypoint)
- All subprocess calls go through `execFileNoThrow` — NEVER `child_process.exec` (injection risk; the safety hook will reject it)
- All LLM access through `LLMProvider` interface
- Configuration via env vars only
- Edits to `src/cerebellum/orchestrator.ts` require manual review

## Build & Test

```bash
npm run build     # tsc
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- ESM imports use `.js` extension
- No `as any` in production
- Immutability: spread, never mutate
- Errors: structured `{ ok: false, error }` or thrown with named class
```

- [ ] **Step 4: Verify everything still builds and tests**

Run: `npm run typecheck && npm test`
Expected: typecheck passes; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md LICENSE
git commit -m "docs: README, CLAUDE.md, LICENSE for v2 Spike Iteration 0"
```

- [ ] **Step 6: Final verification — full build + coverage check**

Run: `npm run build && npm test -- --coverage`
Expected: build succeeds; all tests pass; coverage on `src/` ≥ 80% lines.

- [ ] **Step 7: Verify the safety hook did not get bypassed anywhere**

Run: `grep -rn 'child_process.exec\b' src/ || echo "OK — no shell exec"`
Expected: prints `OK — no shell exec` (the only allowed import is `child_process.execFile` in `src/util/exec.ts`).

If anything other than the util import shows up, fix it before declaring Iteration 0 done.

---

## Summary

After completing all 19 tasks:

- **Lines of code**: ~530 (per design spec estimate)
- **Files**: 17 source files, 11 test files
- **Coverage**: ≥80% on `src/`
- **Capabilities**: GLM-5.2, 4 tools, minimal Cerebellum (engineer strategy, syntax verify)
- **Safety net**: `v1-final` tag; orchestrator protected; no shell exec; session-scoped rollback
- **Spike data**: every waypoint logged to `.odysseus/trace.jsonl`

From here, Iteration 1 is "add a bash tool to the tools registry" — the agent's first self-extension. That begins the co-evolution phase and starts producing JSONL records that drive the 3-dimensional scorecard (efficacy / breakthrough / stability).

---

## Self-Review Checklist

- [x] **Spec coverage**: Every section of the design spec maps to a task. Section 4 (architecture) → Tasks 3-18. Section 5 (data flow) → Task 16. Section 6 (safety) → Tasks 7, 12, 16. Section 7 (testing) → embedded across all tasks. Section 8 (Iteration 0 scope) → Tasks 1-19 are exactly the seed.
- [x] **Placeholder scan**: No "TBD" / "TODO" / "implement later". Bash tool is intentionally deferred to Iteration 1 per spec Section 8.1.
- [x] **Type consistency**: `ToolResult` shape (`{ ok: true, value } | { ok: false, error }`) used consistently across tools/registry, file tools, git tool. `ExecResult` shape consistent across util/exec, checkpoint, rollback, verify, orchestrator. `Waypoint` fields match between waypoint.ts, orchestrator.ts, and trace/jsonl.ts.
- [x] **No `child_process.exec` anywhere**: Only `execFile` is used, in `src/util/exec.ts` only. All other modules import `execFileNoThrow` from there.
- [x] **No `as any` in production code**: All type assertions use specific shapes (`as NodeJS.ErrnoException`, `as RequestInit`, etc.).
- [x] **Sacred file flagged**: Task 16 explicitly marks `orchestrator.ts` as sacred; commit message references Section 6.1.
