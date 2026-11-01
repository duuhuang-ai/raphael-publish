# Raphael Publish — 公众号排版大师

## 项目定位
微信公众号 Markdown 排版工具，React 单页应用，输入 Markdown → 选择主题 → 一键复制带内联样式的 HTML 到公众号后台。

## 怎么跑起来
```bash
pnpm install
pnpm dev          # 本地开发: http://localhost:5173
pnpm build        # 生产构建 (tsc + vite build)
pnpm test         # 单元测试 (vitest)
pnpm test:e2e     # E2E 测试 (playwright)
```
首次 pnpm install 后需要 `pnpm approve-builds esbuild` 放行 esbuild 构建脚本。

## 技术栈
- React 18 + TypeScript + Vite 5
- Tailwind CSS 3 + framer-motion
- markdown-it（解析）+ highlight.js（代码高亮）
- turndown（富文本转 Markdown，魔法粘贴）
- html2pdf.js（PDF 导出）
- vitest + Playwright

## 目录与约定
```
src/
  components/        UI 组件（编辑器、预览、主题选择器、工具栏等）
  lib/
    themes/          30 套主题，分 classic / modern / extra 三组，每组 10 套
    markdown.ts      核心渲染：Markdown → 带内联样式的 HTML（applyTheme）
    htmlToMarkdown.ts  魔法粘贴：富文本 → 纯净 Markdown
    notionZipImport.ts Notion 单篇 Markdown & CSV ZIP 导入与图片路径匹配
    wechatCompat.ts  微信兼容处理
    imageSelector.ts 多图网格排版
    markdownLocator.ts / markdownIndexer.ts  点击定位
  defaultContent.ts  编辑器默认示例内容
  index.css          Tailwind + 自定义样式
docs/superpowers/plans/  已确认功能的实施计划，按 YYYY-MM-DD-功能名.md 命名
```

**新增导入能力**：解析与资源路径映射放在 `src/lib/`，界面入口沿用 `src/components/`；测试放在对应模块旁的 `*.test.ts`，涉及完整操作时补充 `e2e/` 用例。导入失败不得覆盖编辑器现有内容；临时资源只在当前页面会话使用，切换导入或离开页面时释放。计划文档保留作为实施依据，不当临时文件清理。

**主题新增/修改**：在 `src/lib/themes/` 对应分组文件的数组里加/改 Theme 对象。`styles` 的 key 是 CSS 选择器，value 是内联样式字符串。自定义非标准选择器（如 `recommend-title`）需要在 `markdown.ts` 的 `applyTheme()` 里加对应识别逻辑。

**推荐文章区块**：h2 标题包含「推荐/延伸/相关/往期/精选/更多」关键词时，自动识别为推荐区并应用独立样式。目前少数派主题已实现（灰底卡片 + ◦ 前缀 + 红色小标题）。其他主题如需支持，在主题的 styles 里加 `recommend-title` / `recommend-ul` / `recommend-li` / `recommend-a` 即可自动生效。

## 部署
- GitHub Pages + 自定义域名 publish.raphael.app
- push 到 `main` 分支自动触发 `.github/workflows/deploy.yml` 部署
- 本地验证 → commit → push → 等 Actions 完成 → 线上验证

## 当前状态
- 主分支：main；提交和部署状态以 GitHub Actions 与线上验证为准。
- 测试数量随功能增加而变化，以当前运行结果为准。
