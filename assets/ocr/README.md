# 本地 OCR 语言模型

应用只从本目录读取 Tesseract 语言模型，不会自动联网下载。

需要以下文件：

- `chi_sim.traineddata.gz`
- `eng.traineddata.gz`

模型缺失时，图片和扫描 PDF 会保留为“需要 OCR”，不会进入 RAG。
