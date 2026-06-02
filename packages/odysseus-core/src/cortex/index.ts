/**
 * Cortex - 皮层模块
 *
 * 达尔文式进化引擎：技能生态、DNA 突变、适应度评估
 */

// Types
export type {
  ColumnProfile,
  PersonalityGenes,
  PreferenceGenes,
  StrategyGenes,
  Skill,
  SkillType,
  Mutation,
  MutationType,
  FitnessScore,
} from './types.js';

export type {
  IEvolutionEngine,
  EvolutionConfig,
} from './evolution.js';

export type {
  SkillTestResult,
  SkillGenerationConfig,
} from './skill-eco.js';

export type {
  EvolutionCandidate,
  FitnessReflectionOutcome,
  EngineEvolutionConfig,
} from './evolution-engine.js';

// Classes
export { SkillEcosystem } from './skill-eco.js';
export { EvolutionEngine } from './evolution-engine.js';
export { CuriosityEngine } from './curiosity-engine.js';

// Curiosity types
export type {
  KnowledgeGap,
  ExplorationStrategy,
  ExplorationResult,
  DiscoveryEntry,
  InterestProfile,
} from './curiosity-engine.js';

// Constants
export { DEFAULT_EVOLUTION_CONFIG } from './evolution.js';
