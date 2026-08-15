# AI 论文宠物

> 把分散的论文资料，变成可检索、可核验、可用于写作的证据库。

AI 论文宠物是一款面向中文高校学生和个人研究者的 Windows 桌面端论文资料与写作工具。用户以论文项目为单位导入 PDF、DOCX、表格、BibTeX 等资料，系统在本机完成解析、分块和索引；用户提出写作任务后，系统检索相关原文，辅助生成有依据的正文，并展示证据来源、引用清单和待核验项。

项目的核心不是“让 AI 代写论文”，而是缩短这条链路：

```text
分散资料 → 统一整理 → 检索原文 → 形成正文 → 核验来源 → 整理引用 → 导出文档
```

桌面宠物承担入口和过程反馈：资料解析时“阅读”，生成时“工作”，完成后“庆祝”。它服务于长期写作体验，核心价值仍然是资料到证据、证据到内容的工作流。

## 项目亮点

- **项目化资料库**：资料、草稿、对话、索引和引用关系按论文项目隔离保存。
- **本地 RAG 检索**：按页码和语义段落分块，混合关键词与向量/哈希语义检索，只向模型发送本轮命中的必要片段。
- **任务路由与专用 Skill**：先识别写作范围和交付物，再按需加载文献综述、研究设计、数据分析、修订等 Skill。
- **证据可追溯**：正文事实性判断使用 `[E#]` 内部证据标记，可查看文献名称、页码/片段位置和来源映射。
- **引用可信边界**：不根据文件名或模型记忆猜测作者、年份、页码等书目信息；缺失字段进入待核验清单。
- **长论文分步交付**：长篇任务先确认范围和证据需求，再以可核验的写作单元逐步完成。
- **数据分析工具**：支持 CSV/XLSX 描述统计和 matplotlib 图表生成。
- **本地优先**：工作区、资料副本、解析文本、索引和草稿保存在本机；API Key 使用系统安全存储。

## 当前能力边界

项目当前为可运行原型（`0.1.0`）。已经跑通项目管理、资料导入、解析、RAG 检索、任务规划、流式生成、来源映射、核验面板和 Word/Markdown 导出。

脚注预览、文献元数据编辑、完整 GB/T 7714 参考文献生成和 Word 真实脚注结构是下一阶段重点增强项。书目信息不完整时，产品会标记待补充，不会自动编造。详细需求、状态和验收标准见 [产品需求书.md](产品需求书.md)。

## 技术架构

```text
Renderer（src）
  ↓ 白名单 IPC
Preload（electron/preload.js）
  ↓
Electron Main（electron/main.js）
  ├─ Agent Orchestrator
  │  ├─ Plan Schema + State Machine
  │  ├─ Provider Adapter
  │  ├─ Skill Runtime
  │  ├─ RAG Store
  │  ├─ Tool Registry + Cache
  │  └─ Quality Evaluator + Run Records
  ├─ Document Parser + Local OCR
  └─ Workspace Store
     ├─ SQLite：项目、文档元数据、草稿、运行记录
     ├─ 文件缓存：解析正文、RAG 索引、工具结果
     └─ 进程内 LRU：热数据和重复检索
```

### 目录说明

| 目录/文件 | 用途 |
| --- | --- |
| `src/` | 工作台和桌面宠物界面、渲染进程代码 |
| `electron/` | 主进程、IPC、Agent 编排、解析器、RAG、存储、导出 |
| `assets/skills/` | 可按任务加载的论文写作 Skill 和参考规则 |
| `assets/openpets/` | OpenPets 宠物素材 |
| `scripts/` | 数据分析、布局分析和构建辅助脚本 |
| `产品需求书.md` | 产品定位、需求、验收标准和迭代优先级 |
| `架构说明.md` | 模块职责和数据流说明 |
| `迭代基线.md` | 当前实现状态、测试结果和下一步风险 |

实际运行入口为 `electron/main.js` 和 `src/`。根目录的 `main.js`、`feed.html`、`writing-session.js` 是历史兼容副本，不是当前构建入口，已在 `.gitignore` 中排除。

## 本地运行

### 环境要求

- Windows
- Node.js `>= 22.5.0`（使用内置 `node:sqlite`）
- Python `>= 3.10`（仅数据分析和绘图功能需要）
- 可用的大模型服务 API Key（需要生成正文时配置）

### 安装与启动

```powershell
npm ci

# 数据分析和绘图功能（可选）
python -m pip install pandas openpyxl matplotlib

npm start
```

首次使用后，在工作台设置中配置模型服务商和 API Key。应用支持 DeepSeek、OpenAI、通义千问、智谱 GLM、Moonshot/Kimi 和 OpenRouter。

图片和扫描 PDF 需要本地 Tesseract 语言模型。按 [assets/ocr/README.md](assets/ocr/README.md) 配置 `chi_sim` 和 `eng`；未配置时资料会显示为需要 OCR，不会进入 RAG 证据库。

## 测试

运行单项测试：

```powershell
node electron/citation-format.test.js
node electron/document-parser.test.js
node electron/orchestrator.test.js
python scripts/data_analysis.test.py
```

运行完整回归测试：

```powershell
$tests = Get-ChildItem electron -Filter '*.test.js'
foreach ($test in $tests) { node $test.FullName }
python scripts/data_analysis.test.py
```

## 构建 Windows 安装包

```powershell
npm run dist:win
```

构建结果位于 `release/`，该目录已被 `.gitignore` 排除。GitHub Release 可将安装程序作为附件发布，不建议把安装包直接提交到源码仓库。

## 隐私与公开仓库说明

- API Key、聊天记录、项目资料和工具输出保存在用户本机应用数据目录，不随源码提交。
- 项目不内置公开学术检索、学校数据库登录、网页抓取或文献自动下载。
- 本地优先不等于完全离线：生成时会向用户选择的模型服务发送任务和必要的命中资料片段。
- `.local-runtime/`、运行数据库、缓存、导出文档和 Python 缓存均已加入忽略规则。

## 作品集信息

### 简历一句话

独立设计并开发 Windows 桌面端 AI 论文资料与写作工具，围绕“资料整理—RAG 证据检索—任务型写作—来源核验—引用导出”搭建完整闭环，并通过 Electron、SQLite、文档解析、OCR、Skill Runtime 和 Agent 状态机实现本地优先的论文工作流。

### 产品经理视角

- 目标用户：正在使用本地文献撰写中文社科论文的本科生和硕士生。
- 核心痛点：资料散落、查找和摘录耗时、写作缺乏文献支撑、脚注和参考文献整理繁琐。
- 核心指标：每周完成并经过来源核验的有效写作单元数。
- 当前重点：完善文献元数据、GB/T 7714 引用生成、证据逐条核验和真实用户评测集。

### 推荐展示顺序

```text
项目创建 → 导入资料 → 查看解析/索引状态 → 输入明确写作任务
→ 展示证据来源 → 查看核验项 → 导出 Word
```

## 许可证与第三方资产

源代码采用 MIT License。项目使用的第三方库、OpenPets 素材和 OCR 组件说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
