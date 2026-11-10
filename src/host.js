// 自媒体工作台 —— host 半边入口。
// 在 DSH 里作为插件被加载，负责：注册命令/工具、读写本地数据。
// 这里是可运行的最小骨架，功能后续逐步补齐。

export const name = 'we-media-desk'

// Cordis 插件约定：导出一个 apply(ctx) 或 { apply }。
export function apply(ctx) {
  // 插件加载时调用。ctx 是 Cordis 上下文，提供命令注册、服务、生命周期等能力。
  // TODO: 注册灵感/内容/排期相关命令与工具。
  if (ctx?.logger) ctx.logger('we-media-desk loaded')

  return () => {
    // 返回的清理函数在插件卸载时调用。
  }
}

export default { name, apply }
