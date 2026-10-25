/**
 * Packaging receipts: a plugin that cannot be mounted is not delivered.
 *
 * The npm channel for this package is unavailable, so the git tree is the
 * distribution path. Two things have to hold on the tree itself, and both have
 * failed here before:
 *
 *  - `lib/` must be **committed**. A repository whose build output is ignored
 *    ships a package with no entry point, and `dsh plugin add` mounts nothing.
 *  - `dsh.bundle` must point at a patch file that is actually packed. Without
 *    it the installer reports "declares no dsh.bundle - installed as a plain
 *    dependency, not a profile layer": the package installs and still never
 *    loads.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

test('the package declares the bundle patch the installer looks for', () => {
  const patch = pkg.dsh?.bundle?.patch
  assert.equal(
    patch,
    './cordis.patch.yml',
    'dsh.bundle.patch is what turns an installed dependency into a profile layer',
  )
  assert.ok(
    existsSync(new URL(patch, root)),
    `dsh.bundle points at "${patch}", which is not in the tree`,
  )
})

test('the bundle patch is packed, not only present in the repository', () => {
  // A patch file missing from `files` resolves in the working tree and vanishes
  // from the tarball, which is the install path a consumer actually takes.
  assert.ok(
    pkg.files.includes('cordis.patch.yml'),
    'cordis.patch.yml must be listed in files[] or the packed artifact cannot mount',
  )
  assert.ok(pkg.files.includes('lib'), 'the built entry point must be packed')
})

test('the entry point declared by the bundle is present and exports a plugin', () => {
  // The tree ships `lib/`; a clean checkout has it only because it is committed.
  // Run the suite after `npm run build` - this asserts the built artifact, which
  // is what a consumer mounts.
  assert.ok(existsSync(new URL('lib/index.js', root)), 'lib/index.js must exist (npm run build)')
  const entry = readFileSync(new URL('lib/index.js', root), 'utf8')
  for (const exported of ['export const name', 'export const inject', 'export function apply']) {
    assert.ok(entry.includes(exported), `the mounted entry must carry "${exported}"`)
  }
})

test('the patch mounts this package under the id the plugin reports', () => {
  const patch = readFileSync(new URL('cordis.patch.yml', root), 'utf8')
  assert.ok(
    patch.includes(pkg.name),
    'the patch must name the package it mounts',
  )
  assert.ok(
    /^- insert:/m.test(patch),
    'the patch must be a loader document, not prose',
  )
})
