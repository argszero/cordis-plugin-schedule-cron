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

import { Cron } from 'croner'
import type { CronRule, CronRuleState } from './types.js'

/**
 * The deadline offset (ms) a fire must sit before the clock for a rule already
 * behind on multiple occurrences. We fire at most one occurrence per tick so a
 * long-downed schedule doesn't backfill a burst of runs.
 */
export const MAX_CATCH_UP_PER_TICK = 4

/**
 * A rule that is due to fire right now, along with the occurrence timestamp.
 */
export interface DueFire {
  readonly rule: CronRule
  /** The occurrence this fire represents (the schedule time it satisfies). */
  readonly occurrenceAt: Date
}

/**
 * A normalized, mutable view of one rule's schedule state. The plugin holds a
 * `Map<id, CronCursor>`; each cursor is advanced one occurrence per fire.
 */
export interface CronCursor {
  /** The rule this cursor serves. */
  readonly rule: CronRule
  /** The parsed Cron engine (one per rule, reused across ticks). */
  readonly cron: Cron
  /** The next un-fired occurrence. `null` when the rule is exhausted/absent. */
  next: Date | null
}

/**
 * Resolve a stable id for a rule. Falls back to the joined expression so a
 * rule configured without an explicit `id` still has a durable persistence key.
 */
export function ruleIdOf(rule: CronRule): string {
  if (rule.id !== undefined && rule.id !== '') return rule.id
  const expr = Array.isArray(rule.expression) ? rule.expression.join(',') : rule.expression
  return `expr:${expr}`
}

/**
 * Normalize a cron expression (or array of them) to a single croner-parseable
 * string. `croner` accepts a single string; an array is joined with `,` so
 * multiple expressions act as alternatives on the same rule.
 */
export function normalizeExpression(expression: CronRule['expression']): string {
  return Array.isArray(expression) ? expression.join(',') : (expression as string)
}

/**
 * Compute the next strict occurrence of a cron expression at or after `from`.
 * Returns `null` when the expression yields no future occurrence.
 */
export function nextOccurrence(cron: Cron, from: Date): Date | null {
  const next = cron.nextRun(from)
  return next ?? null
}

/**
 * Build the initial cursor for a rule. On first boot we anchor the cursor to
 * the **next** future occurrence (never a past one), so a freshly-mounted
 * schedule does not immediately backfill a burst of runs for every past
 * occurrence.
 *
 * @param rule - the cron rule.
 * @param now - the current time (the boot anchor).
 */
export function initialCursor(rule: CronRule, now: Date): CronCursor {
  const cron = new Cron(normalizeExpression(rule.expression))
  const next = nextOccurrence(cron, now)
  return { rule, cron, next }
}

/**
 * Restore a cursor from persisted `lastFiredAt`. The cursor is anchored one
 * occurrence **after** the last fire, so a restart in the middle of an
 * overdue window resumes forward without re-firing a completed occurrence.
 *
 * @param rule - the cron rule.
 * @param lastFiredAt - the ISO timestamp of the last fire recorded for this rule.
 * @param fallbackNow - the boot anchor when the recorded timestamp is invalid.
 */
export function resumeCursor(rule: CronRule, lastFiredAt: string, fallbackNow: Date): CronCursor {
  const cron = new Cron(normalizeExpression(rule.expression))
  const from = new Date(lastFiredAt)
  const parsed = Number.isNaN(from.getTime()) ? fallbackNow : from
  const next = nextOccurrence(cron, parsed)
  return { rule, cron, next }
}

/**
 * Advance a cursor to the strictly-next occurrence after it fired.
 * @param cursor - the cursor that just fired.
 * @returns the advanced cursor (same object).
 */
export function advance(cursor: CronCursor): CronCursor {
  cursor.next = cursor.next === null ? null : nextOccurrence(cursor.cron, cursor.next)
  return cursor
}

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
export function collectDue(
  cursors: ReadonlyMap<string, CronCursor>,
  now: Date,
): { fires: DueFire[]; state: CronRuleState[] } {
  const fires: DueFire[] = []
  const state: CronRuleState[] = []
  let budget = MAX_CATCH_UP_PER_TICK

  for (const cursor of cursors.values()) {
    if (cursor.rule.enabled === false) continue
    if (cursor.next === null) continue
    if (cursor.next > now) continue

    // One fire per tick per rule, up to the catch-up budget.
    if (budget <= 0) break
    const occurrenceAt = cursor.next
    fires.push({ rule: cursor.rule, occurrenceAt })
    advance(cursor)
    // Persist the occurrence the cursor just consumed (before advance mutated `next`).
    state.push({ id: ruleIdOf(cursor.rule), lastFiredAt: occurrenceAt.toISOString() })
    budget -= 1
  }

  return { fires, state }
}
