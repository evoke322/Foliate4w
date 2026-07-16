<img src="web/public/assets/foliate.svg" align="left" width="72" height="72" alt="Foliate 图标" style="margin-right:12px">
<br>

# Foliate for Windows

在 Windows 上优雅地阅读电子书。

简体中文 | [English](README.md)

Foliate for Windows 是
[Foliate](https://github.com/johnfactotum/foliate) 的轻量 Windows
移植项目。项目复用
[`foliate-js`](https://github.com/johnfactotum/foliate-js) 阅读核心，并使用
[Tauri 2](https://tauri.app/) 和 Microsoft WebView2 重写桌面外壳。

本项目仅以 Windows 为目标平台。界面和阅读体验会尽可能参照 Foliate
原版，同时避免携带 GTK、GJS、libadwaita、WebKitGTK、Electron 和完整的
Chromium 运行时。

> [!IMPORTANT]
> 本项目仍处于早期开发阶段，尚未达到正式发布状态。基础阅读器骨架已经建立，
> 但 Windows 打包、绿色版数据隔离、文件关联和完整运行测试仍在开发中。

## 项目目标

- 尽可能保留 Foliate 原版的视觉风格和核心阅读体验。
- 仅支持 Windows 10、Windows 11 x64。
- 复用现代 Windows 系统通常已经安装的 WebView2 Runtime。
- 尽可能缩小可执行文件和发布包体积。
- 借助 GitHub Actions 同时生成安装版和真正的绿色版 ZIP。
- 绿色版的数据完全随程序存放，程序自身不创建注册表项。

## 支持的图书格式

- EPUB
- Mobipocket（`.mobi`）
- Kindle（`.azw`、`.azw3`）
- FictionBook（`.fb2`、`.fb2.zip`、`.fbz`）
- Comic Book Archive（`.cbz`）
- PDF（实验性支持）

格式解析和渲染主要由 `foliate-js` 提供。PDF 使用 PDF.js，与上游项目相同，
目前应视为实验性功能。

## 当前已有功能

- 通过系统文件选择器打开本地图书
- 将图书拖放到窗口中打开
- 分页和滚动阅读布局
- 图书目录
- 阅读进度和位置恢复
- 显示书名、作者及封面
- 浅色和深色主题
- 键盘及工具栏翻页

Foliate 原版还提供书库、全文搜索、书签、批注、词典查询、文本朗读、更多主题和
完整的阅读排版设置。这些功能计划逐步移植，目前的 Windows 版本尚未全部实现。

## Windows 发布版本

发布工作流计划从同一份源码生成两个互相独立的 x64 版本。

### 安装版

安装版计划具备以下行为：

- 发布文件名为 `Foliate-Windows-x64-Setup.exe`；
- 为当前 Windows 用户安装 Foliate；
- 写入正常的卸载信息；
- 在缺少 WebView2 Runtime 时允许安装器引导安装；
- 将支持的电子书格式关联到 Foliate；
- 在文件资源管理器中双击关联图书时使用 Foliate 打开；
- 按照 Windows 规范，将设置和应用数据保存到当前用户的数据目录。

第一版文件关联会使用静态的 Foliate 文件图标。Linux 原版能够提取图书封面并在
自身书库中显示，但原版没有提供 Windows 文件资源管理器缩略图处理器。

如果要让资源管理器直接把每本书的封面显示为文件缩略图，需要额外开发实现
`IThumbnailProvider` 的 Windows COM Shell Extension。该组件开发和稳定性要求
较高，不属于首个版本的范围；将来如有需要，只适合作为安装版的可选组件。

### 绿色版

绿色版计划具备以下行为：

- 发布文件名为 `Foliate-Windows-x64-Portable.zip`；
- 解压即可运行，不需要安装；
- 不建立任何文件关联；
- 程序自身不创建任何注册表项；
- 设置、书库数据、阅读位置、封面、缓存、日志和 WebView2 用户数据全部保存到
  可执行文件旁的 `Data` 目录；
- 不会在失败时悄悄改用 `%APPDATA%`、`%LOCALAPPDATA%` 或其他应用数据目录；
- 如果程序所在目录不可写，会提示错误并停止运行。

计划中的目录结构如下：

```text
Foliate-Portable/
├── Foliate.exe
├── portable.flag
└── Data/
    ├── cache/
    ├── config/
    ├── covers/
    ├── library/
    └── WebView2/
```

应用可以控制自身数据的保存位置，但 Windows 系统本身仍可能维护 Prefetch、
最近使用文件记录或安全扫描信息等操作系统级记录。

## 运行要求

发布版本需要：

- 64 位 Windows 10 或 Windows 11
- Microsoft WebView2 Runtime

Windows 11 和绝大多数仍在维护的 Windows 10 系统已经包含 Evergreen WebView2
Runtime。安装版可以在缺少它时引导安装。为了保持绿色版自包含且不主动修改系统，
绿色版要求系统已经提供 WebView2。

开发环境需要：

- Node.js 24
- npm
- Rust stable 和 Cargo
- 用于原生构建的 Windows 编译环境

本项目目前使用名为 `foliate` 的独立 Conda 环境管理 Rust 和 Cargo。不要将项目
依赖安装到 Conda 的 `base` 环境。

## 获取源码

克隆仓库并进入本项目目录：

```bash
git clone <repository-url>
cd Foliate4w
```

项目将 `foliate-js` 源码保存在 `web/public/foliate-js`，从而保持其运行时动态
导入和 PDF.js 资源路径不被前端构建工具改写。

## 开发

激活现有 Conda 环境：

```bash
conda activate foliate
```

安装项目级 JavaScript 依赖：

```bash
npm install
```

在浏览器中运行 Web 界面：

```bash
npm run web:dev
```

仅构建 Web 前端：

```bash
npm run web:build
```

执行前端构建和 Rust 检查：

```bash
npm run check
```

运行完整 Tauri 应用：

```bash
npm run dev
```

执行原生发布构建：

```bash
npm run build
```

在 Linux 上进行 Tauri 原生开发还需要额外安装 Linux WebKitGTK 系统开发包，
并且无法验证 Windows WebView2 集成。完整打包和运行验证应在 Windows 上完成。

提交锁文件后，本地和 CI 的可复现依赖安装应使用 `npm ci`，而不是
`npm install`。

## GitHub Actions

Windows 构建工作流位于
[`.github/workflows/windows.yml`](.github/workflows/windows.yml)，使用
GitHub 托管的 `windows-latest` runner。

完成后的工作流将执行：

1. 检出源码；
2. 配置 Node.js 和 Rust MSVC 工具链；
3. 恢复 npm 和 Cargo 缓存；
4. 根据锁文件安装依赖；
5. 构建并检查 Web 前端；
6. 构建 Windows x64 可执行文件；
7. 生成带文件关联的安装版；
8. 生成数据隔离的绿色版目录；
9. 将绿色版目录压缩为 ZIP；
10. 将两个版本上传为 Actions Artifacts；
11. 为版本标签自动将两个文件附加到 GitHub Releases。

目前的工作流只是安装版构建骨架。上述双版本打包及 Release 发布步骤仍需实现并
经过实际验证。

## 项目结构

- `web/`：面向 Windows 的用户界面及阅读器集成
- `web/public/foliate-js/`：上游电子书渲染核心及格式依赖
- `src-tauri/`：轻量原生 Windows 外壳
- `.github/workflows/`：自动化 Windows 构建

阅读器直接以浏览器 `File` 对象接收本地图书，避免通过 JSON 或 Tauri IPC
复制整本电子书，也能缩小 Rust 端的权限范围。

## 轻量化策略

项目通过以下方式控制体积：

- 使用系统 WebView2 Runtime，不携带 Chromium；
- 不使用 GTK/GJS 和 Electron；
- 保持 Rust 外壳精简；
- 保留 `foliate-js` 的模块化动态导入；
- 从发布包排除 source map 等仅用于开发的文件；
- 适当启用 release 优化、LTO、符号剥离和面向体积的 Rust 配置；
- 初期只构建 Windows x64。

准确体积需要等首个经过验证的 Windows 发布版完成后测量。目标是在不携带
WebView2 的前提下，把绿色版压缩包控制在几十 MB 范围内。

## 安全与隐私

- 图书只在本地打开，阅读器不会上传图书内容。
- 当前阅读器不会向电子书内容授予任意文件系统权限。
- 内容安全策略会阻止电子书脚本和不受限制的网络连接。
- 当前实现不会自动打开外部链接。
- 绿色版会把应用可控制的持久数据全部隔离到自身的 `Data` 目录。

## 与 Foliate 原版的关系

Foliate for Windows 基于 Foliate 原版的设计和阅读核心，但它是平台移植项目，
不是 GTK 应用的直接 Windows 编译版本。GTK、libadwaita、GJS、WebKitGTK、
Tracker 和 `speech-dispatcher` 等 Linux 特有组件会在 Windows 上被替换或省略。

Windows 移植相关问题应提交到本项目的问题跟踪页面。如果问题来自上游 GTK
应用或 `foliate-js`，在能够复现的情况下应提交给对应的上游项目。

## 许可证

Foliate for Windows 是自由软件，采用
[GNU General Public License](COPYING) 第 3 版或任何更高版本发布。

项目包含或使用以下组件：

- [Foliate](https://github.com/johnfactotum/foliate)，GPL-3.0-or-later
- [foliate-js](https://github.com/johnfactotum/foliate-js)，MIT
- [zip.js](https://github.com/gildas-lormeau/zip.js)，BSD-3-Clause
- [fflate](https://github.com/101arrowz/fflate)，MIT
- [PDF.js](https://github.com/mozilla/pdf.js)，Apache-2.0
- [Tauri](https://tauri.app/)，Apache-2.0 和 MIT
- [Lucide](https://lucide.dev/)，ISC

Microsoft WebView2 是 Windows 运行时依赖，计划中的轻量发布包不会内置它。
