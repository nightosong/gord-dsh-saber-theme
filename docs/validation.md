# 0.1.0 验证记录

日期：2026-10-16。开发平台经 `uname` 确认为 macOS（Darwin），使用 zsh；本地 Node.js 24.14.0、DSH 0.2.0-rc.2。

| 范围 | 验证方法 | 结果/边界 |
| --- | --- | --- |
| 版本一致性 | 校验 VERSION、package.json、锁文件、README、CHANGELOG、构建输出 | 本地通过 |
| 配置安装/恢复 | 临时目录测试，覆盖空配置、`[]`、注释、CRLF、无末尾换行、中文和空格路径、重复安装、后续追加设置 | 本地通过；损坏的配置块停止处理 |
| macOS 入口 | 直接执行真实 `.command` 脚本，对隔离配置完成安装与恢复 | 本地通过 |
| Windows 入口 | GitHub Actions 在 Windows 上执行真实 `.cmd` 安装与恢复脚本 | 以对应提交的 Actions 结果为准 |
| 主题功能 | Chromium 测试浅色/深色、窄窗口、输入操作、首页/会话背景、失败回滚 | 本地通过 |
| 卸载清理 | 100 次加载/卸载，检查样式数量、主题标记、令牌恢复与草稿保留 | 本地通过，无轮播计时器/观察器 |
| 真实 DSH Web | 临时 DSH_HOME 启动真实 DSH，验证原生插件、实际布局、图片解码、通过官方 Settings 切换深色、页面错误并截图 | 本地通过，不调用模型；实际截图位于 `docs/images/` |
| 原生桌面视觉 | 沿用 DSH 共同的客户端插件接口与布局 | macOS/Windows 桌面应用的窗口、缩放和多屏效果仍需真机验收 |

## 复现

```bash
npm ci
npx playwright install chromium
npm run check
node scripts/dsh-smoke.mjs
node scripts/release.mjs macos
node scripts/release.mjs windows
```

真实 DSH 集成测试需要已安装的 `dsh` 命令（当前脚本用于 macOS/Linux 开发机）。它会在临时目录初始化自己的 profile 和凭据，不读取用户真实账号配置；启动口令仅在测试进程内使用，不保存到截图或报告。截图输出为 `test-results/dsh-smoke.png`。

## 兼容性与限制

- 适配基线为 DSH `0.2.0-rc.2`；上游插件接口与 CSS 模块名可能变化。布局规则仅匹配 `_frame`、`_centerCol`、`_sidebarCol` 和 `_composerHero` 等后缀，避免绑定构建哈希。
- 安装器接受 YAML 块列表和空 `[]`，保留原文。非空 flow 列表（例如 `[{id: ...}]`）和显式文档分隔符应先转换成块列表。
- 安装与恢复前关闭 DSH，以避免其他程序同时编辑配置。配置有唯一备份，安装目录按版本和安装 ID 隔离；不自动删除历史资源。
- 首版使用两张固定图片。单张图片的 CSS data URL 限制为 1 MiB 以下，以避开 Chromium 的自定义属性长度限制。插件包约 0.78 MB，无主题发起的外部网络请求。
- 自动浏览器测试使用明确标记的组件 fixture（测试页面）。真实 DSH 截图与组件测试页面分开，不能用组件测试替代原生桌面验收。
