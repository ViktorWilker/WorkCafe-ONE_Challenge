import re
from pypdf import PdfReader


def clean_text(text: str) -> str:
    lines = text.split("\n")
    result = []
    buffer = ""

    for line in lines:
        line = line.strip()
        if not line:
            if buffer:
                result.append(buffer)
                buffer = ""
            continue
        if buffer:
            if not re.search(r"[.!?:]\s*$", buffer):
                buffer += " " + line
            else:
                result.append(buffer)
                buffer = line
        else:
            buffer = line

    if buffer:
        result.append(buffer)

    return "\n".join(result)


def detect_header_footer(pages: list[str]) -> tuple[str | None, str | None]:
    if len(pages) < 3:
        return None, None

    first_lines = [p.split("\n")[0].strip() for p in pages if p.strip()]
    last_lines = [p.split("\n")[-1].strip() for p in pages if p.strip()]

    header = first_lines[0] if len(set(first_lines)) == 1 else None
    footer = last_lines[0] if len(set(last_lines)) == 1 else None

    return header, footer


def prep_pdf(filepath: str) -> list[dict]:
    reader = PdfReader(filepath)
    raw_pages = [page.extract_text() or "" for page in reader.pages]

    header, footer = detect_header_footer(raw_pages)
    pages = []

    for i, text in enumerate(raw_pages):
        lines = text.split("\n")
        if header and lines and lines[0].strip() == header:
            lines = lines[1:]
        if footer and lines and lines[-1].strip() == footer:
            lines = lines[:-1]

        cleaned = clean_text("\n".join(lines))
        if cleaned.strip():
            pages.append({"page": i + 1, "content": cleaned})

    return pages


if __name__ == "__main__":
    import sys
    import json
    pages = prep_pdf(sys.argv[1])
    print(json.dumps(pages, ensure_ascii=False, indent=2))