/**
 * Self-contained logic tests for the cron plugin's fire engine.
 *
 * These import the compiled `lib/engine.js` (built by `npm run build`). Run
 * after `npm run build` so `.js` output exists. No harness is required — this
 * validates the pure schedule/fire/cursor computation.
 *
 * @module test/logic.test.mjs
 */
import assert from 'node:assert/strict'
import {
  collectDue,
  initialCursor,
  resumeCursor,
  ruleIdOf,
  normalizeExpression,
} from '../lib/engine.js'

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

test('normalizeExpression: single string passes through', () => {
  assert.equal(normalizeExpression('0 9 * * 1-5'), '0 9 * * 1-5')
})

test('normalizeExpression: array joins with comma', () => {
  assert.equal(normalizeExpression(['0 9 * * 1-5', '30 9 * * 6']), '0 9 * * 1-5,30 9 * * 6')
})

test('ruleIdOf: explicit id wins', () => {
  assert.equal(ruleIdOf({ id: 'billing', expression: '* * * * *', task: 'x' }), 'billing')
})

test('ruleIdOf: falls back to expression when no id', () => {
  assert.equal(ruleIdOf({ expression: '0 9 * * 1-5', task: 'x' }), 'expr:0 9 * * 1-5')
})

test('initialCursor anchors to next future occurrence (no backfill burst)', () => {
  // Fri Sep 4 2026 10:00 +08:00; weekday 09:00 rule already passed today.
  const now = new Date('2026-09-04T10:00:00+08:00')
  const cursor = initialCursor({ expression: '0 9 * * 1-5', task: 'x' }, now)
  assert.equal(cursor.next.toISOString(), '2026-09-07T01:00:00.000Z') // Mon Sep 7 09:00+08
})

test('collectDue: fires exactly one due rule per cursor and advances', () => {
  const now = new Date('2026-09-04T10:00:00+08:00')
  const cursor = initialCursor({ id: 'weekday', expression: '0 9 * * 1-5', task: 'daily' }, now)
  const cursors = new Map([['weekday', cursor]])

  // Tick Mon Sep 7 10:00+08 — cursor (Mon 09:00) is due.
  const tick = new Date('2026-09-07T10:00:00+08:00')
  const { fires, state } = collectDue(cursors, tick)
  assert.equal(fires.length, 1)
  assert.equal(fires[0].rule.id, 'weekday')
  assert.equal(fires[0].occurrenceAt.toISOString(), '2026-09-07T01:00:00.000Z')
  assert.equal(state[0].id, 'weekday')
  assert.equal(state[0].lastFiredAt, '2026-09-07T01:00:00.000Z')
  // Cursor advanced to next Tue.
  assert.equal(cursor.next.toISOString(), '2026-09-08T01:00:00.000Z')
})

test('collectDue: does NOT re-fire the same cursor until next occurrence', () => {
  const now = new Date('2026-09-04T10:00:00+08:00')
  const cursor = initialCursor({ id: 'weekday', expression: '0 9 * * 1-5', task: 'daily' }, now)
  const cursors = new Map([['weekday', cursor]])
  const tick = new Date('2026-09-07T10:00:00+08:00')
  collectDue(cursors, tick)
  // Same tick again — cursor advanced to Tue, not due.
  const again = collectDue(cursors, tick)
  assert.equal(again.fires.length, 0)
})

test('collectDue: disabled rule never fires', () => {
  const now = new Date('2026-09-04T10:00:00+08:00')
  const cursor = initialCursor({ id: 'off', expression: '* * * * *', task: 'x', enabled: false }, now)
  const cursors = new Map([['off', cursor]])
  const { fires } = collectDue(cursors, new Date('2026-09-05T10:00:00+08:00'))
  assert.equal(fires.length, 0)
})

test('collectDue: catch-up budget caps burst on long-downed schedules', () => {
  const now = new Date('2026-01-01T00:00:00+08:00')
  const cursor = initialCursor({ id: 'frequent', expression: '* * * * *', task: 'x' }, now)
  const cursors = new Map([['frequent', cursor]])
  // Now well past boot; a single collectDue must not fire unbounded times.
  const later = new Date('2026-04-01T00:00:00+08:00')
  const { fires } = collectDue(cursors, later)
  assert.ok(fires.length >= 1, 'should fire at least one due occurrence')
  assert.ok(fires.length <= 4, `catch-up budget respected (got ${fires.length})`)
})

test('resumeCursor: restores one occurrence after lastFiredAt', () => {
  const rule = { id: 'weekday', expression: '0 9 * * 1-5', task: 'daily' }
  const cursor = resumeCursor(rule, '2026-09-07T01:00:00.000Z', new Date('2026-09-04T10:00:00+08:00'))
  // Next strict occurrence after last fired.
  assert.equal(cursor.next.toISOString(), '2026-09-08T01:00:00.000Z') // Tue Sep 8 09:00+08
})

console.log(`\n${passed} tests passed`)
