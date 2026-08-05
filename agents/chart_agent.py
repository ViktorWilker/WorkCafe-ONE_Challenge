import os
import sys
import json
import chromadb
from pathlib import Path
from langchain_google_genai import ChatGoogleGenerativeAI
from dotenv import load_dotenv

load_dotenv()

CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"


def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        google_api_key=os.getenv("GOOGLE_API_KEY_CHARTS"),
        temperature=0
    )


def fetch_category(category: str, limit: int = 40) -> str:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection("cafe_docs")
    result = collection.get(where={"category": category})
    docs = result["documents"][:limit]
    return "\n".join(docs)


def ask_llm_for_chart(data: str, instruction: str, chart_id: str, chart_type: str, title: str) -> dict:
    llm = get_llm()
    prompt = f"""Você receberá dados de documentos de uma cafeteria e deve retornar um JSON para um gráfico.

Instrução: {instruction}

Dados:
{data}

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
    data = fetch_category("financeiro", limit=60)
    return ask_llm_for_chart(
        data=data,
        instruction="Identifique dados de faturamento ou receita por mês. Se houver múltiplas fontes de dados de vendas mensais, priorize os dados mais completos e recentes. Monte um gráfico de linha com os valores mensais em ordem cronológica. Labels devem ser os meses (jan, fev, mar...). Valores em reais.",
        chart_id="vendas_por_mes",
        chart_type="line",
        title="Faturamento Mensal"
    )


def chart_margem_por_produto() -> dict:
    data = fetch_category("cardapio")
    return ask_llm_for_chart(
        data=data,
        instruction="Identifique produtos e suas margens brutas percentuais. Selecione os top 10 com maior margem. Labels são os nomes dos produtos. Valores em porcentagem de 0 a 100.",
        chart_id="margem_por_produto",
        chart_type="bar",
        title="Top 10 Produtos por Margem Bruta (%)"
    )


def chart_estoque_vs_minimo() -> dict:
    data = fetch_category("estoque")
    return ask_llm_for_chart(
        data=data,
        instruction="Identifique insumos, quantidade atual e quantidade mínima. Selecione os 10 mais críticos (mais próximos ou abaixo do mínimo). Monte um gráfico de barras horizontais com dois datasets: Atual e Mínimo.",
        chart_id="estoque_vs_minimo",
        chart_type="bar_horizontal",
        title="Estoque Crítico vs Mínimo"
    )


def chart_distribuicao_categorias() -> dict:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection("cafe_docs")
    categories = ["cardapio", "rh", "estoque", "fornecedores", "financeiro", "clientes", "operacional"]
    counts = []
    labels = []
    for cat in categories:
        result = collection.get(where={"category": cat})
        count = len(result["ids"])
        if count > 0:
            counts.append(count)
            labels.append(cat)

    return {
        "id": "distribuicao_categorias",
        "type": "pie",
        "title": "Distribuição de Documentos por Categoria",
        "labels": labels,
        "datasets": [{"label": "Chunks", "data": counts}]
    }


def chart_rede_fornecedores() -> dict:
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection("cafe_docs")
    result = collection.get(where={"category": "fornecedores"})
    docs = result["documents"]

    nodes = []
    edges = []
    node_ids = set()

    for doc in docs:
        parts = [p.strip() for p in doc.split("|")]
        fornecedor = None
        produtos = []

        for part in parts:
            if part.lower().startswith("nome:"):
                fornecedor = part.split(":", 1)[1].strip()
            elif part.lower().startswith("produto:"):
                produtos = [p.strip() for p in part.split(":", 1)[1].split(",")]

        if not fornecedor:
            continue

        if fornecedor not in node_ids:
            nodes.append({"id": fornecedor, "type": "fornecedor"})
            node_ids.add(fornecedor)

        for produto in produtos:
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