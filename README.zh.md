# dsh-attention-router（注意力路由）

[![npm version](https://img.shields.io/npm/v/dsh-attention-router)](https://www.npmjs.com/package/dsh-attention-router) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> 作者：jetpan（npm）↔ jerentpan-lab（GitHub）｜[npm 包](https://www.npmjs.com/package/dsh-attention-router)｜[GitHub 仓库](https://github.com/jerentpan-lab/dsh-attention-router)｜也可从 GitHub 安装：`dsh plugin --profile web add github:jerentpan-lab/dsh-attention-router`


让 Agent 不再「每件小事都发通知」。把事件分三档并路由：

| 档位 | 含义 | 动作 |
|---|---|---|
| `alert` | 故障、失败、数据丢失、回滚触发 | 立即投递 |
| `decide` | 需要人拍板（授权、删除、生产变更） | 入待审队列 |
| `inform` | 完成、记录、指标 | 只记日志（静默） |

这是「人的注意力才是瓶颈」的做法：只在异常和需要决策时打扰人。

## 安装

```bash
dsh plugin --profile web add dsh-attention-router
```

## 工具

- `notify_classify`：分类，返回 `{ tier, matched, action, notify }`
- `notify_policy`：查看当前策略与规则数量

## License

MIT
