# 自媒体工作台（we-media-desk）

一个 DeepSeek Harness 插件：记一句灵感，一键成稿。

> 从零开始的原创项目。仅借鉴同类工具的**功能与交互思路**，界面与代码均为独立实现。

## 页面

灵感 · 内容 · 排期 · 复盘 · 风格（当前为骨架，逐步补齐）

## 开发

```bash
npm install       # 安装依赖（esbuild）
npm run build     # 打包 client/ 到 dist/client.js
npm run watch     # 监听模式
npm test          # 运行测试
```

## 结构

- `client/`  前端界面（React JSX + CSS，打包为 `dist/client.js`）
- `src/`     host 端逻辑（插件入口、数据存储）
- `scripts/` 构建脚本
- `test/`    单元测试

## 许可

MIT，版权归本项目作者。
