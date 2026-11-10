# 从 desktop profile 卸载 dsh-we-media-desk 插件
# 用法：先完全退出 DeepSeek Harness，再运行本脚本。

$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath = Join-Path $profileDir 'package.json'

$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "请先完全退出 DeepSeek Harness 应用。" -ForegroundColor Red
  exit 1
}

# 从 bundles 移除
$json = Get-Content $pkgPath -Raw | ConvertFrom-Json
$json.dsh.profile.bundles = @($json.dsh.profile.bundles | Where-Object { $_ -ne 'dsh-we-media-desk' })
$json | ConvertTo-Json -Depth 20 | Set-Content $pkgPath -Encoding utf8

# 用 pnpm 移除依赖
$dsh = 'C:\Users\ZB\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop remove dsh-we-media-desk

Write-Host "已卸载。重新启动 DeepSeek Harness 生效。" -ForegroundColor Green
