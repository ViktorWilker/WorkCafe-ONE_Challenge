import pandas as pd
import chardet
import re


def detect_encoding(filepath: str) -> str:
    with open(filepath, "rb") as f:
        result = chardet.detect(f.read())
    return result["encoding"] or "utf-8"


def detect_separator(filepath: str, encoding: str) -> str:
    with open(filepath, "r", encoding=encoding) as f:
        first_line = f.readline()
    return ";" if first_line.count(";") > first_line.count(",") else ","


def to_snake_case(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[\s]+", "_", name)
    name = re.sub(r"[^\w]", "", name)
    return name


def looks_like_date(series: pd.Series) -> bool:
    return series.astype(str).str.strip().str.match(r"^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$").all()


def fix_types(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        tentativa = df[col].astype(str).str.replace(",", ".", regex=False)
        try:
            converted = pd.to_numeric(tentativa)
            if (converted % 1 == 0).all():
                df[col] = converted.astype("Int64")
            else:
                df[col] = converted.astype(float)
            continue
        except (ValueError, TypeError):
            pass

        if looks_like_date(df[col]):
            try:
                df[col] = pd.to_datetime(df[col], dayfirst=True).dt.strftime("%Y-%m-%d")
                continue
            except (ValueError, TypeError):
                pass

        bool_map = {
            "sim": True, "não": False, "nao": False,
            "true": True, "false": False, "1": True, "0": False
        }
        valores = df[col].astype(str).str.strip().str.lower()
        if valores.isin(bool_map.keys()).all():
            df[col] = valores.map(bool_map)
            continue

        df[col] = df[col].astype(str).str.strip()

    return df


def prep_csv(filepath: str) -> pd.DataFrame:
    encoding = detect_encoding(filepath)
    separator = detect_separator(filepath, encoding)
    df = pd.read_csv(filepath, encoding=encoding, sep=separator)
    df.dropna(how="all", inplace=True)
    df.columns = [to_snake_case(c) for c in df.columns]
    df = fix_types(df)
    return df


if __name__ == "__main__":
    import sys
    df = prep_csv(sys.argv[1])
    print(df.dtypes)
    print(df.head())