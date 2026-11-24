# AeroGlass (`KomariZachary`)

面向 Komari Monitor 的科技感毛玻璃探针主题，支持深浅色跟随系统自动切换、手机端适配、前台实时汇率切换、主页三网状态矩阵，以及子页面多目标延迟检测与削峰。

## 从 Komari 后台直接拉取与更新

1. **首次拉取安装**：进入 **Komari 管理后台 → 主题管理 → 导入主题**，填入仓库地址：
   ```text
   https://github.com/huge1225/Komari-zachary
   ```
2. **后续一键更新**：当仓库发布新版本后，在 **主题管理** 中点击本主题的 **更新** 按钮即可自动拉取最新 Release 安装包。
3. **三网配置**：启用主题后，可在后台 **主题设置** 中勾选主页展示的电信 / 联通 / 移动 Ping 任务（留空则按关键词自动匹配）。

## 版本控制与自动发版

仓库已配置 GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml))：
- 每次推送到 `main` 分支会自动递增补丁版本号（如 `v1.0.0` → `v1.0.1`），构建并发布最新 GitHub Release（首附件固定为 `komari-theme-zachary.zip`）。
- 如需指定大版本，修改 `komari-theme.json` 中的 `"version"`（或推送 `vX.Y.Z` 标签）即可。

## 本地开发

```bash
npm install
npm run dev          # 本地预览
npm run build:theme  # 生成 release/komari-theme-zachary.zip
```
