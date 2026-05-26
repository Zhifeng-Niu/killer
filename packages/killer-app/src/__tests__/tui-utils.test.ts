/**
 * TUI Utility Function Tests
 *
 * Tests pure functions extracted from TUI components.
 */

import { describe, it, expect } from 'vitest';

// --- looksLikeApiKey (from app.tsx) ---

function looksLikeApiKey(s: string): boolean {
  if (s.startsWith('/') || s.length < 20 || s.length > 500) return false;
  if (s.startsWith('sk-') || s.startsWith('sk-ant-') || s.startsWith('sk-or-')) return true;
  if (s.startsWith('sk-cp-') || s.startsWith('sk-kimi') || s.startsWith('gsk_')) return true;
  if (s.startsWith('AIza')) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) return true;
  return false;
}

// --- emotionToEmoji (from app.tsx) ---

function emotionToEmoji(emotion: string): string {
  const map: Record<string, string> = {
    neutral: '😐', happy: '😊', sad: '😢', angry: '😠',
    fearful: '😨', surprised: '😮', disgusted: '🤢',
    curious: '🤔', excited: '🤩', calm: '😌',
  };
  return map[emotion] || '🎭';
}

// --- estimateMessageLines (from chat-panel.tsx) ---

interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'error';
  content: string;
  streaming?: boolean;
  duration?: number;
  timestamp: number;
}

function estimateMessageLines(msg: ChatMessage): number {
  const contentLines = msg.content.split('\n').length;
  const wrappedLines = msg.content.split('\n').reduce((sum: number, line: string) => {
    return sum + Math.max(1, Math.ceil(line.length / 80));
  }, 0);
  return 2 + Math.max(contentLines, wrappedLines);
}

// --- Tests ---

describe('looksLikeApiKey', () => {
  it('rejects commands', () => {
    expect(looksLikeApiKey('/help')).toBe(false);
  });

  it('rejects short strings', () => {
    expect(looksLikeApiKey('short')).toBe(false);
    expect(looksLikeApiKey('1234567890123456789')).toBe(false); // 19 chars
  });

  it('rejects very long strings', () => {
    expect(looksLikeApiKey('a'.repeat(501))).toBe(false);
  });

  it('detects OpenAI-style keys', () => {
    expect(looksLikeApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('detects Anthropic-style keys', () => {
    expect(looksLikeApiKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('detects OpenRouter keys', () => {
    expect(looksLikeApiKey('sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('detects MiniMax keys', () => {
    expect(looksLikeApiKey('sk-cp-abcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('detects Groq keys', () => {
    expect(looksLikeApiKey('gsk_abcdefghijklmnopqrstuvwxyz1234567890ABCDEF')).toBe(true);
  });

  it('detects Google AI keys', () => {
    expect(looksLikeApiKey('AIzaSyabcdefghijklmnopqrstuvwxyz1234567890')).toBe(true);
  });

  it('detects JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456ghi789';
    expect(looksLikeApiKey(jwt)).toBe(true);
  });

  it('rejects normal text', () => {
    expect(looksLikeApiKey('Hello, this is a normal message to the agent')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(looksLikeApiKey('')).toBe(false);
  });
});

describe('emotionToEmoji', () => {
  it('maps known emotions', () => {
    expect(emotionToEmoji('neutral')).toBe('😐');
    expect(emotionToEmoji('happy')).toBe('😊');
    expect(emotionToEmoji('sad')).toBe('😢');
    expect(emotionToEmoji('curious')).toBe('🤔');
    expect(emotionToEmoji('excited')).toBe('🤩');
  });

  it('returns mask for unknown emotion', () => {
    expect(emotionToEmoji('unknown')).toBe('🎭');
    expect(emotionToEmoji('')).toBe('🎭');
  });
});

describe('estimateMessageLines', () => {
  const baseMsg: ChatMessage = { id: 'test', role: 'agent', content: '', timestamp: Date.now() };

  it('estimates single-line message as 3 lines (header + content)', () => {
    const msg = { ...baseMsg, content: 'Hello world' };
    expect(estimateMessageLines(msg)).toBe(3); // 2 header + 1 content
  });

  it('estimates multi-line message', () => {
    const msg = { ...baseMsg, content: 'line1\nline2\nline3' };
    expect(estimateMessageLines(msg)).toBe(5); // 2 header + 3 content
  });

  it('accounts for line wrapping at 80 chars', () => {
    const longLine = 'a'.repeat(160); // wraps to 2 lines
    const msg = { ...baseMsg, content: longLine };
    expect(estimateMessageLines(msg)).toBe(4); // 2 header + 2 wrapped
  });

  it('handles empty content', () => {
    const msg = { ...baseMsg, content: '' };
    expect(estimateMessageLines(msg)).toBe(3); // 2 header + 1 (min)
  });

  it('handles mixed short and long lines', () => {
    const content = 'short\n' + 'b'.repeat(200) + '\nshort';
    const msg = { ...baseMsg, content };
    // 3 content lines, but long line wraps to 3 (200/80=2.5→3)
    // wrapped: 1 + 3 + 1 = 5, content lines: 3 → max is 5
    expect(estimateMessageLines(msg)).toBe(7); // 2 header + 5 wrapped
  });
});
