# 开发约定

- 默认中文沟通。当前仓库为独立 DSH 主题，不是 Codex 桌面主题引擎。
- 原生插件适配基线为 DeepSeek Harness 0.2.0-rc.2。先核对本机 DSH 版本和相关接口，再修改适配代码。
- 视觉参考同级 `codex-saber-theme`，不要复制其 Codex 专用启动器、调试端口或 DOM 选择器。
- `VERSION` 为版本源，同步 `package.json`、锁文件、README、CHANGELOG；标签使用 `v<版本>`。
- 同一份插件适配 macOS/Windows 和 Desktop/Web；保持恢复能力，不覆盖其他 DSH 配置。
- 本地验证使用临时 `DSH_HOME`。用户未请求时，不安装到其真实配置、不重启正在运行的 DSH。
- 修改后运行 `npm run check`；涉及 DSH 接口或布局时，额外运行 `node scripts/dsh-smoke.mjs`。
- 不将 `node_modules`、`lib`、`dist`、凭据、个人 DSH 配置或临时截图提交。
- 美术素材来源写入 `NOTICE.md`；不得将第三方角色美术声明为 MIT 授权。
