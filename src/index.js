/**
 * dsh-attention-router — classify events into inform / decide / alert.
 * Audit-hardened 2026-11-02 (three-party review).
 */
import { DEFAULT_RULES, Deduper, classify, mergeRules, route } from './core.js';

export const name = 'dsh-attention-router';
export const inject = ['tools'];

let defineTool;
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
} catch (err) {
  // Only a missing peer is acceptable; anything else must surface.
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  console.warn('[dsh-attention-router] @deepseek-ai/dsh-tools not found, running unvalidated (tests only).');
  defineTool = (options) => ({ ...options });
}

export function apply(ctx, config = {}) {
  const rules = mergeRules(config.rules || {});
  const policy = { notifyInform: config.policy?.notifyInform === true };
  const fallbackTier = config.fallbackTier || 'decide';
  const deduper = new Deduper({ cooldownMs: Number(config.dedupe?.cooldownMs ?? 60_000) });

  const out = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };

  ctx.tools.register(
    defineTool({
      name: 'notify_classify',
      description:
        'Classify an event into alert (report now), decide (queues for human review) or inform (log only). Unmatched events fail safe into decide with unmatched=true.',
      parameters: {
        text: { type: 'string', required: true, description: 'Event text.' },
        kind: { type: 'string', description: 'Event kind, e.g. event/fault/notice.' },
        dedupe: { type: 'boolean', description: 'Apply in-memory cooldown dedupe (default true).' },
      },
      output: out,
      async execute(args = {}) {
        const result = classify(args.text, { kind: args.kind, rules, fallbackTier });
        const routed = route(result.tier, policy);
        let dedupe = { suppressed: false, count: 0 };
        if (args.dedupe !== false && routed.action === 'deliver_now') {
          dedupe = deduper.check(result.rule || 'unknown');
        }
        return { ...result, ...routed, dedupe };
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'notify_policy',
      description: 'Show the current attention policy, rule counts and ruleset hash.',
      parameters: {},
      output: out,
      async execute() {
        const counts = Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, v.length]));
        return {
          policy,
          fallbackTier,
          dedupeCooldownMs: deduper.cooldownMs,
          rulesSource: config.rules ? 'merged(default + config)' : 'default',
          rulesCount: counts,
          defaultsFrozen: Object.isFrozen(DEFAULT_RULES),
          policyHint: 'alert=>deliver_now, decide=>queue_for_review, inform=>log_only (or deliver_digest)',
        };
      },
    })
  );

  return { rules, policy, fallbackTier };
}
