/**
 * Odysseus Agent - CLI 入口点
 *
 * 命令行启动入口
 */

import { OdysseusAgent, type AgentConfig } from './orchestrator/index.js';
import { createLLMProvider, getSupportedProviders } from './llm/factory.js';
import { OPENAI_COMPATIBLE_PROVIDERS, formatProviderError } from './llm/openai-compatible-provider.js';
import { startReadlineLoop } from './cli/index.js';
import { startTUI } from './tui/index.js';
import { APIServer } from './api/index.js';
import { registerRoutes } from './api/routes.js';
import { Logger, initTrace, getTraceFilePath } from './log/index.js';
import { loadConfig, initOdysseusDir, type OdysseusConfig } from './config/index.js';
import { loadEnvFiles } from './config/env.js';
import { runInitWizard } from './cli/init-wizard.js';
import { startDaemon, stopDaemon, showDaemonStatus } from './cli/daemon.js';

/**
 * 显示启动横幅
 */
function showBanner(config: OdysseusConfig): void {
  const B = '\x1b[1m';
  const R = '\x1b[0m';
  const CYAN = '\x1b[36m';
  const DIM = '\x1b[2m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';

  const provider = config.llm.provider;
  const model = config.llm.model || 'default';
  const isDemo = provider === 'mock';

  if (isDemo) {
    console.log('');
    console.log(`  ${B}${CYAN}🧠 Odysseus Agent${R} ${DIM}v0.1.0${R}`);
    console.log(`  ${YELLOW}体验模式${R} ${DIM}— 粘贴 Key 即可连接真实 AI:${R}`);
    console.log(`  ${DIM}输入 ${B}/key sk-xxxxx${DIM} 或重启时 ${B}--init${DIM}`);
    console.log('');
  } else {
    // 友好的 provider 名称映射
    const providerNames: Record<string, string> = {
      deepseek: 'DeepSeek',
      glm: 'GLM (智谱)',
      minimax: 'MiniMax (海螺)',
      qwen: 'Qwen (通义千问)',
      moonshot: 'Moonshot (Kimi)',
      baichuan: 'Baichuan (百川)',
      yi: 'Yi (零一万物)',
      siliconflow: 'SiliconFlow (硅基流动)',
      volcengine: '火山方舟 (字节跳动)',
      groq: 'Groq',
      together: 'Together AI',
      stepfun: '阶跃星辰',
      hunyuan: '混元 (腾讯)',
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (GPT)',
      openrouter: 'OpenRouter',
      gemini: 'Google Gemini',
    };
    const friendlyName = providerNames[provider] || provider;
    const protocol = config.llm.protocol === 'anthropic' ? ' [Anthropic 协议]' : '';

    console.log('');
    console.log(`  ${B}${CYAN}Odysseus Agent${R} ${DIM}v0.1.0${R}`);
    console.log(`  ${GREEN}${friendlyName}${R} ${DIM}|${R} ${DIM}${model}${R}${DIM}${protocol}${R}`);
    console.log('');
  }
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  const providers = getSupportedProviders();
  const providerList = providers.map(p => `    ${p.name.padEnd(18)} ${p.description} [${p.envKey}]`).join('\n');

  console.log(`
Odysseus Agent - AI Agent Framework

Usage:
  odysseus-app [options]

Options:
  --demo          Start in demo mode (no API key needed)
  --quickstart, -q  Same as --demo — instant start, zero config
  --debug, -d     Enable debug logging
  --api, -a       Start HTTP API server alongside CLI
  --tui           Start with rich terminal UI (default)
  --cli           Start with classic readline CLI
  --port <port>   API server port (default: 3000)
  --daemon, -D    Run as background daemon (with API server)
  --init          Run interactive setup wizard
  --fresh, -f     Start fresh (skip session restore)
  --help, -h      Show this help message

Environment Variables:
  ODYSSEUS_LLM_PROVIDER      LLM provider [default: anthropic]
  ODYSSEUS_API_KEY           API key (or provider-specific env var)
  ODYSSEUS_MODEL             Model name override
  ODYSSEUS_BASE_URL          Custom API endpoint (for openai-compatible)
  ODYSSEUS_PROTOCOL          Communication protocol: openai | anthropic [default: openai]
  ODYSSEUS_DEBUG             Enable debug logging (true/false)

Supported Providers:
${providerList}

Commands (in CLI):
  /status      - Show agent status
  /cells       - List registered cells
  /spawn       - Spawn a new cell (e.g. /spawn researcher)
  /plan        - Create a goal (e.g. /plan "Build API" 0.8)
  /goals       - List active goals
  /persona     - Show persona status
  /skills      - Show skill ecosystem
  /dream       - Trigger dream cycle
  /think       - Deep reasoning about a topic
  /memory      - Show memory statistics
  /metrics     - Show performance metrics
  /delegate    - Delegate task to multiple cells
  /permissions - Show tool permissions
  /approve     - Approve tool for auto-execution
  /deny        - Block a tool
  /confirm     - Require confirmation for a tool
  /evolve      - Trigger evolution cycle
  /emotions    - Show emotional state
  /note        - Save or read notes (/note save|read|list)
  /narrative   - Show autobiographical narrative
  /predictions - Show predictive user model
  /health      - Show health report
  /diagnostics - Show system diagnostics
  /broadcast   - Show cell network topology
  /report      - Generate comprehensive report
  /plugins     - List loaded plugins
  /plugin-unload - Unload a plugin
  /init        - Initialize .odysseus/ directory
  /save        - Save current session
  /load        - Load a saved session
  /sessions    - List saved sessions
  /stop        - Stop the agent
  /exit        - Exit the CLI
  /help        - Show CLI commands

Examples:
  node odysseus.mjs                     # Start with .env config
  node odysseus.mjs --demo              # Try instantly (no API key needed)
  node odysseus.mjs --init              # Interactive setup wizard
  pnpm start                          # Start via pnpm
  ODYSSEUS_LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=sk-... node odysseus.mjs
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(): { debug: boolean; help: boolean; api: boolean; port: number; init: boolean; daemon: boolean; daemonStop: boolean; daemonStatus: boolean; fresh: boolean; tui: boolean; cli: boolean } {
  const args = process.argv.slice(2);
  const debug = args.includes('--debug') || args.includes('-d');
  const help = args.includes('--help') || args.includes('-h');
  const api = args.includes('--api') || args.includes('-a');
  const init = args.includes('--init') || args.includes('-i');
  const daemon = args.includes('--daemon') || args.includes('-D');
  const daemonStop = args.includes('--stop');
  const daemonStatus = args.includes('--status') && daemon;
  const fresh = args.includes('--fresh') || args.includes('-f');
  const tui = args.includes('--tui');
  const cli = args.includes('--cli');

  // Parse --port
  let port = 3000;
  const portIdx = args.indexOf('--port');
  if (portIdx >= 0 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10) || 3000;
  }

  return { debug, help, api, port, init, daemon, daemonStop, daemonStatus, fresh, tui, cli };
}

/**
 * 启动时轻量级 API Key 验证
 *
 * 发一个 maxTokens=5 的请求验证 key 是否有效。
 * 401 时打印友好警告（不阻断启动）。
 */
async function validateApiKey(config: OdysseusConfig): Promise<void> {
  if (config.llm.provider === 'mock' || !config.llm.apiKey) return;

  const preset = OPENAI_COMPATIBLE_PROVIDERS[config.llm.provider];
  if (!preset) return;

  const YELLOW = '\x1b[33m';
  const DIM = '\x1b[2m';
  const R = '\x1b[0m';

  try {
    const response = await fetch(preset.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.model || preset.defaultModel,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) {
      const helpUrl = preset.helpUrl;
      console.log(`  ${YELLOW}⚠ API key 验证失败 (401 Unauthorized)${R}`);
      console.log(`  ${DIM}Key 可能已过期。${helpUrl ? `获取新 key: ${helpUrl}` : '请检查 API key'}${R}`);
      console.log(`  ${DIM}Agent 仍会启动，但 API 调用将失败。运行 /key <new-key> 可热更新。${R}`);
      console.log('');
    }
  } catch {
    // 网络错误 — 不阻断启动
  }
}

/**
 * 验证配置 — 无 API key 时引导用户配置或 fallback 到 mock provider
 */
async function validateConfig(config: OdysseusConfig): Promise<void> {
  const validProviders = [
    'anthropic', 'openai', 'openrouter', 'gemini', 'mock',
    'minimax', 'glm', 'deepseek', 'qwen', 'moonshot', 'baichuan', 'yi', 'siliconflow', 'volcengine',
    'groq', 'together', 'stepfun', 'hunyuan',
    'openai-compatible',
  ];
  if (!validProviders.includes(config.llm.provider)) {
    console.error(`\n  未知的 AI 服务商 "${config.llm.provider}"。`);
    console.error(`  支持: ${validProviders.join(', ')}\n`);
    process.exit(1);
  }

  if (!config.llm.apiKey && config.llm.provider !== 'mock') {
    // 检查是否是首次运行（没有任何配置文件）
    const isFirstRun = !process.env.ODYSSEUS_LLM_PROVIDER
      && !process.env.ODYSSEUS_API_KEY
      && !process.env.ANTHROPIC_API_KEY
      && !process.env.OPENAI_API_KEY
      && !process.env.DEEPSEEK_API_KEY
      && !process.env.GLM_API_KEY
      && !process.env.MINIMAX_API_KEY;

    if (isFirstRun) {
      console.log('');
      console.log('  欢迎使用 Odysseus Agent！');
      console.log('  粘贴你的 API Key 即可连接 AI (支持 DeepSeek / GLM / MiniMax / OpenAI 等)');
      console.log('');
      // 直接启动 init wizard
      await runInitWizard();
      // wizard 保存配置后，重新加载
      const newConfig = loadConfig();
      if (newConfig.llm.apiKey) {
        config.llm.provider = newConfig.llm.provider;
        config.llm.apiKey = newConfig.llm.apiKey;
        config.llm.model = newConfig.llm.model;
        config.llm.baseUrl = newConfig.llm.baseUrl;
        config.llm.protocol = newConfig.llm.protocol;
        return;
      }
    }

    // 仍然没有 key → 体验模式
    (config.llm as { provider: string; apiKey: string }).provider = 'mock';
    (config.llm as { provider: string; apiKey: string }).apiKey = '';
  }
}

/**
 * 创建 Agent 配置
 */
function createAgentConfig(config: OdysseusConfig, fresh: boolean): AgentConfig {
  const llmProvider = createLLMProvider({
    provider: config.llm.provider,
    apiKey: config.llm.apiKey,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl,
    maxTokens: config.llm.maxTokens,
    protocol: config.llm.protocol as 'openai' | 'anthropic' | undefined,
  });

  return {
    llm: llmProvider,
    sensory: {
      enabledChannels: config.sensory.enabledChannels,
      bufferSize: config.sensory.bufferSize,
    },
    memory: {
      dreamingEnabled: config.memory.dreamingEnabled,
      forgettingEnabled: config.memory.forgettingEnabled,
    },
    prefrontal: {
      maxPlanSteps: config.prefrontal.maxPlanSteps,
      maxConcurrentPlans: config.prefrontal.maxConcurrentPlans,
      riskTolerance: config.prefrontal.riskTolerance,
    },
    evolutionEnabled: config.agent.evolutionEnabled,
    debugLogging: config.agent.debugLogging,
    freshStart: fresh,
  };
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 加载 .env 文件（必须在 parseArgs/loadConfig 之前）
  const envLoaded = loadEnvFiles();
  if (envLoaded > 0) {
    // 静默加载，不打印到用户（除非 debug 模式）
  }

  const { debug, help, api, port, init, daemon, daemonStop, daemonStatus, fresh, tui, cli } = parseArgs();

  if (help) {
    showHelp();
    process.exit(0);
  }

  if (init) {
    await runInitWizard();
    process.exit(0);
  }

  // Daemon 模式处理
  if (daemon) {
    if (daemonStop) {
      await stopDaemon();
      process.exit(0);
    }
    if (daemonStatus) {
      showDaemonStatus();
      process.exit(0);
    }
    startDaemon(port);
    // startDaemon 会 fork 子进程并 exit，不会到达这里
    process.exit(0);
  }

  // 初始化 .odysseus/ 目录（失败不阻止启动）
  try {
    initOdysseusDir();
  } catch (err) {
    console.warn(`Warning: Could not create .odysseus directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 初始化 trace 系统 — 写入 .odysseus/trace.jsonl
  initTrace();

  // 加载配置（CLI > env > project .odysseus/config.json > ~/.odysseus/config.json > defaults）
  const config = loadConfig(debug ? { agent: { debugLogging: true } } : undefined);

  // 验证配置（可能引导用户运行 init wizard）
  await validateConfig(config);

  // 配置 Logger
  const logger = Logger.getInstance();
  logger.setLevel(config.logging.level as 'debug' | 'info' | 'warn' | 'error' | 'silent');

  // 决定是否使用 TUI 模式（readline 输入层，IME 兼容）
  const useTUI = tui || !cli;

  // 显示横幅（TUI 模式下跳过 — TUI 有自己的 header）
  if (!useTUI) {
    showBanner(config);
  }

  // 提示 fresh 模式
  if (fresh && !useTUI) {
    console.log(`  ${'\x1b[33m'}Fresh start${'\x1b[0m'} — starting clean, no previous session restored.`);
    console.log('');
  }

  // 创建 Agent 配置
  const agentConfig = createAgentConfig(config, fresh);
  const agent = new OdysseusAgent(agentConfig);

  // 显示启动信息
  if (config.agent.debugLogging) {
    console.log(`[DEBUG] Provider: ${config.llm.provider}`);
    console.log(`[DEBUG] Model: ${config.llm.model || 'default'}`);
    console.log(`[DEBUG] Debug logging: enabled`);
    console.log(`[DEBUG] Config: .odysseus/config.json loaded`);
    console.log('');
  }

  // 处理进程信号
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log('\n正在休眠...');
    try {
      await agent.shutdown();
      console.log('已保存状态，下次见。');
    } catch (error) {
      console.error('关闭时出错:', error);
    }
    // 关闭 API 服务器（如果运行中）
    if (api && apiServer) {
      try {
        await apiServer.stop();
        console.log('API 服务已停止。');
      } catch (error) {
        console.error('停止 API 服务时出错:', error);
      }
    }
    console.log(`  trace: ${getTraceFilePath()}`);
    process.exit(0);
  };

  // 启动 Agent
  // CLI 模式下：boot 期间静默 INFO 日志，只保留简洁的启动动画
  const isCliMode = !api && !process.env.ODYSSEUS_DEBUG;
  const savedLevel = config.logging.level as 'debug' | 'info' | 'warn' | 'error' | 'silent';
  if (isCliMode) {
    logger.setLevel('warn');
  }

  try {
    if (isCliMode) {
      // 简洁的启动动画：单行"正在唤醒"，完成后覆盖
      process.stdout.write('  正在唤醒...');
      await agent.boot();
      // 覆盖为空行，banner 和 greeting 会立即显示
      process.stdout.write('\r' + ' '.repeat(20) + '\r');
    } else {
      console.log('正在唤醒...');
      await agent.boot();
      console.log('准备就绪。\n');
    }
  } catch (error) {
    // Boot 失败时恢复日志级别再输出错误
    logger.setLevel(savedLevel);
    console.error('启动失败:', error);
    console.error('  试试: node odysseus.mjs --init');
    process.exit(1);
  }

  // Boot 完成，恢复日志级别
  // TUI 模式下保持 error 级别 — 避免 INFO 日志混入 Ink 渲染输出
  // CLI 模式下恢复原始级别
  if (useTUI) {
    logger.setLevel('error');
  } else if (isCliMode) {
    logger.setLevel(savedLevel);
  }

  // 后台验证 API Key（不阻断启动）
  validateApiKey(config).catch(() => {});

  // 启动 HTTP API 服务器（如果请求）
  let apiServer: APIServer | undefined;
  if (api) {
    const apiToken = process.env.ODYSSEUS_API_TOKEN || undefined;
    apiServer = new APIServer(port, 'localhost', apiToken);
    registerRoutes(apiServer!, agent);

    // 将 agent 事件推送到 SSE 客户端
    agent.consciousness.onAll((event: unknown) => {
      apiServer!.pushSSE('consciousness', event);
    });

    try {
      await apiServer!.start();
      console.log(`🌐 API server running at http://localhost:${port}`);
      console.log(`   WebSocket: ws://localhost:${port}`);
      console.log(`   Endpoints:`);
      console.log(`     GET  /health  /health/report  /status  /metrics`);
      console.log(`     GET  /persona  /emotions  /narrative  /predictions`);
      console.log(`     GET  /cells  /skills  /memory  /sessions  /permissions`);
      console.log(`     POST /chat  /chat/stream  /cells  /goals`);
      console.log(`     POST /dream  /think  /evolve  /delegate`);
      console.log(`     POST /sessions/save  /sessions/load`);
      console.log(`     POST /permissions/approve  /permissions/deny`);
      console.log(`     GET  /events  (SSE consciousness stream)\n`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('EADDRINUSE')) {
        console.error(`端口 ${port} 已被占用，用 --port <端口> 指定其他端口。`);
      } else {
        console.error(`API 服务启动失败: ${msg}`);
      }
    }
  }

  // 启动交互式界面
  if (useTUI) {
    // ink 接管 stdout — 静音 CLI channel 避免 raw output 打乱渲染
    agent.cliChannel.mute();
    const instance = startTUI(agent);
    instance.waitUntilExit().then(() => shutdown());
  } else {
    const rl = startReadlineLoop(agent);
    rl.on('close', shutdown);
  }

  // 处理 SIGTERM（Docker/K8s/PM2 发送的终止信号）
  process.on('SIGTERM', shutdown);

  // 防止未处理的 Promise 拒绝导致静默失败
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason}`);
    // 写入 trace 文件便于诊断
    const { beginSpan } = require('./log/trace.js') as typeof import('./log/trace.js');
    const span = beginSpan('unhandledRejection', { reason: String(reason) });
    span.end('error', reason instanceof Error ? reason : new Error(String(reason)));
  });

  // 防止未捕获异常导致进程崩溃而不清理
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error}`);
    // 写入 trace 文件
    try {
      const { beginSpan } = require('./log/trace.js') as typeof import('./log/trace.js');
      const span = beginSpan('uncaughtException', { stack: error.stack?.slice(0, 200) });
      span.end('error', error);
    } catch { /* trace itself failed */ }

    // 恢复终端状态（ink alternate screen 可能没清理）
    if (process.stdout.isTTY) {
      process.stdout.write('\x1b[?1049l'); // 退出 alternate screen
      process.stdout.write('\x1b[?25h');   // 显示光标
      process.stdout.write('\x1b[0m');     // 重置颜色
    }

    console.error(`\n=== Odysseus crashed ===\n${error.stack ?? error.message}\nTrace: ${(() => { try { return require('./log/trace.js').getTraceFilePath(); } catch { return 'N/A'; } })()}`);

    // 不要调 shutdown() — 它可能也在 crash 路径上。直接退出。
    process.exit(1);
  });
}

// 启动主函数
main().catch((error) => {
  console.error('致命错误:', error);
  process.exit(1);
});
