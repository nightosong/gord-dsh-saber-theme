# 验证记录

日期：2026-10-16。开发平台经 `uname` 确认为 macOS（Darwin），使用 zsh；本地 Node.js 24.14.0、DSH 0.2.0-rc.2。

## 0.3.1 任务关注验证

日期：2026-10-19；开发平台为 macOS（Darwin）。参考同一作者的 `gord-dsh-worktree` 0.6.0，复用其 MIT 任务摘要投影与索引定位算法，单独实现主题 DOM 视图。

- Windows 运行器曾暴露悬浮收起测试的时钟竞态；0.3.1 将测试时钟冻结，分别精确推进 199ms 与 1ms，不再受真实执行耗时影响。0.3.0 未发布安装资产，保留原标签。
- `npm run check`：10 项基础测试、15 项浏览器测试通过。新增基础测试覆盖真实状态含义、排除当前/归档/子智能体会话、Windows 路径、失败/未确认跳转、后续新阶段再次提醒、取消待完成跳转与监听释放。
- 2,000 个空闲会话下，100 次消息时间戳变化不替换任务快照，只读取候选摘要，不扫描全部空闲会话；不加载会话正文或增加 Session 引用。
- 浏览器覆盖任务计数、浅/深色、中英文、索引下方定位、输入区避让、拖动记忆、窄窗口、恢复位置、键盘焦点、20 条分页、悬浮 200ms 收起、跳转超时和隐藏窗口收起。
- 与 worktree 入口同时可见时，主题入口隐藏；原入口移除后恢复。缺少统一状态能力时，任务视图不创建，主题样式继续生效。
- 100 次激活/卸载循环保持会话列表、统一状态、当前选择、工作区各一份订阅；任务可见时仅 3 个观察器（位置变化与语言），卸载后订阅、观察器和任务 DOM 均为 0。
- 初始入口约 0.81 MB，相比 0.2.0 增加约 30 KB；没有引入第二份前端框架。运行内存未作跨平台定量基准。
- 同一预构建包在真实 DSH Web `0.2.0-rc.2` 和 macOS Desktop `0.2.1-rc.2` 的隔离配置中通过：原生任务服务挂载、样式唯一性、深色切换和两次原生轮播均正常，脚本错误为 0。
- 真实宿主集成检查使用空会话，验证服务接入且空列表隐藏；任务状态、跳转失败/超时及详情 UI 由模拟服务的真实浏览器组件测试覆盖。不调用模型，不把模拟数据截图作为真实会话证据。Windows 原生桌面仍需真机验收。

## 0.2.0 自动轮播验证

日期：2026-10-19；macOS（Darwin）、Node.js 24.14.0。CLI 为 `0.2.0-rc.2`；桌面实际 `app.getVersion()` 和应用包内版本为 `0.2.1-rc.2`（不能仅依据外层 `CFBundleShortVersionString`）。

- `npm run check`：5 项基础测试、8 项浏览器测试通过。
- 真实解码全部 30 张背景，使用加速时钟连续轮播 100 次；自建 Blob URL 稳态 1 个、峰值 2 个，卸载后 0 个。100 次卸载/重载后仅一次轮播调度生效。
- 首页经过多个周期仍不请求轮播素材；窗口隐藏时暂停，恢复等待完整周期，没有补切。
- 传输失败、图片损坏、10 秒超时均保留原图且可在后续周期恢复；隐藏/卸载会清除待解码图片，迟到的加载响应不会复活主题。
- 启动入口约 0.78 MB，背景压缩数据分为 30 个延迟加载的原生客户端分块；预构建包 37 个文件、约 6.84 MB。分发包体积不是运行内存。
- 同一预构建 `.tgz` 在临时 Web profile（实际 `dsh plugin add`）与隔离的 macOS 桌面 profile 中通过：首页、浅/深色、样式唯一性和原生分块加载均正常，页面脚本错误为 0。
- 原生轮播集成测试使用加速时钟，临时移除真实首页的 `_composerHero` 标记以选择聊天背景分支，完成两次图片切换后恢复；不创建会话、不调用模型。它验证真实原生分块传输与渲染，不等同于长时间真实会话验收。
- `engines.dsh` 和宿主主题服务的可选对等依赖仅允许 `0.2.0-rc.2 || 0.2.1-rc.2`，未扩大到其他未验证版本。

以上资源测试统计插件自己创建的 URL 与调度行为，不代表 Chromium 解码缓存、GPU 显存或整个 DSH 应用的内存上限；DSH 会缓存已请求的压缩分块。Windows 原生桌面仍需真机视觉验收。

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
