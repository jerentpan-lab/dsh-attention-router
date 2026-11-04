import { classify } from '../src/core.js';
import { writeFileSync } from 'node:fs';
const texts = ['巡检完成，正常', '网关 TIMEOUT', '请叔批准上线', 'random content', 'без ошибок'];
function bench(n) {
  const t0 = performance.now();
  for (let i = 0; i < n; i += 1) classify(texts[i % texts.length]);
  return performance.now() - t0;
}
const rows = [1000, 10000].map((n) => {
  const samples = Array.from({ length: 7 }, () => bench(n)).sort((a, b) => a - b);
  return { n, p50: samples[3].toFixed(2), p95: samples[6].toFixed(2) };
});
const out = ['# Bench results (dsh-attention-router)', '', '| ops | p50 (ms) | p95 (ms) |', '|---|---|---|', ...rows.map((r) => `| ${r.n} classify | ${r.p50} | ${r.p95} |`)];
writeFileSync(new URL('./RESULTS.md', import.meta.url), out.join('\n') + '\n');
console.log(out.join('\n'));
