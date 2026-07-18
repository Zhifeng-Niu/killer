/**
 * Structured Logger Module
 */

export {
  Logger,
  ModuleLogger,
  ConsoleOutput,
  FileOutput,
  type LogLevel,
  type LogEntry,
  type LogOutput,
} from './types.js';

export {
  initTrace,
  getTraceFilePath,
  beginSpan,
  Span,
  traceAsync,
  traceSync,
  type SpanData,
} from './trace.js';
