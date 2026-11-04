/**
 * Config validation for dsh-attention-router (0.2.0 G1).
 * Zero dependencies; returns readable errors instead of crashing deep inside apply().
 */
import { readFileSync } from 'node:fs';
import { TIERS } from './core.js';

export class ConfigError extends Error {
  constructor(errors) {
    super(`invalid dsh-attention-router config:\n- ${errors.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

const TOP_KEYS = new Set(['rules', 'rulesFile', 'rulesFileWatch', 'policy', 'fallbackTier', 'dedupe']);
const DEFAULTS = Object.freeze({
  rules: {},
  rulesFile: null,
  rulesFileWatch: false,
  policy: { notifyInform: false },
  fallbackTier: 'decide',
  dedupe: { cooldownMs: 60_000, stateFile: null, maxEntries: 1000 },
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function checkNonEmptyString(value, path, errors, { allowNull = false } = {}) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${path}: must be a non-empty string${allowNull ? ' or null' : ''}`);
}

export function validateConfig(raw = {}) {
  const errors = [];
  if (!isPlainObject(raw)) throw new ConfigError(['config: must be a plain object']);

  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) errors.push(`config: unknown key "${key}" (allowed: ${[...TOP_KEYS].join(', ')})`);
  }

  // rules: {alert?: string[], decide?: string[], inform?: string[]}
  const rules = {};
  if (raw.rules !== undefined) {
    if (!isPlainObject(raw.rules)) {
      errors.push('rules: must be an object mapping alert/decide/inform to string arrays');
    } else {
      for (const [tier, list] of Object.entries(raw.rules)) {
        if (!TIERS.includes(tier)) errors.push(`rules.${tier}: unknown tier (allowed: ${TIERS.join(', ')})`);
        else if (!Array.isArray(list)) errors.push(`rules.${tier}: must be an array of strings`);
        else {
          const cleaned = [];
          for (const [i, item] of list.entries()) {
            if (typeof item !== 'string') errors.push(`rules.${tier}[${i}]: must be a string`);
            else if (item.trim() === '') errors.push(`rules.${tier}[${i}]: must not be empty`);
            else cleaned.push(item.trim());
          }
          rules[tier] = cleaned;
        }
      }
    }
  }

  if (raw.rulesFile !== undefined) checkNonEmptyString(raw.rulesFile, 'rulesFile', errors, { allowNull: true });
  if (raw.rulesFileWatch !== undefined && typeof raw.rulesFileWatch !== 'boolean') {
    errors.push('rulesFileWatch: must be a boolean');
  }

  const policy = { notifyInform: false };
  if (raw.policy !== undefined) {
    if (!isPlainObject(raw.policy)) errors.push('policy: must be an object');
    else {
      for (const key of Object.keys(raw.policy)) {
        if (key !== 'notifyInform') errors.push(`policy: unknown key "${key}" (allowed: notifyInform)`);
      }
      if (raw.policy.notifyInform !== undefined && typeof raw.policy.notifyInform !== 'boolean') {
        errors.push('policy.notifyInform: must be a boolean');
      }
      if (typeof raw.policy.notifyInform === 'boolean') policy.notifyInform = raw.policy.notifyInform;
    }
  }

  let fallbackTier = DEFAULTS.fallbackTier;
  if (raw.fallbackTier !== undefined) {
    if (!TIERS.includes(raw.fallbackTier)) errors.push(`fallbackTier: must be one of ${TIERS.join(', ')}`);
    else fallbackTier = raw.fallbackTier;
  }

  const dedupe = { ...DEFAULTS.dedupe };
  if (raw.dedupe !== undefined) {
    if (!isPlainObject(raw.dedupe)) errors.push('dedupe: must be an object');
    else {
      for (const key of Object.keys(raw.dedupe)) {
        if (!['cooldownMs', 'stateFile', 'maxEntries'].includes(key)) {
          errors.push(`dedupe: unknown key "${key}" (allowed: cooldownMs, stateFile, maxEntries)`);
        }
      }
      if (raw.dedupe.cooldownMs !== undefined) {
        if (typeof raw.dedupe.cooldownMs !== 'number' || !Number.isFinite(raw.dedupe.cooldownMs) || raw.dedupe.cooldownMs < 0) {
          errors.push('dedupe.cooldownMs: must be a finite number >= 0');
        } else dedupe.cooldownMs = raw.dedupe.cooldownMs;
      }
      if (raw.dedupe.stateFile !== undefined) checkNonEmptyString(raw.dedupe.stateFile, 'dedupe.stateFile', errors, { allowNull: true });
      if (raw.dedupe.maxEntries !== undefined) {
        if (!Number.isInteger(raw.dedupe.maxEntries) || raw.dedupe.maxEntries < 1) {
          errors.push('dedupe.maxEntries: must be an integer >= 1');
        } else dedupe.maxEntries = raw.dedupe.maxEntries;
      }
    }
  }

  if (errors.length) throw new ConfigError(errors);
  return {
    config: {
      rules,
      rulesFile: raw.rulesFile ?? null,
      rulesFileWatch: raw.rulesFileWatch === true,
      policy,
      fallbackTier,
      dedupe,
    },
  };
}

/** Load user rules from a JSON file: {alert?:[], decide?:[], inform?:[]}. Missing file => null + warning. */
export function loadRulesFile(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { rules: null, warning: `rulesFile not found: ${file} (using defaults)` };
    throw new ConfigError([`rulesFile: cannot read ${file}: ${err.message}`]);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ConfigError([`rulesFile: invalid JSON in ${file}: ${err.message}`]);
  }
  const { config } = validateConfig({ rules: parsed });
  return { rules: config.rules, warning: null };
}
