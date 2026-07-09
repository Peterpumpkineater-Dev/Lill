# Lilly OS Architecture

## Design decisions

### 1. Event-driven agents
Agents never call each other directly. They publish domain events on an in-process EventBus (and optionally fan-out via Redis for multi-instance). This keeps agents replaceable and testable.

### 2. AI reasoning vs business logic
- **Business logic**: typed services + repositories (scheduling rules, analytics math, compliance checklists).
- **AI reasoning**: optional LLM adapter behind `ReasoningService`. When `LLM_ENABLED=false`, agents use deterministic heuristics so the system runs fully offline.

### 3. Human-in-the-loop
- Community replies are **draft-only**.
- Publishing requires Compliance pass when `PUBLISH_REQUIRE_COMPLIANCE=true`.
- `PUBLISH_AUTO_APPROVED=false` keeps a manual approval gate for production safety.

### 4. Traffic / continuous posting
The **Publisher** agent targets platforms that permit scheduled/API posting for adult creators. It does not bypass ToS. Platforms are plugins implementing `IPlatformAdapter`.

### 5. Memory
Hybrid memory:
- **Episodic**: events and outcomes in Postgres
- **Semantic**: brand voice, prefs, campaign lessons (key-value + tags)
- **Working**: Redis short-lived context per mission

### 6. Plugin system
New platforms, report sinks, or agents register via `PluginRegistry` at boot.

## Folder map

```
src/
  config/          env + typed config
  types/           shared domain types
  core/
    event-bus/     typed EventBus
    queue/         BullMQ workers
    plugin/        plugin registry
    logger/        pino setup
    memory/        memory subsystem
  agents/          one folder per agent
  services/        pure business logic
  db/              pool, migrations, repositories
  api/             REST + WebSocket
  utils/
```

## Event flow (publish pipeline)

```
MissionDirector → task.created
ContentPlanner  → content.planned
Compliance      → content.reviewed (pass|fail)
Scheduler       → publish.queued
Publisher       → publish.completed | publish.failed
Analytics       → metrics.recorded
MemoryManager   → memory.updated
Dashboard WS    → push all above to clients
```

## Scaling

- Horizontal API replicas share Redis queues and Postgres.
- Sticky WS not required; clients reconnect and re-subscribe to channels.
- Agent workers can run as separate processes via queue consumers.
