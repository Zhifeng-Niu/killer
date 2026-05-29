/**
 * Chat Panel — 线性对话区
 *
 * 终端唯一动态区域。渲染全部消息，不做行数裁剪。
 * React.memo 隔离每条消息，只有流式输出消息触发重绘。
 * 暖灰正文 + 紫色品牌 + 电子青/琥珀点缀。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, box, icons, thinkFrames, waveFrames, roleColors } from './theme.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system' | 'error';
  content: string;
  streaming?: boolean;
  duration?: number;
  timestamp: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isThinking: boolean;
}

// ── 行内格式 ──

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(`(.+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let ki = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t-${ki++}`}>{text.slice(lastIndex, match.index)}</Text>);
    }
    if (match[1]) {
      parts.push(<Text key={`b-${ki++}`} bold color={colors.text}>{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(<Text key={`i-${ki++}`} italic color={colors.text}>{match[4]}</Text>);
    } else if (match[5]) {
      parts.push(<Text key={`s-${ki++}`} strikethrough color={colors.secondary}>{match[6]}</Text>);
    } else if (match[7]) {
      parts.push(
        <Text key={`c-${ki++}`} color={colors.amber} backgroundColor={colors.surface}>
          {' '}{match[8]}{' '}
        </Text>,
      );
    } else if (match[9]) {
      parts.push(<Text key={`l-${ki++}`} color={colors.cyan} underline>{match[10]}</Text>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key="end">{text.slice(lastIndex)}</Text>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

// ── 代码高亮 ──

function highlightCodeLine(line: string): React.ReactNode {
  const commentIdx = line.search(/\/\/|#(?!\[)/);
  if (commentIdx >= 0) {
    const before = line.slice(0, commentIdx);
    const commentText = line.slice(commentIdx);
    const parts: React.ReactNode[] = [];
    if (before) parts.push(...highlightTokens(before, 0));
    parts.push(<Text key="cm" color={colors.separator}>{commentText}</Text>);
    return <>{parts}</>;
  }
  return <>{highlightTokens(line, 0)}</>;
}

function highlightTokens(text: string, startKey: number): React.ReactNode[] {
  const keywords = new Set([
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
    'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
    'throw', 'new', 'this', 'typeof', 'interface', 'type', 'extends',
    'implements', 'null', 'undefined', 'true', 'false', 'def', 'self', 'print',
  ]);
  const results: React.ReactNode[] = [];
  const tokens = text.split(/(\b)/);
  let ki = startKey;
  for (const token of tokens) {
    if (keywords.has(token)) {
      results.push(<Text key={`kw-${ki++}`} color={colors.purple}>{token}</Text>);
    } else if (/^\d+(\.\d+)?$/.test(token)) {
      results.push(<Text key={`num-${ki++}`} color={colors.amber}>{token}</Text>);
    } else if (/^["'`]([^"'`]|\\.)*["'`]$/.test(token)) {
      results.push(<Text key={`str-${ki++}`} color={colors.cyan}>{token}</Text>);
    } else {
      results.push(<Text key={`txt-${ki++}`} color={colors.secondary}>{token}</Text>);
    }
  }
  return results;
}

// ── Markdown 内容渲染 ──

function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';
  let inToolResult = false;
  let toolResultTool = '';
  let toolResultBuffer: string[] = [];
  let inTable = false;
  let tableBuffer: string[] = [];

  const flushTable = (idx: number) => {
    elements.push(renderTable(tableBuffer, idx));
    inTable = false;
    tableBuffer = [];
  };

  const flushToolResult = (idx: number) => {
    elements.push(renderToolResult(toolResultTool, toolResultBuffer.join('\n'), idx));
    inToolResult = false;
    toolResultTool = '';
    toolResultBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inToolResult) flushToolResult(i);
      if (inTable) flushTable(i);
      if (inCodeBlock) {
        elements.push(renderCodeBlock(codeBuffer, codeLang, i));
        codeBuffer = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        codeLang = line.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) { codeBuffer.push(line); continue; }

    const isTableRow = line.trim().startsWith('|') && line.trim().endsWith('|');
    const isTableSep = /^\|[\s\-:]+\|/.test(line.trim());
    if (isTableRow) {
      if (inToolResult) flushToolResult(i);
      if (!inTable) inTable = true;
      if (!isTableSep) tableBuffer.push(line);
      continue;
    } else if (inTable) {
      flushTable(i);
    }

    if (inToolResult) {
      if (/^\[.*\]/.test(line) || line.startsWith('#') || line.startsWith('---')) {
        flushToolResult(i);
      } else {
        toolResultBuffer.push(line);
        continue;
      }
    }

    if (/^\[Reasoning[^]]*\]\s*$/.test(line)) {
      elements.push(
        <Box key={`reason-${i}`} marginTop={1} marginBottom={1}>
          <Text color={colors.purple}>◐ </Text>
          <Text color={colors.secondary} italic>thinking</Text>
        </Box>,
      );
      continue;
    }

    const resultMatch = line.match(/^\[Tool Result: (\w+)\]\s*$/);
    if (resultMatch) { inToolResult = true; toolResultTool = resultMatch[1]; continue; }

    const blockedMatch = line.match(/^\[Tool Blocked: (\w+)\]\s*(.*)/);
    if (blockedMatch) {
      elements.push(
        <Box key={`blocked-${i}`} marginTop={1} marginLeft={1} borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.amber} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.amber} bold>{icons.warn} {blockedMatch[1]}</Text>
            <Text color={colors.secondary}>{blockedMatch[2] || 'requires confirmation'}</Text>
            <Text color={colors.separator}> /approve {blockedMatch[1]}</Text>
          </Box>
        </Box>,
      );
      continue;
    }

    const terrorMatch = line.match(/^\[Tool Error: (\w+)\]\s*(.*)/);
    if (terrorMatch) {
      elements.push(
        <Box key={`terror-${i}`} marginTop={1} marginLeft={1} borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.error} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.error} bold>{icons.error} {terrorMatch[1]}</Text>
            <Text color={colors.secondary}>{terrorMatch[2]}</Text>
          </Box>
        </Box>,
      );
      continue;
    }

    const callMatch = line.match(/\[TOOL:\s*(\w+)\]\((.*?)\)/);
    if (callMatch) {
      const params = callMatch[2];
      elements.push(
        <Box key={`tool-${i}`} marginTop={1} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.purpleDim} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.purple}>{icons.tool} {callMatch[1]}</Text>
            {params && <Text color={colors.separator}>{params.length > 120 ? params.slice(0, 120) + '…' : params}</Text>}
          </Box>
        </Box>,
      );
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      elements.push(
        <Box key={`hr-${i}`} marginTop={1} marginLeft={1}>
          <Text color={colors.separator}>{box.hDot.repeat(6)}</Text>
        </Box>,
      );
      continue;
    }

    // Markdown 结构
    if (line.startsWith('### ')) {
      elements.push(
        <Box key={`h3-${i}`} marginTop={1}>
          <Text color={colors.separator}>{box.h} </Text>
          <Text color={colors.purple} bold>{renderInline(line.slice(4))}</Text>
        </Box>,
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <Box key={`h2-${i}`} marginTop={1}>
          <Text color={colors.purple} bold>{renderInline(line.slice(3))}</Text>
        </Box>,
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <Box key={`h1-${i}`} marginTop={1}>
          <Text color={colors.purple} bold>{renderInline(line.slice(2))}</Text>
        </Box>,
      );
    } else if (!line.trim()) {
      const prev = elements[elements.length - 1];
      const prevIsBlank = prev != null && typeof prev === 'object' && 'key' in prev && String(prev.key).startsWith('blank-');
      if (!prevIsBlank) elements.push(<Text key={`blank-${i}`}>{''}</Text>);
    } else if (line.match(/^\s{2,}[-*]\s/)) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const depth = Math.min(Math.floor(indent / 2), 3);
      const markers = ['◦', '◦', '·', '·'];
      elements.push(
        <Box key={`nli-${i}`}>
          <Text color={colors.separator}>{'  '.repeat(depth + 1)}{markers[depth]} </Text>
          <Text color={colors.secondary}>{renderInline(line.trim().replace(/^[-*]\s/, ''))}</Text>
        </Box>,
      );
    } else if (line.match(/^\s{2,}\d+\.\s/)) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const depth = Math.min(Math.floor(indent / 2), 3);
      const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <Box key={`nol-${i}`}>
            <Text color={colors.separator}>{'  '.repeat(depth + 1)}{numMatch[1]}. </Text>
            <Text color={colors.secondary}>{renderInline(numMatch[2])}</Text>
          </Box>,
        );
      }
    } else if (line.match(/^[-*]\s/)) {
      elements.push(
        <Box key={`li-${i}`}>
          <Text color={colors.purple}>  • </Text>
          <Text color={colors.text}>{renderInline(line.replace(/^[-*]\s/, ''))}</Text>
        </Box>,
      );
    } else if (line.match(/^\d+\.\s/)) {
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <Box key={`ol-${i}`}>
            <Text color={colors.purple}>  {numMatch[1]}. </Text>
            <Text color={colors.text}>{renderInline(numMatch[2])}</Text>
          </Box>,
        );
      }
    } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      const checked = line.startsWith('- [x] ');
      elements.push(
        <Box key={`task-${i}`}>
          <Text color={checked ? colors.cyan : colors.separator}>  {checked ? '✓' : '○'} </Text>
          <Text color={checked ? colors.secondary : colors.text} strikethrough={checked}>{renderInline(line.slice(6))}</Text>
        </Box>,
      );
    } else if (line.match(/^>\s/)) {
      elements.push(
        <Box key={`qt-${i}`} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.separator} paddingX={1}>
          <Text color={colors.secondary} italic>{renderInline(line.slice(2))}</Text>
        </Box>,
      );
    } else {
      elements.push(<Text key={`line-${i}`} color={colors.text}>{renderInline(line)}</Text>);
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) elements.push(renderCodeBlock(codeBuffer, codeLang, lines.length));
  if (inTable) flushTable(lines.length);
  if (inToolResult) flushToolResult(lines.length);

  return <Box flexDirection="column">{elements}</Box>;
}

function renderToolResult(tool: string, data: string, keyBase: number): React.ReactNode {
  const truncated = data.length > 300 ? data.slice(0, 300) + '…' : data;
  return (
    <Box key={`result-${keyBase}`} marginTop={1} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.cyan} paddingX={1}>
      <Box flexDirection="column">
        <Text color={colors.cyan}>{icons.success} {tool}</Text>
        {data && <Text color={colors.separator}>{truncated}</Text>}
      </Box>
    </Box>
  );
}

function renderCodeBlock(lines: string[], lang: string, keyBase: number): React.ReactNode {
  const numWidth = String(lines.length).length;
  return (
    <Box key={`code-${keyBase}`} flexDirection="column" marginTop={1} marginBottom={1}>
      {lang && (
        <Box marginLeft={1}>
          <Text color={colors.separator} backgroundColor={colors.surface}> {lang} </Text>
          <Text color={colors.bg}> {lines.length} lines</Text>
        </Box>
      )}
      <Box flexDirection="column" marginLeft={1} borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.separator} paddingX={1}>
        {lines.map((line, idx) => (
          <Box key={`cl-${keyBase}-${idx}`}>
            <Text color={colors.bg}>{String(idx + 1).padStart(numWidth)} │ </Text>
            {lang && shouldHighlight(lang) ? highlightCodeLine(line) : <Text color={colors.secondary}>{line}</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function shouldHighlight(lang: string): boolean {
  const set = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript', 'py', 'python', 'go', 'rs', 'rust']);
  return set.has(lang.toLowerCase());
}

function renderTable(rows: string[], keyBase: number): React.ReactNode {
  if (rows.length === 0) return null;
  const parseRow = (row: string): string[] =>
    row.split('|').map(c => c.trim()).filter(c => c.length > 0);
  const headerCells = parseRow(rows[0]);
  const dataRows = rows.slice(1).map(parseRow);
  const colCount = Math.max(headerCells.length, ...dataRows.map(r => r.length));
  const colWidths: number[] = [];
  for (let col = 0; col < colCount; col++) {
    const maxW = Math.max((headerCells[col] || '').length, ...dataRows.map(r => (r[col] || '').length));
    colWidths.push(Math.min(maxW, 30));
  }
  const renderRow = (cells: string[], isHeader: boolean) => (
    <Box key={`tr-${keyBase}-${isHeader ? 'h' : cells.join('')}`}>
      <Text color={colors.separator}> │ </Text>
      {cells.map((cell, ci) => (
        <React.Fragment key={`tc-${ci}`}>
          {ci > 0 && <Text color={colors.bg}> │ </Text>}
          <Text color={isHeader ? colors.purple : colors.text} bold={isHeader}>
            {cell.padEnd(colWidths[ci] || cell.length).slice(0, colWidths[ci] || 30)}
          </Text>
        </React.Fragment>
      ))}
      <Text color={colors.separator}> │</Text>
    </Box>
  );
  return (
    <Box key={`table-${keyBase}`} flexDirection="column" marginTop={1} marginLeft={1}>
      {renderRow(headerCells, true)}
      <Box>
        <Text color={colors.separator}> │ </Text>
        {colWidths.map((w, ci) => (
          <React.Fragment key={`ts-${ci}`}>
            {ci > 0 && <Text color={colors.bg}>─┼─</Text>}
            <Text color={colors.bg}>{box.h.repeat(w)}</Text>
          </React.Fragment>
        ))}
        <Text color={colors.separator}> │</Text>
      </Box>
      {dataRows.map((cells) => renderRow(cells, false))}
    </Box>
  );
}

// ── 空状态 ──

function EmptyState() {
  return (
    <Box flexDirection="column" paddingY={2} marginLeft={2}>
      <Text color={colors.purple} bold>  ╋  O D Y S S E U S</Text>
      <Text color={colors.secondary}>  ┃  Autonomous Agent Framework</Text>
      <Text> </Text>
      <Box flexDirection="column" marginLeft={1}>
        <Text color={colors.separator}>  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈</Text>
        <Text> </Text>
        <Text color={colors.text}>  type anything to start</Text>
        <Text> </Text>
        <Box><Text color={colors.purple}>  /think</Text><Text color={colors.secondary}> deep reasoning</Text></Box>
        <Box><Text color={colors.purple}>  /dream</Text><Text color={colors.secondary}> memory consolidation</Text></Box>
        <Box><Text color={colors.purple}>  /goals</Text><Text color={colors.secondary}> set a goal</Text></Box>
        <Box><Text color={colors.purple}>  /help</Text><Text color={colors.secondary}> all commands</Text></Box>
        <Text> </Text>
        <Text color={colors.bg}>  ↑↓ history · Tab · Esc</Text>
      </Box>
    </Box>
  );
}

// ── 消息气泡 ──

const MessageBubble = React.memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isSystem = message.role === 'system';

  const rc = roleColors[message.role] ?? roleColors.agent;

  return (
    <Box flexDirection="column" marginLeft={1} marginTop={1}>
      <Box>
        <Text color={rc.color}>{rc.icon} </Text>
        <Text color={rc.color} bold>{rc.label}</Text>
        {message.duration != null && (
          <Text color={colors.secondary}> {message.duration}ms</Text>
        )}
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {renderContent(message.content)}
        {message.streaming && <StreamingCursor />}
      </Box>
    </Box>
  );
});

// ── 思考指示器 ──

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % thinkFrames.length), 150);
    return () => clearInterval(timer);
  }, []);

  const current = thinkFrames[frame];
  return (
    <Box marginLeft={1} marginTop={1}>
      <Text color={current.col}>{current.ch} </Text>
      <Text color={colors.secondary} italic>thinking...</Text>
    </Box>
  );
}

// ── 波形光标 — 流式态 ──

function StreamingCursor() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % waveFrames.length), 100);
    return () => clearInterval(timer);
  }, []);

  return <Text color={colors.purple}>{waveFrames[frame]}</Text>;
}

// ── 主面板 ──

export const ChatPanel = React.memo(function ChatPanel({ messages, isThinking }: ChatPanelProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;

  // 留空：状态栏(1) + 上下文条(1) + 输入框(3) + 快捷键提示(1) + 余量(2) = 8行
  // 每条消息约占 2-3 行（role 行 + 至少一行内容），保守按 2.5 行估算
  const reservedLines = 8;
  const avgMsgLines = 3;
  const maxVisible = Math.max(Math.floor((termHeight - reservedLines) / avgMsgLines), 5);
  const visible = messages.length > maxVisible ? messages.slice(-maxVisible) : messages;
  const trimmed = messages.length - visible.length;
  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {trimmed > 0 && (
        <Box marginLeft={1}>
          <Text color={colors.separator}>↑ {trimmed} 条更早消息</Text>
        </Box>
      )}
      {isEmpty ? (
        <EmptyState />
      ) : (
        visible.map((msg, idx) => {
          const prevMsg = idx > 0 ? visible[idx - 1] : null;
          const showDivider = prevMsg != null && prevMsg.role === 'user' && msg.role === 'agent';
          return (
            <React.Fragment key={msg.id}>
              {showDivider && (
                <Box marginLeft={1}>
                  <Text color={colors.purple}>{box.hBold}</Text>
                  <Text color={colors.separator}>{box.hDot.repeat(2)}</Text>
                </Box>
              )}
              <MessageBubble message={msg} />
            </React.Fragment>
          );
        })
      )}
      {isThinking && <ThinkingIndicator />}
    </Box>
  );
});
