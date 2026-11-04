/**
 * Pure classification logic for dsh-attention-router.
 *
 * Design notes (after three-party audit 2026-11-02):
 * - User rules are LITERALS, never regular expressions: no ReDoS, no silent
 *   semantic changes. Latin literals match on word boundaries.
 * - A match preceded by a negation word (无/未/不/没有/零/0/none/no/not) is
 *   ignored, so "无异常" is not an alert.
 * - Unmatched text fails SAFE: it is routed to `decide` (review queue) instead
 *   of being silently dropped as `inform`.
 * - Tiers: alert (report now) / decide (human decision) / inform (log only).
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const TIERS = ['alert', 'decide', 'inform'];

export const DEFAULT_RULES = Object.freeze({
  alert: Object.freeze([
    '断链', '不可达', '失败', '异常', '告警', '错误', '超时', '丢失', 'OOM',
    '回滚触发', '恢复失败', '数据不一致', '未通过', '不通过', '驳回', '打回',
    'error', 'fail', 'timeout', 'panic', 'down', 'anomaly', 'аномалия', 'ошибка', 'ошибки', 'ошибок', 'сбой', 'отказ', 'таймаут', 'недоступен',
  ]),
  decide: Object.freeze([
    '授权', '批准', '同意', '拍板', '裁决', '请叔', '需叔', '要不要',
    '删除', '变更生产', '对外承诺', '目标变更', '上线', '预算', '签字',
    '是否批准', '是否同意', '是否发布', 'approve', 'decision', 'delete',
    'production change',
  ]),
  inform: Object.freeze([
    '完成', '已发布', '记录', '正常', '成功', '指标', '已修复', '通了',
    '通过验收', '测试通过', '更新', '盘点', '周报', '纪要',
    'success', 'done', 'published', 'готово', 'успешно', 'опубликовано',
  ]),
});

export const NEUTRAL_KINDS = Object.freeze(['event', 'notice', 'info', 'inform', 'log']);
export const ALERT_KINDS = Object.freeze([
  'alert', 'fault', 'failure', 'error', 'critical', 'fatal', 'panic', 'emergency', 'degraded',
]);

export const DEFAULT_NEGATIONS = ['没有', '无', '未', '不', '零', '0', 'none', 'no', 'not', 'without', 'нет', 'не', 'без', 'никаких'];
const NEGATIONS = DEFAULT_NEGATIONS;

function escapeLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLatin(s) {
  return /^[\x00-\x7F]+$/.test(s);
}

/** Literal pattern -> case-insensitive RegExp; Latin gets word boundaries. */
export function compilePattern(pattern) {
  const literal = escapeLiteral(String(pattern).trim());
  if (!literal) throw new Error('compilePattern: empty pattern');
  let body = literal;
  if (isLatin(literal)) {
    const start = /^\w/.test(literal) ? '\\b' : '';
    const end = /\w$/.test(literal) ? 's?\\b' : '';
    body = `${start}${literal}${end}`;
  }
  return new RegExp(body, 'i');
}

export function compileRules(rules = DEFAULT_RULES) {
  const compiled = {};
  for (const tier of TIERS) {
    const list = Array.isArray(rules?.[tier]) ? rules[tier] : [];
    compiled[tier] = list.filter((p) => String(p).trim()).map((p) => ({ rule: String(p), re: compilePattern(p) }));
  }
  return compiled;
}

/** Accept plain strings or event-like objects; never silently stringify objects. */
export function textOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    for (const key of ['text', 'msg', 'message', 'detail']) {
      if (typeof input[key] === 'string') return input[key];
    }
  }
  throw new TypeError('classify: text must be a string or an object with a text/msg/message field');
}

function negatedAt(raw, index, extraNegations = []) {
  const head = raw.slice(0, index).toLowerCase().trimEnd();
  for (const neg of [...NEGATIONS, ...extraNegations]) {
    if (!neg) continue;
    if (head.endsWith(neg)) return true;
    // English negation followed by a space: "... no error", "not down"
    if (isLatin(neg) && new RegExp(`\\b${escapeLiteral(neg)}\\s*$`, 'i').test(head + ' ')) return true;
  }
  return false;
}

function findMatch(raw, entries, extraNegations = []) {
  const negated = [];
  for (const { rule, re } of entries) {
    const m = re.exec(raw);
    if (!m) continue;
    if (negatedAt(raw, m.index, extraNegations)) {
      negated.push({ matched: m[0], rule });
      continue; // "无异常" is not an alert
    }
    return { positive: { matched: m[0], rule }, negated };
  }
  return { positive: null, negated };
}

/**
 * Classify a text event.
 * @param {string|object} input
 * @param {{kind?: string, rules?: object, fallbackTier?: 'alert'|'decide'|'inform', negations?: string[]}} [options]
 * @returns {{tier, matched, rule, kind, unmatched, negated}}
 */
export function classify(input, options = {}) {
  const raw = textOf(input);
  const kind = String(options.kind ?? 'event').toLowerCase();

  if (ALERT_KINDS.includes(kind)) {
    return { tier: 'alert', matched: `kind:${kind}`, rule: `kind:${kind}`, kind, unmatched: false, negated: false };
  }
  if (!NEUTRAL_KINDS.includes(kind)) {
    // Unknown kind: fail safe (audit B07 / Buddy: fail-safe not fail-silent).
    return { tier: 'alert', matched: `unknown-kind:${kind}`, rule: `unknown-kind:${kind}`, kind, unmatched: false, negated: false };
  }

  const extraNegations = Array.isArray(options.negations) ? options.negations.map(String).filter(Boolean) : [];
  const compiled = compileRules(options.rules || DEFAULT_RULES);
  let negatedHit = null;
  for (const tier of ['alert', 'decide', 'inform']) {
    const { positive, negated } = findMatch(raw, compiled[tier], options.negations || []);
    if (positive) return { tier, matched: positive.matched, rule: positive.rule, kind, unmatched: false, negated: false };
    if (!negatedHit && negated.length) negatedHit = negated[0];
  }
  if (negatedHit) {
    // A negated failure ("无异常", "0 errors") is a positive signal => inform.
    return { tier: 'inform', matched: negatedHit.matched, rule: negatedHit.rule, kind, unmatched: false, negated: true };
  }
  // No match: fail safe into the review queue, flagged as unmatched.
  const fallback = options.fallbackTier || 'decide';
  return { tier: fallback, matched: null, rule: null, kind, unmatched: true, negated: false };
}

/**
 * Decide what to do with a classified event.
 * action is the source of truth: deliver_now / queue_for_review / deliver_digest / log_only.
 */
export function route(tier, policy = {}) {
  if (tier === 'alert') return { action: 'deliver_now', notify: true };
  if (tier === 'decide') return { action: 'queue_for_review', notify: true };
  if (policy.notifyInform === true) return { action: 'deliver_digest', notify: true };
  return { action: 'log_only', notify: false };
}

/** Cooldown for repeated alerts; suppression is counted, never dropped.
 *  0.2.0 A2: optional on-disk persistence (stateFile) so cooldown survives restarts. */
export class Deduper {
  constructor({ cooldownMs = 60_000, now = () => Date.now(), stateFile = null, maxEntries = 1000 } = {}) {
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.stateFile = stateFile;
    this.maxEntries = maxEntries;
    this.entries = new Map();
    this.warnings = [];
    this.load();
  }

  load() {
    if (!this.stateFile) return;
    try {
      const raw = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      const entries = raw && typeof raw === 'object' ? raw.entries : null;
      if (entries && typeof entries === 'object') {
        for (const [key, v] of Object.entries(entries)) {
          if (v && typeof v.last === 'number' && Number.isFinite(v.last)) {
            this.entries.set(key, { last: v.last, count: Number.isInteger(v.count) ? v.count : 0 });
          }
        }
      }
    } catch (err) {
      if (err && err.code !== 'ENOENT') this.warnings.push(`dedupe state unreadable: ${err.message}`);
    }
  }

  prune() {
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) return;
    if (this.entries.size <= this.maxEntries) return;
    const kept = [...this.entries.entries()].sort((a, b) => b[1].last - a[1].last).slice(0, this.maxEntries);
    this.entries = new Map(kept);
  }

  save() {
    if (!this.stateFile) return;
    try {
      mkdirSync(dirname(this.stateFile), { recursive: true });
      const tmp = `${this.stateFile}.tmp-${process.pid}`;
      const entries = Object.fromEntries(this.entries);
      writeFileSync(tmp, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), entries }), 'utf8');
      renameSync(tmp, this.stateFile);
    } catch (err) {
      this.warnings.push(`dedupe state not persisted: ${err.message}`);
    }
  }

  check(key) {
    const t = this.now();
    const entry = this.entries.get(key);
    if (entry !== undefined && t - entry.last < this.cooldownMs) {
      entry.count += 1;
      this.save();
      return { suppressed: true, count: entry.count };
    }
    this.entries.set(key, { last: t, count: 0 });
    this.prune();
    this.save();
    return { suppressed: false, count: 0 };
  }
}

/** Detect the same literal placed in multiple tiers (case-insensitive, trimmed). */
export function detectRuleConflicts(configRules = {}) {
  const seen = new Map();
  for (const tier of TIERS) {
    const list = Array.isArray(configRules?.[tier]) ? configRules[tier] : [];
    for (const raw of list) {
      const key = String(raw).trim().toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, { pattern: String(raw).trim(), tiers: [] });
      const entry = seen.get(key);
      if (!entry.tiers.includes(tier)) entry.tiers.push(tier);
    }
  }
  return [...seen.values()].filter((e) => e.tiers.length > 1).map((e) => ({ ...e, suggestion: `keep "${e.pattern}" in one tier only` }));
}

/** Merge configured rules on top of defaults (append + dedupe). */
export function mergeRules(configRules = {}) {
  const merged = {};
  for (const tier of TIERS) {
    const def = DEFAULT_RULES[tier] || [];
    const extra = Array.isArray(configRules[tier]) ? configRules[tier] : [];
    merged[tier] = [...new Set([...def, ...extra.map(String).map((s) => s.trim()).filter(Boolean)])];
  }
  return merged;
}
