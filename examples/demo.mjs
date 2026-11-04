#!/usr/bin/env node
/** G5 demo: classify a handful of events without installing into DSH. */
import { classify, route } from '../src/core.js';
const samples = [
  '网关 TIMEOUT after 30s',
  '巡检完成，无异常',
  '请叔批准删除旧集合',
  'random content xyz',
];
for (const text of samples) {
  const r = classify(text);
  console.log(`${r.tier.padEnd(6)} ${String(r.matched).padEnd(12)} ${JSON.stringify(route(r.tier))}  <= ${text}`);
  console.log(`       rule=${r.rule} unmatched=${r.unmatched} negated=${r.negated}`);
}
console.log('\nTry it with your own rules: node examples/demo.mjs  (see config.example.json)');
