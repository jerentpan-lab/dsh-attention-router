import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name } from '../src/index.js';

test('apply registers tools and classify executes', async () => {
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, {});
  assert.equal(name, 'dsh-attention-router');
  assert.deepEqual(tools.map((t) => t.name).sort(), ['notify_classify', 'notify_policy']);
  const r = await tools.find((t) => t.name === 'notify_classify').execute({ text: '请求批准上线' });
  assert.equal(r.tier, 'decide');
});
