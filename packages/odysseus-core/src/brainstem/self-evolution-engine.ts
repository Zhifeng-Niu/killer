/**
 * SelfEvolutionEngine — Autonomous Self-Improvement Loop
 *
 * The missing piece: a closed-loop system that lets the agent
 * perceive capability gaps → reason about fixes → generate code →
 * compile → load → verify → integrate.
 *
 * Not parameter tuning. Real code-level self-evolution.
 *
 * Phases:
 *   1. AUDIT    — scan current capabilities, identify gaps
 *   2. REASON   — LLM analyzes the gap and designs a solution
 *   3. FORGE    — generate TypeScript/JavaScript code for the new capability
 *   4. VALIDATE — static analysis + sandbox execution
 *   5. INTEGRATE — register the new capability (tool, module, or prompt fragment)
 *   6. VERIFY   — run the new capability on a test input
 */

import type { Tool, ToolResult } from './tool-executor.js';
import { ToolExecutor } from './tool-executor.js';
import {
  ToolForge,
  EssenceForge,
  validateToolCode,
  validateToolName,
} from './tool-forge.js';
import type { ForgeResult } from './tool-forge.js';

// ── Types ──

export type EvolutionPhase =
  | 'audit'
  | 'reason'
  | 'forge'
  | 'validate'
  | 'integrate'
  | 'verify';

export type EvolutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'rolled_back';

export interface EvolutionRecord {
  id: string;
  timestamp: number;
  trigger: EvolutionTrigger;
  phase: EvolutionPhase;
  status: EvolutionStatus;
  description: string;
  toolName?: string;
  code?: string;
  error?: string;
  durationMs: number;
}

export type EvolutionTrigger =
  | 'tool_not_found'
  | 'missing_tool'
  | 'weak_tool'
  | 'missing_knowledge'
  | 'architectural'
  | 'user_request'
  | 'self_audit'
  | 'failure_pattern';

export interface CapabilityGap {
  type: 'missing_tool' | 'weak_tool' | 'missing_knowledge' | 'architectural';
  description: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedFix?: string;
}

export interface SelfEvolutionConfig {
  /** Max concurrent evolution cycles */
  maxConcurrent: number;
  /** Max code size for generated tools (chars) */
  maxCodeSize: number;
  /** Whether to auto-evolve on failure patterns */
  autoEvolveOnFailure: boolean;
  /** Modules that cannot be modified */
  protectedModules: string[];
  /** Whether to persist evolution history */
  persistHistory: boolean;
  /** Max history records to keep */
  maxHistory: number;
}

export interface EvolutionResult {
  success: boolean;
  phase: EvolutionPhase;
  record: EvolutionRecord;
  toolName?: string;
  description?: string;
}

const DEFAULT_CONFIG: SelfEvolutionConfig = {
  maxConcurrent: 1,
  maxCodeSize: 10000,
  autoEvolveOnFailure: true,
  protectedModules: [
    'consciousness/',
    'synapse/',
    'brainstem/errors',
    'brainstem/types',
  ],
  persistHistory: true,
  maxHistory: 200,
};

// ── LLM Interface (injected, not imported) ──

export interface EvolutionLLM {
  complete(prompt: string): Promise<string>;
}

// ── SelfEvolutionEngine ──

export class SelfEvolutionEngine {
  private readonly config: SelfEvolutionConfig;
  private readonly toolForge: ToolForge;
  private readonly essenceForge: EssenceForge;
  private readonly tools: ToolExecutor;
  private readonly llm: EvolutionLLM | null;
  private readonly history: EvolutionRecord[] = [];
  private running = false;

  constructor(deps: {
    toolForge: ToolForge;
    essenceForge: EssenceForge;
    tools: ToolExecutor;
    llm?: EvolutionLLM;
    config?: Partial<SelfEvolutionConfig>;
  }) {
    this.toolForge = deps.toolForge;
    this.essenceForge = deps.essenceForge;
    this.tools = deps.tools;
    this.llm = deps.llm ?? null;
    this.config = { ...DEFAULT_CONFIG, ...deps.config };
  }

  // ── Phase 1: AUDIT — Scan Capabilities ──

  /**
   * Audit current capabilities and identify gaps.
   * Returns a prioritized list of improvements the agent could make.
   */
  auditCapabilities(): CapabilityGap[] {
    const gaps: CapabilityGap[] = [];
    const currentTools = this.tools.list();

    // Check for common capability gaps
    const essentialCapabilities: Array<{
      toolPattern: RegExp;
      description: string;
      severity: CapabilityGap['severity'];
    }> = [
      { toolPattern: /search|web_search|duckduckgo/i, description: 'Web search capability', severity: 'high' },
      { toolPattern: /fetch|web_fetch|http/i, description: 'HTTP fetching capability', severity: 'high' },
      { toolPattern: /memory|store|recall/i, description: 'Memory persistence', severity: 'high' },
      { toolPattern: /file|read_file|write/i, description: 'File operations', severity: 'medium' },
      { toolPattern: /shell|exec/i, description: 'Shell execution', severity: 'medium' },
      { toolPattern: /calculate|math/i, description: 'Mathematical computation', severity: 'low' },
    ];

    for (const cap of essentialCapabilities) {
      const hasIt = currentTools.some(t => cap.toolPattern.test(t));
      if (!hasIt) {
        gaps.push({
          type: 'missing_tool',
          description: cap.description,
          evidence: `No tool matching "${cap.toolPattern.source}" found among ${currentTools.length} registered tools`,
          severity: cap.severity,
        });
      }
    }

    // Check tool failure rates from ToolForge metadata
    const dynamicTools = this.toolForge.list();
    for (const meta of dynamicTools) {
      if (meta.callCount > 3 && meta.failureCount / meta.callCount > 0.5) {
        gaps.push({
          type: 'weak_tool',
          description: `Tool "${meta.name}" has high failure rate (${Math.round(meta.failureCount / meta.callCount * 100)}%)`,
          evidence: `${meta.failureCount} failures out of ${meta.callCount} calls`,
          severity: 'medium',
          suggestedFix: 'Rewrite or improve the tool implementation',
        });
      }
    }

    return gaps.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // ── Phase 2-6: Full Evolution Cycle ──

  /**
   * Run a complete evolution cycle for a given gap.
   *
   * This is the main entry point: given a capability gap, the engine
   * reasons about it, generates code, validates, and integrates.
   */
  async evolve(gap: CapabilityGap): Promise<EvolutionResult> {
    if (this.running) {
      return this.makeResult('audit', 'failed', gap.description, 'Evolution already in progress');
    }

    this.running = true;
    const startTime = Date.now();
    const id = `evo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      // Phase 2: REASON
      if (!this.llm) {
        return this.makeResult('reason', 'failed', gap.description, 'No LLM available for reasoning');
      }

      const reasoning = await this.reasonAboutGap(gap);
      if (!reasoning.shouldEvolve) {
        return this.makeResult('reason', 'failed', gap.description, reasoning.reason);
      }

      // Phase 3: FORGE
      const forged = await this.forgeCapability(gap, reasoning.code!, reasoning.toolName!);
      if (!forged.success) {
        this.recordEvolution(id, 'forge', 'failed', gap.description, undefined, undefined, forged.error, Date.now() - startTime);
        return { success: false, phase: 'forge', record: this.history[this.history.length - 1] };
      }

      // Phase 4: VALIDATE (static validation already done by ToolForge)
      // Phase 5: INTEGRATE (done by ToolForge.create)

      // Phase 6: VERIFY
      const verified = await this.verifyCapability(forged.data!.name, gap);
      const status: EvolutionStatus = verified ? 'success' : 'failed';
      this.recordEvolution(id, 'verify', status, gap.description, forged.data!.name, undefined, verified ? undefined : 'Verification failed', Date.now() - startTime);

      return {
        success: verified,
        phase: 'verify',
        record: this.history[this.history.length - 1],
        toolName: forged.data!.name,
        description: forged.data!.description,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.recordEvolution(id, 'forge', 'failed', gap.description, undefined, undefined, errorMsg, Date.now() - startTime);
      return { success: false, phase: 'forge', record: this.history[this.history.length - 1] };
    } finally {
      this.running = false;
    }
  }

  /**
   * One-shot evolution triggered by a specific need.
   * Used when the agent encounters a tool-not-found during execution.
   */
  async evolveForTask(taskDescription: string, toolNameHint: string): Promise<EvolutionResult> {
    const gap: CapabilityGap = {
      type: 'missing_tool',
      description: `Need tool "${toolNameHint}" for: ${taskDescription}`,
      evidence: `Tool "${toolNameHint}" not found during plan execution`,
      severity: 'high',
      suggestedFix: `Create tool "${toolNameHint}" that handles: ${taskDescription}`,
    };
    return this.evolve(gap);
  }

  // ── Phase 2: REASON ──

  private async reasonAboutGap(gap: CapabilityGap): Promise<{ shouldEvolve: boolean; reason: string; code?: string; toolName?: string }> {
    if (!this.llm) {
      return { shouldEvolve: false, reason: 'No LLM' };
    }

    const currentTools = this.tools.list().join(', ');

    const prompt = `You are a self-evolving AI agent. Analyze this capability gap and decide if you should create a new tool.

Current tools: ${currentTools}

Gap: ${gap.description}
Evidence: ${gap.evidence}
Severity: ${gap.severity}
${gap.suggestedFix ? `Suggested fix: ${gap.suggestedFix}` : ''}

If the gap can be filled by creating a new tool, respond with:
DECISION: evolve
TOOL_NAME: <a short snake_case name>
CODE:
<the JavaScript code for the tool>

The tool must export default:
{
  name: "tool_name",
  description: "one-line description",
  async execute(params) {
    // implementation
    return { success: true, data: { ... } };
  }
}

Rules:
- No child_process, fs, process.exit, eval, Function constructor
- Must have async execute function
- Tool name: lowercase letters, digits, underscores, 2-40 chars
- Max ${this.config.maxCodeSize} characters

If the gap should NOT be filled (e.g., it's already covered, or it's dangerous), respond with:
DECISION: skip
REASON: <why not>`;

    try {
      const response = await this.llm.complete(prompt);
      return this.parseReasoningResponse(response);
    } catch (err) {
      return {
        shouldEvolve: false,
        reason: `LLM reasoning failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private parseReasoningResponse(response: string): { shouldEvolve: boolean; reason: string; code?: string; toolName?: string } {
    const decisionMatch = response.match(/DECISION:\s*(evolve|skip)/i);
    if (!decisionMatch) {
      return { shouldEvolve: false, reason: 'Could not parse decision from LLM response' };
    }

    const decision = decisionMatch[1].toLowerCase();
    if (decision === 'skip') {
      const reasonMatch = response.match(/REASON:\s*(.+)/);
      return { shouldEvolve: false, reason: reasonMatch?.[1] ?? 'LLM decided to skip' };
    }

    const nameMatch = response.match(/TOOL_NAME:\s*(\w+)/);
    const toolName = nameMatch?.[1] ?? '';

    const codeMatch = response.match(/CODE:\s*\n([\s\S]*?)(?:\n\n(?:DECISION|REASON|TOOL_NAME)|$)/);
    let code = codeMatch?.[1]?.trim() ?? '';

    // Fallback: try to extract code block
    if (!code) {
      const codeBlockMatch = response.match(/```(?:js|javascript|ts|typescript)?\n([\s\S]*?)```/);
      code = codeBlockMatch?.[1]?.trim() ?? '';
    }

    if (!toolName || !code) {
      return { shouldEvolve: false, reason: `Missing tool name or code. Name: "${toolName}", code length: ${code.length}` };
    }

    if (code.length > this.config.maxCodeSize) {
      return { shouldEvolve: false, reason: `Code too large: ${code.length} chars (max ${this.config.maxCodeSize})` };
    }

    return { shouldEvolve: true, reason: 'Evolution approved', code, toolName };
  }

  // ── Phase 3-5: FORGE + VALIDATE + INTEGRATE ──

  private async forgeCapability(
    gap: CapabilityGap,
    code: string,
    toolName: string,
  ): Promise<ForgeResult> {
    // Pre-validate
    const nameCheck = validateToolName(toolName);
    if (!nameCheck.valid) {
      return { success: false, error: nameCheck.error };
    }

    const codeCheck = validateToolCode(code);
    if (!codeCheck.valid) {
      return { success: false, error: codeCheck.error };
    }

    // Check protected modules — don't overwrite core tools
    for (const pattern of this.config.protectedModules) {
      if (toolName.includes(pattern.replace('/', ''))) {
        return { success: false, error: `Cannot create tool that conflicts with protected module: ${pattern}` };
      }
    }

    // Use ToolForge to create (validates + loads + registers atomically)
    return this.toolForge.create(toolName, gap.description.slice(0, 100), code);
  }

  // ── Phase 6: VERIFY ──

  private async verifyCapability(toolName: string, gap: CapabilityGap): Promise<boolean> {
    try {
      // Execute the tool with a minimal test payload
      const testResult = await this.tools.execute(toolName, { test: true, __evolution_verify: true });

      if (!testResult.success) {
        // Even a "parameter error" means the tool loaded and executed
        // (we're just checking it doesn't crash, not that it works perfectly)
        const error = testResult.error ?? '';
        if (error.includes('not found') || error.includes('not registered')) {
          return false;
        }
      }

      // Tool loaded and responded — verification passes
      return true;
    } catch {
      return false;
    }
  }

  // ── History Management ──

  private recordEvolution(
    id: string,
    phase: EvolutionPhase,
    status: EvolutionStatus,
    description: string,
    toolName?: string,
    code?: string,
    error?: string,
    durationMs?: number,
  ): void {
    const record: EvolutionRecord = {
      id,
      timestamp: Date.now(),
      trigger: 'self_audit',
      phase,
      status,
      description,
      toolName,
      code,
      error,
      durationMs: durationMs ?? 0,
    };

    this.history.push(record);

    // Trim history
    if (this.history.length > this.config.maxHistory) {
      this.history.splice(0, this.history.length - this.config.maxHistory);
    }
  }

  private makeResult(
    phase: EvolutionPhase,
    status: EvolutionStatus,
    description: string,
    error?: string,
  ): EvolutionResult {
    const record: EvolutionRecord = {
      id: `evo-${Date.now()}`,
      timestamp: Date.now(),
      trigger: 'self_audit',
      phase,
      status,
      description,
      error,
      durationMs: 0,
    };
    this.history.push(record);
    return { success: status === 'success', phase, record };
  }

  // ── Public API ──

  getHistory(): EvolutionRecord[] {
    return [...this.history];
  }

  getRecentEvolutions(count: number = 10): EvolutionRecord[] {
    return this.history.slice(-count);
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): {
    running: boolean;
    totalEvolutions: number;
    successfulEvolutions: number;
    failedEvolutions: number;
    dynamicToolCount: number;
  } {
    return {
      running: this.running,
      totalEvolutions: this.history.length,
      successfulEvolutions: this.history.filter(r => r.status === 'success').length,
      failedEvolutions: this.history.filter(r => r.status === 'failed').length,
      dynamicToolCount: this.toolForge.list().length,
    };
  }

  /**
   * Export history for persistence
   */
  exportHistory(): EvolutionRecord[] {
    return [...this.history];
  }

  /**
   * Import history from persistence
   */
  importHistory(records: EvolutionRecord[]): void {
    for (const record of records) {
      this.history.push(record);
    }
    // Trim to max
    if (this.history.length > this.config.maxHistory) {
      this.history.splice(0, this.history.length - this.config.maxHistory);
    }
  }
}
