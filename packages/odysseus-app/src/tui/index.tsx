/**
 * TUI Entry Point
 *
 * 启动 ink 渲染的 TUI 模式。所有输入由 useInput hook 在组件内处理。
 */

import React from 'react';
import { render, type Instance } from 'ink';
import { OdysseusTUI } from './app.js';
import type { OdysseusAgent } from '../orchestrator/index.js';

export function startTUI(agent: OdysseusAgent): Instance {
  const instance = render(
    <OdysseusTUI agent={agent} />,
    { exitOnCtrlC: false },
  );

  // 外部 SIGINT（kill -INT）fallback — 正常 Ctrl+C 由组件内 useInput 处理
  process.on('SIGINT', () => {
    try { agent.saveSession('tui-session'); } catch { /* best effort */ }
    instance.unmount();
    process.exit(0);
  });

  return instance;
}
