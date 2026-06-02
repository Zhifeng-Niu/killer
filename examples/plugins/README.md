# Killer Plugins

Plugins extend Killer Agent with custom tools and commands.

## Structure

```
.odysseus/plugins/
└── my-plugin/
    └── index.js    # Plugin entry point (must be compiled JS)
```

## Creating a Plugin

A plugin implements the `OdysseusPlugin` interface:

```typescript
import type { PluginContext, OdysseusPlugin, PluginManifest } from '@odysseus/app';

const manifest: PluginManifest = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'What my plugin does',
};

async function init(context: PluginContext): Promise<void> {
  // Register a tool the agent can use
  context.registerTool({
    name: 'my_tool',
    description: 'What this tool does',
    execute: async (params) => {
      return { success: true, data: { result: 'done' } };
    },
  });

  // Register a CLI command
  context.registerCommand('mycommand', 'What this command does', async (args) => {
    return `You said: ${args}`;
  });
}

const plugin: OdysseusPlugin = { manifest, init };
export default plugin;
```

## Plugin Context API

### `context.registerTool(tool)`

Register a tool the agent can invoke during reasoning.

```typescript
context.registerTool({
  name: 'tool_name',          // Unique identifier
  description: 'Description', // Used by the agent to decide when to use this tool
  execute: async (params) => {
    // params: arbitrary input from the agent
    return {
      success: boolean,
      data?: unknown,      // Result data on success
      error?: string,      // Error message on failure
    };
  },
});
```

### `context.registerCommand(name, description, handler)`

Register a CLI command users can invoke with `/name`.

```typescript
context.registerCommand('greet', 'Send a greeting', async (args) => {
  return `Hello, ${args}!`;
});
```

### `context.getLogger()`

Get a namespaced logger.

```typescript
const logger = context.getLogger();
logger.info('Plugin initialized');
logger.error('Something failed', error);
```

## Loading

Plugins are auto-loaded from:
1. `.odysseus/plugins/` (project-level)
2. `~/.odysseus/plugins/` (user-level)

Or registered programmatically:

```typescript
agent.pluginManager.register(myPlugin);
```

## Example

See `examples/plugins/time-query/` for a working example plugin that provides time query tools and a `/time` CLI command.
