/**
 * Chat Panel — 消息显示区域
 *
 * 消息气泡设计：用户消息用 ╭─ 框线，agent 消息用 ┄┄ 前缀。
 * 代码块：带语言标签 + 缩进的 box 包裹。
 * 流式输出：光标闪烁动画。
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, box, bubble, statusDot, statusColor, icons, spinners } from './theme.js';

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

/** 行内格式：粗体、代码、链接 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t-${keyIdx++}`}>{text.slice(lastIndex, match.index)}</Text>);
    }
    if (match[1]) {
      parts.push(<Text key={`b-${keyIdx++}`} bold color={colors.text}>{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(
        <Text key={`c-${keyIdx++}`} color={colors.warning} backgroundColor={colors.surface}>
          {' '}{match[4]}{' '}
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

/** 渲染消息内容 — tool 调用/结果/错误 + 标题/列表/代码块 */
function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';
  let inToolResult = false;
  let toolResultTool = '';
  let toolResultBuffer: string[] = [];

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
        <Box key={`hr-${i}`} marginTop={1}>
          <Text color={colors.faint}>{box.hDot.repeat(20)}</Text>
        </Box>
      );
      continue;
    }

    // ── Markdown: headings, lists, quotes ──
    if (line.startsWith('### ')) {
      elements.push(
        <Box key={`h3-${i}`} marginTop={1}>
          <Text color={colors.dimmed}>{box.h} </Text>
          <Text color={colors.primary} bold>{line.slice(4)}</Text>
        </Box>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <Box key={`h2-${i}`} marginTop={1}>
          <Text color={colors.primary} bold>{line.slice(3)}</Text>
        </Box>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <Box key={`h1-${i}`} marginTop={1}>
          <Text color={colors.primary} bold>{line.slice(2)}</Text>
        </Box>
      );
    } else if (!line.trim()) {
      elements.push(<Text key={`blank-${i}`}>{' '}</Text>);
    } else if (line.match(/^[-*]\s/)) {
      elements.push(
        <Box key={`li-${i}`}>
          <Text color={colors.dimmed}>  {box.v} </Text>
          <Text color={colors.text}>{renderInline(line.slice(2))}</Text>
        </Box>
      );
    } else if (line.match(/^>\s/)) {
      elements.push(
        <Box key={`qt-${i}`}>
          <Text color={colors.dimmed}>  {box.vBold} </Text>
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

/** 代码块渲染 — 带标签 + 左边线 */
function renderCodeBlock(lines: string[], lang: string, keyBase: number): React.ReactNode {
  const label = lang
    ? <Text color={colors.dimmed}>{box.teeL} </Text>
    : null;
  const langTag = lang
    ? <Text color={colors.faint} backgroundColor={colors.surface}> {lang} </Text>
    : null;

  return (
    <Box key={`code-${keyBase}`} flexDirection="column" marginTop={1} marginBottom={1}>
      {langTag && (
        <Box marginLeft={1}>
          {langTag}
        </Box>
      )}
      <Box flexDirection="column" marginLeft={1} borderStyle="bold" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.dimmed} paddingX={1}>
        <Text color={colors.muted}>{lines.join('\n')}</Text>
      </Box>
    </Box>
  );
}

export function ChatPanel({ messages, isThinking }: ChatPanelProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const termWidth = stdout?.columns ?? 80;
  const reservedLines = 10;
  const maxLines = Math.max(termHeight - reservedLines, 6);

  // 从最新消息往前推算可见区域
  const visible: ChatMessage[] = [];
  let usedLines = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const lines = estimateMessageLines(msg, termWidth);
    if (usedLines + lines > maxLines && visible.length > 0) break;
    visible.unshift(msg);
    usedLines += lines;
  }

  const trimmed = messages.length - visible.length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {trimmed > 0 && (
        <Box marginLeft={1}>
          <Text color={colors.dimmed}>↑ {trimmed} 条更早消息</Text>
        </Box>
      )}
      {visible.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isThinking && (
        <ThinkingIndicator />
      )}
    </Box>
  );
}

/** 思考中动画 — 月相旋转 */
function ThinkingIndicator() {
  const frames = spinners.thinking;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % frames.length), 180);
    return () => clearInterval(timer);
  }, [frames.length]);

  return (
    <Box marginLeft={2} marginTop={1}>
      <Text color={colors.primary}>{frames[frame]} </Text>
      <Text color={colors.dimmed}>thinking</Text>
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
  return 2 + Math.ceil(Math.max(msg.content.split('\n').length, wrappedLines) * 1.1);
}

/** 消息气泡 — 按角色区分视觉风格 */
const MessageBubble = React.memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';
  const isError = message.role === 'error';
  const isSystem = message.role === 'system';

  // ── 错误消息 ──
  if (isError) {
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box borderStyle="bold" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.error} paddingX={1}>
          <Box flexDirection="column">
            <Text color={colors.error} bold>{bubble.error} Error</Text>
            <Text color={colors.error}>{message.content}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── 系统消息 ──
  if (isSystem) {
    return (
      <Box marginLeft={2} marginTop={1}>
        <Text color={colors.dimmed}>{bubble.system} {message.content}</Text>
      </Box>
    );
  }

  // ── 用户消息 ──
  if (isUser) {
    return (
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        <Box>
          <Text color={colors.user} bold>{bubble.userEnd} You</Text>
          <Text color={colors.dimmed}> {formatTime(message.timestamp)}</Text>
        </Box>
        <Box marginLeft={3} flexDirection="column">
          {renderContent(message.content)}
        </Box>
      </Box>
    );
  }

  // ── Agent 消息 ──
  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1}>
      <Box>
        <Text color={colors.agent} bold>{bubble.agent} Killer</Text>
        <Text color={colors.dimmed}> {formatTime(message.timestamp)}</Text>
        {message.duration != null && !message.streaming && (
          <Text color={colors.dimmed}> {formatDuration(message.duration)}</Text>
        )}
        {message.streaming && (
          <Text color={colors.primary}> ▊</Text>
        )}
      </Box>
      <Box marginLeft={3} flexDirection="column">
        {renderContent(message.content)}
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
