# @argszero/cordis-plugin-schedule-cron

Cron-driven **autonomous task runs** for the deepseek-harness (`dsh`) agent.

Unlike the official [`@deepseek-ai/dsh-schedule`](https://www.npmjs.com/package/@deepseek-ai/dsh-schedule) — which only **messages the live session** (a follow-up delivered into whatever agent is already running and idle) — this plugin **spawns a fresh agent run** when a calendar fire occurs, so scheduled work actually happens even with no browser session open. It is the "EMRG-style" scheduled-task runner: a cron calendar rule awakens a brand-new agent turn.

## Why this exists

`dsh-schedule` explicitly documents the gap:

> "当交付必须到达会话之外时请避开它...或者当你需要**「每个工作日 9 点」这类日历规则**时：重复提醒**只按固定间隔运行**。"

That is, it has:
- **No calendar rules** — only `after_seconds` / `at` / `every_seconds` fixed intervals.
- **No autonomous drive** — it delivers into a live session; closed/cold sessions just leave the reminder overdue.

`dsh-cron` fills both: standard 5-field cron calendar rules and a fresh agent run per fire.

## Install

```sh
npm install @argszero/cordis-plugin-schedule-cron
```

Then mount it into your `dsh` profile (a Cordis overlay). For example:

```yaml
# cordis.yml fragment
plugins:
  schedule-cron:
    cron:
      - id: daily-triage
        expression: "0 9 * * 1-5"          # 09:00 Mon–Fri
        task: "Review the open issues in this repo and summarize anything urgent."
      - id: weekly-report
        expression: "0 8 * * 1"             # 08:00 Monday
        task: "Write this week's status report."
        provider: deepseek
        model: deepseek-chat
        cwd: /path/to/workspace
    tickMs: 60000
```

## How it works

On a tick (`tickMs`, default `60_000`), the plugin checks each rule. When a rule is due:

1. `ctx.agents.create({ sessionId, meta, agentOptions })` composes a **fresh agent** (a brand new session) — the same primitive the ACP bridge uses for non-interactive sessions.
2. `agent.followup(createUserMessage({ content: [{ type: 'text', text: task }], source: { kind: 'plugin', plugin: 'schedule-cron' } }))` drives its first turn **autonomously**.

The fire uses a **monotonic per-rule cursor** (`croner`), so:
- Each occurrence fires exactly once.
- On first mount, every cursor anchors to its **next future** occurrence (no backfill burst for past times).
- A long-downed schedule is capped at `MAX_CATCH_UP_PER_TICK = 4` fires per tick (no burst).
- Disabled rules (`enabled: false`) are parsed but never fired.

A rule's state is recoverable across a restart via `initialState` (`lastFiredAt` per rule id), so a process restart mid-window resumes forward instead of re-firing.

## API

### Config

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cron` | `CronRule[]` | `[]` | The rules to fire. |
| `tickMs` | number | `60000` | How often (ms) to check for due rules. |
| `initialState` | `CronRuleState[]` | `[]` | Restore `lastFiredAt` baselines across a restart. |

### `CronRule`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable persistence key (defaults to `expr:<expr>`). |
| `expression` | `string \| string[]` | 5-field cron; an array acts as alternatives. |
| `task` | string | Prompt delivered as the spawned agent's first turn. |
| `provider` | string | Provider route (defaults to harness default). |
| `model` | string | Model id (defaults to harness default). |
| `cwd` | string | Working dir for the spawned agent (defaults to harness default). |
| `enabled` | boolean | `true` if the rule should fire (defaults true). |

### Engine (pure, no harness needed)

```ts
import { collectDue, initialCursor, resumeCursor, ruleIdOf, normalizeExpression } from '@argszero/cordis-plugin-schedule-cron'
```

The `collectDue(cursors, now)` function is dependency-free and unit-tested, so it can be driven by any timer (not just Cordis).

## Development

```sh
npm install
npm run build   # tsc emits lib/
npm test        # node test/logic.test.mjs (needs build first)
```

## License

MIT
