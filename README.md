# dsh-attention-router

[![npm version](https://img.shields.io/npm/v/dsh-attention-router)](https://www.npmjs.com/package/dsh-attention-router) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> Author: jetpan (npm) ↔ jerentpan-lab (GitHub) | [npm package](https://www.npmjs.com/package/dsh-attention-router) | [GitHub repo](https://github.com/jerentpan-lab/dsh-attention-router) | install from GitHub: `dsh plugin --profile web add github:jerentpan-lab/dsh-attention-router`


Stop agents from over-notifying. Classify every event into one of three tiers and route it:

| tier | meaning | action |
|---|---|---|
| `alert` | fault, failure, data loss, rollback trigger | deliver now |
| `decide` | requires a human decision (approval, deletion, production change) | queue for review |
| `inform` | completed work, records, metrics | log only (silent) |

This is the "attention is the bottleneck" pattern: agents should only interrupt a human
for alerts and decisions, not for every completed step.

## Install

```bash
dsh plugin --profile web add dsh-attention-router
```

## Tools

- `notify_classify` — classify text, return `{ tier, matched, action, notify }`
- `notify_policy` — show current policy and rule counts

## Config

```yaml
- id: dsh-attention-router
  name: dsh-attention-router
  config:
    rules:
      alert: ["lookup failure"]
      decide: ["approve this"]
    policy:
      notifyInform: false
```

## License

MIT
