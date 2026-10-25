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
export {};
//# sourceMappingURL=types.js.map