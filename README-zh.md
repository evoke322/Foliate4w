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
> 阅读体验和打包骨架已经基本建立，但 Windows 实机运行测试以及与 GTK 原版的
> 完整功能对齐仍在进行中。

## 项目目标

- 尽可能保留 Foliate 原版的视觉风格和核心阅读体验。
- 仅支持 Windows 10、Windows 11 x64。
- 复用现代 Windows 系统通常已经安装的 WebView2 Runtime。
- 尽可能缩小可执行文件和发布包体积。
- 借助 GitHub Actions 生成真正的便携版 ZIP。
- 便携版的数据完全随程序存放，程序不会自动创建注册表项。

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
- 整本书或当前章节全文搜索，并支持逐项跳转
- 阅读进度和位置恢复
- 显示书名、作者及封面
- 浅色、深色界面及九种阅读配色主题
- 键盘及工具栏翻页
- 接近 Foliate 原版的阅读侧栏、工具栏和底部导航
- 字体、字号、对齐、断词、页边距、最大列数、动画、光标自动隐藏和暗色模式
  反色设置
- 一次性读取并可搜索筛选的 Windows 系统字体列表
- 分开的界面、电子书阅读、PDF 阅读、划词工具和 Windows 系统集成设置
- 分页布局下使用鼠标滚轮翻页
- 可整体隐藏划词工具条，并逐项启用或禁用工具
- 剩余时间、章节、出版物页码、Landmarks 及 EPUB CFI 复制粘贴导航
- 支持多本导入、网格/列表视图、元数据搜索、封面、进度和多窗口同步的本地书库
- 可切换“打开即导入书库”或“仅打开、手动导入”的书库行为
- 由用户明确操作的当前用户文件关联和桌面快捷方式管理
- 书签以及可搜索的批注列表
- 流式排版图书的高亮、下划线、波浪线、删除线、自定义颜色和批注笔记
- 批注删除撤销，以及 Foliate JSON、HTML、Markdown 和 Org Mode 导入导出
- 脚注和尾注弹窗
- 词典、增强的 Wikipedia 和记忆目标语言的翻译查询
- 引用/CFI 复制、书内查找、从此处朗读和打印等选中文本操作
- 支持缩放、拖动、旋转、反相、复制及另存为的插图查看器
- 全屏、窗口状态恢复、重新加载、新窗口打开、打印、快捷键帮助、完整错误页和
  “关于/调试信息”窗口
- 简体中文和英文界面模式
- 按图书声明启用竖排、从右向左阅读和固定版式
- 对命令行传入的图书按区间读取，打开大型 EPUB/PDF 时避免额外通过 IPC
  完整复制一次文件

PDF 渲染仍属于实验性功能。当前可以选择文本并进行查询，但 PDF 和其他固定版式
图书暂不支持高亮与批注；在线查询工具需要网络连接。

Foliate 原版仍有部分功能尚未完整移植，包括完整的文本朗读控制器、媒体叠加和
OPDS 在线书库。

桌面版导入书库时只保存原始 Windows 文件路径，不会再保存一份完整图书副本。
IndexedDB 保存该路径、封面、元数据、阅读进度、书签和批注；便携版中该数据库
位于 `Data/WebView2`。移动或删除原始文件后，书库链接会暂时失效，需要重新导入
文件。设置页可清理已移除图书保留的阅读数据和临时文件。

## Windows 发布版本

发布工作流只生成一个 Windows x64 便携版。

### 便携版

便携版按以下原则设计：

- 发布文件名为 `Foliate-Windows-x64-Portable.zip`；
- 解压即可运行，不需要安装；
- 默认不建立文件关联，也不自动创建注册表项；
- 只有用户在设置页明确点击后才修改当前用户的文件关联，并提供对应的取消操作；
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
    ├── logs/
    ├── temp/
    └── WebView2/
```

应用可以控制自身数据的保存位置，但 Windows 系统本身仍可能维护 Prefetch、
最近使用文件记录或安全扫描信息等操作系统级记录。

## 运行要求

发布版本需要：

- 64 位 Windows 10 或 Windows 11
- Microsoft WebView2 Runtime

Windows 11 和绝大多数仍在维护的 Windows 10 系统已经包含 Evergreen WebView2
Runtime。为了保持便携版自包含且不自动修改系统，便携版要求系统已经提供
WebView2。

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
6. 构建不含安装器的 Windows x64 可执行文件；
7. 生成数据隔离的便携版目录；
8. 将便携版目录压缩为 ZIP；
9. 将便携版上传为 Actions Artifact；
10. 将便携版附加到触发本次构建的 GitHub Release。

推送到 `main` 或 `master`、Pull Request、单独推送标签以及保存 Release 草稿都不会
触发打包。只有在 GitHub 中正式发布 Release（例如标签 `v0.1.3`）时，才会开始
Windows 构建并上传便携版发布包。

## 项目结构

- `web/`：面向 Windows 的用户界面及阅读器集成
- `web/public/foliate-js/`：上游电子书渲染核心及格式依赖
- `src-tauri/`：轻量原生 Windows 外壳
- `.github/workflows/`：自动化 Windows 构建

桌面版使用 Windows 原生文件选择器，因此打开和导入的图书可以保留原始文件路径。
这些路径由 Tauri 提供类似 Blob 的区间读取接口，使 EPUB 和 PDF 解析器可以按需
读取文件片段，而不必先通过 IPC 完整传输一次文件。单本图书仍可直接拖入阅读器
临时打开，但导入书库必须使用原生选择器，因为网页拖放不能可靠取得 Windows 路径。

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
WebView2 的前提下，把便携版压缩包控制在几十 MB 范围内。

## 安全与隐私

- 图书只在本地打开，阅读器不会上传图书内容。
- 当前阅读器不会向电子书内容授予任意文件系统权限。
- 内容安全策略会阻止电子书脚本和不受限制的网络连接。
- 只有用户明确操作后才会打开外部链接，并交给 Windows 默认浏览器处理。
- 便携版会把应用可控制的持久数据全部隔离到自身的 `Data` 目录。

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
