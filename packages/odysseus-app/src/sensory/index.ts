/**
 * Sensory - 感官层
 *
 * 多渠道感知模块，将 Agent 连接到外部世界
 */

// Types
export * from './types.js';

// Channel
export * from './channel.js';

// Router
export * from './router.js';

// Output Manager
export * from './output.js';

// CLI Channel
export * from './cli/index.js';

// Webhook Channel
export * from './webhook/index.js';

// Telegram Channel
export * from './telegram/index.js';

// Code Channel (also serves as FileWatcher)
export * from './code/index.js';

// Discord Channel (stub — requires discord.js)
export * from './discord/index.js';
