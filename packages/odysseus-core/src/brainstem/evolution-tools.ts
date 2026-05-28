/**
 * Evolution Tools — Agent-facing tools for self-evolution
 *
 * Three tools that expose the SelfEvolutionEngine to the agent:
 *   evolve_audit  — scan capabilities, identify gaps
 *   evolve_self   — trigger autonomous evolution to fill a gap
 *   evolve_status — query evolution history and stats
 */

import type { Tool, ToolResult } from './tool-executor.js';
import type { SelfEvolutionEngine, CapabilityGap } from './self-evolution-engine.js';

// ── EvolveAuditTool ──

export class EvolveAuditTool implements Tool {
  readonly name = 'evolve_audit';
  readonly description =
    'Audit your own capabilities and identify gaps. ' +
    'Returns a prioritized list of missing or weak capabilities you could evolve. ' +
    'No params needed.';
  private readonly engine: SelfEvolutionEngine;

  constructor(engine: SelfEvolutionEngine) {
    this.engine = engine;
  }

  async execute(_params: unknown): Promise<ToolResult> {
    const gaps = this.engine.auditCapabilities();
    const status = this.engine.getStatus();

    return {
      success: true,
      data: {
        summary: {
          totalTools: status.dynamicToolCount + (gaps.length > 0 ? 0 : 0),
          gapsFound: gaps.length,
          evolutionHistory: {
            total: status.totalEvolutions,
            successful: status.successfulEvolutions,
            failed: status.failedEvolutions,
          },
        },
        gaps: gaps.map(g => ({
          type: g.type,
          severity: g.severity,
          description: g.description,
          evidence: g.evidence,
          suggestedFix: g.suggestedFix,
        })),
        recommendation: gaps.length > 0
          ? `Use evolve_self to address the "${gaps[0].description}" gap (severity: ${gaps[0].severity})`
          : 'No significant gaps found. You are operating at full capability.',
      },
    };
  }
}

// ── EvolveSelfTool ──

export class EvolveSelfTool implements Tool {
  readonly name = 'evolve_self';
  readonly description =
    'Evolve a new capability to fill a gap. ' +
    'Params: { description: string, severity?: "low"|"medium"|"high"|"critical", suggestedFix?: string }. ' +
    'The engine will reason about the gap, generate code, validate, and register the new tool. ' +
    'Returns the new tool name if successful.';
  private readonly engine: SelfEvolutionEngine;

  constructor(engine: SelfEvolutionEngine) {
    this.engine = engine;
  }

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Params required: { description, severity?, suggestedFix? }' };
    }

    const { description, severity = 'medium', suggestedFix } = params as {
      description?: string;
      severity?: string;
      suggestedFix?: string;
    };

    if (!description) {
      return { success: false, error: '"description" is required — describe the capability you need' };
    }

    if (this.engine.isRunning()) {
      return { success: false, error: 'Evolution already in progress. Wait for it to complete.' };
    }

    const gap: CapabilityGap = {
      type: 'missing_tool',
      description,
      evidence: `Agent requested evolution for: ${description}`,
      severity: (['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium') as CapabilityGap['severity'],
      suggestedFix,
    };

    const result = await this.engine.evolve(gap);

    if (result.success) {
      return {
        success: true,
        data: {
          message: `Evolution successful! New tool "${result.toolName}" is now available.`,
          toolName: result.toolName,
          description: result.description,
          phase: result.phase,
        },
      };
    }

    return {
      success: false,
      error: `Evolution failed at phase "${result.phase}": ${result.record.error ?? 'unknown error'}`,
    };
  }
}

// ── MutateSourceTool ──

export class MutateSourceTool implements Tool {
  readonly name = 'mutate_source';
  readonly description =
    'Modify your own source code at runtime. ' +
    'Params: { path: string, instruction: string, projectRoot: string }. ' +
    'Reads the file, sends instruction to LLM, writes modified source, compiles, and rolls back on failure.';
  private readonly engine: SelfEvolutionEngine;

  constructor(engine: SelfEvolutionEngine) {
    this.engine = engine;
  }

  async execute(params: unknown): Promise<ToolResult> {
    if (typeof params !== 'object' || params === null) {
      return { success: false, error: 'Params required: { path, instruction, projectRoot }' };
    }

    const { path, instruction, projectRoot } = params as {
      path?: string;
      instruction?: string;
      projectRoot?: string;
    };

    if (!path) return { success: false, error: '"path" is required — the file to modify' };
    if (!instruction) return { success: false, error: '"instruction" is required — describe what to change' };
    if (!projectRoot) return { success: false, error: '"projectRoot" is required — for compilation verification' };

    const result = await this.engine.mutateSource({ filePath: path, instruction, projectRoot });

    if (result.success) {
      return {
        success: true,
        data: {
          message: `Source mutated successfully: ${path}`,
          description: result.description,
          phase: result.phase,
        },
      };
    }

    return {
      success: false,
      error: `Source mutation failed at phase "${result.phase}": ${result.record.error ?? 'unknown'}`,
    };
  }
}

// ── EvolveStatusTool ──

export class EvolveStatusTool implements Tool {
  readonly name = 'evolve_status';
  readonly description =
    'Check the status of your self-evolution system. ' +
    'Params: { detail?: "summary"|"history"|"all" (default "summary") }. ' +
    'Shows evolution stats and recent history.';
  private readonly engine: SelfEvolutionEngine;

  constructor(engine: SelfEvolutionEngine) {
    this.engine = engine;
  }

  async execute(params: unknown): Promise<ToolResult> {
    const { detail = 'summary' } = (typeof params === 'object' && params !== null ? params : {}) as { detail?: string };
    const status = this.engine.getStatus();

    if (detail === 'summary') {
      return {
        success: true,
        data: {
          running: status.running,
          totalEvolutions: status.totalEvolutions,
          successful: status.successfulEvolutions,
          failed: status.failedEvolutions,
          dynamicTools: status.dynamicToolCount,
        },
      };
    }

    const history = detail === 'history'
      ? this.engine.getRecentEvolutions(20)
      : this.engine.getHistory();

    return {
      success: true,
      data: {
        status: {
          running: status.running,
          totalEvolutions: status.totalEvolutions,
          successful: status.successfulEvolutions,
          failed: status.failedEvolutions,
          dynamicTools: status.dynamicToolCount,
        },
        history: history.map(r => ({
          id: r.id,
          timestamp: new Date(r.timestamp).toISOString(),
          phase: r.phase,
          status: r.status,
          description: r.description,
          toolName: r.toolName,
          error: r.error,
          durationMs: r.durationMs,
        })),
      },
    };
  }
}
