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

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId as toSessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { randomUUID } from 'node:crypto'
import {
  collectDue,
  initialCursor,
  resumeCursor,
  ruleIdOf,
  type CronCursor,
} from './engine.js'
import type { ScheduleCronConfig } from './types.js'

export type * from './types.js'
export { collectDue, initialCursor, resumeCursor, ruleIdOf, normalizeExpression } from './engine.js'
export type { CronCursor, DueFire } from './engine.js'

/** Cordis function-plugin name. */
export const name = 'schedule-cron'
/** Services required before any scheduled run can be spawned. */
export const inject = ['agents', 'sessions', 'llm']

const DEFAULT_TICK_MS = 60_000

/**
 * Mount the cron scheduler. Config holds the rules; each fire spawns a fresh
 * agent run.
 */
export function apply(ctx: Context, config: ScheduleCronConfig): void {
  const tickMs = config.tickMs ?? DEFAULT_TICK_MS
  const rules = config.cron ?? []

  // Build the cursor map. Restore from initialState when present, else anchor
  // each cursor to its next future occurrence (no backfill burst on mount).
  const cursors = new Map<string, CronCursor>()
  const bootNow = new Date()

  const restored = new Map<string, string>()
  for (const state of config.initialState ?? []) restored.set(state.id, state.lastFiredAt)

  for (const rule of rules) {
    const id = ruleIdOf(rule)
    if (cursors.has(id)) continue
    const lastFiredAt = restored.get(id)
    cursors.set(id, lastFiredAt === undefined
      ? initialCursor(rule, bootNow)
      : resumeCursor(rule, lastFiredAt, bootNow))
  }

  let stopped = false

  /** Spawn one fresh agent run for a fired rule. */
  async function fire(rule: ScheduleCronConfig['cron'][number]): Promise<void> {
    const sessionId = toSessionId(`session-${randomUUID()}`)
    const handle = await ctx.agents.create({
      sessionId,
      meta: rule.cwd === undefined ? {} : { cwd: rule.cwd },
      agentOptions: rule.provider === undefined
        ? (rule.model === undefined ? {} : { model: rule.model })
        : { provider: rule.provider, ...(rule.model === undefined ? {} : { model: rule.model }) },
    })
    const message = createUserMessage({
      content: [{ type: 'text', text: rule.task }],
      source: { kind: 'plugin', plugin: 'schedule-cron' },
    })
    // Commit the fire to the durable log even if the turn errors.
    handle.agent.followup(message)
    // The agent lives on; the handle's disposer stays with the plugin.
  }

  ctx.effect(() => {
    const onTick = async (): Promise<void> => {
      if (stopped) return
      const now = new Date()
      const { fires } = collectDue(cursors, now)
      for (const due of fires) {
        try {
          await fire(due.rule)
        } catch (error) {
          ctx.logger.warn('[schedule-cron] fire failed', { rule: due.rule.id, error })
        }
      }
    }
    const timerId = setInterval(() => { void onTick() }, tickMs)
    return () => {
      stopped = true
      clearInterval(timerId)
    }
  }, 'schedule-cron.tick()')
}
