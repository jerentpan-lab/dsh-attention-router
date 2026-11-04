#!/usr/bin/env node
/**
 * G2 verify: unit tests + npm pack content/size/safety checks (zero deps).
 * Usage: npm run verify
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const problems = [];
const note = (msg) => problems.push(msg);

// 1) unit tests
try {
  execFileSync(process.execPath, ['--test', ...readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => join(root, 'test', f))], { stdio: 'inherit' });
  console.log(`[verify] tests: PASS`);
} catch (err) {
  note(`tests failed (exit ${err.status})`);
}

// 2) dependency discipline
if (pkg.dependencies && Object.keys(pkg.dependencies).length) note(`dependencies must stay empty, found: ${Object.keys(pkg.dependencies).join(', ')}`);

// 3) pack content
let pack;
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  pack = JSON.parse(out)[0];
} catch (err) {
  note(`npm pack --dry-run failed: ${err.message}`);
}
if (pack) {
  if (pack.unpackedSize > 200 * 1024) note(`unpackedSize too large: ${pack.unpackedSize}B (>200KB)`);
  const paths = pack.files.map((f) => f.path);
  const required = ['package.json', 'README.md', 'README.zh.md', 'LICENSE', 'cordis.patch.yml', 'config.example.json'];
  for (const r of required) if (!paths.includes(r)) note(`missing required file in tarball: ${r}`);
  if (!paths.some((p) => p.startsWith('src/'))) note('missing src/ in tarball');
  const forbidden = [
    [/^test\//, 'test files'],
    [/^scripts\//, 'scripts'],
    [/\.test\.js$/, 'test files'],
    [/(^|\/)\.env$/, '.env'],
    [/\.(key|pem|p12)$/, 'key material'],
    [/(^|\/)node_modules\//, 'node_modules'],
    [/(^|\/)\.git\//, 'git metadata'],
  ];
  for (const p of paths) {
    for (const [re, label] of forbidden) if (re.test(p)) note(`forbidden file in tarball (${label}): ${p}`);
  }
  console.log(`[verify] pack: ${pack.files.length} files, ${pack.unpackedSize}B, sha1=${pack.shasum}`);
}

if (problems.length) {
  console.error(`[verify] FAIL\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`[verify] PASS ${pkg.name}@${pkg.version}`);
