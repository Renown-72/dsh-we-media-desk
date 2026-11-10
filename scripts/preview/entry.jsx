// 本地预览入口：脱离 DSH，用打包进来的 React 渲染工作台。
// ?mode=canvas|feed  ?dark=1  ?tab=ideas
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../../client/index.jsx'

const q = new URLSearchParams(location.search)
if (q.get('dark') === '1') document.body.setAttribute('data-ds-dark-theme', '')
if (q.get('fresh') === '1') localStorage.clear()
if (q.get('mode')) localStorage.setItem('we-media-desk:ideas-mode', JSON.stringify(q.get('mode')))
if (q.get('tab')) localStorage.setItem('we-media-desk:tab', q.get('tab'))

createRoot(document.getElementById('root')).render(<App />)
