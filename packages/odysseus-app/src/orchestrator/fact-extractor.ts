/**
 * Fact Extractor - 实时事实提取
 *
 * 从用户输入中检测并提取语义事实（用户偏好、个人信息、重要声明等），
 * 立即存储到 hippocampus 语义记忆中，而非等待上下文溢出时的摘要。
 */

/**
 * 提取的事实
 */
export interface ExtractedFact {
  /** 事实类别 */
  category: 'identity' | 'preference' | 'knowledge' | 'relationship' | 'goal' | 'event' | 'fact';
  /** 人类可读标签 */
  label: string;
  /** 结构化属性 */
  properties: Record<string, unknown>;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 事实提取模式
 *
 * 每个模式包含：正则表达式、类别、属性提取函数
 */
interface FactPattern {
  pattern: RegExp;
  category: ExtractedFact['category'];
  extract: (match: RegExpMatchArray) => { label: string; properties: Record<string, unknown> } | null;
}

/**
 * 英文 + 中文事实提取模式
 */
const FACT_PATTERNS: FactPattern[] = [
  // === 身份信息 ===
  {
    pattern: /(?:my name is|i'm called|call me|i am)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i,
    category: 'identity',
    extract: (m) => ({ label: `User Name: ${m[1]}`, properties: { name: m[1], field: 'name' } }),
  },
  {
    pattern: /(?:我叫|我的名字是|名字叫)\s*(\S{1,10})/u,
    category: 'identity',
    extract: (m) => ({ label: `用户名: ${m[1]}`, properties: { name: m[1], field: 'name' } }),
  },
  {
    pattern: /i (?:work at|am at|am with|am employed (?:at|by))\s+([A-Z][\w\s&]+?)(?:\.|,|$)/i,
    category: 'identity',
    extract: (m) => ({ label: `User Company: ${m[1].trim()}`, properties: { company: m[1].trim(), field: 'company' } }),
  },
  {
    pattern: /(?:我在|我在|公司是)\s*(\S{1,20})(?:工作|上班|任职)/u,
    category: 'identity',
    extract: (m) => ({ label: `用户公司: ${m[1]}`, properties: { company: m[1], field: 'company' } }),
  },
  {
    pattern: /i (?:am|work as|'m)\s+(?:a |an )?(\w[\w\s]{1,30}?)(?:\.|,| at| in| and|$)/i,
    category: 'identity',
    extract: (m) => {
      const role = m[1].trim().toLowerCase();
      // 过滤掉太泛化的匹配
      if (['a', 'the', 'not', 'very', 'so', 'just', 'also', 'still', 'already'].includes(role)) {
        return null;
      }
      const jobWords = ['engineer', 'developer', 'designer', 'manager', 'scientist', 'analyst', 'architect', 'director', 'lead', 'intern', 'researcher', 'programmer', 'consultant', 'student', 'teacher'];
      if (!jobWords.some(w => role.includes(w))) return null;
      return { label: `User Role: ${m[1].trim()}`, properties: { role: m[1].trim(), field: 'role' } };
    },
  },
  {
    pattern: /(?:我是|职业是|做)\s*(\S{1,15})(?:工程师|开发|设计|经理|分析师|架构|程序员|学生|老师|研究者|工作)/u,
    category: 'identity',
    extract: (m) => ({ label: `用户职业: ${m[1]}`, properties: { role: m[1], field: 'role' } }),
  },
  {
    pattern: /i live (?:in|at|near)\s+([A-Z][\w\s]+?)(?:\.|,|$)/i,
    category: 'identity',
    extract: (m) => ({ label: `User Location: ${m[1].trim()}`, properties: { location: m[1].trim(), field: 'location' } }),
  },
  {
    pattern: /(?:我住|住在|生活在|在)\s*([\u4e00-\u9fff]{1,8})(?:，|。|,|\.|$)/u,
    category: 'identity',
    extract: (m) => ({ label: `用户位置: ${m[1]}`, properties: { location: m[1], field: 'location' } }),
  },

  // === 偏好 ===
  {
    pattern: /i (?:prefer|like|love|enjoy|favor)\s+([\w\s]{3,40}?)(?:\.|,| over| instead| rather|$)/i,
    category: 'preference',
    extract: (m) => ({ label: `Prefers: ${m[1].trim()}`, properties: { preference: m[1].trim(), sentiment: 'positive' } }),
  },
  {
    pattern: /i (?:don't like|dislike|hate|avoid|can't stand)\s+([\w\s]{3,40}?)(?:\.|,|$)/i,
    category: 'preference',
    extract: (m) => ({ label: `Dislikes: ${m[1].trim()}`, properties: { preference: m[1].trim(), sentiment: 'negative' } }),
  },
  {
    pattern: /(?:我喜欢|偏好|爱好|最爱)\s*([\u4e00-\u9fff\w\s]{1,20}?)(?:，|。|,|\.|$)/u,
    category: 'preference',
    extract: (m) => ({ label: `偏好: ${m[1].trim()}`, properties: { preference: m[1].trim(), sentiment: 'positive' } }),
  },
  {
    pattern: /(?:我不喜欢|讨厌|不爱)\s*([\u4e00-\u9fff\w\s]{1,20}?)(?:，|。|,|\.|$)/u,
    category: 'preference',
    extract: (m) => ({ label: `不喜欢: ${m[1].trim()}`, properties: { preference: m[1].trim(), sentiment: 'negative' } }),
  },
  {
    pattern: /(?:i always|i usually|i typically|i tend to|i'm used to)\s+([\w\s]{3,40}?)(?:\.|,|$)/i,
    category: 'preference',
    extract: (m) => ({ label: `Habit: ${m[1].trim()}`, properties: { habit: m[1].trim() } }),
  },
  {
    pattern: /(?:please |can you )(?:always|never|usually|make sure|be sure|remember to)\s+([\w\s]{3,40}?)(?:\.|,|$)/i,
    category: 'preference',
    extract: (m) => ({ label: `Instruction: ${m[1].trim()}`, properties: { instruction: m[1].trim() } }),
  },

  // === 目标/计划 ===
  {
    pattern: /(?:i want to|i need to|i'm trying to|i'm going to|i plan to|my goal is to)\s+([\w\s]{3,50}?)(?:\.|,|$)/i,
    category: 'goal',
    extract: (m) => ({ label: `Goal: ${m[1].trim()}`, properties: { goal: m[1].trim(), status: 'active' } }),
  },
  {
    pattern: /(?:我想|我要|我需要|我打算|我的目标是)\s*([\u4e00-\u9fff\w\s]{1,30}?)(?:，|。|,|\.|$)/u,
    category: 'goal',
    extract: (m) => ({ label: `目标: ${m[1].trim()}`, properties: { goal: m[1].trim(), status: 'active' } }),
  },

  // === 显式记忆指令 ===
  {
    pattern: /(?:remember (?:that |this )?|keep in mind that |note that )(.{3,60}?)(?:\.|,|$)/i,
    category: 'fact',
    extract: (m) => ({ label: `Remembered: ${m[1].trim()}`, properties: { fact: m[1].trim(), source: 'explicit' } }),
  },
  {
    pattern: /(?:记住|记着|别忘了|记住这个)\s*[:：]?\s*(.{2,40}?)(?:，|。|,|\.|$)/u,
    category: 'fact',
    extract: (m) => ({ label: `记住: ${m[1].trim()}`, properties: { fact: m[1].trim(), source: 'explicit' } }),
  },

  // === 重要事件/日期 ===
  {
    pattern: /(?:my birthday is|i was born on|i turn \d+ on)\s+(.{3,40}?)(?:\.|,|$)/i,
    category: 'event',
    extract: (m) => ({ label: `Birthday: ${m[1].trim()}`, properties: { title: 'Birthday', date: m[1].trim(), important: true, field: 'birthday' } }),
  },
  {
    pattern: /(?:i have|got)\s+(?:a\s+)?(?:an?\s+)?(?:interview|meeting|presentation|exam|deadline|flight|appointment|call|conference)\s+(.{3,50}?)(?:\.|,|$)/i,
    category: 'event',
    extract: (m) => ({ label: `Upcoming: ${m[1].trim()}`, properties: { description: m[1].trim(), important: true } }),
  },
  {
    pattern: /(?:tomorrow|next week|this weekend|on monday|on tuesday|on wednesday|on thursday|on friday|on saturday|on sunday|tonight)\s+(?:i(?:'ll| will| have)?\s+)?(.{3,50}?)(?:\.|,|$)/i,
    category: 'event',
    extract: (m) => ({ label: `Scheduled: ${m[1].trim()}`, properties: { description: m[1].trim(), timeHint: m[0].split(/\s+/)[0] } }),
  },
  {
    pattern: /(?:我的生日|我生日|生日是)\s*(?:是|在)?\s*(.{2,20}?)(?:，|。|,|\.|$)/u,
    category: 'event',
    extract: (m) => ({ label: `生日: ${m[1].trim()}`, properties: { title: '生日', date: m[1].trim(), important: true, field: 'birthday' } }),
  },
  {
    pattern: /(?:明天|下周|这周末|今晚)\s*(?:我要|有个|有|得去)?\s*(.{2,30}?)(?:，|。|,|\.|$)/u,
    category: 'event',
    extract: (m) => ({ label: `日程: ${m[1].trim()}`, properties: { description: m[1].trim() } }),
  },
];

/**
 * 从用户输入中提取事实
 *
 * 返回所有匹配的事实，按置信度排序。
 * 同一类别只保留最高置信度的事实。
 */
export function extractFacts(input: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const { pattern, category, extract } of FACT_PATTERNS) {
    const match = input.match(pattern);
    if (!match) continue;

    const extracted = extract(match);
    if (!extracted) continue; // 模式可以返回 null 表示误匹配

    facts.push({
      category,
      label: extracted.label,
      properties: extracted.properties,
      confidence: estimateConfidence(input, match, category),
    });
  }

  // 同一 field 只保留最高置信度的事实
  const seenFields = new Set<string>();
  return facts
    .sort((a, b) => b.confidence - a.confidence)
    .filter((fact) => {
      const field = String(fact.properties.field ?? fact.label);
      if (seenFields.has(field)) return false;
      seenFields.add(field);
      return true;
    });
}

/**
 * 估算匹配置信度
 *
 * 基于匹配位置、输入长度和类别权重
 */
function estimateConfidence(
  input: string,
  match: RegExpMatchArray,
  category: ExtractedFact['category'],
): number {
  let confidence = 0.7;

  // 匹配在句首 → 更高置信度
  if (match.index !== undefined && match.index < 10) {
    confidence += 0.15;
  }

  // 显式记忆指令 → 最高置信度
  if (category === 'fact' && match[0].toLowerCase().includes('remember')) {
    confidence += 0.2;
  }

  // 短输入中的匹配 → 更高置信度（更直接的陈述）
  if (input.length < 50) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}
