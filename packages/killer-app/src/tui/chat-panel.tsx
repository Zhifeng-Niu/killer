/**
 * Chat Panel — 消息显示区域
 *
 * 消息气泡设计：用户消息用 ╭─ 框线，agent 消息用 ┄┄ 前缀。
 * 代码块：带语言标签 + 行号 + 缩进的 box 包裹。
 * 流式输出：光标闪烁动画。
 * Markdown：标题、列表（有序+无序）、引用、代码块、行内格式。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, box, icons, spinners } from './theme.js';

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

/** 行内格式：粗体、斜体、代码、删除线、链接 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // 依次匹配：**bold**、*italic*（非 **）、~~strike~~、`code`、[text](url)
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(`(.+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t-${keyIdx++}`}>{text.slice(lastIndex, match.index)}</Text>);
    }
    if (match[1]) {
      // **bold**
      parts.push(<Text key={`b-${keyIdx++}`} bold color={colors.text}>{match[2]}</Text>);
    } else if (match[3]) {
      // *italic*（非 ** 开头）
      parts.push(<Text key={`i-${keyIdx++}`} italic color={colors.text}>{match[4]}</Text>);
    } else if (match[5]) {
      // ~~strikethrough~~
      parts.push(<Text key={`s-${keyIdx++}`} strikethrough color={colors.muted}>{match[6]}</Text>);
    } else if (match[7]) {
      // `code`
      parts.push(
        <Text key={`c-${keyIdx++}`} color={colors.warning} backgroundColor={colors.surface}>
          {' '}{match[8]}{' '}
        </Text>
      );
    } else if (match[9]) {
      // [text](url)
      parts.push(
        <Text key={`l-${keyIdx++}`} color={colors.info} underline>
          {match[10]}
        </Text>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={`end`}>{text.slice(lastIndex)}</Text>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

/** 简易关键词高亮（代码块内） */
function highlightCodeLine(line: string): React.ReactNode {
  // 关键词着色
  const keywords = /\b(function|const|let|var|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|typeof|interface|type|extends|implements|public|private|protected|static|void|null|undefined|true|false)\b/g;
  const stringLit = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;
  const comment = /(\/\/.*$|#.*$)/gm;

  // 简单策略：先处理注释，再字符串，再关键词
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let keyIdx = 0;

  // 检测行注释
  const commentIdx = remaining.search(/\/\/|#(?!\[)/);
  if (commentIdx >= 0) {
    const before = remaining.slice(0, commentIdx);
    const commentText = remaining.slice(commentIdx);
    if (before) parts.push(...highlightTokens(before, keyIdx));
    keyIdx += 10;
    parts.push(<Text key={`cm-${keyIdx}`} color={colors.dimmed}>{commentText}</Text>);
    return <>{parts}</>;
  }

  return <>{highlightTokens(remaining, 0)}</>;
}

function highlightTokens(text: string, startKey: number): React.ReactNode[] {
  const results: React.ReactNode[] = [];
  const keywords = new Set([
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
    'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch',
    'throw', 'new', 'this', 'typeof', 'interface', 'type', 'extends',
    'implements', 'null', 'undefined', 'true', 'false', 'def', 'self', 'print',
  ]);
  const tokens = text.split(/(\b)/);
  let keyIdx = startKey;
  for (const token of tokens) {
    if (keywords.has(token)) {
      results.push(<Text key={`kw-${keyIdx++}`} color={colors.primary}>{token}</Text>);
    } else if (/^\d+(\.\d+)?$/.test(token)) {
      results.push(<Text key={`num-${keyIdx++}`} color={colors.warning}>{token}</Text>);
    } else if (/^["'`]([^"'`]|\\.)*["'`]$/.test(token)) {
      results.push(<Text key={`str-${keyIdx++}`} color={colors.accent}>{token}</Text>);
    } else {
      results.push(<Text key={`txt-${keyIdx++}`} color={colors.muted}>{token}</Text>);
    }
  }
  return results;
}

/** 渲染消息内容 — tool 调用/结果/错误 + 标题/列表/代码块/表格 */
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

    // ── Code block ──
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

    // ── Table detection (| col | col |) ──
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

    // ── Tool result data (multi-line) ──
    if (inToolResult) {
      if (/^\[.*\]/.test(line) || line.startsWith('#') || line.startsWith('---')) {
        flushToolResult(i);
      } else {
        toolResultBuffer.push(line);
        continue;
      }
    }

    // ── [Reasoning...] ──
    if (/^\[Reasoning[^]]*\]\s*$/.test(line)) {
      elements.push(
        <Box key={`reason-${i}`} marginTop={1} marginBottom={1}>
          <Text color={colors.warning}>◐ </Text>
          <Text color={colors.muted} italic>thinking</Text>
        </Box>
      );
      continue;
    }

    // ── [Tool Result: name] (starts multi-line capture) ──
    const resultMatch = line.match(/^\[Tool Result: (\w+)\]\s*$/);
    if (resultMatch) {
      inToolResult = true;
      toolResultTool = resultMatch[1];
      continue;
    }

    // ── [Tool Blocked: name] reason ──
    const blockedMatch = line.match(/^\[Tool Blocked: (\w+)\]\s*(.*)/);
    if (blockedMatch) {
      elements.push(
        <Box key={`blocked-${i}`} marginTop={1} marginLeft={1} borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.warning} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.warning} bold>{icons.warn} {blockedMatch[1]}</Text>
            <Text color={colors.muted}>{blockedMatch[2] || 'requires confirmation'}</Text>
            <Text color={colors.dimmed}> /approve {blockedMatch[1]}</Text>
          </Box>
        </Box>
      );
      continue;
    }

    // ── [Tool Error: name] error ──
    const terrorMatch = line.match(/^\[Tool Error: (\w+)\]\s*(.*)/);
    if (terrorMatch) {
      elements.push(
        <Box key={`terror-${i}`} marginTop={1} marginLeft={1} borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.error} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.error} bold>{icons.error} {terrorMatch[1]}</Text>
            <Text color={colors.muted}>{terrorMatch[2]}</Text>
          </Box>
        </Box>
      );
      continue;
    }

    // ── [TOOL: name](params) — pre-execution call ──
    const callMatch = line.match(/\[TOOL:\s*(\w+)\]\((.*?)\)/);
    if (callMatch) {
      const params = callMatch[2];
      elements.push(
        <Box key={`tool-${i}`} marginTop={1} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.primaryDim} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.primary}>{icons.cell} {callMatch[1]}</Text>
            {params && <Text color={colors.dimmed}>{params.length > 120 ? params.slice(0, 120) + '…' : params}</Text>}
          </Box>
        </Box>
      );
      continue;
    }

    // ── Horizontal rule ──
    if (/^---+\s*$/.test(line)) {
      elements.push(
        <Box key={`hr-${i}`} marginTop={1} marginLeft={1}>
          <Text color={colors.dimmed}>{box.hDot.repeat(6)}</Text>
        </Box>
      );
      continue;
    }

    // ── Markdown: headings, lists, quotes ──
    if (line.startsWith('### ')) {
      elements.push(
        <Box key={`h3-${i}`} marginTop={1}>
          <Text color={colors.dimmed}>{box.h} </Text>
          <Text color={colors.primary} bold>{renderInline(line.slice(4))}</Text>
        </Box>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <Box key={`h2-${i}`} marginTop={1}>
          <Text color={colors.primary} bold>{renderInline(line.slice(3))}</Text>
        </Box>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <Box key={`h1-${i}`} marginTop={1}>
          <Text color={colors.primary} bold>{renderInline(line.slice(2))}</Text>
        </Box>
      );
    } else if (!line.trim()) {
      // 跳过连续空行 — 只保留一个紧凑间距
      const prev = elements[elements.length - 1];
      const prevIsBlank = prev != null && typeof prev === 'object' && 'key' in prev && String(prev.key).startsWith('blank-');
      if (!prevIsBlank) {
        elements.push(<Text key={`blank-${i}`}>{''}</Text>);
      }
    } else if (line.match(/^\s{2,}[-*]\s/)) {
      // 嵌套无序列表（2+ 空格缩进）
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const depth = Math.min(Math.floor(indent / 2), 3);
      const markers = ['◦', '◦', '·', '·'];
      elements.push(
        <Box key={`nli-${i}`}>
          <Text color={colors.dimmed}>{'  '.repeat(depth + 1)}{markers[depth]} </Text>
          <Text color={colors.muted}>{renderInline(line.trim().replace(/^[-*]\s/, ''))}</Text>
        </Box>
      );
    } else if (line.match(/^\s{2,}\d+\.\s/)) {
      // 嵌套有序列表
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const depth = Math.min(Math.floor(indent / 2), 3);
      const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <Box key={`nol-${i}`}>
            <Text color={colors.dimmed}>{'  '.repeat(depth + 1)}{numMatch[1]}. </Text>
            <Text color={colors.muted}>{renderInline(numMatch[2])}</Text>
          </Box>
        );
      }
    } else if (line.match(/^[-*]\s/)) {
      // 无序列表
      elements.push(
        <Box key={`li-${i}`}>
          <Text color={colors.primary}>  • </Text>
          <Text color={colors.text}>{renderInline(line.replace(/^[-*]\s/, ''))}</Text>
        </Box>
      );
    } else if (line.match(/^\d+\.\s/)) {
      // 有序列表
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <Box key={`ol-${i}`}>
            <Text color={colors.primary}>  {numMatch[1]}. </Text>
            <Text color={colors.text}>{renderInline(numMatch[2])}</Text>
          </Box>
        );
      }
    } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
      // 任务列表
      const checked = line.startsWith('- [x] ');
      elements.push(
        <Box key={`task-${i}`}>
          <Text color={checked ? colors.accent : colors.dimmed}>  {checked ? '✓' : '○'} </Text>
          <Text color={checked ? colors.muted : colors.text} strikethrough={checked}>{renderInline(line.slice(6))}</Text>
        </Box>
      );
    } else if (line.match(/^>\s/)) {
      elements.push(
        <Box key={`qt-${i}`} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
          <Text color={colors.muted} italic>{renderInline(line.slice(2))}</Text>
        </Box>
      );
    } else {
      elements.push(<Text key={`line-${i}`} color={colors.text}>{renderInline(line)}</Text>);
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(renderCodeBlock(codeBuffer, codeLang, lines.length));
  }
  if (inTable) flushTable(lines.length);
  if (inToolResult) flushToolResult(lines.length);

  return <Box flexDirection="column">{elements}</Box>;
}

/** Tool 结果渲染 — 带状态图标 + 可折叠数据 */
function renderToolResult(tool: string, data: string, keyBase: number): React.ReactNode {
  const truncated = data.length > 300 ? data.slice(0, 300) + '…' : data;
  return (
    <Box key={`result-${keyBase}`} marginTop={1} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.accent} paddingX={1}>
      <Box flexDirection="column">
        <Text color={colors.accent}>{icons.success} {tool}</Text>
        {data && <Text color={colors.dimmed}>{truncated}</Text>}
      </Box>
    </Box>
  );
}

/** 代码块渲染 — 带标签 + 行号 + 关键词高亮 */
function renderCodeBlock(lines: string[], lang: string, keyBase: number): React.ReactNode {
  const maxLineNum = lines.length;
  const numWidth = String(maxLineNum).length;

  return (
    <Box key={`code-${keyBase}`} flexDirection="column" marginTop={1} marginBottom={1}>
      {lang && (
        <Box marginLeft={1}>
          <Text color={colors.dimmed} backgroundColor={colors.surface}> {lang} </Text>
          <Text color={colors.faint}> {lines.length} lines</Text>
        </Box>
      )}
      <Box flexDirection="column" marginLeft={1} borderStyle="bold" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
        {lines.map((line, idx) => (
          <Box key={`cl-${keyBase}-${idx}`}>
            <Text color={colors.faint}>{String(idx + 1).padStart(numWidth)} │ </Text>
            {lang && shouldHighlight(lang) ? highlightCodeLine(line) : <Text color={colors.muted}>{line}</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** 判断语言是否需要语法高亮 */
function shouldHighlight(lang: string): boolean {
  const highlightable = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript', 'py', 'python', 'go', 'rs', 'rust']);
  return highlightable.has(lang.toLowerCase());
}

/** Markdown 表格渲染 — 带列对齐 */
function renderTable(rows: string[], keyBase: number): React.ReactNode {
  if (rows.length === 0) return null;

  const parseRow = (row: string): string[] =>
    row.split('|').map(c => c.trim()).filter(c => c.length > 0);

  const headerCells = parseRow(rows[0]);
  const dataRows = rows.slice(1).map(parseRow);
  const colCount = Math.max(headerCells.length, ...dataRows.map(r => r.length));
  const colWidths: number[] = [];

  for (let col = 0; col < colCount; col++) {
    const maxW = Math.max(
      (headerCells[col] || '').length,
      ...dataRows.map(r => (r[col] || '').length),
    );
    colWidths.push(Math.min(maxW, 30));
  }

  const renderRow = (cells: string[], isHeader: boolean) => (
    <Box key={`tr-${keyBase}-${isHeader ? 'h' : cells.join('')}`}>
      <Text color={colors.dimmed}> │ </Text>
      {cells.map((cell, ci) => (
        <React.Fragment key={`tc-${ci}`}>
          {ci > 0 && <Text color={colors.faint}> │ </Text>}
          <Text color={isHeader ? colors.primary : colors.text} bold={isHeader}>
            {cell.padEnd(colWidths[ci] || cell.length).slice(0, colWidths[ci] || 30)}
          </Text>
        </React.Fragment>
      ))}
      <Text color={colors.dimmed}> │</Text>
    </Box>
  );

  return (
    <Box key={`table-${keyBase}`} flexDirection="column" marginTop={1} marginLeft={1}>
      {renderRow(headerCells, true)}
      <Box>
        <Text color={colors.dimmed}> │ </Text>
        {colWidths.map((w, ci) => (
          <React.Fragment key={`ts-${ci}`}>
            {ci > 0 && <Text color={colors.faint}>─┼─</Text>}
            <Text color={colors.faint}>{box.h.repeat(w)}</Text>
          </React.Fragment>
        ))}
        <Text color={colors.dimmed}> │</Text>
      </Box>
      {dataRows.map((cells, ri) => renderRow(cells, false))}
    </Box>
  );
}

/** 空状态引导 — 品牌化首次体验 */
function EmptyState() {
  return (
    <Box flexDirection="column" paddingY={1} marginLeft={2}>
      {/* Logo mark */}
      <Box flexDirection="column">
        <Text color={colors.primary} bold>  ╋  K I L L E R</Text>
        <Text color={colors.dimmed}>  ┃  Autonomous Agent</Text>
        <Text color={colors.faint}> </Text>
      </Box>
      {/* Quick actions */}
      <Box flexDirection="column" marginLeft={1}>
        <Text color={colors.dimmed}>  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈</Text>
        <Text color={colors.muted}> </Text>
        <Text color={colors.text}>  type anything to start</Text>
        <Text color={colors.muted}> </Text>
        <Box>
          <Text color={colors.primary}>  /think</Text>
          <Text color={colors.dimmed}> deep reasoning</Text>
        </Box>
        <Box>
          <Text color={colors.primary}>  /dream</Text>
          <Text color={colors.dimmed}> memory consolidation</Text>
        </Box>
        <Box>
          <Text color={colors.primary}>  /goals</Text>
          <Text color={colors.dimmed}> set a goal</Text>
        </Box>
        <Box>
          <Text color={colors.primary}>  /help</Text>
          <Text color={colors.dimmed}> all commands</Text>
        </Box>
        <Text color={colors.muted}> </Text>
        <Text color={colors.faint}>  ↑↓ history · Tab · Esc</Text>
      </Box>
    </Box>
  );
}

export const ChatPanel = React.memo(function ChatPanel({ messages, isThinking }: ChatPanelProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth = stdout?.columns ?? 80;
  const reservedLines = 10;
  const maxLines = Math.max(termHeight - reservedLines, 6);

  // 缓存消息 key 列表 —— 只有 messages.length 或最后一条消息的 content/id 变化时才重算
  const lastMsg = messages[messages.length - 1];
  const messagesKey = `${messages.length}:${lastMsg?.id}:${lastMsg?.content?.length ?? 0}`;
  const visible = React.useMemo(() => {
    const result: ChatMessage[] = [];
    let usedLines = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const lines = estimateMessageLines(msg, termWidth);
      if (usedLines + lines > maxLines && result.length > 0) break;
      result.unshift(msg);
      usedLines += lines;
    }
    return result;
  }, [messagesKey, maxLines, termWidth]);

  const trimmed = messages.length - visible.length;

  // Empty state — onboarding guide when no messages
  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {trimmed > 0 && (
        <Box marginLeft={1}>
          <Text color={colors.dimmed}>↑ {trimmed} 条更早消息</Text>
        </Box>
      )}
      {isEmpty ? (
        <EmptyState />
      ) : (
        visible.map((msg, idx) => {
          const prevMsg = idx > 0 ? visible[idx - 1] : null;
          const showDivider = prevMsg && prevMsg.role === 'user' && msg.role === 'agent';
          return (
            <Box key={msg.id} flexDirection="column">
              {showDivider && (
                <Box marginLeft={1} marginTop={0}>
                  <Text color={colors.primaryDim}>{box.hBold}</Text>
                  <Text color={colors.faint}>{box.hDot.repeat(2)}</Text>
                </Box>
              )}
              <MessageBubble message={msg} />
            </Box>
          );
        })
      )}
      {isThinking && (
        <ThinkingIndicator />
      )}
    </Box>
  );
});

/** 流式输出光标 — 脉冲方块 */
function StreamingCursor() {
  const frames = ['█', '▓', '▒', ' '];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % frames.length), 280);
    return () => clearInterval(timer);
  }, [frames.length]);

  return <Text color={colors.primary}> {frames[frame]}</Text>;
}

/** 思考中动画 — orbit spinner + 动态文字 */
function ThinkingIndicator() {
  const frames = spinners.pulse;
  const [frame, setFrame] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
      setDotCount(d => (d % 3) + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [frames.length]);

  const dots = '.'.repeat(dotCount);
  const padding = ' '.repeat(3 - dotCount);

  return (
    <Box marginLeft={2} marginTop={1}>
      <Text color={colors.primary}>{frames[frame]} </Text>
      <Text color={colors.dimmed}>thinking{dots}{padding}</Text>
    </Box>
  );
}

/** 估算消息占用的终端行数 */
function estimateMessageLines(msg: ChatMessage, termWidth: number): number {
  const sidebarW = termWidth >= 80 ? 24 : 0;
  const contentWidth = Math.max(termWidth - sidebarW - 6, 30);
  const wrappedLines = msg.content.split('\n').reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / contentWidth));
  }, 0);
  return 1 + Math.ceil(Math.max(msg.content.split('\n').length, wrappedLines) * 1.05);
}

/** 消息气泡 — 按角色区分视觉风格 */
const MessageBubble = React.memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';
  const isError = message.role === 'error';
  const isSystem = message.role === 'system';

  // 缓存内容渲染 — 只在 content/streaming 变化时重算
  const renderedContent = React.useMemo(
    () => renderContent(message.content),
    [message.content, message.id]
  );

  // ── 错误消息 — 带恢复建议 ──
  if (isError) {
    const recovery = getErrorRecovery(message.content);
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box borderStyle="bold" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.error} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.error} bold>{icons.error} Error</Text>
            <Text color={colors.error}>{message.content}</Text>
          </Box>
        </Box>
        {recovery && (
          <Box marginLeft={2} marginTop={0}>
            <Text color={colors.dimmed}>{recovery.icon} {recovery.hint}</Text>
            {recovery.action && <Text color={colors.muted}> {recovery.action}</Text>}
          </Box>
        )}
      </Box>
    );
  }

  // ── 系统消息 — 区分工具状态和普通提示 ──
  if (isSystem) {
    const content = message.content;
    const isToolStatus = content.startsWith('  ◉') || content.startsWith('  ◎');
    if (isToolStatus) {
      return (
        <Box marginTop={0} marginLeft={2}>
          <Text color={colors.primary}>{content}</Text>
        </Box>
      );
    }
    return (
      <Box marginTop={1} marginLeft={1} borderStyle="single" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
        <Text color={colors.dimmed}>{content}</Text>
      </Box>
    );
  }

  // ── 用户消息 — 简洁箭头标记 ──
  if (isUser) {
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box>
          <Text color={colors.user} bold>{icons.user} You</Text>
          <Text color={colors.dimmed}> {formatTime(message.timestamp)}</Text>
        </Box>
        <Box marginLeft={1}>
          <Text color={colors.text}>{message.content}</Text>
        </Box>
      </Box>
    );
  }

  // ── Agent 消息 — 品牌色左侧线 + 元数据 ──
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginLeft={1}>
        <Text color={colors.agent} bold>{icons.agent} Killer</Text>
        <Text color={colors.dimmed}> {formatTime(message.timestamp)}</Text>
        {message.duration != null && !message.streaming && (
          <Text color={colors.faint}> {formatDuration(message.duration)}</Text>
        )}
        {message.streaming && <StreamingCursor />}
        {!message.streaming && message.content.length > 0 && (
          <Text color={colors.faint}> ✓</Text>
        )}
      </Box>
      <Box borderStyle="bold" borderLeft borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.primaryDim} paddingX={1}>
        <Box flexDirection="column">
          {renderedContent}
        </Box>
      </Box>
    </Box>
  );
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

/** 智能错误恢复建议 */
function getErrorRecovery(msg: string): { icon: string; hint: string; action: string } | null {
  const lower = msg.toLowerCase();
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key') || lower.includes('invalid key')) {
    return { icon: '→', hint: 'API key 无效或已过期', action: '— /key <new-key> 更新密钥' };
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many')) {
    return { icon: '→', hint: '请求频率超限', action: '— 等待 30 秒后重试' };
  }
  if (lower.includes('503') || lower.includes('502') || lower.includes('unavailable') || lower.includes('overloaded')) {
    return { icon: '→', hint: 'AI 服务暂时过载', action: '— 稍后自动重试，或 /health 查看状态' };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('econnrefused') || lower.includes('network')) {
    return { icon: '→', hint: '网络连接问题', action: '— 检查网络后重试' };
  }
  if (lower.includes('context') && lower.includes('length')) {
    return { icon: '→', hint: '对话过长，超出模型上下文', action: '— /clear 清空或开启新话题' };
  }
  if (lower.includes('circuit breaker')) {
    return { icon: '→', hint: '连续多次失败，已暂停请求', action: '— /health 查看详情，自动恢复中' };
  }
  return null;
}
