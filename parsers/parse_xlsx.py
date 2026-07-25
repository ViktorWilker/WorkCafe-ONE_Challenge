import json
import sys
from prep_xlsx import prep_xlsx


def parse_xlsx(filepath: str) -> dict:
    sheets = prep_xlsx(filepath)
    content = {}

    for sheet_name, df in sheets.items():
        content[sheet_name] = {
            "columns": list(df.columns),
            "total_rows": len(df),
            "data": df.to_dict(orient="records")
        }

    return {
        "type": "xlsx",
        "file": filepath,
        "sheets": list(content.keys()),
        "content": content
    }


if __name__ == "__main__":
    result = parse_xlsx(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))