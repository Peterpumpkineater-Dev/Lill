# Lilly OS — Agent Framework

## BaseAgent contract

Every agent:
1. Extends `BaseAgent`
2. Declares `readonly name: AgentName`
3. Implements `setup()` for event subscriptions
4. Optionally implements `handle(action, input)` for REST invokes
5. Communicates **only** via `EventBus` (no direct agent imports for runtime calls)

## Event catalog

See `src/types/events.ts` for the full typed `EventMap`.

## Adding an agent

1. Create `src/agents/my-agent/index.ts`
2. Extend `BaseAgent`
3. Register in `src/index.ts`
4. Add actions to REST via existing `/api/agents/:name/:action` or dedicated routes

## Adding a platform

Implement `IPlatformAdapter` and register via `PluginRegistry` or `createDefaultAdapters()`.
