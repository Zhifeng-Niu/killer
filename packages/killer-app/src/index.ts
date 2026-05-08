/**
 * @killer/app - Killer Agent Framework Application Layer
 *
 * 应用层，提供：
 * - Sensory: 感官层（多渠道感知）
 * - Persona: 人格基因组（DNA 解析与表达、镜像神经元、用户建模、情感引擎、预测模型）
 * - Skills: Skill 生态（动态生成、测试、改进、编译）
 * - LLM: 语言模型提供者（Anthropic/OpenAI/OpenRouter/Mock + 熔断器）
 * - Orchestrator: 编排器（整合所有模块）
 * - Config: 配置系统（5 层覆盖）
 * - Plugins: 插件框架（动态加载、工具/命令注册）
 * - Session: 会话持久化
 * - Metrics: 指标收集 + 健康监控
 * - Log: 结构化日志
 */

// Sensory
export * from './sensory/index.js';

// Persona (types + engine + emotional state + predictive model)
export * from './persona/types.js';
export * from './persona/engine.js';
export { EmotionalStateEngine } from './persona/emotional-state.js';
export { PredictiveUserModel } from './persona/predictive-model.js';

// Skills
export * from './skills/types.js';
export * from './skills/manager.js';

// LLM Providers
export * from './llm/index.js';

// Orchestrator
export * from './orchestrator/index.js';

// Config
export * from './config/index.js';

// Plugins
export * from './plugins/index.js';

// Session
export * from './session/index.js';

// Metrics (collector + health monitor)
export * from './metrics/index.js';

// Log
export * from './log/index.js';
