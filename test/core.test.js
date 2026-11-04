import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, Deduper, classify, compilePattern, mergeRules, route,
} from '../src/core.js';

test('failure text is alert', () => {
  assert.equal(classify('Buddy 桥不可达').tier, 'alert');
  assert.equal(classify('gateway TIMEOUT after 30s').tier, 'alert');
});

test('negated failure text is NOT alert (audit B01)', () => {
  const r = classify('巡检完成，正常，无异常');
  assert.notEqual(r.tier, 'alert');
  assert.equal(classify('未失败').tier, 'inform');
  assert.equal(classify('没有超时').tier, 'inform');
  assert.equal(classify('0 errors').tier, 'inform');
});

test('latin literals use word boundaries (audit B02)', () => {
  const r = classify('download 完成，done');
  assert.equal(r.tier, 'inform');
  assert.notEqual(r.matched, 'down');
});

test('approval text is decide, 是否 alone does not flood decide (B06)', () => {
  assert.equal(classify('请叔批准删除旧集合').tier, 'decide');
  assert.equal(classify('是否批准上线').tier, 'decide');
  const r = classify('请确认是否收到');
  // unmatched text fails safe into decide, but must be flagged
  assert.equal(r.tier, 'decide');
  assert.equal(r.unmatched, true);
});

test('failed acceptance is alert (B06)', () => {
  assert.equal(classify('验收未通过').tier, 'alert');
  assert.equal(classify('测试不通过').tier, 'alert');
});

test('unknown text fails safe into decide with unmatched flag (Buddy R1)', () => {
  const r = classify('random content xyz');
  assert.equal(r.tier, 'decide');
  assert.equal(r.unmatched, true);
});

test('object input is accepted, non-text input rejected (B04)', () => {
  assert.equal(classify({ msg: '磁盘写入失败' }).tier, 'alert');
  assert.throws(() => classify({ foo: 1 }), /text must be a string/);
  assert.throws(() => classify(42), /text must be a string/);
});

test('unknown kind fails safe to alert (B07)', () => {
  assert.equal(classify('routine check', { kind: 'critical' }).tier, 'alert');
  assert.equal(classify('routine check', { kind: 'weird-level' }).tier, 'alert');
  assert.equal(classify('完成', { kind: 'notice' }).tier, 'inform');
});

test('custom rules are literals and partial rule sets do not crash (B03, B05)', () => {
  assert.equal(classify('boom happened', { rules: { alert: ['boom'] } }).tier, 'alert');
  // literal: [ERR] matches only the literal string, not as a character class
  assert.equal(classify('E', { rules: { alert: ['[ERR]'] } }).unmatched, true);
  assert.equal(classify('E-R-R', { rules: { alert: ['[ERR]'] } }).unmatched, true);
  const exact = classify('[ERR]', { rules: { alert: ['[ERR]'] } });
  assert.equal(exact.tier, 'alert');
  assert.equal(exact.matched, '[ERR]');
});

test('matched field returns the matched text and the rule (B08)', () => {
  const r = classify('磁盘写入失败，重试中');
  assert.equal(r.matched, '失败');
  assert.equal(r.rule, '失败');
});

test('route maps tiers to actions and digest (B09)', () => {
  assert.deepEqual(route('alert'), { action: 'deliver_now', notify: true });
  assert.deepEqual(route('decide'), { action: 'queue_for_review', notify: true });
  assert.deepEqual(route('inform'), { action: 'log_only', notify: false });
  assert.deepEqual(route('inform', { notifyInform: true }), { action: 'deliver_digest', notify: true });
});

test('defaults are frozen and merge appends without mutating defaults (B10)', () => {
  assert.ok(Object.isFrozen(DEFAULT_RULES));
  const merged = mergeRules({ alert: ['boom'] });
  assert.ok(merged.alert.includes('boom'));
  assert.ok(merged.alert.includes('失败'));
  assert.equal(DEFAULT_RULES.alert.includes('boom'), false);
});

test('deduper suppresses repeated keys within cooldown and counts', () => {
  let t = 1_000;
  const d = new Deduper({ cooldownMs: 100, now: () => t });
  assert.equal(d.check('k').suppressed, false);
  assert.equal(d.check('k').suppressed, true);
  assert.equal(d.check('k').count, 2); // 0.2.0: suppression count accumulates
  t += 200;
  assert.equal(d.check('k').suppressed, false);
});

test('compilePattern escapes literals and bounds latin words', () => {
  assert.equal(compilePattern('fail').test('failover'), false);
  assert.equal(compilePattern('fail').test('FAIL'), true);
  assert.equal(compilePattern('[ERR]').test('[ERR]'), true);
  assert.equal(compilePattern('[ERR]').test('E'), false);
});
