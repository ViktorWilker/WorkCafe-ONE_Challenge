import json
import sys
from prep_pdf import prep_pdf


def parse_pdf(filepath: str) -> dict:
    pages = prep_pdf(filepath)
    return {
        "type": "pdf",
        "file": filepath,
        "total_pages": len(pages),
        "pages": pages
    }


if __name__ == "__main__":
    result = parse_pdf(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))