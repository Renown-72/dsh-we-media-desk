// 本地预览入口：脱离 DSH，用打包进来的 React 渲染工作台。
// ?mode=canvas|feed  ?dark=1  ?tab=ideas  ?unit=week|month
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../client/index.jsx'

const q = new URLSearchParams(location.search)
if (q.get('dark') === '1') document.body.setAttribute('data-ds-dark-theme', '')
if (q.get('fresh') === '1') localStorage.clear()
if (q.get('mode')) localStorage.setItem('we-media-desk:ideas-mode', JSON.stringify(q.get('mode')))
if (q.get('unit')) localStorage.setItem('we-media-desk:board-unit', q.get('unit'))
if (q.get('tab')) localStorage.setItem('we-media-desk:tab', q.get('tab'))

createRoot(document.getElementById('root')).render(<App />)

// ?capture=1：模拟按 N 打开录入框
if (q.get('capture') === '1') setTimeout(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' })), 800)

// ?gather=1：打开汇聚面板，选「城市夜景 vlog」和 #封面，再收起面板
const wait = ms => new Promise(r => setTimeout(r, ms))
const clickText = (sel, text) => [...document.querySelectorAll(sel)].find(b => b.textContent.includes(text))?.click()
if (q.get('gather') === '1') (async () => {
  await wait(1000); document.querySelector('.wk-gather-wrap .wk-pill-btn')?.click()
  await wait(200); clickText('.wk-popover .wk-chip', '城市夜景 vlog')
  await wait(100); clickText('.wk-popover .wk-chip', '#封面')
  await wait(400); document.querySelector('.wk-gather-wrap .wk-pill-btn')?.click()
})()
// ?picker=1：录入框里选一个脚本，再打开标签小框
if (q.get('picker') === '1') (async () => {
  await wait(1200); document.querySelectorAll('.wk-picker-btn')[0]?.click()
  await wait(200); clickText('.wk-picker-opt', 'AI 待办实测')
  await wait(200); document.querySelectorAll('.wk-picker-btn')[1]?.click()
  await wait(200); clickText('.wk-picker-opt', '#选题')
})()
