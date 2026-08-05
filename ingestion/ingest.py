import os
import sys
import time
import chromadb
from pathlib import Path
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).parent.parent / "parsers"))

from parse_csv import parse_csv
from parse_xlsx import parse_xlsx
from parse_pdf import parse_pdf

DOCS_DIR = Path(__file__).parent.parent / "docs"
CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"

KNOWN_CATEGORIES = ["financeiro", "rh", "estoque", "fornecedores", "cardapio", "clientes", "operacional"]

CATEGORY_MAP = {
    "cardapio.xlsx": "cardapio",
    "escala_funcionarios.xlsx": "rh",
    "estoque_insumos.xlsx": "estoque",
    "ficha_tecnica.pdf": "cardapio",
    "fornecedores.csv": "fornecedores",
    "funcionarios.csv": "rh",
    "pedidos_fornecedores.xlsx": "fornecedores",
    "politica_rh.pdf": "rh",
    "procedimentos_operacionais.pdf": "operacional",
    "relatorio_gerencial.pdf": "financeiro",
    "vendas_mensais.xlsx": "financeiro",
    "avaliacoes_clientes.csv": "clientes",
}


def get_embeddings():
    return GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=os.getenv("GOOGLE_API_KEY_EMBED")
    )


def row_to_text(row: dict) -> str:
    return " | ".join(f"{k}: {v}" for k, v in row.items() if v not in (None, "", "nan", "None"))


def chunk_csv(parsed: dict) -> list[dict]:
    return [{"text": row_to_text(row), "source": parsed["file"]} for row in parsed["data"]]


def chunk_xlsx(parsed: dict) -> list[dict]:
    chunks = []
    for sheet_name, sheet in parsed["content"].items():
        for row in sheet["data"]:
            text = f"[{sheet_name}] {row_to_text(row)}"
            chunks.append({"text": text, "source": parsed["file"]})
    return chunks


def chunk_pdf(parsed: dict) -> list[dict]:
    chunks = []
    for page in parsed["pages"]:
        paragraphs = [p.strip() for p in page["content"].split("\n") if p.strip()]
        for paragraph in paragraphs:
            chunks.append({"text": paragraph, "source": parsed["file"]})
    return chunks


def parse_file(filepath: Path) -> dict | None:
    suffix = filepath.suffix.lower()
    if suffix == ".csv":
        return parse_csv(str(filepath))
    elif suffix == ".xlsx":
        return parse_xlsx(str(filepath))
    elif suffix == ".pdf":
        return parse_pdf(str(filepath))
    return None


def chunk_file(parsed: dict) -> list[dict]:
    if parsed["type"] == "csv":
        return chunk_csv(parsed)
    elif parsed["type"] == "xlsx":
        return chunk_xlsx(parsed)
    elif parsed["type"] == "pdf":
        return chunk_pdf(parsed)
    return []

def infer_category(filepath: Path, parsed: dict) -> str:
    try:
        sample = ""
        if parsed["type"] == "csv":
            rows = parsed["data"][:5]
            sample = "\n".join(str(r) for r in rows)
        elif parsed["type"] == "xlsx":
            for sheet in parsed["content"].values():
                rows = sheet["data"][:5]
                sample = "\n".join(str(r) for r in rows)
                break
        elif parsed["type"] == "pdf":
            sample = parsed["pages"][0]["content"][:500] if parsed["pages"] else ""

        llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            google_api_key=os.getenv("GOOGLE_API_KEY_CHARTS"),
            temperature=0
        )

        prompt = f"""Você é um classificador de documentos de uma cafeteria.
Com base no nome do arquivo e amostra do conteúdo abaixo, escolha UMA categoria:

Categorias disponíveis: {', '.join(KNOWN_CATEGORIES)}

Nome do arquivo: {filepath.name}
Amostra do conteúdo:
{sample}

Responda APENAS com o nome da categoria, sem explicação."""

        response = llm.invoke(prompt)
        content = response.content
        if isinstance(content, list):
            content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
            content = content.strip().lower()

        if content in KNOWN_CATEGORIES:
            return content
        return "geral"
    except Exception as e:
        print(f"[InferCategory] Error: {e}")
        return "geral"

def ingest_file(filepath: Path) -> int:
    embeddings = get_embeddings()
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(name="cafe_docs")

    existing = collection.get(where={"source": filepath.name})
    if existing["ids"]:
        collection.delete(ids=existing["ids"])

    parsed = parse_file(filepath)
    if not parsed:
        return 0

    chunks = chunk_file(parsed)
    if not chunks:
        return 0

    category = CATEGORY_MAP.get(filepath.name) or infer_category(filepath, parsed)
    print(f"[IngestFile] Category: {category}")

    batch_size = 10
    total = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [c["text"] for c in batch]
        vectors = embeddings.embed_documents(texts)

        ids = [f"{filepath.stem}_{i + j}" for j in range(len(batch))]
        metadatas = [
            {
                "source": filepath.name,
                "category": category,
                "type": parsed["type"]
            }
            for _ in batch
        ]

        collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metadatas)
        total += len(batch)
        time.sleep(8)

    return total


def ingest():
    embeddings = get_embeddings()
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(name="cafe_docs")

    for filepath in DOCS_DIR.iterdir():
        if filepath.suffix.lower() not in (".csv", ".xlsx", ".pdf"):
            continue

        print(f"Processing: {filepath.name}")
        existing = collection.get(where={"source": filepath.name})
        if existing and len(existing["ids"]) > 0:
            print(f"  → already indexed, skipping")
            continue

        parsed = parse_file(filepath)
        if not parsed:
            continue

        chunks = chunk_file(parsed)
        if not chunks:
            continue

        batch_size = 10
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            texts = [c["text"] for c in batch]
            vectors = embeddings.embed_documents(texts)

            ids = [f"{filepath.stem}_{i + j}" for j in range(len(batch))]
            metadatas = [
                {
                    "source": filepath.name,
                    "category": CATEGORY_MAP.get(filepath.name, "geral"),
                    "type": parsed["type"]
                }
                for _ in batch
            ]

            collection.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metadatas)
            print(f"  → batch {i // batch_size + 1}: {len(batch)} chunks indexed")
            time.sleep(8)

        time.sleep(15)

    print("\nIngestion complete.")



if __name__ == "__main__":
    ingest()