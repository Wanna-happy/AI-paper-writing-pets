# Third-party notices

## Local DOCX preview

DOCX preview bundles [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) 0.3.7 (Apache-2.0) and [JSZip](https://github.com/Stuk/jszip) 3.10.1 (MIT). Licenses are preserved in `src/vendor/docx-preview.LICENSE` and `src/vendor/jszip.LICENSE`. The self-contained preview frame embeds these pinned local scripts; document rendering uses no online document service. `scripts/prepare-docx-renderer.cjs` verifies the renderer archive integrity before extracting assets.

## Local spreadsheet preview

Spreadsheet preview bundles SheetJS Community Edition 0.20.3 (Apache-2.0), sourced from the [official standalone distribution](https://docs.sheetjs.com/docs/getting-started/installation/standalone/). The license and asset SHA-256 hashes are preserved in `src/vendor/xlsx.LICENSE` and `src/vendor/xlsx-manifest.json`. Files are parsed locally; Microsoft Excel and online document services are not required. The application adds read-only worksheet navigation and basic OOXML cell-style rendering.

## Bundled Python and scientific packages

The Windows package includes official CPython 3.14.8 embeddable binaries and Windows binary wheels from PyPI. Source URLs, versions and SHA-256 digests are recorded in `python/runtime-manifest.json` beside the installed application resources. Python's license is included with the runtime; individual package licenses are preserved in their `.dist-info` directories under `python/Lib/site-packages`.

The runtime includes numpy, pandas, scipy, matplotlib, openpyxl and their binary dependencies. End users do not need a separate Python or Node.js installation. Dependencies execute offline within the existing Windows LPAC and Job Object sandbox for generated analysis code.

The runtime also includes pip (MIT license), used only by the application's trusted, project-scoped wheel download stage. That stage retrieves binary wheels from PyPI, verifies their published SHA-256 hashes, and makes them available to the network-denied analysis sandbox. Licenses for dynamically installed packages remain in each project's wheel metadata.

## OpenPets

This application includes original animated pet assets and sprite animation conventions from [OpenPets](https://openpets.dev/), sourced from [github.com/alvinunreal/openpets](https://github.com/alvinunreal/openpets).

Bundled original pets:

- Ember Pup (`ember-pup-openpets`)
- Shadow Kit (`shadow-kit-openpets`)
- Nori (`nori-openpets`)

Only pets identified by the OpenPets catalog as “OpenPets Original” are bundled. Community/fan-made catalog entries are not included.

MIT License

Copyright (c) 2026 OpenPets

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Nature Skills

The application's evidence-first research workflow was informed by the public workflow design of [Nature Skills](https://github.com/Yuan1z0825/nature-skills), including task routing, claim-evidence-boundary checks, terminology consistency, section-aware drafting, conservative citation handling, and final groundedness review.

No Nature Skills package is required at runtime. The application contains an independently adapted implementation for local RAG and Chinese degree-thesis writing. Nature Skills is licensed under the Apache License 2.0. A copy of that license is available at <https://www.apache.org/licenses/LICENSE-2.0>.

Nature Skills repository revision reviewed: `fac88c419fa0ad642014609e3084f52629cfee52` (accessed 2026-07-28).

## Tesseract OCR language models

Bundled chi_sim and eng traineddata are from [tesseract-ocr/tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast), licensed under Apache-2.0. Exact revision and SHA256 checksums are recorded in assets/ocr/models.json. The complete license is bundled in assets/ocr/LICENSE.

## Bundled Python empirical-analysis libraries

The offline CPython runtime uses official Python and PyPI wheel artifacts, with versions, source URLs and SHA-256 hashes recorded in `assets/python/runtime-lock.json`. Original package license files and distribution metadata are included in the installed runtime. Additional empirical libraries include statsmodels (BSD-3-Clause), scikit-learn (BSD-3-Clause), linearmodels (NCSA), lifelines (MIT), dtaidistance (Apache-2.0), formulaic (MIT), joblib (BSD-3-Clause), and wrapt (BSD-2-Clause). Their transitive dependencies are recorded in the same manifest.

Joblib, scikit-learn and wrapt are pinned to tested compatible versions for the network-denied Windows sandbox. Statistical execution uses one process; the application does not modify these libraries' source or relax the sandbox's network restrictions.
# 文件预览图标

文件预览控件使用 Microsoft [Codicons](https://github.com/microsoft/vscode-codicons)，版本 0.0.39，许可 CC BY 4.0。图标未修改；原始许可随 `node_modules/@vscode/codicons/LICENSE` 一同分发。

## Imported research skill collections

The research skill library uses the user-provided archives from [Auto-Empirical-Research-Skills](https://github.com/brycewang-stanford/Auto-Empirical-Research-Skills) and [Paper-WorkFlow](https://github.com/brycewang-stanford/Paper-WorkFlow). Archive revisions and SHA-256 checksums are recorded in `assets/research-skills/IMPORT.json`. Paper-WorkFlow fills collection 69 in the main catalog.

Upstream skill sources, references, attribution and license files are preserved in `assets/research-skills`. This collection contains multiple authors and licenses; the application's MIT license does not relicense those materials. Per-skill license metadata is retained in `catalog/skills-enriched.json` and upstream license reports. Entries marked restricted are excluded from runtime selection. Inclusion in the local library does not establish permission to redistribute every collection commercially; review the upstream license files before distribution.

Collections `49-voidborne-d-humanize-chinese` and `54-scdenney-open-science-skills` are retained only in the local source archive and excluded from the distributable app. The package verifier rejects their source paths. The Significance-Search source is likewise excluded. Catalog audit metadata does not enable or grant permission to execute the excluded sources.

