# 安全与发布

本产品没有“绝对安全”保证。代码签名用于证明发布者身份和文件完整性，不能代替漏洞修复或病毒扫描。SmartScreen 仍可能对新版本提示信誉不足。

## AI 配置与数据

规划、对话、写作、分析 Agent 可独立设置服务商、接口、模型与密钥。密钥通过 Electron safeStorage 加密保存在用户数据目录；Agent 配置绑定接口地址，切换地址不继承原接口密钥。关闭独立配置后使用共用配置。不要把密钥、用户资料或本机数据库提交到 GitHub。

执行 AI 任务时，会将本轮要求、相关历史摘要及任务所需的文献片段或数据上下文发送至配置的服务商。统计代码在 Windows LPAC + Job Object 沙箱运行；沙箱不可用时拒绝执行。项目 RAG 与对话记忆按项目隔离。

## Windows 安装包

安装包内置 Python 3.14.8 与离线统计绘图依赖，默认不使用系统 Python。高级设置可切换到用户指定的解释器。构建时先运行 `python scripts/prepare-python-runtime.py`；官方 Python SHA-256 与 PyPI wheel SHA-256 均需验证，版本和哈希锁定在 `assets/python/runtime-lock.json`。发布前另外通过 OSV 检查 Python 依赖，发现已知漏洞时阻止发布。

在 PowerShell 运行 `npm run release:preview` 生成明确标注 UNSIGNED 的预览包；运行 `npm run release:signed` 生成强制签名版本。若本机没有 npm，可使用项目内 `.local-runtime/npm/package/bin/npm-cli.js` 调用脚本，或直接运行 `scripts/release-win.ps1`。

签名版本需提前配置自己合法持有的可信签名证书：`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`（或 electron-builder 支持的 `CSC_LINK` / `CSC_KEY_PASSWORD`）。不要在源码、配置文件或日志中写入证书密码。脚本不自动上传 GitHub。

发布流程包含实时依赖审计、回归测试、系统沙箱构建、安装包内容和密钥检查、签名验证、Defender 扫描和 SHA-256 校验。正式运行不要使用 `-SkipTests`；该开关仅用于同一源码和依赖已经测试通过后的本地重复构建。

仅在 `release-report.json` 生成且扫描通过后，把安装包、SHA256SUMS.txt、依赖和打包检查报告发布为 GitHub Release 附件。不要上传 win-unpacked 整个目录。未签名包只能按预览版描述；不能要求用户关闭 Defender 或 SmartScreen。

依赖审计区分随产品交付的依赖与构建工具；随产品交付的高危或严重漏洞会阻止发布。构建工具告警也会保留在报告中，应使用锁文件与独立的干净构建环境，并持续更新工具链。扫描失败、扫描服务不可用或签名缺失不能视为通过。

安全问题请通过 GitHub 私密漏洞报告渠道联系维护者，不要在公开 issue 粘贴 API Key、真实资料或证书信息。
