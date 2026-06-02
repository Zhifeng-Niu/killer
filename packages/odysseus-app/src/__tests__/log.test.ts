/**
 * Logger Tests
 */

import { describe, it, expect } from 'vitest';
import { Logger, ConsoleOutput, type LogEntry, type LogLevel } from '../log/index.js';

/**
 * 收集日志条目的 mock output
 */
class MockOutput implements ConsoleOutput {
  entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe('Logger', () => {
  it('should log at info level by default', () => {
    const logger = Logger.getInstance();
    logger.setLevel('info');

    const mock = new MockOutput();
    logger.addOutput(mock);

    logger.info('test message');
    expect(mock.entries.length).toBeGreaterThanOrEqual(1);
    expect(mock.entries[mock.entries.length - 1].message).toBe('test message');
  });

  it('should filter out debug when level is info', () => {
    const logger = Logger.getInstance();
    logger.setLevel('info');

    const mock = new MockOutput();
    logger.addOutput(mock);

    logger.debug('should not appear');
    expect(mock.entries).toHaveLength(0);
  });

  it('should include debug when level is debug', () => {
    const logger = Logger.getInstance();
    logger.setLevel('debug');

    const mock = new MockOutput();
    logger.addOutput(mock);

    logger.debug('should appear');
    expect(mock.entries.length).toBeGreaterThanOrEqual(1);
    expect(mock.entries[mock.entries.length - 1].message).toBe('should appear');
  });

  it('should create child loggers with module name', () => {
    const logger = Logger.getInstance();
    logger.setLevel('info');

    const mock = new MockOutput();
    logger.addOutput(mock);

    const child = logger.child('test-module');
    child.info('child message');

    expect(mock.entries.length).toBeGreaterThanOrEqual(1);
    const lastEntry = mock.entries[mock.entries.length - 1];
    expect(lastEntry.module).toBe('test-module');
    expect(lastEntry.message).toBe('child message');
  });

  it('should include structured fields', () => {
    const logger = Logger.getInstance();
    logger.setLevel('info');

    const mock = new MockOutput();
    logger.addOutput(mock);

    logger.info('with fields', { key: 'value', count: 42 });

    const lastEntry = mock.entries[mock.entries.length - 1];
    expect(lastEntry.fields).toEqual({ key: 'value', count: 42 });
  });

  it('should handle error objects', () => {
    const logger = Logger.getInstance();
    logger.setLevel('info');

    const mock = new MockOutput();
    logger.addOutput(mock);

    const err = new Error('test error');
    logger.error('something failed', err);

    const lastEntry = mock.entries[mock.entries.length - 1];
    expect(lastEntry.level).toBe('error');
    expect(lastEntry.error).toBe(err);
  });

  it('should suppress all logs at silent level', () => {
    const logger = Logger.getInstance();
    logger.setLevel('silent');

    const mock = new MockOutput();
    logger.addOutput(mock);

    logger.error('critical');
    logger.warn('warning');
    logger.info('info');
    logger.debug('debug');

    expect(mock.entries).toHaveLength(0);
  });
});
