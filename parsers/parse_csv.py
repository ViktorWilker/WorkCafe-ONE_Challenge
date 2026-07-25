import json
import sys
import pandas as pd
from prep_csv import prep_csv


def parse_csv(filepath: str) -> dict:
    df = prep_csv(filepath)
    return {
        "type": "csv",
        "file": filepath,
        "columns": list(df.columns),
        "total_rows": len(df),
        "data": df.to_dict(orient="records")
    }


if __name__ == "__main__":
    result = parse_csv(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False, indent=2))