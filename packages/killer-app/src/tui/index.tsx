/**
 * TUI Entry Point
 *
 * 启动 ink 渲染的 TUI 模式。接收 KillerAgent 实例。
 */

import React from 'react';
import { render, type Instance } from 'ink';
import { KillerTUI } from './app.js';
import type { KillerAgent } from '../orchestrator/index.js';

export function startTUI(agent: KillerAgent): Instance {
  return render(<KillerTUI agent={agent} />);
}
