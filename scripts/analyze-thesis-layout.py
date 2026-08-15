import collections
import json
import statistics
import sys

import pdfplumber


def rounded(value):
    return round(float(value or 0), 1)


def main():
    pdf_path = sys.argv[1]
    with pdfplumber.open(pdf_path) as pdf:
        summary = {
            "pages": len(pdf.pages),
            "metadata": pdf.metadata,
            "page_sizes": collections.Counter(
                (rounded(page.width), rounded(page.height)) for page in pdf.pages
            ),
        }
        font_counts = collections.Counter()
        size_counts = collections.Counter()
        page_reports = []

        for page_number, page in enumerate(pdf.pages, 1):
            chars = [char for char in page.chars if char.get("text", "").strip()]
            for char in chars:
                font_counts[char.get("fontname", "unknown")] += 1
                size_counts[rounded(char.get("size"))] += 1

            text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            body_chars = [char for char in chars if rounded(char.get("size")) in {10.5, 11.0, 12.0}]
            lower_chars = [char for char in chars if char.get("top", 0) >= page.height * 0.72]
            page_reports.append({
                "page": page_number,
                "text_start": text[:180].replace("\n", " | "),
                "has_contents": "目录" in text[:200],
                "has_references": "参考文献" in text[:200],
                "char_count": len(chars),
                "font_top": collections.Counter(char.get("fontname", "unknown") for char in chars).most_common(4),
                "size_top": collections.Counter(rounded(char.get("size")) for char in chars).most_common(5),
                "body_bounds": None if not body_chars else [
                    rounded(min(char["x0"] for char in body_chars)),
                    rounded(min(char["top"] for char in body_chars)),
                    rounded(max(char["x1"] for char in body_chars)),
                    rounded(max(char["bottom"] for char in body_chars)),
                ],
                "lower_text": "".join(char.get("text", "") for char in sorted(lower_chars, key=lambda item: (rounded(item.get("top")), item.get("x0", 0))))[:220],
            })

        summary["font_top"] = font_counts.most_common(20)
        summary["size_top"] = size_counts.most_common(20)
        summary["candidate_pages"] = [
            report for report in page_reports
            if report["page"] <= 20
            or report["has_contents"]
            or report["has_references"]
            or report["page"] in {25, 30, 40, 60, 80, 100, 120, 140, 160, 180, 200}
        ]
        print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
