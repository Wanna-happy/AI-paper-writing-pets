# 本地 OCR 语言模型

随源码提供 Tesseract tessdata_fast 的 chi_sim.traineddata 与 eng.traineddata，运行时离线加载。

精确来源版本与文件 SHA256 见 models.json；许可证为 Apache-2.0，完整文本见 LICENSE。模型缺失或识别失败时资料标为需要 OCR / 解析失败，不进入 RAG。

运行 `npm run test:ocr-integration` 可使用合成图片验证真实模型识别。
