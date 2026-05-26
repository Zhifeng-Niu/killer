/**
 * Chat Panel — 消息显示区域
 *
 * 渲染用户和 agent 的对话消息，支持流式输出和 markdown 高亮。
 * 根据终端高度自动裁剪可见消息，确保输入框始终可见。
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { colors, icons } from './theme.js';

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

/** 行内格式：粗体、代码 */
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
      parts.push(<Text key={`c-${keyIdx++}`} color={colors.warning} backgroundColor={colors.surface}>{match[4]}</Text>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={`end`}>{text.slice(lastIndex)}</Text>);
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

/** 渲染消息内容，处理代码块和基础 markdown */
function renderContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const langLabel = codeLang ? <Text color={colors.primary}>{codeLang}</Text> : null;
        elements.push(
          <Box key={`code-${i}`} marginLeft={1} flexDirection="column">
            {langLabel && <Box><Text color={colors.dimmed}>┌ </Text>{langLabel}</Box>}
            <Box paddingX={1} borderStyle={codeLang ? undefined : 'round'} borderColor={colors.dimmed}>
              <Text color={colors.muted}>{codeBuffer.join('\n')}</Text>
            </Box>
          </Box>
        );
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

    if (line.startsWith('### ')) {
      elements.push(<Text key={`h3-${i}`} color={colors.primary} bold>{line.slice(4)}</Text>);
    } else if (line.startsWith('## ')) {
      elements.push(<Text key={`h2-${i}`} color={colors.primary} bold>{line.slice(3)}</Text>);
    } else if (line.startsWith('# ')) {
      elements.push(<Text key={`h1-${i}`} color={colors.primary} bold>{line.slice(2)}</Text>);
    } else if (!line.trim()) {
      elements.push(<Text key={`blank-${i}`}>{' '}</Text>);
    } else if (line.match(/^[-*]\s/)) {
      elements.push(<Text key={`li-${i}`} color={colors.text}><Text color={colors.accent}>  • </Text>{renderInline(line.slice(2))}</Text>);
    } else {
      elements.push(<Text key={`line-${i}`} color={colors.text}>{renderInline(line)}</Text>);
    }
  }
  return <Box flexDirection="column">{elements}</Box>;
}

export function ChatPanel({ messages, isThinking }: ChatPanelProps) {
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  // 预留: header 2行 + input 2行 + spinner 2行 + 边距 2行
  const reservedLines = 8;
  const maxLines = Math.max(termHeight - reservedLines, 6);

  // 从最新消息往前推算，估算每条消息占用行数
  const visible: ChatMessage[] = [];
  let usedLines = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const lines = estimateMessageLines(msg);
    if (usedLines + lines > maxLines && visible.length > 0) break;
    visible.unshift(msg);
    usedLines += lines;
  }

  const trimmed = messages.length - visible.length;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {trimmed > 0 && (
        <Text color={colors.dimmed}>  ↑ 还有 {trimmed} 条更早的消息</Text>
      )}
      {visible.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isThinking && (
        <Box marginTop={1}>
          <Text color={colors.primary}> <Spinner type="dots" /> </Text>
          <Text color={colors.muted}>思考中...</Text>
        </Box>
      )}
    </Box>
  );
}

/** 估算消息占用的终端行数（保守估计） */
function estimateMessageLines(msg: ChatMessage): number {
  const contentLines = msg.content.split('\n').length;
  // 每行 ~80 字符宽时可能折行
  const wrappedLines = msg.content.split('\n').reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / 80));
  }, 0);
  // 2 行头部 (角色 + 时间戳) + 内容行（取折行后）
  return 2 + Math.max(contentLines, wrappedLines);
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isAgent = message.role === 'agent';
  const isError = message.role === 'error';
  const roleColor = isUser ? colors.user : isAgent ? colors.agent : isError ? colors.error : colors.muted;
  const label = isUser ? icons.user : isAgent ? icons.agent : isError ? icons.error : '📌';
  const prefix = isUser ? '你' : isAgent ? 'Killer' : isError ? '错误' : '系统';

  const inner = (
    <Box flexDirection="column">
      <Box>
        <Text color={roleColor} bold>{label} {prefix}</Text>
        <Text color={colors.dimmed}> {formatTime(message.timestamp)}</Text>
        {message.duration != null && !message.streaming && (
          <Text color={colors.dimmed}> · {message.duration < 1000 ? `${message.duration}ms` : `${(message.duration / 1000).toFixed(1)}s`}</Text>
        )}
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {renderContent(message.content)}
      </Box>
    </Box>
  );

  if (isError) {
    return (
      <Box borderStyle="bold" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={colors.error} marginTop={1}>
        {inner}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={isAgent ? 1 : 0}>
      {inner}
    </Box>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
