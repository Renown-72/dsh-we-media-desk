# 把 dsh-we-media-desk 插件安装到 desktop profile
# 用法：先完全退出 DeepSeek Harness 应用，然后在普通 PowerShell 里运行本脚本。
#      安装完成后，重新启动 DeepSeek Harness，侧栏应出现「📝 自媒体工作台」。

$ErrorActionPreference = 'Stop'

$pluginDir = 'C:\Users\ZB\Desktop\Development\dsh-we-media-desk'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$pkgPath = Join-Path $profileDir 'package.json'
$dsh = 'C:\Users\ZB\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'

Write-Host "== 1. 检查应用是否已退出 =="
$running = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "检测到 DeepSeek Harness 仍在运行，请先完全退出应用再运行本脚本。" -ForegroundColor Red
  exit 1
}
Write-Host "   应用已退出，继续。"

Write-Host "== 2. 确保插件已构建 =="
Push-Location $pluginDir
npm run build
Pop-Location

Write-Host "== 3. 安装依赖到 profile (dsh plugin add) =="
& $dsh plugin --profile desktop add "file:$pluginDir"
if ($LASTEXITCODE -ne 0) { throw "dsh plugin add 失败，退出码 $LASTEXITCODE" }

Write-Host "== 4. 把插件登记到 profile 的 bundles 列表 =="
$json = Get-Content $pkgPath -Raw | ConvertFrom-Json
if ($json.dsh.profile.bundles -notcontains 'dsh-we-media-desk') {
  $json.dsh.profile.bundles += 'dsh-we-media-desk'
}
$json | ConvertTo-Json -Depth 20 | Set-Content $pkgPath -Encoding utf8

Write-Host "== 完成 ==" -ForegroundColor Green
Write-Host "现在启动 DeepSeek Harness 即可。侧栏应出现「📝 自媒体工作台」。"
