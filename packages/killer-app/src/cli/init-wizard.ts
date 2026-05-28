/**
 * Interactive Init Wizard
 *
 * 消费级傻瓜式配置：粘贴 Key → 自动识别 → 选模型 → 启动。
 * 目标：从「没有任何配置」到「开始聊天」只需 1-2 步交互。
 *
 * 流程：
 * 0. 自动扫描环境变量中已有的 Key → 找到就直接用（0 步交互）
 * 1. 没找到 → 粘贴 Key → 自动识别服务商（1 步交互）
 * 2. 选模型 → 连接测试 → 保存（可选交互）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';
import {
  OPENAI_COMPATIBLE_PROVIDERS,
  getProviderOptions,
  getProviderEnvKeys,
  detectProviderFromKey as detectProviderFromRegistry,
} from '../llm/openai-compatible-provider.js';

interface ProviderOption {
  name: string;
  description: string;
  envKey: string;
  /** 是否支持双协议 (OpenAI + Anthropic) */
  dualProtocol?: boolean;
}

/** 从 registry 派生的 provider 列表 — 单一数据源 */
export const PROVIDER_OPTIONS: ProviderOption[] = getProviderOptions();

/** 从 registry 重新导出 detectProviderFromKey（单一数据源） */
export { detectProviderFromRegistry as detectProviderFromKey };

/**
 * 让用户选择模型（可选步骤）
 */
async function selectModel(
  providerName: string,
  question: (prompt: string) => Promise<string>,
): Promise<string | undefined> {
  const preset = OPENAI_COMPATIBLE_PROVIDERS[providerName];
  if (!preset || preset.models.length <= 1) return undefined;

  console.log(`  可选模型:`);
  preset.models.forEach((m, i) => {
    const marker = m === preset.defaultModel ? ' (默认)' : '';
    console.log(`    ${i + 1}. ${m}${marker}`);
  });
  console.log(`    回车 = 使用默认 (${preset.defaultModel})`);

  const choice = await question('  选模型: ');
  const trimmed = choice.trim();

  if (!trimmed) return preset.defaultModel;

  const idx = parseInt(trimmed, 10) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < preset.models.length) {
    return preset.models[idx];
  }

  return undefined;
}

/**
 * 询问双协议服务商的协议选择
 */
async function selectProtocol(
  providerName: string,
  question: (prompt: string) => Promise<string>,
): Promise<'openai' | 'anthropic' | undefined> {
  const provider = PROVIDER_OPTIONS.find(p => p.name === providerName);
  if (!provider?.dualProtocol) return undefined;

  console.log(`  ${provider.description} 支持双协议:`);
  console.log(`    1. OpenAI 协议 (推荐 — 兼容性最广)`);
  console.log(`    2. Anthropic 协议 (适合 Claude Code / Cursor 等工具用户)`);
  console.log(`    回车 = OpenAI 协议`);

  const choice = await question('  选协议: ');
  const trimmed = choice.trim();

  if (trimmed === '2') return 'anthropic';
  return 'openai';
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
    confidence = 'high';
  } else {
    const detected = detectProviderFromRegistry(key);
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

  // 高置信度 → 跳过模型/协议选择（消费级 0 交互）
  const skipOptionalSteps = confidence === 'high';
  const model = skipOptionalSteps ? undefined : await selectModel(providerName, question);
  const protocol = skipOptionalSteps ? undefined : await selectProtocol(providerName, question);

  // 测试连接
  console.log('  验证中...');
  const testResult = await testConnection(providerName, key, protocol);

  if (testResult.ok) {
    await saveConfig(providerName, key, model, protocol);
    console.log(`  ✓ 连接成功！运行 killer 即可。`);
    return;
  }

  // 高置信度识别失败 → 可能是网络问题，直接保存
  if (confidence === 'high') {
    console.log(`  ⚠ 验证未通过（${testResult.error}），但 Key 格式匹配`);
    await saveConfig(providerName, key, model, protocol);
    console.log(`  ✓ 已保存为 ${provider.description}。运行 killer 即可。`);
    return;
  }

  // 低置信度/未识别 → 尝试其他 openai-compatible 服务商
  if (providerName !== 'deepseek') {
    const retryResult = await testConnection('deepseek', key);
    if (retryResult.ok) {
      await saveConfig('deepseek', key, model);
      console.log(`  ✓ 连接成功！运行 killer 即可。`);
      return;
    }
  }

  // 都失败 → 询问是否仍然保存
  console.log(`  ⚠ 验证失败: ${testResult.error}`);
  const proceed = await question('  仍然保存？(y/N): ');
  if (proceed.trim().toLowerCase() === 'y') {
    await saveConfig(providerName, key, model, protocol);
    console.log('  ✓ 已保存。运行 killer 即可。');
  } else {
    console.log('  已取消。运行 killer --init 重试。');
  }
}

/**
 * 运行交互式配置向导 — 消费级傻瓜版
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
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log('  │  Killer Agent — 粘贴 API Key 即可开始        │');
    console.log('  │  自动识别服务商 / 模型 / 协议                 │');
    console.log('  └─────────────────────────────────────────────┘');
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

    if (detectedKeys.length === 1) {
      // 单 key 零交互 — 自动保存
      const dk = detectedKeys[0];
      const provider = PROVIDER_OPTIONS.find(p => p.envKey === dk.envKey);
      if (provider) {
        await saveConfig(provider.name, dk.key, undefined);
        console.log(`  ✓ 检测到 ${provider.description}，已自动配置！`);
        console.log('  运行 killer 即可启动。');
        return;
      }
    }

    if (detectedKeys.length > 1) {
      console.log('  ✓ 检测到多个 API Key:');
      for (const dk of detectedKeys) {
        const provider = PROVIDER_OPTIONS.find(p => p.envKey === dk.envKey);
        console.log(`    ${provider?.description ?? dk.envKey}: ${maskKey(dk.key)}`);
      }
      console.log('');
      const useDetected = await question('  选择使用哪个？(输入编号，回车=第一个): ');
      const idx = parseInt(useDetected.trim(), 10) - 1;
      const dkIdx = (!isNaN(idx) && idx >= 0 && idx < detectedKeys.length) ? idx : 0;
      const dk = detectedKeys[dkIdx];
      const provider = PROVIDER_OPTIONS.find(p => p.envKey === dk.envKey);
      if (provider) {
        await saveConfig(provider.name, dk.key, undefined);
        console.log(`  ✓ 已配置 ${provider.description}！`);
        return;
      }
      console.log('');
    }

    // ── 核心交互：粘贴 Key 或输入编号 ──
    console.log('  支持的服务商:');
    PROVIDER_OPTIONS.forEach((p, i) => {
      const dual = p.dualProtocol ? ' [双协议]' : '';
      console.log(`    ${String(i + 1).padStart(2)}. ${p.description}${dual}`);
    });
    console.log('');
    const input = await question('  粘贴 Key (或输入编号选择服务商): ');
    const trimmed = input.trim();

    if (!trimmed) {
      console.log('  已取消。运行 killer --init 重试。');
      return;
    }

    // 用户粘贴了一个 Key
    if (!/^\d+$/.test(trimmed)) {
      await handleKeyPaste(trimmed, question);
      return;
    }

    // 用户输入了编号 → 选择服务商
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

    const preset = OPENAI_COMPATIBLE_PROVIDERS[selected.name];
    const link = preset?.helpUrl;
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
async function testConnection(
  provider: string,
  apiKey: string,
  protocol?: 'openai' | 'anthropic',
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const preset = OPENAI_COMPATIBLE_PROVIDERS[provider];
  if (!preset) {
    return { ok: true };
  }

  // 双协议测试：如果指定了 Anthropic 协议，测试 Anthropic 端点
  if (protocol === 'anthropic' && preset.anthropicBaseUrl) {
    try {
      const response = await fetch(preset.anthropicBaseUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: preset.anthropicModels?.[0] ?? preset.defaultModel,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (response.ok) {
        return { ok: true };
      }

      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      return { ok: false, error: err.error?.message || `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // 默认 OpenAI 协议测试
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
 */
export async function saveConfig(
  provider: string,
  apiKey: string,
  model?: string,
  protocol?: 'openai' | 'anthropic',
): Promise<void> {
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

  if (protocol && protocol !== 'openai') {
    lines.push(`KILLER_PROTOCOL=${protocol}`);
  }

  const envContent = lines.join('\n') + '\n';

  // 写入当前目录 .env
  fs.writeFileSync(path.join(process.cwd(), '.env'), envContent, 'utf-8');

  // 写入 ~/.killer/.env（全局）
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
      ...(model && { model }),
      ...(protocol && protocol !== 'openai' && { protocol }),
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
}
