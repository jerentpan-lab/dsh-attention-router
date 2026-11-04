import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadRulesFile, validateConfig } from '../src/config.js';
import { Deduper } from '../src/core.js';
import { apply } from '../src/index.js';

const dir = mkdtempSync(join(tmpdir(), 'attn-cfg-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('G1: example config validates', () => {
  const example = JSON.parse(readFileSync(new URL('../config.example.json', import.meta.url), 'utf8'));
  const { config } = validateConfig(example);
  assert.equal(config.fallbackTier, 'decide');
  assert.deepEqual(config.rules.alert, ['lookup failure', '磁盘写满']);
});

test('G1: invalid config returns readable errors (unknown key/tier/number)', () => {
  assert.throws(() => validateConfig({ nope: 1 }), (err) => err instanceof ConfigError && /unknown key "nope"/.test(err.message));
  assert.throws(() => validateConfig({ rules: { critical: ['x'] } }), /rules\.critical: unknown tier/);
  assert.throws(() => validateConfig({ dedupe: { cooldownMs: -1 } }), /dedupe\.cooldownMs: must be a finite number >= 0/);
  assert.throws(() => validateConfig({ policy: { notifyInform: 'yes' } }), /policy\.notifyInform: must be a boolean/);
  assert.throws(() => validateConfig({ fallbackTier: 'silent' }), /fallbackTier: must be one of/);
});

test('A1: rules file loads and merges with config; missing file falls back with warning', async () => {
  const file = join(dir, 'rules.json');
  writeFileSync(file, JSON.stringify({ alert: ['customboom'], decide: [], inform: [] }));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  const runtime = apply(ctx, { rules: { alert: ['cfg-alert'] }, rulesFile: file });
  assert.ok(runtime.rules.alert.includes('customboom'));
  assert.ok(runtime.rules.alert.includes('cfg-alert'));
  const classifyTool = tools.find((t) => t.name === 'notify_classify');
  assert.equal((await classifyTool.execute({ text: 'customboom happened' })).tier, 'alert');

  const missing = loadRulesFile(join(dir, 'no-such-file.json'));
  assert.equal(missing.rules, null);
  assert.match(missing.warning, /not found/);
});

test('A2: dedupe state persists across instances (restart simulation)', async () => {
  const stateFile = join(dir, 'dedupe.json');
  const first = new Deduper({ cooldownMs: 60_000, stateFile });
  const r1 = first.check('k');
  assert.equal(r1.suppressed, false, JSON.stringify({ r1, warnings: first.warnings }));
  const second = new Deduper({ cooldownMs: 60_000, stateFile });
  const r2 = second.check('k');
  assert.equal(r2.suppressed, true, JSON.stringify({ r2, entries: [...second.entries], warnings: second.warnings }));
  assert.equal(second.check('k').count, 2);

  // apply() config wires persistence + tools still work
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { dedupe: { cooldownMs: 60_000, stateFile } });
  const classifyTool = tools.find((t) => t.name === 'notify_classify');
  const r = await classifyTool.execute({ text: '磁盘写入失败' });
  assert.equal(r.tier, 'alert');
  assert.equal(r.dedupe.suppressed, false); // first time this rule matches
  const again = await classifyTool.execute({ text: '磁盘写入失败' });
  assert.equal(again.dedupe.suppressed, true); // persisted/shared cooldown within the same store
});

test('A2: corrupt dedupe state is quarantined with warning, not a crash', () => {
  const stateFile = join(dir, 'corrupt.json');
  writeFileSync(stateFile, '{not-json');
  const d = new Deduper({ cooldownMs: 1000, stateFile });
  assert.equal(d.check('x').suppressed, false);
  assert.equal(d.warnings.length, 1);
});
