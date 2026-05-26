/**
 * Configuration System
 *
 * 支持 .killer/ 目录配置 + 环境变量 + 命令行参数
 *
 * 配置优先级（高到低）：
 * 1. CLI 参数
 * 2. 环境变量
 * 3. 项目级 .killer/config.json
 * 4. 用户级 ~/.killer/config.json
 * 5. 默认值
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * 递归 Partial — 支持嵌套覆盖
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Killer 配置结构
 */
export interface KillerConfig {
  // LLM 配置
  llm: {
    provider: string;
    apiKey: string;
    model?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    /** 通信协议: 'openai' | 'anthropic' — 用于双协议服务商 */
    protocol?: string;
  };

  // Agent 行为
  agent: {
    debugLogging: boolean;
    evolutionEnabled: boolean;
    maxConversationTurns: number;
  };

  // 记忆系统
  memory: {
    dreamingEnabled: boolean;
    forgettingEnabled: boolean;
  };

  // 感官输入
  sensory: {
    enabledChannels: string[];
    bufferSize: number;
    webhook?: {
      port: number;
      host?: string;
      path?: string;
      authToken?: string;
    };
  };

  // 前额叶皮层
  prefrontal: {
    maxPlanSteps: number;
    maxConcurrentPlans: number;
    riskTolerance: number;
  };

  // 日志
  logging: {
    level: string;
    file?: string;
  };
}

/**
 * 配置文件结构（.killer/config.json）
 */
interface ConfigFile {
  llm?: Partial<KillerConfig['llm']>;
  agent?: Partial<KillerConfig['agent']>;
  memory?: Partial<KillerConfig['memory']>;
  sensory?: Partial<KillerConfig['sensory']>;
  prefrontal?: Partial<KillerConfig['prefrontal']>;
  logging?: Partial<KillerConfig['logging']>;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: KillerConfig = {
  llm: {
    provider: 'anthropic',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 4096,
  },
  agent: {
    debugLogging: false,
    evolutionEnabled: true,
    maxConversationTurns: 20,
  },
  memory: {
    dreamingEnabled: true,
    forgettingEnabled: true,
  },
  sensory: {
    enabledChannels: ['cli'],
    bufferSize: 100,
  },
  prefrontal: {
    maxPlanSteps: 10,
    maxConcurrentPlans: 3,
    riskTolerance: 0.5,
  },
  logging: {
    level: 'info',
  },
};

/**
 * 深度合并配置
 */
function deepMerge(base: Record<string, unknown>, ...overrides: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const override of overrides) {
    for (const key of Object.keys(override)) {
      const val = override[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = deepMerge(
          (result[key] as Record<string, unknown>) ?? {},
          val as Record<string, unknown>,
        );
      } else if (val !== undefined) {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * 读取 JSON 配置文件
 */
function readConfigFile(filePath: string): ConfigFile | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ConfigFile;
  } catch {
    return null;
  }
}

/**
 * Provider → 环境变量 key 映射
 * 用于自动检测：当用户只设了 API key 而没设 KILLER_LLM_PROVIDER 时推断 provider
 */
const PROVIDER_ENV_KEYS: Array<{ provider: string; envKeys: string[] }> = [
  { provider: 'deepseek', envKeys: ['DEEPSEEK_API_KEY'] },
  { provider: 'glm', envKeys: ['GLM_API_KEY', 'ZHIPU_API_KEY'] },
  { provider: 'minimax', envKeys: ['MINIMAX_API_KEY'] },
  { provider: 'qwen', envKeys: ['DASHSCOPE_API_KEY'] },
  { provider: 'moonshot', envKeys: ['MOONSHOT_API_KEY'] },
  { provider: 'baichuan', envKeys: ['BAICHUAN_API_KEY'] },
  { provider: 'yi', envKeys: ['YI_API_KEY'] },
  { provider: 'siliconflow', envKeys: ['SILICONFLOW_API_KEY'] },
  { provider: 'volcengine', envKeys: ['VOLCENGINE_API_KEY'] },
  { provider: 'openrouter', envKeys: ['OPENROUTER_API_KEY'] },
  { provider: 'openai', envKeys: ['OPENAI_API_KEY'] },
  { provider: 'anthropic', envKeys: ['ANTHROPIC_API_KEY'] },
  { provider: 'gemini', envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'] },
];

/**
 * 根据环境变量中的 API key 自动推断 provider
 * 返回 { provider, apiKey } 或 null
 */
function detectProviderFromEnvKeys(): { provider: string; apiKey: string } | null {
  // 优先 KILLER_API_KEY（通用 key，但需要 KILLER_LLM_PROVIDER 配合）
  for (const { provider, envKeys } of PROVIDER_ENV_KEYS) {
    for (const key of envKeys) {
      const val = process.env[key];
      if (val) return { provider, apiKey: val };
    }
  }
  return null;
}

/**
 * 根据 provider 名称查找对应的 API key
 */
function findApiKeyForProvider(provider: string): string {
  const mapping = PROVIDER_ENV_KEYS.find(p => p.provider === provider);
  if (mapping) {
    for (const key of mapping.envKeys) {
      const val = process.env[key];
      if (val) return val;
    }
  }
  return '';
}

/**
 * 从环境变量读取 LLM 配置
 *
 * 自动检测逻辑：
 * 1. 用户显式设了 KILLER_LLM_PROVIDER → 使用它 + 查找对应 key
 * 2. 用户只设了某个 provider 的 API key → 自动推断 provider + 使用该 key
 * 3. 什么都没设 → 返回空，后续走 mock/demo 模式
 */
function readEnvLLMConfig(): Partial<KillerConfig['llm']> {
  const config: Partial<KillerConfig['llm']> = {};

  const explicitProvider = process.env.KILLER_LLM_PROVIDER;

  if (explicitProvider) {
    // 用户显式指定了 provider
    config.provider = explicitProvider;
    const apiKey = process.env.KILLER_API_KEY || findApiKeyForProvider(explicitProvider);
    if (apiKey) config.apiKey = apiKey;
  } else {
    // 自动检测：根据存在的 API key 推断 provider
    const detected = detectProviderFromEnvKeys();
    if (detected) {
      config.provider = detected.provider;
      config.apiKey = process.env.KILLER_API_KEY || detected.apiKey;
    }
  }

  const model = process.env.KILLER_MODEL;
  if (model) config.model = model;

  const baseUrl = process.env.KILLER_BASE_URL;
  if (baseUrl) config.baseUrl = baseUrl;

  const protocol = process.env.KILLER_PROTOCOL;
  if (protocol) config.protocol = protocol;

  return config;
}

/**
 * 从环境变量读取 Agent 配置
 */
function readEnvAgentConfig(): Partial<KillerConfig['agent']> {
  const config: Partial<KillerConfig['agent']> = {};

  if (process.env.KILLER_DEBUG === 'true') config.debugLogging = true;
  if (process.env.KILLER_EVOLUTION === 'false') config.evolutionEnabled = false;

  return config;
}

/**
 * 从环境变量读取日志配置
 */
function readEnvLoggingConfig(): Partial<KillerConfig['logging']> {
  const config: Partial<KillerConfig['logging']> = {};

  const level = process.env.KILLER_LOG_LEVEL;
  if (level) config.level = level;

  return config;
}

/**
 * 加载完整配置
 *
 * 合并优先级：CLI > 环境变量 > 项目配置 > 用户配置 > 默认值
 */
export function loadConfig(cliOverrides?: DeepPartial<KillerConfig>): KillerConfig {
  // 1. 用户级配置
  const userConfigPath = path.join(os.homedir(), '.killer', 'config.json');
  const userConfig = readConfigFile(userConfigPath);

  // 2. 项目级配置
  const projectConfigPath = path.join(process.cwd(), '.killer', 'config.json');
  const projectConfig = readConfigFile(projectConfigPath);

  // 3. 环境变量
  const envLLM = readEnvLLMConfig();
  const envAgent = readEnvAgentConfig();
  const envLogging = readEnvLoggingConfig();

  // 4. 合并所有配置层
  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    userConfig as Record<string, unknown> ?? {},
    projectConfig as Record<string, unknown> ?? {},
    {
      llm: envLLM,
      agent: envAgent,
      logging: envLogging,
    },
    cliOverrides as Record<string, unknown> ?? {},
  );

  const config = merged as unknown as KillerConfig;

  // Validate critical config values
  validateConfig(config);

  return config;
}

/**
 * Validate critical configuration values
 * Throws descriptive errors for invalid config
 */
function validateConfig(config: KillerConfig): void {
  const VALID_PROVIDERS = [
    'anthropic', 'openai', 'openrouter', 'gemini', 'mock',
    'minimax', 'glm', 'deepseek', 'qwen', 'moonshot', 'baichuan', 'yi', 'siliconflow', 'volcengine',
    'openai-compatible',
  ];
  const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'];

  if (!VALID_PROVIDERS.includes(config.llm.provider)) {
    throw new Error(
      `Invalid LLM provider "${config.llm.provider}". Valid: ${VALID_PROVIDERS.join(', ')}`
    );
  }

  // API key 缺失时不 throw — 由 main.ts 的 validateConfig 处理 mock fallback
  // 这样 loadConfig() 在无 key 场景下也能正常返回配置对象

  if (config.llm.temperature !== undefined && (config.llm.temperature < 0 || config.llm.temperature > 1)) {
    throw new Error(`Invalid temperature ${config.llm.temperature}. Must be between 0 and 1.`);
  }

  if (config.llm.maxTokens !== undefined && config.llm.maxTokens <= 0) {
    throw new Error(`Invalid maxTokens ${config.llm.maxTokens}. Must be positive.`);
  }

  if (config.sensory.webhook?.port !== undefined && (config.sensory.webhook.port < 1 || config.sensory.webhook.port > 65535)) {
    throw new Error(`Invalid webhook port ${config.sensory.webhook.port}. Must be 1-65535.`);
  }

  if (config.prefrontal.riskTolerance < 0 || config.prefrontal.riskTolerance > 1) {
    throw new Error(`Invalid riskTolerance ${config.prefrontal.riskTolerance}. Must be between 0 and 1.`);
  }

  if (!VALID_LOG_LEVELS.includes(config.logging.level)) {
    throw new Error(`Invalid log level "${config.logging.level}". Valid: ${VALID_LOG_LEVELS.join(', ')}`);
  }
}

/**
 * 初始化 .killer/ 目录结构
 */
export function initKillerDir(targetDir?: string): string {
  const dir = targetDir ?? path.join(process.cwd(), '.killer');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 创建默认配置文件
  const configPath = path.join(dir, 'config.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig: ConfigFile = {
      llm: {
        provider: 'anthropic',
      },
      agent: {
        debugLogging: false,
      },
      logging: {
        level: 'info',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }

  // 创建 sessions 子目录
  const sessionsDir = path.join(dir, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  return dir;
}
