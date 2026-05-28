/**
 * Prefrontal Cortex - 智能步骤验证器
 *
 * 多维度验证 plan step 执行结果，替代简单的非空+长度检查。
 * 支持：内容完整性、工具调用成功率、目标对齐度、代码质量。
 */

/** 验证维度 */
export type VerificationDimension =
  | 'completeness'
  | 'error_signals'
  | 'goal_alignment'
  | 'tool_success'
  | 'code_quality';

/** 单维度验证结果 */
export interface DimensionResult {
  dimension: VerificationDimension;
  passed: boolean;
  score: number;
  reason?: string;
}

/** 综合验证结果 */
export interface StepVerification {
  valid: boolean;
  overallScore: number;
  dimensions: DimensionResult[];
  reason?: string;
  /** 建议的恢复策略 */
  suggestedStrategy?: 'continue' | 'retry' | 'replan' | 'decompose' | 'escalate';
}

/** 验证器配置 */
export interface StepVerifierConfig {
  /** 综合通过阈值（0-1） */
  passThreshold: number;
  /** 是否检查代码质量 */
  checkCodeQuality: boolean;
  /** 错误信号关键词 */
  errorSignals: string[];
}

const DEFAULT_CONFIG: StepVerifierConfig = {
  passThreshold: 0.5,
  checkCodeQuality: true,
  errorSignals: ['error:', 'exception:', 'failed:', 'timeout', 'unauthorized', 'forbidden', 'fatal:'],
};

/** 代码质量指标 */
interface CodeQualityMetrics {
  hasCode: boolean;
  hasTests: boolean;
  hasErrorHandling: boolean;
  estimatedLines: number;
}

/**
 * 智能步骤验证器
 *
 * 多维度验证执行结果质量，提供恢复策略建议。
 */
export class StepVerifier {
  private readonly config: StepVerifierConfig;

  constructor(config?: Partial<StepVerifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 验证 step 执行结果
   */
  verify(stepDescription: string, response: string, context?: VerificationContext): StepVerification {
    const dimensions: DimensionResult[] = [];

    // 1. 内容完整性
    dimensions.push(this.checkCompleteness(stepDescription, response));

    // 2. 错误信号检测
    dimensions.push(this.checkErrorSignals(response));

    // 3. 目标对齐度
    dimensions.push(this.checkGoalAlignment(stepDescription, response));

    // 4. 工具调用成功率
    if (context?.toolCalls) {
      dimensions.push(this.checkToolSuccess(context.toolCalls));
    }

    // 5. 代码质量（如果 step 涉及代码）
    if (this.config.checkCodeQuality && this.isCodeStep(stepDescription)) {
      dimensions.push(this.checkCodeQuality(response));
    }

    const overallScore = this.calculateOverallScore(dimensions);
    const valid = overallScore >= this.config.passThreshold;

    return {
      valid,
      overallScore,
      dimensions,
      reason: valid ? undefined : this.buildFailureReason(dimensions),
      suggestedStrategy: this.suggestStrategy(dimensions, overallScore),
    };
  }

  private checkCompleteness(stepDesc: string, response: string): DimensionResult {
    if (!response || response.trim().length === 0) {
      return { dimension: 'completeness', passed: false, score: 0, reason: 'Empty response' };
    }

    if (response.length < 10) {
      return { dimension: 'completeness', passed: false, score: 0.1, reason: 'Response too short' };
    }

    // 检查响应是否包含与步骤描述相关的关键词
    const descWords = stepDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const responseLower = response.toLowerCase();
    const relevantWords = descWords.filter(w => responseLower.includes(w));
    const relevanceRatio = descWords.length > 0 ? relevantWords.length / descWords.length : 0.5;

    const score = Math.min(1, 0.4 + relevanceRatio * 0.6);
    return {
      dimension: 'completeness',
      passed: score >= 0.4,
      score,
      reason: score < 0.4 ? `Low relevance: ${relevantWords.length}/${descWords.length} keywords matched` : undefined,
    };
  }

  private checkErrorSignals(response: string): DimensionResult {
    const lower = response.toLowerCase();
    const firstLine = response.split('\n')[0].toLowerCase();

    for (const signal of this.config.errorSignals) {
      if (firstLine.includes(signal)) {
        // "I cannot" 类的正常拒绝不算错误
        if (lower.includes('i cannot') || lower.includes("i can't")) {
          return { dimension: 'error_signals', passed: true, score: 0.7 };
        }
        return { dimension: 'error_signals', passed: false, score: 0, reason: `Error signal in first line: ${firstLine.slice(0, 80)}` };
      }
    }

    // 检查整体错误密度
    let errorCount = 0;
    for (const signal of this.config.errorSignals) {
      if (lower.includes(signal)) errorCount++;
    }

    const score = Math.max(0, 1 - errorCount * 0.2);
    return { dimension: 'error_signals', passed: true, score };
  }

  private checkGoalAlignment(stepDesc: string, response: string): DimensionResult {
    const descLower = stepDesc.toLowerCase();

    // 检测步骤类型
    const isImplementation = /^(implement|create|build|add|write|fix|refactor|update)/i.test(descLower);
    const isAnalysis = /^(analyze|review|check|investigate|search|find|read)/i.test(descLower);
    const isTesting = /^(test|verify|validate|run)/i.test(descLower);

    const responseLower = response.toLowerCase();

    if (isImplementation) {
      // 实现类步骤：期望包含代码块或文件路径
      const hasCodeBlock = response.includes('```') || response.includes('function ') || response.includes('class ');
      const hasFilePath = /[a-zA-Z0-9_/]+\.(ts|tsx|js|jsx|py|go|rs)/.test(response);
      const hasEdits = responseLower.includes('edit') || responseLower.includes('created') || responseLower.includes('modified');

      const score = (hasCodeBlock ? 0.4 : 0) + (hasFilePath ? 0.3 : 0) + (hasEdits ? 0.3 : 0);
      return {
        dimension: 'goal_alignment',
        passed: score >= 0.3,
        score: Math.min(1, score),
        reason: score < 0.3 ? 'Implementation step lacks code blocks or file references' : undefined,
      };
    }

    if (isAnalysis) {
      // 分析类步骤：期望包含发现或结论
      const hasFindings = responseLower.includes('found') || responseLower.includes('result') || responseLower.includes('analysis');
      const hasSpecifics = response.length > 100; // 分析结果应该有一定长度
      const score = (hasFindings ? 0.6 : 0.2) + (hasSpecifics ? 0.4 : 0);
      return {
        dimension: 'goal_alignment',
        passed: score >= 0.4,
        score: Math.min(1, score),
        reason: score < 0.4 ? 'Analysis step lacks findings or conclusions' : undefined,
      };
    }

    if (isTesting) {
      // 测试类步骤：期望包含通过/失败信息
      const hasPassFail = responseLower.includes('pass') || responseLower.includes('fail') || responseLower.includes('success');
      const hasTestOutput = responseLower.includes('test') && response.length > 50;
      const score = (hasPassFail ? 0.6 : 0.2) + (hasTestOutput ? 0.4 : 0);
      return {
        dimension: 'goal_alignment',
        passed: score >= 0.4,
        score: Math.min(1, score),
      };
    }

    // 通用步骤：基本检查
    return { dimension: 'goal_alignment', passed: true, score: 0.7 };
  }

  private checkToolSuccess(toolCalls: ToolCallResult[]): DimensionResult {
    if (toolCalls.length === 0) {
      return { dimension: 'tool_success', passed: true, score: 1 };
    }

    const successCount = toolCalls.filter(tc => tc.success).length;
    const score = successCount / toolCalls.length;

    return {
      dimension: 'tool_success',
      passed: score >= 0.5,
      score,
      reason: score < 1 ? `${toolCalls.length - successCount}/${toolCalls.length} tool calls failed` : undefined,
    };
  }

  private checkCodeQuality(response: string): DimensionResult {
    const metrics = this.analyzeCodeQuality(response);

    let score = 0;
    if (metrics.hasCode) score += 0.3;
    if (metrics.hasErrorHandling) score += 0.3;
    if (metrics.hasTests) score += 0.2;
    if (metrics.estimatedLines > 0 && metrics.estimatedLines < 200) score += 0.2;

    return {
      dimension: 'code_quality',
      passed: score >= 0.3,
      score: Math.min(1, score),
      reason: !metrics.hasCode ? 'No code detected in response' : undefined,
    };
  }

  private isCodeStep(stepDesc: string): boolean {
    return /^(implement|create|build|add|write|fix|refactor|update|code|develop)/i.test(stepDesc);
  }

  private analyzeCodeQuality(response: string): CodeQualityMetrics {
    const codeBlocks = response.match(/```[\s\S]*?```/g) ?? [];
    const allCode = codeBlocks.join('\n');

    return {
      hasCode: allCode.length > 0,
      hasTests: /test\(|describe\(|it\(|expect\(/.test(allCode),
      hasErrorHandling: /try\s*\{|catch\s*\(|\.catch\(|on\('error/.test(allCode),
      estimatedLines: allCode.split('\n').length,
    };
  }

  private calculateOverallScore(dimensions: DimensionResult[]): number {
    if (dimensions.length === 0) return 0;

    const weights: Record<VerificationDimension, number> = {
      completeness: 0.3,
      error_signals: 0.25,
      goal_alignment: 0.25,
      tool_success: 0.1,
      code_quality: 0.1,
    };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const dim of dimensions) {
      const weight = weights[dim.dimension] ?? 0.1;
      weightedSum += dim.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private suggestStrategy(dimensions: DimensionResult[], score: number): StepVerification['suggestedStrategy'] {
    if (score >= 0.7) return 'continue';

    const failedDims = dimensions.filter(d => !d.passed);

    if (failedDims.some(d => d.dimension === 'error_signals' && d.score === 0)) {
      return 'retry';
    }

    if (failedDims.some(d => d.dimension === 'goal_alignment' && d.score < 0.2)) {
      return 'replan';
    }

    if (failedDims.some(d => d.dimension === 'completeness' && d.score < 0.3)) {
      return 'decompose';
    }

    if (score < 0.3) return 'escalate';

    return 'retry';
  }

  private buildFailureReason(dimensions: DimensionResult[]): string {
    const failed = dimensions.filter(d => !d.passed);
    return failed.map(d => `${d.dimension}: ${d.reason ?? `score=${d.score.toFixed(2)}`}`).join('; ');
  }
}

/** 工具调用结果（用于验证上下文） */
export interface ToolCallResult {
  tool: string;
  success: boolean;
  error?: string;
}

/** 验证上下文 */
export interface VerificationContext {
  toolCalls?: ToolCallResult[];
  previousResults?: Array<{ stepDescription: string; response: string }>;
}
