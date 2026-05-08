/**
 * Interactive Init Wizard
 *
 * 极简首次配置：检测 → 选服务商 → 粘贴 Key → 自动保存 → 启动。
 * 目标：从「没有任何配置」到「开始聊天」只需 2 步交互。
 *
 * 流程：
 * 1. 自动扫描环境变量中已有的 Key → 找到就直接用（0 步交互）
 * 2. 没找到 → 列出服务商，用户选一个 → 粘贴 Key → 自动测试 → 保存（2 步交互）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { OPENAI_COMPATIBLE_PROVIDERS } from '../llm/openai-compatible-provider.js';

interface ProviderOption {
  name: string;
  description: string;
  envKey: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { name: 'deepseek', description: 'DeepSeek (推荐 — 性价比最高)', envKey: 'DEEPSEEK_API_KEY' },
  { name: 'glm', description: 'GLM / 智谱 AI', envKey: 'GLM_API_KEY' },
  { name: 'minimax', description: 'MiniMax (海螺 AI)', envKey: 'MINIMAX_API_KEY' },
  { name: 'qwen', description: 'Qwen / 通义千问 (阿里云)', envKey: 'DASHSCOPE_API_KEY' },
  { name: 'moonshot', description: 'Moonshot / Kimi (月之暗面)', envKey: 'MOONSHOT_API_KEY' },
  { name: 'siliconflow', description: 'SiliconFlow (硅基流动)', envKey: 'SILICONFLOW_API_KEY' },
  { name: 'volcengine', description: 'Volcengine / 火山方舟 (字节跳动)', envKey: 'VOLCENGINE_API_KEY' },
  { name: 'baichuan', description: 'Baichuan / 百川智能', envKey: 'BAICHUAN_API_KEY' },
  { name: 'yi', description: 'Yi / 零一万物', envKey: 'YI_API_KEY' },
  { name: 'anthropic', description: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY' },
  { name: 'openai', description: 'OpenAI (GPT)', envKey: 'OPENAI_API_KEY' },
  { name: 'openrouter', description: 'OpenRouter (聚合多模型)', envKey: 'OPENROUTER_API_KEY' },
  { name: 'gemini', description: 'Google Gemini', envKey: 'GOOGLE_API_KEY' },
  { name: 'mock', description: '体验模式 (无需 API key)', envKey: '' },
];

/** 获取 API Key 的链接 */
const HELP_LINKS: Record<string, string> = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  glm: 'https://open.bigmodel.cn/usercenter/apikeys',
  minimax: 'https://platform.minimaxi.com/',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  volcengine: 'https://console.volcengine.com/ark',
  baichuan: 'https://platform.baichuan-ai.com/',
  yi: 'https://platform.lingyiwanwu.com/',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
  gemini: 'https://aistudio.google.com/apikey',
};

/**
 * 从 API Key 格式自动推断服务商
 *
 * 已知的 Key 前缀格式:
 * - Anthropic: sk-ant-api03-...
 * - OpenRouter: sk-or-...
 * - Google Gemini: AIza...
 * - DeepSeek: sk-... (24位 hex)
 * - OpenAI: sk-... (较长，通常含 proj- 或 org- 前缀)
 * - 智谱 GLM: JWT 格式 (xxx.yyy.zzz)
 * - 其他中国服务商: sk-... 或纯 hex 字符串
 */
export function detectProviderFromKey(key: string): { provider: string; confidence: 'high' | 'low' } | null {
  if (!key || key.length < 10) return null;

  // 高置信度 — 前缀唯一
  if (key.startsWith('sk-ant-')) return { provider: 'anthropic', confidence: 'high' };
  if (key.startsWith('sk-or-')) return { provider: 'openrouter', confidence: 'high' };
  if (key.startsWith('AIza')) return { provider: 'gemini', confidence: 'high' };
  if (key.startsWith('sk-cp-')) return { provider: 'minimax', confidence: 'high' };
  if (key.startsWith('sk-kimi')) return { provider: 'moonshot', confidence: 'high' };

  // 智谱 GLM — JWT 格式 (三段 base64url，含 "." 分隔)
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return { provider: 'glm', confidence: 'high' };
  }

  // OpenAI — 通常包含 proj- 或 org- 段
  if (key.startsWith('sk-') && (key.includes('proj-') || key.includes('org-'))) {
    return { provider: 'openai', confidence: 'high' };
  }

  // 低置信度 — sk- 前缀但不确定是哪家
  if (key.startsWith('sk-')) return { provider: 'deepseek', confidence: 'low' };

  // 通义千问 — dashscope key 通常是 sk- 开头但无法与 deepseek 区分
  // 火山方舟 — 通常也是 sk- 开头

  return null;
}

/**
 * 处理用户粘贴的 API Key — 自动识别、测试、保存
 */
async function handleKeyPaste(
  key: string,
  question: (prompt: string) => Promise<string>,
  forceProvider?: string,
): Promise<void> {
  let providerName: string;
  let provider: ProviderOption;
  let confidence: 'high' | 'low' | 'none' = 'none';

  if (forceProvider) {
    providerName = forceProvider;
    provider = PROVIDER_OPTIONS.find(p => p.name === providerName)!;
    confidence = 'high'; // 用户手动指定 = 高置信度
  } else {
    const detected = detectProviderFromKey(key);
    if (detected) {
      providerName = detected.provider;
      provider = PROVIDER_OPTIONS.find(p => p.name === providerName)!;
      confidence = detected.confidence;
      if (detected.confidence === 'high') {
        console.log(`  ✓ 识别为 ${provider.description}`);
      } else {
        console.log(`  ⚠ 疑似 ${provider.description}（如不对可重跑 --init）`);
      }
    } else {
      providerName = 'deepseek';
      provider = PROVIDER_OPTIONS.find(p => p.name === providerName)!;
      console.log(`  ⚠ 无法识别，尝试通用协议`);
    }
  }

  // 测试连接
  console.log('  验证中...');
  const testResult = await testConnection(providerName, key);

  if (testResult.ok) {
    await saveConfig(providerName, key, undefined);
    console.log(`  ✓ 连接成功！运行 killer 即可。`);
    return;
  }

  // 高置信度识别失败 → 可能是网络问题，直接保存（信任 key 格式判断）
  if (confidence === 'high') {
    console.log(`  ⚠ 验证未通过（${testResult.error}），但 Key 格式匹配`);
    await saveConfig(providerName, key, undefined);
    console.log(`  ✓ 已保存为 ${provider.description}。运行 killer 即可。`);
    return;
  }

  // 低置信度/未识别 → 尝试其他 openai-compatible 服务商
  if (providerName !== 'deepseek') {
    const retryResult = await testConnection('deepseek', key);
    if (retryResult.ok) {
      await saveConfig('deepseek', key, undefined);
      console.log(`  ✓ 连接成功！运行 killer 即可。`);
      return;
    }
  }

  // 都失败 → 询问是否仍然保存
  console.log(`  ⚠ 验证失败: ${testResult.error}`);
  const proceed = await question('  仍然保存？(y/N): ');
  if (proceed.trim().toLowerCase() === 'y') {
    await saveConfig(providerName, key, undefined);
    console.log('  ✓ 已保存。运行 killer 即可。');
  } else {
    console.log('  已取消。运行 killer --init 重试。');
  }
}

/**
 * 运行交互式配置向导 — 极简版
 */
export async function runInitWizard(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve));

  try {
    console.log('');
    console.log('  🧠 连接 AI — 粘贴 API Key 即可（自动识别服务商）');
    console.log('');

    // ── 第 0 步：检测已有配置（0 交互） ──
    const existingConfig = detectExistingConfig();
    if (existingConfig) {
      console.log(`  已有配置: ${existingConfig.provider} (${existingConfig.source})`);
      console.log(`  Key: ${maskKey(existingConfig.apiKey)}`);
      console.log('');
      const keepExisting = await question('  保留？(Y/n): ');
      if (keepExisting.trim().toLowerCase() !== 'n') {
        console.log('  ✓ 配置不变。运行 killer 即可启动。');
        return;
      }
      console.log('');
    }

    // ── 智能检测：扫描 env 中已有的 key ──
    const detectedKeys = detectAvailableKeys();

    if (detectedKeys.length > 0) {
      console.log('  ✓ 检测到 API Key:');
      for (const dk of detectedKeys) {
        const provider = PROVIDER_OPTIONS.find(p => p.envKey === dk.envKey);
        console.log(`    ${provider?.description ?? dk.envKey}: ${maskKey(dk.key)}`);
      }
      console.log('');
      const useDetected = await question('  直接使用？(Y/n): ');
      if (useDetected.trim().toLowerCase() !== 'n') {
        const dk = detectedKeys[0];
        const provider = PROVIDER_OPTIONS.find(p => p.envKey === dk.envKey);
        if (provider) {
          await saveConfig(provider.name, dk.key, undefined);
          console.log(`  ✓ 已配置 ${provider.description}！`);
          return;
        }
      }
      console.log('');
    }

    // ── 核心交互：一行提示，粘贴 Key 或输入编号 ──
    const input = await question('  粘贴 Key: ');
    const trimmed = input.trim();

    if (!trimmed) {
      console.log('  已取消。运行 killer --init 重试。');
      return;
    }

    // ── 用户粘贴了一个 Key ──
    if (!/^\d+$/.test(trimmed)) {
      await handleKeyPaste(trimmed, question);
      return;
    }

    // ── 用户输入了编号 → 显示服务商列表 ──
    const idx = parseInt(trimmed, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= PROVIDER_OPTIONS.length) {
      console.log('  输入编号无效。也可直接粘贴 Key。');
      return;
    }

    const selected = PROVIDER_OPTIONS[idx];

    if (selected.name === 'mock') {
      await saveConfig(selected.name, '', undefined);
      console.log('  ✓ 体验模式。运行 killer 即可。');
      return;
    }

    const link = HELP_LINKS[selected.name];
    const keyPrompt = link
      ? `  粘贴 ${selected.envKey} (获取: ${link}): `
      : `  粘贴 ${selected.envKey}: `;
    const apiKey = await question(keyPrompt);
    const finalKey = apiKey.trim();
    if (!finalKey) {
      console.log('  Key 不能为空。运行 killer --init 重试。');
      return;
    }

    await handleKeyPaste(finalKey, question, selected.name);

  } finally {
    rl.close();
  }
}

/**
 * 测试 API 连接
 */
async function testConnection(provider: string, apiKey: string): Promise<{ ok: boolean; model?: string; error?: string }> {
  const preset = OPENAI_COMPATIBLE_PROVIDERS[provider];
  if (!preset) {
    // 非 OpenAI-compatible 的 provider，跳过测试
    return { ok: true };
  }

  try {
    const response = await fetch(preset.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: preset.defaultModel,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      const data = await response.json() as { model?: string };
      return { ok: true, model: data.model };
    }

    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const errMsg = err.error?.message || `HTTP ${response.status}`;
    return { ok: false, error: errMsg };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 扫描环境变量中已有的 API Key
 */
function detectAvailableKeys(): Array<{ envKey: string; key: string }> {
  const found: Array<{ envKey: string; key: string }> = [];
  for (const opt of PROVIDER_OPTIONS) {
    if (!opt.envKey) continue;
    const val = process.env[opt.envKey];
    if (val && val.trim()) {
      found.push({ envKey: opt.envKey, key: val.trim() });
    }
  }
  const killerKey = process.env.KILLER_API_KEY;
  if (killerKey && killerKey.trim() && !found.some(f => f.key === killerKey.trim())) {
    found.push({ envKey: 'KILLER_API_KEY', key: killerKey.trim() });
  }
  return found;
}

/**
 * 检测已有配置
 */
function detectExistingConfig(): { provider: string; apiKey: string; source: string } | null {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const providerMatch = content.match(/^KILLER_LLM_PROVIDER=(.+)$/m);
    const keyMatch = content.match(/^(?:DEEPSEEK|GLM|MINIMAX|DASHSCOPE|MOONSHOT|BAICHUAN|YI|SILICONFLOW|VOLCENGINE|OPENROUTER|OPENAI|ANTHROPIC|GOOGLE|KILLER)_API_KEY=(.+)$/m);
    if (providerMatch) {
      return {
        provider: providerMatch[1].trim(),
        apiKey: keyMatch ? keyMatch[2].trim() : '',
        source: '.env 文件',
      };
    }
  }

  const envProvider = process.env.KILLER_LLM_PROVIDER;
  if (envProvider) {
    const envKey = PROVIDER_OPTIONS.find(p => p.name === envProvider)?.envKey || 'KILLER_API_KEY';
    return {
      provider: envProvider,
      apiKey: process.env[envKey] || process.env.KILLER_API_KEY || '',
      source: '环境变量',
    };
  }

  return null;
}

/**
 * 遮蔽 API key 用于显示
 */
function maskKey(key: string): string {
  if (!key) return '(未设置)';
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

/**
 * 保存配置到 .env 和 ~/.killer/.env（全局）
 *
 * 写入两个位置：
 * 1. 当前目录 .env — 项目级配置
 * 2. ~/.killer/.env — 全局配置（任何目录都能找到）
 * 3. ~/.killer/config.json — 备份（不含明文 key）
 */
export async function saveConfig(provider: string, apiKey: string, model?: string): Promise<void> {
  const lines: string[] = [
    '# Killer Agent — auto-generated by init wizard',
    `KILLER_LLM_PROVIDER=${provider}`,
  ];

  if (apiKey) {
    const envKey = PROVIDER_OPTIONS.find(p => p.name === provider)?.envKey || 'KILLER_API_KEY';
    lines.push(`${envKey}=${apiKey}`);
  }

  if (model) {
    lines.push(`KILLER_MODEL=${model}`);
  }

  const envContent = lines.join('\n') + '\n';

  // 写入当前目录 .env
  fs.writeFileSync(path.join(process.cwd(), '.env'), envContent, 'utf-8');

  // 写入 ~/.killer/.env（全局，任何目录启动都能加载）
  const killerDir = path.join(os.homedir(), '.killer');
  if (!fs.existsSync(killerDir)) {
    fs.mkdirSync(killerDir, { recursive: true });
  }
  fs.writeFileSync(path.join(killerDir, '.env'), envContent, 'utf-8');

  // 备份到 ~/.killer/config.json（不含明文 key）
  const configPath = path.join(killerDir, 'config.json');
  const existing: Record<string, unknown> = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    : {};

  const updated = {
    ...existing,
    llm: {
      ...(existing.llm as Record<string, unknown> || {}),
      provider,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
}
