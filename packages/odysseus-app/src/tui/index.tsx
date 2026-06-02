/**
 * TUI Entry Point
 *
 * 启动 ink 渲染的 TUI 模式。接收 OdysseusAgent 实例。
 */

import React from 'react';
import { render, type Instance } from 'ink';
import { OdysseusTUI } from './app.js';
import type { OdysseusAgent } from '../orchestrator/index.js';

export function startTUI(agent: OdysseusAgent): Instance {
  return render(<OdysseusTUI agent={agent} />);
}
