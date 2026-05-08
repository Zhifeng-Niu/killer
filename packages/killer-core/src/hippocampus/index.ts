/**
 * Hippocampus - 海马体模块
 *
 * 六层记忆系统：工作记忆、情景记忆、语义记忆、程序记忆、前瞻记忆、梦境
 */

// Types
export type {
  Episode,
  SemanticNode,
  SemanticNodeType,
  SemanticRelation,
  ProceduralMemory,
  ProspectiveMemory,
  WorkingMemory,
  DreamMemory,
  AssociativeQuery,
  AssociativeResult,
  AutobiographicalNarrative,
  NarrativeChapter,
  RelationshipNarrative,
} from './types.js';

export type {
  DreamingResult,
  MemoryConfig,
  IMemoryEngine,
} from './memory.js';

export type {
  AssociationConfig,
  ActivatedNode,
} from './association.js';

export type {
  ForgettingConfig,
} from './forgetting.js';

export type {
  DreamResult,
  DreamingConfig,
} from './dreaming.js';

export type {
  NarrativeSynthesisConfig,
} from './narrative-synthesis.js';

export type {
  SimpleHippocampusConfig,
} from './hippocampus-engine.js';

// Enums
export { MemoryLayer } from './types.js';

// Classes
export { HippocampusEngine } from './memory.js';
export { AssociationEngine } from './association.js';
export { DreamEngine } from './dreaming.js';
export { NarrativeSynthesisEngine } from './narrative-synthesis.js';
export { HippocampusMemoryEngine } from './hippocampus-engine.js';

// Functions
export {
  calculateRetention,
  shouldRecall,
  reinforce,
  decay,
  calculateNextReview,
  applyForgettingCurve,
  getMemoryHealth,
} from './forgetting.js';

// Constants
export {
  DEFAULT_MEMORY_CONFIG,
} from './memory.js';

export {
  DEFAULT_ASSOCIATION_CONFIG,
} from './association.js';

export {
  DEFAULT_FORGETTING_CONFIG,
} from './forgetting.js';

export {
  DEFAULT_DREAMING_CONFIG,
} from './dreaming.js';

export {
  DEFAULT_SIMPLE_CONFIG,
} from './hippocampus-engine.js';
