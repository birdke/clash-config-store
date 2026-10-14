# 变更日志

本文档记录面向使用者的版本说明；完整提交历史见 Git。

## 未发布

### 修复

- 修正 Loyalsoldier 内置规则集的格式：上游 `.txt` 文件实际为包含 `payload` 的 YAML，不再错误地按 `text` 解析。
- 新增数据库迁移（版本 2），将原始 Loyalsoldier 系统预设中的错误 `text` 格式改为 `yaml`，保留条目 ID 和既有引用；不修改用户自定义或已更换来源的规则集。
- 升级前请备份数据库；升级后需让客户端更新订阅并重新加载。生成的规则集条目可能省略 `format`（使用 Mihomo 默认的 YAML 格式），这是正常行为。配置模板中手写的 `format: text` 覆盖项不属于数据库预设，若指向同一 YAML 上游，需手动修正。

## v1.1.0-beta.3 — 2026-04-21

预发布版本，侧重订阅管理与文档配图。

### 新增

- **订阅二维码分享**：在订阅流程中可将订阅链接以二维码展示，便于手机扫码导入；新增 `SubscriptionShareDialog` 与 `subscription-url` 工具函数。
- **订阅列表与详情**：优化订阅列表布局与交互，并同步调整订阅详情相关入口。

### 文档与资源

- 更新 README 中的界面截图；压缩部分示例图体积；补充 rule-providers、subscriptions 二维码等配图。

### 其他

- 前端依赖更新（含二维码展示所需包）。

---

历史版本说明见 [GitHub Releases](https://github.com/PrintNow/clash-config-store/releases) 与各版本 Git 标签。
