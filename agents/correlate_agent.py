import os
import sys
import json
import chromadb
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"

CATEGORY_DISPLAY = {
    "financeiro": "Faturamento",
    "cardapio": "Margem",
    "estoque": "Estoque",
    "fornecedores": "Fornecedores",
    "rh": "Base de Docs"
}

DISPLAY_TO_CATEGORY = {v: k for k, v in CATEGORY_DISPLAY.items()}


def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        google_api_key=os.getenv("GOOGLE_API_KEY_CORRELATE"),
        temperature=0.3
    )


def fetch_dataset(category: str) -> str:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection("cafe_docs")
    result = collection.get(where={"category": category})
    return "\n".join(result["documents"])

def build_company_context() -> str:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection("cafe_docs")

    context_chunks = []
    for category in ["financeiro", "operacional", "rh"]:
        result = collection.get(where={"category": category})
        if result["documents"]:
            context_chunks.extend(result["documents"][:5])

    return "\n".join(context_chunks)


def correlate(dataset_a: str, dataset_b: str) -> dict:
    cat_a = DISPLAY_TO_CATEGORY.get(dataset_a, dataset_a)
    cat_b = DISPLAY_TO_CATEGORY.get(dataset_b, dataset_b)

    data_a = fetch_dataset(cat_a)
    data_b = fetch_dataset(cat_b)
    context = build_company_context()

    llm = get_llm()

    prompt = f"""Você é um analista de dados especialista desta cafeteria. Você conhece profundamente o negócio e usa esse conhecimento para contextualizar suas análises.

CONTEXTO DA EMPRESA:
{context}

Com base nesse contexto, analise a correlação entre os dois conjuntos de dados abaixo. Suas análises devem sempre considerar as metas, a estrutura operacional e o perfil do negócio descrito acima.

CONJUNTO A — {dataset_a}:
{data_a}

CONJUNTO B — {dataset_b}:
{data_b}

Retorne APENAS um JSON válido, sem texto antes ou depois, neste formato exato:
{{
  "insights": [
    {{
      "titulo": "título curto do insight (máx 6 palavras)",
      "resumo": "uma frase direta com dado quantitativo quando possível (máx 15 palavras)",
      "detalhe": "explicação completa em 2-3 frases com contexto e recomendação"
    }}
  ]
}}

Regras:
- Gere entre 3 e 4 insights
- Cada insight deve ser independente e sobre uma correlação diferente
- Priorize dados quantitativos no resumo (%, R$, unidades)
- Seja direto e objetivo
- Nunca invente dados que não estejam nos conjuntos ou no contexto"""

    response = llm.invoke(prompt)
    content = response.content
    if isinstance(content, list):
        content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))

    content = content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]

    return json.loads(content.strip())


if __name__ == "__main__":
    result = correlate("Faturamento", "Estoque")
    print(result)