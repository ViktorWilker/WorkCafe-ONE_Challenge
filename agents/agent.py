import os
import warnings
warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from tools import search_documents

load_dotenv()

SYSTEM_PROMPT = """Você é um assistente interno de uma cafeteria. Seu papel é responder perguntas dos funcionários com base nos documentos internos da empresa.

Regras:
- Sempre busque informações antes de responder. Nunca responda de memória.
- Se a pergunta envolver valores numéricos, cite os números exatos encontrados.
- Se a resposta envolver múltiplos documentos, consolide as informações e apresente de forma clara.
- Se não encontrar informação suficiente, diga claramente que não encontrou nos documentos.
- Responda sempre em português brasileiro, de forma direta e objetiva.
- Quando relevante, mencione a fonte da informação (nome do arquivo).
- Antes de responder, reflita sobre o que foi perguntado e se a busca retornou informação suficiente.
- Se a resposta envolver comparações ou rankings (maior margem, menor custo, etc.), analise todos os resultados retornados antes de concluir.
- Se a pergunta for ambígua, interprete pelo contexto mais provável dentro de uma cafeteria.
- Nunca invente informações. Se não souber, diga que não encontrou nos documentos internos.
- Para fins de turno, considere: manhã = até 12:00, tarde = 12:00-18:00, noite = após 18:00."""


def build_agent(checkpointer=None):
    llm = ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        google_api_key=os.getenv("GOOGLE_API_KEY_CHAT"),
        temperature=0.2
    )

    return create_react_agent(
        model=llm,
        tools=[search_documents],
        prompt=SYSTEM_PROMPT,
        checkpointer=checkpointer
    )


def ask(question: str, thread_id: str = None) -> str:
    agent = build_agent()
    tid = thread_id or __import__("uuid").uuid4()
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config={"configurable": {"thread_id": str(tid)}}
    )
    last = result["messages"][-1]
    content = last.content
    if isinstance(content, list):
        content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content


if __name__ == "__main__":
    questions = [
        "quem trabalha no sábado de manhã?",
        "qual produto tem maior margem de lucro?",
        "qual o contato do fornecedor de café?",
        "tem leite em estoque?",
    ]
    for q in questions:
        print(f"\n{'='*60}")
        print(f"Pergunta: {q}")
        print(f"{'='*60}")
        print(ask(q))