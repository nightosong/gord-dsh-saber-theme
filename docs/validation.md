# 0.1.0 验证记录

日期：2026-10-16。开发平台经 `uname` 确认为 macOS（Darwin），使用 zsh；本地 Node.js 24.14.0、DSH 0.2.0-rc.2。

## 0.1.1 市场分发补充验证

- `npm run check`：5 项基础测试和 4 项浏览器测试通过。
- `npm run package`：产物 `gord-dsh-saber-theme.tgz` 为标准 npm 包格式，593,824 字节、7 个文件；仅包含两个运行文件、插件清单、原生 bundle 补丁及说明/许可，无安装期脚本、源码构建依赖或用户配置。
- Web：通过真实 `dsh plugin --profile web add <本地 tgz>` 安装到临时 profile，随后启动 DSH `0.2.0-rc.2`；主题版本 `0.1.1`、背景和官方设置深色切换通过，页面错误为 0。
- macOS Desktop：将同一个 tgz 安装到临时 profile 的包目录并按原生 bundle 加载；`dsh-app://app/` 中版本为 `0.1.1`，背景生效，主题样式仅一份，页面错误为 0。
- `engines.dsh` 与宿主主题服务的可选 `peerDependencies` 都限定为实际验证的 `0.2.0-rc.2`；未扩大兼容性声明。
- 截图声明位于根目录 `screenshots.json`，市场从公开 GitHub 仓库读取，无需把展示截图装进运行包。

### 复现市场安装验证

```bash
npm run package
SABER_PACKAGE=dist/gord-dsh-saber-theme.tgz node scripts/dsh-smoke.mjs
SABER_PACKAGE=dist/gord-dsh-saber-theme.tgz node scripts/desktop-smoke.mjs
```

以下为 `0.1.0` 的原始验证记录；其界面样式沿用至 `0.1.1`。

| 范围 | 验证方法 | 结果/边界 |
| --- | --- | --- |
| 版本一致性 | 校验 VERSION、package.json、锁文件、README、CHANGELOG、构建输出 | 本地通过 |
| 配置安装/恢复 | 临时目录测试，覆盖空配置、`[]`、注释、CRLF、无末尾换行、中文和空格路径、重复安装、后续追加设置 | 本地通过；损坏的配置块停止处理 |
| macOS 入口 | 直接执行真实 `.command` 脚本，对隔离配置完成安装与恢复 | 本地通过 |
| Windows 入口 | GitHub Actions 在 Windows 上执行真实 `.cmd` 安装与恢复脚本 | 已通过，详见仓库 Actions |
| 主题功能 | Chromium 测试浅色/深色、窄窗口、输入操作、首页/会话背景、失败回滚 | 本地通过 |
| 卸载清理 | 100 次加载/卸载，检查样式数量、主题标记、令牌恢复与草稿保留 | 本地通过，无轮播计时器/观察器 |
| 真实 DSH Web | 临时 DSH_HOME 启动真实 DSH，验证原生插件、实际布局、图片解码、通过官方 Settings 切换深色、页面错误并截图 | 本地通过，不调用模型；实际截图位于 `docs/images/` |
| macOS 原生桌面 | 使用已安装的应用二进制、临时 DSH_HOME、独立 Electron userData、端口 0 启动，检查 `dsh-app://app/` 中主题标记、背景与样式数量并截图 | 本地通过，渲染脚本错误为 0；截图位于 `docs/images/dsh-saber-desktop-macos.png` |
| Windows 原生桌面视觉 | 沿用 DSH 共同的客户端插件接口与布局 | 仍需 Windows 桌面真机验收；两平台缩放/多屏/长会话压力不属于本次验收 |

## 复现

```bash
npm ci
npx playwright install chromium
npm run check
node scripts/dsh-smoke.mjs
node scripts/desktop-smoke.mjs
node scripts/release.mjs macos
node scripts/release.mjs windows
```

真实 DSH 集成测试需要已安装的 `dsh` 命令（当前脚本用于 macOS/Linux 开发机）。它会在临时目录初始化自己的 profile 和凭据，不读取用户真实账号配置；启动口令仅在测试进程内使用，不保存到截图或报告。截图输出为 `test-results/dsh-smoke.png`。

桌面测试需要安装 DeepSeek Harness。`desktop-smoke.mjs` 默认定位 macOS 应用；其他路径可用 `SABER_DESKTOP_APP` 指定。测试使用独立用户目录并将临时 profile 的 `webserver.port` 设为 `0`，避免与已运行的桌面应用默认端口冲突。测试过程不修改安装的应用文件。

## 兼容性与限制

- 适配基线为 DSH `0.2.0-rc.2`；上游插件接口与 CSS 模块名可能变化。布局规则仅匹配 `_frame`、`_centerCol`、`_sidebarCol` 和 `_composerHero` 等后缀，避免绑定构建哈希。
- 安装器接受 YAML 块列表和空 `[]`，保留原文。非空 flow 列表（例如 `[{id: ...}]`）和显式文档分隔符应先转换成块列表。
- 安装与恢复前关闭 DSH，以避免其他程序同时编辑配置。配置有唯一备份，安装目录按版本和安装 ID 隔离；不自动删除历史资源。
- 首版使用两张固定图片。单张图片的 CSS data URL 限制为 1 MiB 以下，以避开 Chromium 的自定义属性长度限制。插件包约 0.78 MB，无主题发起的外部网络请求。
- 自动浏览器测试使用明确标记的组件 fixture（测试页面）。真实 DSH 截图与组件测试页面分开，不能用组件测试替代原生桌面验收。
