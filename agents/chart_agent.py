import os
import sys
import json
import chromadb
from pathlib import Path
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).parent.parent / "parsers"))

from parse_xlsx import parse_xlsx
from parse_csv import parse_csv

DOCS_DIR = Path(__file__).parent.parent / "docs"
CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"


def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        google_api_key=os.getenv("GOOGLE_API_KEY_CHARTS"),
        temperature=0
    )


def get_collection():
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_collection("cafe_docs")


def ask_llm_for_chart(data: dict, instruction: str, chart_id: str, chart_type: str, title: str) -> dict:
    llm = get_llm()
    prompt = f"""Você receberá dados de um documento de uma cafeteria e deve retornar um JSON para um gráfico.

Instrução: {instruction}

Dados:
{json.dumps(data, ensure_ascii=False, indent=2)}

Retorne APENAS um JSON válido neste formato, sem texto antes ou depois:
{{
  "id": "{chart_id}",
  "type": "{chart_type}",
  "title": "{title}",
  "labels": [...],
  "datasets": [
    {{"label": "nome", "data": [...]}}
  ]
}}"""

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


def chart_vendas_por_mes() -> dict:
    filepath = DOCS_DIR / "vendas_mensais.xlsx"
    if not filepath.exists():
        return {}
    parsed = parse_xlsx(str(filepath))
    return ask_llm_for_chart(
        data=parsed,
        instruction="Identifique as colunas de mês e receita/faturamento total. Monte um gráfico de linha com faturamento por mês em ordem cronológica.",
        chart_id="vendas_por_mes",
        chart_type="line",
        title="Faturamento Mensal"
    )


def chart_margem_por_produto() -> dict:
    filepath = DOCS_DIR / "cardapio.xlsx"
    if not filepath.exists():
        return {}
    parsed = parse_xlsx(str(filepath))
    return ask_llm_for_chart(
        data=parsed,
        instruction="Identifique as colunas de produto e margem bruta percentual. Selecione os top 10 produtos com maior margem. Os valores devem ser em porcentagem (0 a 100).",
        chart_id="margem_por_produto",
        chart_type="bar",
        title="Top 10 Produtos por Margem Bruta (%)"
    )


def chart_estoque_vs_minimo() -> dict:
    filepath = DOCS_DIR / "estoque_insumos.xlsx"
    if not filepath.exists():
        return {}
    parsed = parse_xlsx(str(filepath))
    return ask_llm_for_chart(
        data=parsed,
        instruction="Identifique as colunas de insumo, quantidade atual e quantidade mínima. Selecione os 10 insumos mais críticos (onde quantidade atual está mais próxima ou abaixo do mínimo). Monte um gráfico de barras horizontais com dois datasets: atual e mínimo.",
        chart_id="estoque_vs_minimo",
        chart_type="bar_horizontal",
        title="Estoque Crítico vs Mínimo"
    )


def chart_distribuicao_categorias() -> dict:
    collection = get_collection()
    categories = ["cardapio", "rh", "estoque", "fornecedores", "financeiro"]
    counts = []
    for cat in categories:
        result = collection.get(where={"category": cat})
        counts.append(len(result["ids"]))

    return {
        "id": "distribuicao_categorias",
        "type": "pie",
        "title": "Distribuição de Documentos por Categoria",
        "labels": categories,
        "datasets": [{"label": "Chunks", "data": counts}]
    }


def chart_rede_fornecedores() -> dict:
    filepath = DOCS_DIR / "fornecedores.csv"
    if not filepath.exists():
        return {}

    parsed = parse_csv(str(filepath))
    data = parsed["data"]

    nodes = []
    edges = []
    node_ids = set()

    for row in data:
        fornecedor = row.get("nome", "")
        produtos = str(row.get("produto", "")).split(",")

        if fornecedor not in node_ids:
            nodes.append({"id": fornecedor, "type": "fornecedor"})
            node_ids.add(fornecedor)

        for produto in produtos:
            produto = produto.strip()
            if produto and produto not in node_ids:
                nodes.append({"id": produto, "type": "categoria"})
                node_ids.add(produto)
            if produto:
                edges.append({"source": fornecedor, "target": produto})

    return {
        "id": "rede_fornecedores",
        "type": "graph",
        "title": "Rede de Fornecedores",
        "nodes": nodes,
        "edges": edges
    }


def build_charts_data() -> dict:
    charts = [
        chart_distribuicao_categorias(),
        chart_rede_fornecedores(),
        chart_vendas_por_mes(),
        chart_margem_por_produto(),
        chart_estoque_vs_minimo(),
    ]
    return {
        "type": "charts_update",
        "charts": [c for c in charts if c]
    }


if __name__ == "__main__":
    data = build_charts_data()
    print(json.dumps(data, ensure_ascii=False, indent=2))