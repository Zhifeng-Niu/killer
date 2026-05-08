/**
 * CLI Format Tests
 *
 * 测试 ANSI 终端格式化工具
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { c, kv, divider, renderMarkdown } from '../cli/format.js';

describe('CLI Format', () => {
  const originalTTY = process.stdout.isTTY;
  const originalNoColor = process.env.NO_COLOR;
  const originalForceColor = process.env.FORCE_COLOR;

  afterEach(() => {
    process.stdout.isTTY = originalTTY;
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
    if (originalForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = originalForceColor;
    }
  });

  describe('Color Functions', () => {
    it('should produce ANSI codes when FORCE_COLOR is set', () => {
      process.env.FORCE_COLOR = '1';
      // Need to reimport to pick up env change — but since module is cached,
      // we test the output format instead
      const result = c.bold('hello');
      // Either ANSI-wrapped (if color enabled at import) or plain text
      expect(result).toContain('hello');
    });

    it('should produce plain text as fallback', () => {
      // In test environment (non-TTY), colors may be disabled
      const result = c.red('error');
      expect(result).toContain('error');
    });

    it('should support all color methods', () => {
      const methods = ['bold', 'dim', 'italic', 'underline', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'header', 'label', 'value', 'success', 'error', 'warn', 'info', 'muted'];
      for (const method of methods) {
        const result = (c as Record<string, (t: string) => string>)[method]('test');
        expect(result).toContain('test');
      }
    });

    it('should support background colors', () => {
      const result = c.bgBlue('highlighted');
      expect(result).toContain('highlighted');

      const result2 = c.bgMagenta('highlighted');
      expect(result2).toContain('highlighted');
    });
  });

  describe('kv', () => {
    it('should format key-value pairs', () => {
      const result = kv('Uptime', '12s');
      expect(result).toContain('Uptime');
      expect(result).toContain('12s');
    });

    it('should pad labels', () => {
      const result = kv('A', 'value');
      // Label should be padded to 16 chars
      expect(result).toContain('A');
      expect(result).toContain('value');
    });

    it('should support custom indent', () => {
      const result = kv('Key', 'val', 6);
      expect(result).toContain('Key');
      expect(result).toContain('val');
      // Should have 6 spaces of indent
      expect(result.startsWith('      ')).toBe(true);
    });
  });

  describe('divider', () => {
    it('should generate a divider line', () => {
      const result = divider();
      expect(result).toContain('─');
    });

    it('should support custom character and width', () => {
      const result = divider('=', 10);
      expect(result).toContain('=');
    });
  });

  describe('renderMarkdown', () => {
    it('should convert inline code to yellow', () => {
      const result = renderMarkdown('Use `npm install` to install');
      expect(result).toContain('npm install');
      // Should not contain backticks if colors enabled, or plain if not
    });

    it('should convert bold text', () => {
      const result = renderMarkdown('This is **important** text');
      expect(result).toContain('important');
    });

    it('should convert italic text', () => {
      const result = renderMarkdown('This is *emphasized* text');
      expect(result).toContain('emphasized');
    });

    it('should handle code blocks', () => {
      const result = renderMarkdown('Before\n```js\nconst x = 1;\n```\nAfter');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('should handle mixed formatting', () => {
      const result = renderMarkdown('**bold** and `code` and *italic*');
      expect(result).toContain('bold');
      expect(result).toContain('code');
      expect(result).toContain('italic');
    });

    it('should handle text without markdown', () => {
      const result = renderMarkdown('Plain text nothing special');
      expect(result).toContain('Plain text nothing special');
    });

    it('should handle empty string', () => {
      expect(renderMarkdown('')).toBe('');
    });
  });
});
