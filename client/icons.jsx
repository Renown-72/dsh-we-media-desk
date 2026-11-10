// 线性图标（24 网格，描边），手绘路径，跟随文字颜色。
import React from 'react'

const PATHS = {
  sparkle: 'M12 3.5l1.6 4.6a3 3 0 0 0 1.8 1.8l4.6 1.6-4.6 1.6a3 3 0 0 0-1.8 1.8L12 19.5l-1.6-4.6a3 3 0 0 0-1.8-1.8L4 11.5l4.6-1.6a3 3 0 0 0 1.8-1.8z',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  attach: 'M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1L13 4.3a3.4 3.4 0 0 1 4.8 4.8l-7.9 7.9a1.7 1.7 0 0 1-2.4-2.4L14.8 7.3',
  pin: 'M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6',
  orbit: 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M5.5 6.5a9 9 0 0 1 13 0M18.5 17.5a9 9 0 0 1-13 0M4 12h.01M20 12h.01',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  archive: 'M4 7h16v3H4zM5.5 10v8.5h13V10M10 14h4',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  target: 'M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M12 3v3M12 18v3M3 12h3M18 12h3',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  feed: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  canvas: 'M5 6.5h6v5H5zM14 4h5v6h-5zM8 14.5h5v5.5H8zM16 13.5h4v4h-4z',
  search: 'M11 11m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M20 20l-4.3-4.3',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  text: 'M5 6V4.5h14V6M12 4.5V20M9 20h6',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  play: 'M8 5.5v13l10.5-6.5z',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  globe: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M4 12h16M12 4c2.5 2.6 3.5 5.3 3.5 8s-1 5.4-3.5 8c-2.5-2.6-3.5-5.3-3.5-8s1-5.4 3.5-8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cloudOff: 'M3 3l18 18M8 7.2A6 6 0 0 1 17.6 10 4 4 0 0 1 20 17M16 18H7a4.5 4.5 0 0 1-1.7-8.7',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  docs: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h5M10 15.5h5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
  chart: 'M4 20h16M7 16v-4M12 16V8M17 16v-7',
  palette: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.2-3.8-7.5-8.5-7.5zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5H5V6h5',
}

export function Icon({ name, size = 16, stroke = 1.8, fill = false, className = '', title }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={'wk-icon ' + className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}
