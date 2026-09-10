import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/**
 * Guard the dsh peer ranges against the two ways they have already been wrong.
 *
 * Every dsh release so far is a prerelease, and a semver comparator admits
 * prereleases only when they share its own major.minor.patch tuple:
 *
 *   ">=0.1.0" / ">=0.1.2"   match NOTHING          -> ETARGET on install
 *   ">=0.1.2-rc.1 <0.2.0"   matches only 0.1.2-rc.1, so the 0.1.5 line gets ERESOLVE
 *
 * Each supported tuple line therefore needs its own comparator.
 */
const DSL_DEPS = Object.entries(pkg.peerDependencies ?? {})
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))

test('every dsh peer dependency is declared', () => {
  assert.ok(DSL_DEPS.length > 0, 'expected at least one @deepseek-ai/dsh-* peer dependency')
})

for (const [dep, range] of DSL_DEPS) {
  test(`peer range for ${dep} admits both supported dsh prerelease lines`, () => {
    assert.ok(
      !/^\s*>?=?~?=?v?\d+\.\d+\.\d+\s*$/.test(range),
      `a bare non-prerelease comparator ("${range}") matches no published dsh version`,
    )
    assert.match(range, /0\.1\.2-rc\.\d+/, 'expected a 0.1.2-rc.N lower bound')
    assert.match(range, /0\.1\.5-(alpha|beta|rc)\.\d+/,
      'the range must also admit the 0.1.5 prerelease line (next/alpha tags)')
  })
}
