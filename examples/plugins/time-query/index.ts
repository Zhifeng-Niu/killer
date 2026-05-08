/**
 * Example Plugin: Time Query
 *
 * Demonstrates the Killer plugin API by registering:
 * - A "time_query" tool that returns current time in various formats
 * - A "/time" CLI command for quick time access
 *
 * Usage:
 *   1. Compile this file to JS: npx tsc examples/plugins/time-query/index.ts --outDir .killer/plugins/time-query --module ES2020 --moduleResolution node
 *   2. Or copy the compiled JS to .killer/plugins/time-query/index.js
 *   3. The plugin loads automatically on agent boot
 */

import type { PluginContext, KillerPlugin, PluginManifest } from '../../packages/killer-app/src/plugins/types.js';

export const manifest: PluginManifest = {
  name: 'time-query',
  version: '1.0.0',
  description: 'Provides time query capabilities — current time, date calculations, and timezone conversion',
  author: 'Killer Framework',
};

export async function init(context: PluginContext): Promise<void> {
  const logger = context.getLogger();

  // Register a tool that can be called by the agent
  context.registerTool({
    name: 'time_query',
    description: 'Get current date/time in various formats or convert between timezones',
    execute: async (params) => {
      const p = params as { format?: string; timezone?: string };
      const now = new Date();

      try {
        let result: string;

        if (p.timezone) {
          result = now.toLocaleString('en-US', { timeZone: p.timezone });
        } else if (p.format === 'iso') {
          result = now.toISOString();
        } else if (p.format === 'unix') {
          result = String(Math.floor(now.getTime() / 1000));
        } else if (p.format === 'relative') {
          result = formatRelative(now);
        } else {
          result = now.toLocaleString();
        }

        logger.info(`Time query: ${result}`);
        return { success: true, data: { time: result, timezone: p.timezone ?? 'local' } };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // Register a CLI command
  context.registerCommand('time', 'Show current time', async (args) => {
    const now = new Date();
    if (args.trim() === 'iso') return now.toISOString();
    if (args.trim() === 'unix') return String(Math.floor(now.getTime() / 1000));
    return now.toLocaleString();
  });

  logger.info('Time query plugin initialized');
}

/**
 * Format time in a relative style (e.g., "Thursday afternoon")
 */
function formatRelative(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hour = date.getHours();
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `${days[date.getDay()]} ${period}, ${date.toLocaleTimeString()}`;
}

// Export as KillerPlugin
const timeQueryPlugin: KillerPlugin = { manifest, init };
export default timeQueryPlugin;
