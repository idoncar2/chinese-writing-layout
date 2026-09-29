# 本地部署与阶段性发布流程

## 目标与边界

- 日常开发使用单独的本机配置，将构建产物部署到当前电脑的 Obsidian 插件目录。
- 本机 Vault 绝对路径不进入 Git；只部署 `main.js`、`manifest.json` 和 `styles.css`。
- 每次完成可验证的 bug 修复、兼容性调整或小型界面优化，都及时提升 patch 版本，并完成测试、构建和本地部署，避免多个小改动长期堆积后才补版本号。
- 完成中等规模的新功能或一组完整功能闭环后，及时推进一次阶段性 minor 发布；发布前仍需通过构建、测试及 Obsidian 人工确认。
- 新功能通常提升 minor 版本，纯修复通常提升 patch 版本；用户明确指定版本时以用户要求为准。
- 阶段性发布生成本地 ZIP，更新开发日志和功能清单。Git commit、push 与 GitHub 外部发布前仍需用户确认。
- 用户要求“封装”或“打包”指定版本时，默认表示执行完整阶段性发布：本地部署与 ZIP 存档、开发日志和已实现功能清单更新、Git commit/push 及 GitHub Release 核对；只有用户明确要求“仅本地”时才缩小范围。

## 本地部署

本机配置文件为 `.deploy.local.json`，它被 Git 忽略。配置只包含插件安装目录：

```json
{
  "pluginDir": "<vault>/.obsidian/plugins/chinese-writing-layout"
}
```

运行 `npm.cmd run deploy:local` 后，流程依次执行生产构建、复制三项安装文件并校验源文件和目标文件的 SHA-256。普通 `npm.cmd run build` 只构建工作区，不写入 Vault。

## 阶段性发布

1. 确认发布阈值已经满足，并确认用户完成 Obsidian 人工检查。
2. 检查 Git 状态、版本文件和待提交内容，排除本机路径、密钥、临时文件及无关产物。
3. 运行完整测试和生产构建。
4. 按语义版本同步 `package.json`、`package-lock.json`、`manifest.json` 和 `versions.json`。
5. 重新部署本地插件，并在 `release/` 生成只包含三项安装文件的版本 ZIP。
6. 更新 Obsidian 中的插件开发日志；只把本次确实完成的功能或问题改为已完成。
7. 再次验证测试、构建、ZIP 内容和 Git diff。
8. 展示拟提交文件与 commit message。用户确认后才提交并普通 push；禁止 force push。
9. 由仓库现有 GitHub Actions 创建或更新对应 Release，完成后核对 GitHub 状态和工作区状态。

## 决策记录

- 选择“项目脚本 + 本机忽略配置 + Codex skill”，不使用跨目录链接或常驻文件监控器。
- 本地部署是显式的一条命令，避免普通 build 意外写入 Vault。
- 发布判断采用里程碑阈值，而不是每次开发都升版。
- GitHub、Obsidian 笔记和 Git 历史属于外部或持久状态，执行前保留可审查步骤与用户确认。
