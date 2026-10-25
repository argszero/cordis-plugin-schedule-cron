/**
 * @argszero/cordis-plugin-schedule-cron
 *
 * Cron-driven autonomous task runs for the dsh harness. On a calendar cron
 * fire this plugin **spawns a fresh agent run** via `ctx.agents.create()` and
 * `agent.followup()`, so scheduled work happens even with no browser session
 * open. This is the EMRG-style "autonomous scheduled task" model, distinct
 * from the official @deepseek-ai/dsh-schedule which only messages the live
 * session.
 *
 * @module @argszero/cordis-plugin-schedule-cron
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ScheduleCronConfig } from './types.js';
/**
 * The durable source kind this plugin stamps on every message it fires.
 *
 * `MessageSourceMap` is merge-extensible and its base entry declares no shared
 * catch-all `plugin` kind: each producer names its own, which is why the map is
 * augmented here rather than a literal being bent to fit the union. The bare
 * `form` arm is deliberate - a fired task is the instruction the run acts on,
 * not a one-line notice about something else.
 */
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'schedule-cron': {
            kind: 'schedule-cron';
            plugin?: string;
        };
    }
}
export type * from './types.js';
export { collectDue, initialCursor, resumeCursor, ruleIdOf, normalizeExpression } from './engine.js';
export type { CronCursor, DueFire } from './engine.js';
/** Cordis function-plugin name. */
export declare const name = "schedule-cron";
/** Services required before any scheduled run can be spawned. */
export declare const inject: string[];
/**
 * Mount the cron scheduler. Config holds the rules; each fire spawns a fresh
 * agent run.
 */
export declare function apply(ctx: Context, config: ScheduleCronConfig): void;
//# sourceMappingURL=index.d.ts.map