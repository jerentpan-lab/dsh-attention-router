import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NEGATIONS, classify, detectRuleConflicts } from '../src/core.js';
import { apply } from '../src/index.js';

test('A3: negation works in Chinese / English / Russian (无异常 / no anomaly / без ошибок)', () => {
  assert.equal(classify('巡检完成，无异常').tier, 'inform');
  assert.equal(classify('no anomaly detected').tier, 'inform');
  assert.equal(classify('без ошибок').tier, 'inform');
  assert.equal(classify('нет ошибок').tier, 'inform');
  // positive failure still alerts in all three languages
  assert.equal(classify('发现异常').tier, 'alert');
  assert.equal(classify('anomaly detected').tier, 'alert');
  assert.equal(classify('ошибка при записи').tier, 'alert');
});

test('A3: custom negations from config are applied', async () => {
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { negations: ['ok'] });
  const classifyTool = tools.find((t) => t.name === 'notify_classify');
  const negated = await classifyTool.execute({ text: 'ok ошибка' });
  assert.equal(negated.tier, 'inform');
  const positive = await classifyTool.execute({ text: 'right now ошибка' });
  assert.equal(positive.tier, 'alert');
});

test('A4: same literal in multiple tiers is reported with a suggestion', async () => {
  const conflicts = detectRuleConflicts({ alert: ['boom'], inform: ['BOOM'], decide: [] });
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].tiers.sort(), ['alert', 'inform']);
  assert.match(conflicts[0].suggestion, /one tier/);

  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { rules: { alert: ['boom'], inform: ['boom'] } });
  const policy = await tools.find((t) => t.name === 'notify_policy').execute({});
  assert.equal(policy.ruleConflicts.length, 1);
  assert.ok(policy.warnings.some((w) => w.includes('rule conflict')));
  assert.ok(Array.isArray(policy.negations));
});
