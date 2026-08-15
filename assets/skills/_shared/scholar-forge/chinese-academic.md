# Chinese Academic Writing (中文学术规范)

## When to apply

- 学位论文 (硕士/博士)
- 中文期刊投稿
- 双语论文的中文摘要/关键词
- 国自然 / 省部级基金申请书

## GB/T 7714 citation (顺序编码制)

In-text: superscript `[1]` or `\cite{key}` with `gbt7714-numerical` bib style.

BibTeX journal article example:

```bibtex
@article{wang2024example,
  author  = {王某某 and 李某某},
  title   = {示例论文标题},
  journal = {计算机学报},
  year    = {2024},
  volume  = {47},
  number  = {3},
  pages   = {100--110},
  doi     = {10.xxxx/xxxxx}
}
```

Use `and` between Chinese authors in BibTeX; `et al.` → `等` in reference list (handled by style).

## Thesis structure (学位论文)

Typical order:

1. 封面 / 原创性声明 (template-provided)
2. 中文摘要 + 关键词
3. English abstract + keywords
4. 目录
5. 绪论 (背景、问题、贡献、结构)
6. 相关工作 / 文献综述
7. 方法 / 理论 / 系统设计
8. 实验与结果 / 案例分析
9. 总结与展望
10. 参考文献
11. 附录、致谢、攻读学位期间成果

Fetch **school-specific** template (清华、北大、中科院等) via venue intelligence — margins, chapter numbering, and declaration pages differ.

## Chinese prose norms

- 第三人称或「本文」为主语；避免口语化
- 摘要：目的、方法、结果、结论四要素（理工科）
- 英文摘要需与中文摘要信息对等，不可增删核心结论
- 术语首次出现：中文（English）或 英文缩写（中文全称）

## CNKI / 知网 workflow

1. User may have institutional VPN — search 知网 for 核心期刊、CSSCI、CSCD
2. Prefer 近五年文献 unless historical context needed
3. 学位论文引用：标注 `[D]` 类型
4. 无法访问时：请用户提供导出题录或 `.nbib` / `.ris`

## LaTeX for Chinese

- `ctex` document class: `ctexbook`, `ctexart`
- Bib style: `gbt7714-numerical` or `gbt7714-author-year`
- Template: see [templates/gb7714-thesis.tex](../templates/gb7714-thesis.tex)

## 基金申请书要点

- 立项依据：国内外现状 + 科学问题 + 研究价值
- 研究内容：3–5 条，可考核
- 技术路线：可用 figure 描述
- 创新点：与现有工作对比，避免空泛
- 研究基础：团队成果真实可查
