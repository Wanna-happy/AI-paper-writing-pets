import collections
import json
import re
import sys
import zipfile

from docx import Document
from lxml import etree


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def length_cm(value):
    return None if value is None else round(value.cm, 2)


def pt(value):
    return None if value is None else round(value.pt, 2)


def style_report(style):
    font = style.font
    paragraph = style.paragraph_format
    element = style._element
    east_asia = element.xpath("./w:rPr/w:rFonts/@w:eastAsia")
    ascii_font = element.xpath("./w:rPr/w:rFonts/@w:ascii")
    return {
        "name": style.name,
        "type": str(style.type),
        "font": font.name or (ascii_font[0] if ascii_font else None),
        "eastAsia": east_asia[0] if east_asia else None,
        "sizePt": pt(font.size),
        "bold": font.bold,
        "alignment": None if paragraph.alignment is None else str(paragraph.alignment),
        "firstLineCm": length_cm(paragraph.first_line_indent),
        "leftIndentCm": length_cm(paragraph.left_indent),
        "spaceBeforePt": pt(paragraph.space_before),
        "spaceAfterPt": pt(paragraph.space_after),
        "lineSpacing": paragraph.line_spacing,
    }


def paragraph_report(paragraph, index):
    text = paragraph.text.strip()
    paragraph_format = paragraph.paragraph_format
    run_fonts = collections.Counter()
    run_sizes = collections.Counter()
    for run in paragraph.runs:
        if not run.text.strip():
            continue
        run_fonts[run.font.name or "(style)"] += len(run.text)
        if run.font.size:
            run_sizes[round(run.font.size.pt, 1)] += len(run.text)
    return {
        "index": index,
        "text": text[:180],
        "chars": len(text),
        "style": paragraph.style.name if paragraph.style is not None else "(none)",
        "alignment": None if paragraph_format.alignment is None else str(paragraph_format.alignment),
        "firstLineCm": length_cm(paragraph_format.first_line_indent),
        "lineSpacing": paragraph_format.line_spacing,
        "spaceBeforePt": pt(paragraph_format.space_before),
        "spaceAfterPt": pt(paragraph_format.space_after),
        "runFonts": run_fonts.most_common(4),
        "runSizes": run_sizes.most_common(4),
    }


def main():
    source = sys.argv[1]
    document = Document(source)
    paragraphs = [paragraph_report(paragraph, index) for index, paragraph in enumerate(document.paragraphs) if paragraph.text.strip()]
    body_paragraphs = [item for item in paragraphs if item["style"] in {"Normal", "正文", "Body Text", "Body Text 2"} and item["chars"] >= 30]
    result = {
        "source": source,
        "sections": [{
            "pageWidthCm": length_cm(section.page_width),
            "pageHeightCm": length_cm(section.page_height),
            "topMarginCm": length_cm(section.top_margin),
            "bottomMarginCm": length_cm(section.bottom_margin),
            "leftMarginCm": length_cm(section.left_margin),
            "rightMarginCm": length_cm(section.right_margin),
            "headerDistanceCm": length_cm(section.header_distance),
            "footerDistanceCm": length_cm(section.footer_distance),
        } for section in document.sections],
        "styles": [style_report(style) for style in document.styles if style.type == 1 and style.name in {
            "Normal", "正文", "Title", "标题 1", "标题 2", "标题 3", "Heading 1", "Heading 2", "Heading 3", "Footnote Text"
        }],
        "paragraphCount": len(paragraphs),
        "bodyParagraphChars": {
            "count": len(body_paragraphs),
            "median": None if not body_paragraphs else sorted(item["chars"] for item in body_paragraphs)[len(body_paragraphs) // 2],
            "p25": None if not body_paragraphs else sorted(item["chars"] for item in body_paragraphs)[len(body_paragraphs) // 4],
            "p75": None if not body_paragraphs else sorted(item["chars"] for item in body_paragraphs)[len(body_paragraphs) * 3 // 4],
            "max": None if not body_paragraphs else max(item["chars"] for item in body_paragraphs),
        },
        "paragraphSamples": paragraphs[:80],
        "footnotes": [],
    }

    with zipfile.ZipFile(source) as archive:
        if "word/footnotes.xml" in archive.namelist():
            root = etree.fromstring(archive.read("word/footnotes.xml"))
            for footnote in root.xpath("//w:footnote", namespaces=WORD_NS):
                footnote_id = footnote.get(f"{{{WORD_NS['w']}}}id")
                if footnote_id in {"-1", "0"}:
                    continue
                text = "".join(footnote.xpath(".//w:t/text()", namespaces=WORD_NS)).strip()
                if text:
                    result["footnotes"].append({"id": footnote_id, "text": text[:300], "chars": len(text)})

    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
