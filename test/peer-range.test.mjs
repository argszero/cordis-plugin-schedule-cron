import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { satisfies } from 'semver'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/**
 * Every `@deepseek-ai/dsh-*` version published as of 2026-09-18, oldest first.
 * `npm view <dep> versions` refreshes it.
 *
 * The list is deliberately frozen: it records what the range was checked
 * against, rather than querying the registry at test time. A version published
 * later is not covered here - that is what the release checklist is for.
 */
const PUBLISHED_23 = [
  '0.0.1-rc.1', '0.0.1-rc.2', '0.0.1-rc.3', '0.0.1-rc.5', '0.1.0-rc.2',
  '0.1.0-rc.3', '0.1.0-rc.6', '0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1',
  '0.1.1-rc.2', '0.1.2-alpha.2', '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5',
  '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1',
  '0.1.5-rc.2', '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.2.0-rc.1', '0.2.0-rc.2',
  '0.2.1-alpha.1', '0.2.1-alpha.2', '0.2.1-alpha.3', '0.2.1-alpha.4',
  '0.2.1-alpha.5', '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3',
]

/** dsh-home-paths and dsh-jobs were first published one tuple later. */
const PUBLISHED_21 = [
  '0.0.1-rc.3', '0.0.1-rc.5', '0.1.0-rc.2', '0.1.0-rc.3', '0.1.0-rc.6',
  '0.1.0-rc.7', '0.1.0-rc.8', '0.1.1-rc.1', '0.1.1-rc.2', '0.1.2-alpha.2',
  '0.1.2-alpha.3', '0.1.2-alpha.4', '0.1.2-alpha.5', '0.1.2-rc.1', '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.1',
  '0.1.6-alpha.2',
]

/**
 * The versions this plugin is installed and exercised against. Each has had the
 * full suite run with *every* dsh dev dependency pinned to that single line
 * (install from the registry, build, `node --test`), not merely a surface grep:
 * 7/7 on all eight.
 *
 * One caveat, measured rather than assumed: pinning a *single* dsh package to
 * an older line inside an otherwise empty project does NOT resolve, because npm
 * then auto-installs this package's other peers at their newest versions, and
 * upstream's peers exclude older prereleases of their own tuple (dsh-agent@X
 * peers dsh-llm@^X). Verified both ways: with only one peer pinned it fails
 * with ERESOLVE naming *dsh-agent*, not this package; with the full peer set
 * pinned to that line - which is what a consumer on that line actually has - it
 * resolves cleanly and the packed artifact imports. So the failure belongs to
 * upstream's peer diamond, not to this range, and it is not reachable through
 * the supported user path `npm i @deepseek-ai/dsh@<line>`, which floats within
 * the tuple.
 */
const SUPPORTED = [
  '0.1.2-rc.1',
  '0.1.3-alpha.2',
  '0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.1', '0.1.5-rc.2',
  '0.1.6-alpha.1', '0.1.6-alpha.2',
  '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3',
]

/**
 * Guard the peer range by *computing* admission, not by pattern-matching it.
 *
 * A semver comparator admits a prerelease only when some comparator in the same
 * group shares that prerelease's `major.minor.patch` tuple. The range this
 * package shipped before v0.1.2 -
 *
 *   ">=0.1.2-rc.1 <0.2.0 || >=0.1.5-alpha.1 <0.2.0"
 *
 * - therefore admitted the 0.1.2-rc and 0.1.5 tuples and nothing else: the
 * `<0.2.0` upper bound never excludes a later tuple's prerelease, so it was
 * inert, and no comparator covered the 0.1.3 or 0.1.6 tuples. A user on the
 * newest shipped dsh release got
 *
 *   npm error ERESOLVE unable to resolve dependency tree
 *
 * for a plugin whose own suite passes on that line. The dsh packages are
 * *peers*, so this cannot be papered over with `--legacy-peer-deps`: the
 * install simply fails.
 *
 * Asserting the admitted set *exactly* makes both failure directions loud - a
 * range that quietly drops a supported line fails the equality below, and a
 * range that quietly admits an untested line fails it too.
 */
for (const [dep, published] of Object.entries({
  '@deepseek-ai/dsh-agent': PUBLISHED_23,
  '@deepseek-ai/dsh-brand': PUBLISHED_23,
  '@deepseek-ai/dsh-llm': PUBLISHED_23,
  '@deepseek-ai/dsh-session': PUBLISHED_23,
  '@deepseek-ai/dsh-tools': PUBLISHED_23,
})) {
  test(`peer range for ${dep} admits exactly the tested dsh lines`, () => {
    const range = pkg.peerDependencies[dep]
    assert.ok(range, 'the dsh peer dependency must be declared')

    const admitted = published.filter((v) => satisfies(v, range))
    assert.deepEqual(
      admitted,
      SUPPORTED,
      `the range "${range}" admits [${admitted.join(', ')}] but the suite has only been ` +
        `run against [${SUPPORTED.join(', ')}]`,
    )

    const refused = published.filter((v) => !satisfies(v, range))
    assert.deepEqual(
      refused,
      published.filter((v) => !SUPPORTED.includes(v)),
      'older, untested prereleases must keep getting a loud ERESOLVE',
    )
  })

  test(`peer range for ${dep} carries one comparator per prerelease tuple`, () => {
    const range = pkg.peerDependencies[dep]
    const clauses = range.split('||').map((s) => s.trim())
    const tuples = new Set(SUPPORTED.map((v) => v.split('-')[0]))
    // A single `>=` can never span two tuples, so the clause count has to cover
    // every supported tuple; and every clause has to name a prerelease, because
    // a bare release bound matches no published dsh version at all.
    assert.equal(
      clauses.length,
      tuples.size,
      `"${range}" has ${clauses.length} clause(s) for ${tuples.size} supported tuple(s)`,
    )
    for (const clause of clauses) {
      assert.match(clause, /-/, `clause "${clause}" names no prerelease`)
    }
  })
}

test('the newest shipped dsh line is admitted', () => {
  // The defect this release fixes: the whole 0.1.6 line was refused, so a user
  // on the newest dsh could not install the plugin at all.
  const deps = Object.keys(pkg.peerDependencies).filter((d) => d.startsWith('@deepseek-ai/dsh-'))
  for (const dep of deps) {
    for (const line of ['0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3']) {
      assert.equal(
        satisfies(line, pkg.peerDependencies[dep]),
        true,
        `${dep} must admit ${line}`,
      )
    }
  }
})

test('a bare >=0.1.2 comparator would match no published prerelease', () => {
  // Not a semver evaluator: this pins the *reason* the union exists, so a later
  // "simplification" to `>=0.1.2` fails here with the explanation attached.
  for (const version of PUBLISHED_23) {
    assert.equal(satisfies(version, '>=0.1.2'), false, `>=0.1.2 unexpectedly admits ${version}`)
  }
})

test('the dev pins stay on a line the range admits', () => {
  // A dev pin outside the peer range would mean the suite ran against a line the
  // published package refuses - the exact mismatch this file exists to prevent.
  for (const [dep, pin] of Object.entries(pkg.devDependencies ?? {})) {
    if (!dep.startsWith('@deepseek-ai/dsh-')) continue
    assert.ok(
      SUPPORTED.includes(pin),
      `devDependency ${dep}@"${pin}" is not in the tested set`,
    )
  }
})

test('the README quotes the manifest peer range verbatim', () => {
  // The family's third carrier is documentation: a README that quotes only part
  // of a union teaches the reader to copy the broken form. Asserting the README
  // contains the real range turns the "claim" from a hand-copied transcript into
  // a checked artifact.
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const deps = Object.keys(pkg.peerDependencies).filter((d) => d.startsWith('@deepseek-ai/dsh-'))
  for (const dep of deps) {
    const range = pkg.peerDependencies[dep]
    assert.ok(
      readme.includes(range),
      `README must quote the exact peer range for ${dep}: "${range}"`,
    )
  }
})
