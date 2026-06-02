/**
 * TUI Entry Point
 *
 * 启动 ink 渲染的 TUI 模式。接收 OdysseusAgent 实例。
 *
 * 架构：ink 渲染（消息/状态/动画）+ readline 输入（IME 兼容）
 * 不使用 useInput / TextInput 避免raw mode 与中文输入法冲突。
 */

import React from 'react';
import { render, type Instance } from 'ink';
import { createInterface } from 'readline';
import { Writable } from 'stream';
import { OdysseusTUI } from './app.js';
import type { OdysseusAgent } from '../orchestrator/index.js';

export function startTUI(agent: OdysseusAgent): Instance {
  // Bridge: readline 层通过这些闭包将输入传递给 ink 组件
  let submitFn: ((input: string) => void) | null = null;
  let getStatusFn: (() => string) | null = null;
  let abortFn: (() => void) | null = null;

  const bridge = {
    submit: (fn: (input: string) => void) => { submitFn = fn; },
    getStatus: (fn: () => string) => { getStatusFn = fn; },
    abort: (fn: () => void) => { abortFn = fn; },
  };

  const instance = render(
    <OdysseusTUI agent={agent} bridge={bridge} />,
    { exitOnCtrlC: false },
  );

  // Readline 输入（IME 兼容，不使用 raw mode）
  const nullOutput = new Writable({ write: (_chunk, _enc, cb) => cb() });
  const rl = createInterface({
    input: process.stdin,
    output: nullOutput,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (getStatusFn && getStatusFn() !== 'idle') return;
    if (submitFn) submitFn(trimmed);
  });

  // SIGINT (Ctrl+C) → 优雅关闭
  const shutdown = () => {
    rl.close();
    agent.saveSession('tui-session');
    agent.shutdown().then(() => {
      instance.unmount();
      process.exit(0);
    }).catch(() => {
      instance.unmount();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);

  return instance;
}
