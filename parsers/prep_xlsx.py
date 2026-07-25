import pandas as pd
import re


def to_snake_case(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[\s]+", "_", name)
    name = re.sub(r"[^\w]", "", name)
    return name

DAY_MAP = {
    "seg": "segunda",
    "ter": "terca",
    "qua": "quarta",
    "qui": "quinta",
    "sex": "sexta",
    "sáb": "sabado",
    "dom": "domingo"
}

def expand_column_names(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [DAY_MAP.get(col, col) for col in df.columns]
    return df

def looks_like_date(series: pd.Series) -> bool:
    return series.astype(str).str.strip().str.match(r"^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$").all()


def fix_types(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.columns:
        series = df[col]

        if pd.api.types.is_numeric_dtype(series):
            if (series.dropna() % 1 == 0).all():
                df[col] = series.astype("Int64")
            else:
                df[col] = series.astype(float)
            continue

        tentativa = series.astype(str).str.replace(",", ".", regex=False)
        try:
            converted = pd.to_numeric(tentativa)
            if (converted.dropna() % 1 == 0).all():
                df[col] = converted.astype("Int64")
            else:
                df[col] = converted.astype(float)
            continue
        except (ValueError, TypeError):
            pass

        if looks_like_date(series):
            try:
                df[col] = pd.to_datetime(series, dayfirst=False).dt.strftime("%Y-%m-%d")
                continue
            except (ValueError, TypeError):
                pass

        bool_map = {
            "sim": True, "não": False, "nao": False,
            "true": True, "false": False, "1": True, "0": False
        }
        valores = series.astype(str).str.strip().str.lower()
        if valores.isin(bool_map.keys()).all():
            df[col] = valores.map(bool_map)
            continue

        df[col] = series.astype(str).str.strip()

    return df


def prep_xlsx(filepath: str) -> dict[str, pd.DataFrame]:
    xl = pd.ExcelFile(filepath)
    sheets = {}

    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name)
        if df.empty:
            continue
        df.dropna(how="all", inplace=True)
        df.columns = [to_snake_case(c) for c in df.columns]
        df = fix_types(df)
        df = expand_column_names(df)  # ← aqui
        sheets[sheet_name] = df

    return sheets


if __name__ == "__main__":
    import sys
    sheets = prep_xlsx(sys.argv[1])
    for name, df in sheets.items():
        print(f"\n--- Sheet: {name} ---")
        print(df.dtypes)
        print(df.head())