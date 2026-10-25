/**
 * Pure fire-engine logic for the cron plugin.
 *
 * No Cordis dependency: the computation (which rules are due, how to advance a
 * per-rule cursor) is kept pure so it can be unit-tested without a harness.
 * The Cordis plugin (`index.ts`) owns the tick timer and the
 * `ctx.agents.create()` call; this module only answers "what should fire now".
 *
 * @module @argszero/cordis-plugin-schedule-cron/engine
 */
import { Cron } from 'croner';
import type { CronRule, CronRuleState } from './types.js';
/**
 * The deadline offset (ms) a fire must sit before the clock for a rule already
 * behind on multiple occurrences. We fire at most one occurrence per tick so a
 * long-downed schedule doesn't backfill a burst of runs.
 */
export declare const MAX_CATCH_UP_PER_TICK = 4;
/**
 * A rule that is due to fire right now, along with the occurrence timestamp.
 */
export interface DueFire {
    readonly rule: CronRule;
    /** The occurrence this fire represents (the schedule time it satisfies). */
    readonly occurrenceAt: Date;
}
/**
 * A normalized, mutable view of one rule's schedule state. The plugin holds a
 * `Map<id, CronCursor>`; each cursor is advanced one occurrence per fire.
 */
export interface CronCursor {
    /** The rule this cursor serves. */
    readonly rule: CronRule;
    /** The parsed Cron engine (one per rule, reused across ticks). */
    readonly cron: Cron;
    /** The next un-fired occurrence. `null` when the rule is exhausted/absent. */
    next: Date | null;
}
/**
 * Resolve a stable id for a rule. Falls back to the joined expression so a
 * rule configured without an explicit `id` still has a durable persistence key.
 */
export declare function ruleIdOf(rule: CronRule): string;
/**
 * Normalize a cron expression (or array of them) to a single croner-parseable
 * string. `croner` accepts a single string; an array is joined with `,` so
 * multiple expressions act as alternatives on the same rule.
 */
export declare function normalizeExpression(expression: CronRule['expression']): string;
/**
 * Compute the next strict occurrence of a cron expression at or after `from`.
 * Returns `null` when the expression yields no future occurrence.
 */
export declare function nextOccurrence(cron: Cron, from: Date): Date | null;
/**
 * Build the initial cursor for a rule. On first boot we anchor the cursor to
 * the **next** future occurrence (never a past one), so a freshly-mounted
 * schedule does not immediately backfill a burst of runs for every past
 * occurrence.
 *
 * @param rule - the cron rule.
 * @param now - the current time (the boot anchor).
 */
export declare function initialCursor(rule: CronRule, now: Date): CronCursor;
/**
 * Restore a cursor from persisted `lastFiredAt`. The cursor is anchored one
 * occurrence **after** the last fire, so a restart in the middle of an
 * overdue window resumes forward without re-firing a completed occurrence.
 *
 * @param rule - the cron rule.
 * @param lastFiredAt - the ISO timestamp of the last fire recorded for this rule.
 * @param fallbackNow - the boot anchor when the recorded timestamp is invalid.
 */
export declare function resumeCursor(rule: CronRule, lastFiredAt: string, fallbackNow: Date): CronCursor;
/**
 * Advance a cursor to the strictly-next occurrence after it fired.
 * @param cursor - the cursor that just fired.
 * @returns the advanced cursor (same object).
 */
export declare function advance(cursor: CronCursor): CronCursor;
/**
 * Decide which rules are due at `now`, producing the fires + the per-rule
 * state to persist afterwards. At most {@link MAX_CATCH_UP_PER_TICK} fires
 * total are produced per call so a long-downed schedule doesn't burst.
 *
 * @param cursors - the current cursor map (keyed by rule id).
 * @param now - the current time this tick observed.
 * @returns the due fires and a snapshot of the post-fire cursors (for the
 * optional state projection).
 */
export declare function collectDue(cursors: ReadonlyMap<string, CronCursor>, now: Date): {
    fires: DueFire[];
    state: CronRuleState[];
};
//# sourceMappingURL=engine.d.ts.map