/**
 * Prefrontal Cortex - 风险评估器
 *
 * 评估不同行动的风险水平
 */

import type { RiskAssessment, RiskFactor, RiskLevel } from './types.js';

/**
 * 行动类型基础风险分数
 */
const ACTION_BASE_RISKS: Record<string, number> = {
  code_edit: 0.6,
  cell_create: 0.7,
  message_send: 0.3,
  tool_call: 0.2,
  memory_store: 0.1,
  file_delete: 0.8,
  network_request: 0.4,
  system_command: 0.9,
  default: 0.5,
};

/**
 * 风险评估器
 *
 * 负责评估不同行动的风险水平
 */
export class RiskAssessor {
  /**
   * 评估行动风险
   */
  assess(action: { type: string; payload?: unknown }): RiskAssessment {
    const baseRisk = this.getBaseRisk(action.type);
    const factors = this.assessFactors(action);
    const mitigations = this.generateMitigations(action, factors);
    const overallScore = this.calculateOverallScore(baseRisk, factors);
    const level = this.getRiskLevel(overallScore);

    return {
      level,
      factors,
      mitigations,
      overallScore,
    };
  }

  /**
   * 获取行动类型的基础风险
   */
  private getBaseRisk(actionType: string): number {
    return ACTION_BASE_RISKS[actionType] ?? ACTION_BASE_RISKS.default;
  }

  /**
   * 评估风险因子
   */
  private assessFactors(action: { type: string; payload?: unknown }): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // 可逆性因子
    factors.push(this.assessReversibility(action));

    // 范围因子
    factors.push(this.assessScope(action));

    // 时间敏感性因子
    factors.push(this.assessTimeSensitivity(action));

    return factors;
  }

  /**
   * 评估可逆性
   */
  private assessReversibility(action: { type: string; payload?: unknown }): RiskFactor {
    const irreversibleActions = ['file_delete', 'system_command', 'code_edit'];
    const probability = irreversibleActions.includes(action.type) ? 0.7 : 0.2;
    const impact = 0.8;

    return {
      name: 'reversibility',
      description: '操作是否可撤销',
      probability,
      impact,
    };
  }

  /**
   * 评估影响范围
   */
  private assessScope(action: { type: string; payload?: unknown }): RiskFactor {
    let probability = 0.3;
    let impact = 0.5;

    switch (action.type) {
      case 'system_command':
      case 'file_delete':
        impact = 0.9;
        break;
      case 'code_edit':
        impact = 0.7;
        probability = 0.5;
        break;
      case 'message_send':
        impact = 0.4;
        break;
      default:
        impact = 0.3;
    }

    return {
      name: 'scope',
      description: '操作影响范围',
      probability,
      impact,
    };
  }

  /**
   * 评估时间敏感性
   */
  private assessTimeSensitivity(action: { type: string }): RiskFactor {
    // 时间敏感性通常影响不大，但某些操作在高负载时风险更高
    const probability = 0.2;
    const impact = 0.3;

    return {
      name: 'time_sensitivity',
      description: '时间压力带来的风险',
      probability,
      impact,
    };
  }

  /**
   * 计算综合风险分数
   */
  private calculateOverallScore(baseRisk: number, factors: RiskFactor[]): number {
    if (factors.length === 0) {
      return baseRisk;
    }

    // 计算因子最大值（最坏情况）
    const factorMax = Math.max(
      ...factors.map(factor => factor.probability * factor.impact)
    );

    // 对于高风险操作（baseRisk >= 0.7），使用更激进的策略
    // 确保高风险操作不会被降低到中等风险
    if (baseRisk >= 0.7) {
      // 高风险操作：基础风险占 80%，因子最大值占 20%
      return baseRisk * 0.8 + factorMax * 0.2;
    }

    // 中低风险操作：基础风险占 60%，因子最大值占 40%
    return baseRisk * 0.6 + factorMax * 0.4;
  }

  /**
   * 根据分数获取风险等级
   */
  private getRiskLevel(score: number): RiskLevel {
    if (score < 0.2) return 'negligible';
    if (score < 0.4) return 'low';
    if (score < 0.6) return 'moderate';
    if (score < 0.8) return 'high';
    return 'critical';
  }

  /**
   * 生成缓解措施建议
   */
  private generateMitigations(
    action: { type: string; payload?: unknown },
    factors: RiskFactor[]
  ): string[] {
    const mitigations: string[] = [];

    // 基于行动类型
    switch (action.type) {
      case 'code_edit':
        mitigations.push('建议先在测试环境验证');
        mitigations.push('确保有版本控制备份');
        break;
      case 'file_delete':
        mitigations.push('确认文件路径正确');
        mitigations.push('确认文件不再被需要');
        break;
      case 'system_command':
        mitigations.push('验证命令参数');
        mitigations.push('在沙盒环境中执行');
        break;
      case 'cell_create':
        mitigations.push('验证输入数据格式');
        mitigations.push('设置资源限制');
        break;
    }

    // 基于风险因子
    for (const factor of factors) {
      if (factor.name === 'reversibility' && factor.probability > 0.5) {
        mitigations.push('操作不可逆，请谨慎执行');
      }
      if (factor.name === 'scope' && factor.impact > 0.7) {
        mitigations.push('操作影响范围大，建议分步执行');
      }
    }

    return mitigations;
  }

  /**
   * 批量评估多个行动
   */
  assessBatch(actions: Array<{ type: string; payload?: unknown }>): RiskAssessment[] {
    return actions.map(action => this.assess(action));
  }

  /**
   * 比较两个行动的风险
   */
  compare(
    action1: { type: string; payload?: unknown },
    action2: { type: string; payload?: unknown }
  ): {
    action1Risk: RiskAssessment;
    action2Risk: RiskAssessment;
    safer: 'action1' | 'action2' | 'equal';
    difference: number;
  } {
    const action1Risk = this.assess(action1);
    const action2Risk = this.assess(action2);

    const difference = Math.abs(action1Risk.overallScore - action2Risk.overallScore);
    let safer: 'action1' | 'action2' | 'equal' = 'equal';

    if (action1Risk.overallScore < action2Risk.overallScore) {
      safer = 'action1';
    } else if (action2Risk.overallScore < action1Risk.overallScore) {
      safer = 'action2';
    }

    return {
      action1Risk,
      action2Risk,
      safer,
      difference,
    };
  }
}
