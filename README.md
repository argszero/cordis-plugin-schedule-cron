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

### A note on the peer range

This package declares every dsh package it reads as a peer, all with the same
range:

```
>=0.1.2-rc.1 <0.1.3 || >=0.1.3-alpha.2 <0.1.4 || >=0.1.5-alpha.1 <0.2.0 || >=0.1.6-alpha.1 <0.2.0
```

Every dsh release published today is a **prerelease** (`0.1.2-rc.1`, `0.1.5-alpha.1`,
`0.1.6-alpha.2`, …), and a semver comparator admits a prerelease only when some
comparator **in the same group** shares its `major.minor.patch` tuple. Two
consequences follow, and both have already bitten this package:

```jsonc
// Matches nothing: 0.1.2-rc.1 sorts BELOW 0.1.2, and every other prerelease
// carries a different tuple.  -> ETARGET, the package cannot be installed.
">=0.1.2"

// Only the 0.1.2-rc tuple. The `<0.2.0` upper bound is INERT for prereleases:
// it excludes no later line, so every other line gets ERESOLVE.
">=0.1.2-rc.1 <0.2.0"
```

The second form is the dangerous one, because it *reads* as though it covered
everything from `0.1.2-rc.1` onward. It does not — `<0.2.0` never excludes
`0.1.6-alpha.2`, and no comparator names that tuple. Up to **v0.1.1** the
shipped range was

```
>=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0
```

which admitted the `0.1.2-rc` and `0.1.5` tuples and **nothing else** — 5 of the
23 published versions. A user on the newest shipped dsh release
(`0.1.6-alpha.2`) therefore could not install the plugin at all:

```
npm error ERESOLVE unable to resolve dependency tree
npm error peer @deepseek-ai/dsh-llm@">=0.1.2-rc.1 <0.2.0 || ..." from
npm error   @argszero/cordis-plugin-schedule-cron@0.1.1
```

The plugin's own suite passes on that line (7/7). The dsh packages are
**peers**, so `--legacy-peer-deps` is not something a consumer can reasonably be
asked to accept: the install simply fails.

**What we ship:** one comparator per supported tuple, each with its own upper
bound so the intended span is legible rather than implied.

| clause | admits |
| --- | --- |
| `>=0.1.2-rc.1 <0.1.3` | `0.1.2-rc.1` |
| `>=0.1.3-alpha.2 <0.1.4` | `0.1.3-alpha.2` |
| `>=0.1.5-alpha.1 <0.2.0` | the whole 0.1.5 line (alpha.1, alpha.2, rc.1, rc.2) |
| `>=0.1.6-alpha.1 <0.2.0` | the whole 0.1.6 line (alpha.1, alpha.2) |

`test/peer-range` **computes** the admitted set with the real `semver` package
and asserts it equals exactly the set the suite has been run against — 8
versions — rather than pattern-matching the range string. An earlier guard only
checked that the string mentioned `0.1.2-rc.N` and `0.1.5-alpha.N`; that form
cannot tell a correct range from an incorrect one, which is how the range above
shipped green. Asserting the set exactly makes both directions loud: dropping a
supported line fails, and admitting an unverified line fails too. The same file
also asserts that this README quotes the manifest range verbatim.
## License

MIT
