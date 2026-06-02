/**
 * LLM Provider 抽象层
 *
 * 定义 LLM 调用接口，支持多种实现
 */

/**
 * LLM 完成结果
 */
export interface LLMCompletion {
  content: string;
  model: string;
  tokensUsed?: number;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  /** 缓存命中 token 数（DeepSeek/Gemini 等支持 prefix caching 的 provider） */
  cacheHitTokens?: number;
  /** 缓存未命中 token 数 */
  cacheMissTokens?: number;
}

/**
 * 工具定义（OpenAI function calling 格式）
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * LLM 请求中的工具调用
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 包含工具调用的完成结果
 */
export interface LLMToolCallCompletion extends LLMCompletion {
  toolCalls?: ToolCall[];
  /** DeepSeek 等 thinking-mode provider 的推理内容（需回传以保持推理质量） */
  reasoningContent?: string;
}

/**
 * 工具结果消息（role: "tool"）
 */
export interface ToolResultMessage {
  role: 'tool';
  toolCallId: string;
  content: string;
}

/**
 * 聊天消息（支持多角色）
 */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[]; reasoning_content?: string }
  | ToolResultMessage;

/**
 * LLM Provider 接口
 */
export interface LLMProvider {
  complete(prompt: string, context?: string): Promise<LLMCompletion>;
  stream(prompt: string, context?: string): AsyncIterable<string>;
  getModel(): string;

  /**
   * 使用原生 function calling 的完成请求
   *
   * 支持 OpenAI-compatible providers 的 tools 参数。
   * 返回结果可能包含 toolCalls，调用者应循环处理。
   */
  completeWithTools?(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LLMToolCallCompletion>;
}

/**
 * Mock LLM Provider - 用于测试
 */
export class MockLLMProvider implements LLMProvider {
  private responsePattern: string;

  constructor(responsePattern = 'Mock reasoning response') {
    this.responsePattern = responsePattern;
  }

  async complete(prompt: string, context?: string): Promise<LLMCompletion> {
    // 模拟网络延迟
    await this.delay(80);

    // If a custom pattern is set (tests), use legacy behavior
    if (this.responsePattern !== 'Mock reasoning response') {
      return {
        content: `${this.responsePattern}\n\nPrompt: ${prompt.slice(0, 50)}...`,
        model: this.getModel(),
        finishReason: 'stop',
      };
    }

    // Demo mode: generate context-aware responses
    const response = this.generateDemoResponse(prompt);

    return {
      content: response,
      model: this.getModel(),
      finishReason: 'stop',
    };
  }

  async *stream(prompt: string, context?: string): AsyncIterable<string> {
    // If a custom pattern is set (tests), use legacy behavior
    let response: string;
    if (this.responsePattern !== 'Mock reasoning response') {
      response = `${this.responsePattern}\n\nPrompt: ${prompt.slice(0, 50)}...`;
    } else {
      response = this.generateDemoResponse(prompt);
    }

    const words = response.split(' ');

    for (const word of words) {
      await this.delay(15);
      yield word + ' ';
    }
  }

  /**
   * 生成上下文感知的 Demo 响应
   *
   * 分析 prompt 中的用户消息，生成自然的回复。
   * 让 Demo 模式看起来像一个真正的 AI 伴侣。
   */
  private generateDemoResponse(prompt: string): string {
    // Extract the last user message from the prompt
    const userMatch = prompt.match(/User:\s*(.+?)(?:\n|$)/g);
    const lastUserMsg = userMatch?.[userMatch.length - 1]?.replace(/^User:\s*/, '')?.trim() ?? '';

    // === Greetings ===
    if (/^(hi|hello|hey|你好|嗨|早|晚上好)/i.test(lastUserMsg)) {
      return this.pick([
        'Hey! Great to hear from you. What are you working on today?',
        'Hello! I\'m here and ready to help. What\'s on your mind?',
        'Hi there! I was just thinking about some things. How are you doing?',
        '你好！很高兴你来找我聊天。今天有什么想讨论的吗？',
      ]);
    }

    // === Name introduction ===
    if (/(?:my name is|i'm called|call me|我叫|名字是)/i.test(lastUserMsg)) {
      const nameMatch = lastUserMsg.match(/(?:my name is|i'm called|call me)\s+([A-Z][a-z]+)/i)
        ?? lastUserMsg.match(/(?:我叫|名字是)\s*(\S+)/u);
      const name = nameMatch?.[1] ?? 'there';
      return `Nice to meet you, ${name}! I'll remember that. What do you do? I'm curious about your work and interests.`;
    }

    // === Questions about me ===
    if (/(?:who are you|what are you|你是什么|你是谁|what can you do)/i.test(lastUserMsg)) {
      return this.pick([
        'I\'m Killer — your AI companion. I remember our conversations, learn your preferences, and try to be genuinely helpful. I can search the web, read and write files, run shell commands, and keep notes. But mostly, I\'m here to think alongside you.',
        '我是 Killer — 你的 AI 伙伴。我能记住我们的对话，了解你的偏好，并且真正地帮助你。我可以搜索网页、读写文件、执行命令、做笔记。但最重要的是，我在这里和你一起思考。',
      ]);
    }

    // === Code-related ===
    if (/(?:code|function|bug|debug|implement|error|代码|函数|bug|实现)/i.test(lastUserMsg)) {
      return this.pick([
        'I\'d love to help with that! In a real session, I could read your files, search for solutions, and even run tests. For now, here\'s my take: break the problem into smaller pieces, write tests first, and iterate. What specific part are you stuck on?',
        'That\'s a great coding challenge. When connected to a real LLM, I can actually read your codebase, search for relevant docs, and write working code. Try setting up an API key with `odysseus --init` to unlock full capabilities!',
      ]);
    }

    // === Emotional / personal ===
    if (/(?:feel|feeling|sad|happy|tired|stressed|frustrat|心情|难过|开心|累|压力)/i.test(lastUserMsg)) {
      return this.pick([
        'I hear you. Whatever you\'re going through, I\'m here to listen and help where I can. Sometimes just talking about it helps — want to share more?',
        'Thank you for being open with me. I\'ve noted how you\'re feeling. Is there something specific I can help with, or do you just need someone to talk to?',
      ]);
    }

    // === Help request ===
    if (/(?:help|can you|please|could you|帮|能|请)/i.test(lastUserMsg)) {
      return this.pick([
        'Of course! I\'m here to help. Let me think about this... In demo mode I\'m simulating responses, but with a real LLM connected I can provide detailed, accurate help. Try `odysseus --init` to set up a provider!',
        'Absolutely, I\'d be happy to help with that. This is a demo response, but when you connect a real AI model, I can give you thorough, knowledgeable answers. The setup takes about 30 seconds!',
      ]);
    }

    // === Memory-related ===
    if (/(?:remember|recall|上次|之前|last time|what did|what do you know)/i.test(lastUserMsg)) {
      return this.pick([
        'That\'s a great question! In a real session, I would search through my episodic memories and give you a specific answer. The fact that you\'re asking about past conversations shows you\'re thinking about our relationship the right way.',
        'I value the continuity of our conversations. When connected to a real LLM, I genuinely recall past topics, your preferences, and important facts. Each session builds on the last.',
      ]);
    }

    // === Default: warm and engaging ===
    return this.pick([
      'That\'s interesting! Tell me more about what you\'re thinking. I like to understand the full picture before jumping to conclusions.',
      'I appreciate you sharing that. What aspect would you like to explore further? I\'m here to think through it with you.',
      'Got it. In demo mode I\'m giving simulated responses, but the real magic happens when you connect an LLM — I get genuinely smart and helpful. Try `odysseus --init` when you\'re ready!',
      '嗯，这是个有趣的想法。虽然现在是 Demo 模式，但连接真实 AI 后我可以深入讨论任何话题。试试 `odysseus --init` 来解锁完整能力！',
    ]);
  }

  private pick(options: string[]): string {
    return options[Math.floor(Math.random() * options.length)];
  }

  getModel(): string {
    return 'mock-llm-v1';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 设置响应模式
   */
  setResponsePattern(pattern: string): void {
    this.responsePattern = pattern;
  }
}

/**
 * 预定义的响应模式用于测试场景
 */
export const MockResponses = {
  /**
   * 标准推理响应
   */
  standardReasoning: `
Based on the perception, I should:
1. Analyze the current context
2. Identify the most relevant action
3. Execute with appropriate confidence

Confidence: 0.85
`,

  /**
   * 高优先级响应
   */
  highPriorityReasoning: `
CRITICAL: High priority input detected.
Immediate action required.

Confidence: 0.95
`,

  /**
   * 低置信度响应
   */
  lowConfidenceReasoning: `
Ambiguous input detected.
Need more context to proceed.

Confidence: 0.35
`,
};
