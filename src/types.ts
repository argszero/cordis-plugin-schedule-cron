/**
 * Types for @argszero/cordis-plugin-schedule-cron.
 *
 * A cron rule describes a calendar-based recurrence and the task the harness
 * should run when it fires. Unlike the official @deepseek-ai/dsh-schedule
 * (which messages the *live* session), each fire here spawns a **fresh
 * autonomous agent run** via `ctx.agents.create()` + `agent.followup()`,
 * so work happens even when no browser session is open.
 *
 * @module @argszero/cordis-plugin-schedule-cron
 */

/** A calendar cron expression in the standard 5-field form. */
export interface CronRule {
  /**
   * The rule id. Persistence keys on this to dedupe fires. Auto-assigned when omitted.
   */
  readonly id?: string
  /**
   * Standard 5-field cron expression: `minute hour day-of-month month day-of-week`.
   * Example: `"0 9 * * 1-5"` for 09:00 on weekdays. May be an array of expressions.
   */
  readonly expression: string | readonly string[]
  /**
   * The prompt/task to run when the rule fires. This is delivered as a
   * `UserMessage` into the spawned agent's first turn.
   */
  readonly task: string
  /**
   * Optional provider route for the spawned agent. Defaults to the harness's
   * current default selection when omitted.
   */
  readonly provider?: string
  /**
   * Optional model id interpreted by the selected provider. Defaults to the
   * harness's current default selection when omitted.
   */
  readonly model?: string
  /**
   * Optional working directory for the spawned agent. Defaults to the
   * harness default `cwd` when omitted.
   */
  readonly cwd?: string
  /**
   * Whether the rule is enabled. Disabled rules are parsed but never fired.
   * Useful for a persisted registry that the host toggles without deleting.
   */
  readonly enabled?: boolean
}

/**
 * Per-rule fire state. Duration-preserving key so the plugin can survive a
 * process restart without re-firing already-completed shedules.
 */
export interface CronRuleState {
  /** The rule id. */
  readonly id: string
  /** The last scheduled occurrence the plugin actually fired. */
  readonly lastFiredAt: string
}

/** Plugin configuration shape. */
export interface ScheduleCronConfig {
  /**
   * The cron rules this plugin owns. When a rule fires, the plugin spawns a
   * fresh agent run with the rule's `task` as its first turn.
   */
  readonly cron: readonly CronRule[]
  /**
   * How often (milliseconds) the plugin wakes to check for due rules.
   * Defaults to 60_000 (one minute). For fine-grained schedules, lower this
   * (e.g. 15_000) — but sub-minute cron expressions are not honored by the
   * standard 5-field form.
   */
  readonly tickMs?: number
  /**
   * Optional initial state to restore dedupe baselines across a restart.
   * Without it the plugin refuses to fire a rule it has no baseline for on
   * the first boot (guarding against a "backfill burst" of fires for every
   * past occurrence).
   */
  readonly initialState?: readonly CronRuleState[]
}
