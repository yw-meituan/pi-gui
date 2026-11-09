# 本地定制与上游同步

## 约定

- `origin`：`yw-meituan/pi-gui`，个人 fork。
- `upstream`：`minghinmatthewlam/pi-gui`。
- `main`：只快进同步上游，保持原样。
- `custom`：个人补丁和维护文件；也是 fork 默认分支，让每周检查生效。
- 优先使用 Pi 配置、skills 和外部扩展；必要的应用改动做成小而独立的提交。
- 保留上游锁文件。按其依赖版本构建；更新 CLI 与更新 GUI 内嵌 SDK 分别进行。
- 用 merge 保留已推送历史；冲突逐项解决，避免重置或强推。

## 每周提醒

`Local upstream check` 每周一北京时间 09:00 比较 `custom` 与上游 `main`。
有新提交时维护一个分配给仓库所有者的 issue；同步完成后下一次检查关闭它。
GitHub 通知取决于账号通知设置。任务只检查，合并、验证和安装由人确认。
GitHub 的定时任务可能延迟，公开仓库连续 60 天无活动可能暂停定时任务。
在 Actions 页面或下面的命令中可手动触发：

```bash
gh workflow run local-upstream-check.yml -R yw-meituan/pi-gui
```

fork 的上游发布、Claude、趋势等工作流保持禁用；原文件保留，减少合并冲突。

## 日常开发

```bash
cd ~/repos/personal/github/pi-gui
git switch custom
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

共享 `~/.pi/agent` 的配置、凭证、skills 和扩展。GUI 的配置改动也会影响 CLI。
`ctx.ui.custom()` 等终端 UI 扩展需另行适配。

## 更新上游

先退出应用，提交自己的改动，确认 `git status --short` 为空。
逐行执行；出现错误或冲突时停下处理，再继续。

```bash
git switch custom
git fetch origin
git merge --ff-only origin/custom
git fetch upstream main
git log --oneline custom..upstream/main
git diff --stat custom...upstream/main

# main 永远只跟踪上游
git switch main
git merge --ff-only origin/main
git merge --ff-only upstream/main
git push origin main

# 把上游带入个人分支
git switch custom
git merge upstream/main
corepack pnpm install --frozen-lockfile
corepack pnpm check
bash scripts/local-build-install.sh
git push origin custom
```

优先检查 SDK、扩展 API、锁文件、Electron 和打包流程变化。
出现冲突时解决并提交合并，再验证；需要放弃此次合并时用 `git merge --abort`。
每次升级额外手测真实模型对话与自己的扩展；打包冒烟测试使用隔离配置，覆盖启动、创建会话和终端。

## 打包安装

```bash
bash scripts/local-build-install.sh
open /Applications/pi-gui.app
```

脚本使用上游构建流程，生成本机 ad-hoc 签名的 arm64 应用，执行依赖、签名与 Electron 冒烟验证后安装。
本地包适合本机使用；Apple 公证和发布留给正式发布流程。
脚本要求先退出已安装应用；保留旧安装包和上一次构建到 `.artifacts/local-build/<时间>/`。
新源码构建后还应按改动范围执行 `corepack pnpm check` 和相应桌面验证。

手动安装已验证的包：先退出应用，把 `/Applications/pi-gui.app` 移到备份目录，再执行：

```bash
ditto apps/desktop/release/mac-arm64/pi-gui.app /Applications/pi-gui.app
```

回滚：退出应用，将当前应用另存，把备份的 `previous-pi-gui.app` 复制回 `/Applications/pi-gui.app`。
配置/会话独立保存，应用回滚不回退这些数据；升级前按需要单独备份。

### 本机 Swift 工具链覆盖

首次构建发现 Apple Command Line Tools 同时包含两个定义 `SwiftBridging` 的模块映射。
`.artifacts/local-build/swift-overlay/` 保存了仅供编译使用的 VFS 覆盖和 `xcrun` 包装器，系统文件保持原样。
安装脚本检测到该包装器时会自动使用。覆盖文件属于本机产物，未提交到 fork。
修复或更新 Command Line Tools 后，可将该目录改名为备份目录，再使用标准工具链构建。

开发时如果仍遇到相同 Swift 错误，可临时执行：

```bash
PATH="$PWD/.artifacts/local-build/swift-overlay/bin:$PATH" corepack pnpm dev
```
