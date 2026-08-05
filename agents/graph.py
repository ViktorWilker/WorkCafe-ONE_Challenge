import os
import sys
import json
import uuid
import asyncio
from pathlib import Path
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langgraph.graph.message import add_messages
from dotenv import load_dotenv
from agents.chart_agent import build_charts_data
from ingestion.ingest import ingest_file

load_dotenv()
sys.path.append(str(Path(__file__).parent))
sys.path.append(str(Path(__file__).parent.parent / "ingestion"))

_broadcast_callback = None


def set_broadcast_callback(callback):
    global _broadcast_callback
    _broadcast_callback = callback


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    task: str
    filepath: str | None
    thread_id: str | None
    dataset_a: str | None
    dataset_b: str | None
    chunks_indexed: int
    charts_data: dict | None
    error: str | None


def router_node(state: AgentState) -> AgentState:
    return state


def ingest_node(state: AgentState) -> AgentState:
    try:
        filepath = Path(state["filepath"])
        print(f"[IngestNode] Processing: {filepath.name}")
        chunks = ingest_file(filepath)
        print(f"[IngestNode] Done: {chunks} chunks indexed")
        return {**state, "chunks_indexed": chunks}
    except Exception as e:
        return {**state, "error": str(e)}


def charts_node(state: AgentState) -> AgentState:
    try:
        print("[ChartsNode] Building charts data...")
        data = build_charts_data()
        print("[ChartsNode] Done")
        return {**state, "charts_data": data}
    except Exception as e:
        return {**state, "error": str(e)}


def broadcast_node(state: AgentState) -> AgentState:
    if state.get("charts_data") and _broadcast_callback:
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(_broadcast_callback(state["charts_data"]))
            else:
                loop.run_until_complete(_broadcast_callback(state["charts_data"]))
            print("[BroadcastNode] Charts pushed to clients")
        except Exception as e:
            print(f"[BroadcastNode] Error: {e}")
    return state


def chat_node(state: AgentState) -> AgentState:
    try:
        import os
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import SystemMessage
        from agents.tools import search_documents

        llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            google_api_key=os.getenv("GOOGLE_API_KEY_CHAT"),
            temperature=0.2
        ).bind_tools([search_documents])

        system = SystemMessage(content="""Você é um assistente interno de uma cafeteria. Seu papel é responder perguntas dos funcionários com base nos documentos internos da empresa.

Regras:
- Sempre busque informações antes de responder. Nunca responda de memória.
- Se a pergunta envolver valores numéricos, cite os números exatos encontrados.
- Se a resposta envolver múltiplos documentos, consolide as informações e apresente de forma clara.
- Se não encontrar informação suficiente, diga claramente que não encontrou nos documentos.
- Responda sempre em português brasileiro, de forma direta e objetiva.
- Quando relevante, mencione a fonte da informação (nome do arquivo).
- Nunca invente informações. Se não souber, diga que não encontrou nos documentos internos.
- Para fins de turno, considere: manhã = até 12:00, tarde = 12:00-18:00, noite = após 18:00.""")

        messages = [system] + state["messages"]
        response = llm.invoke(messages)

        return {**state, "messages": [response]}
    except Exception as e:
        import traceback
        traceback.print_exc()
        from langchain_core.messages import AIMessage
        return {**state, "messages": [AIMessage(content="Desculpe, não foi possível processar sua pergunta.")]}


def tool_node(state: AgentState) -> AgentState:
    from langchain_core.messages import ToolMessage
    from agents.tools import search_documents

    last = state["messages"][-1]
    tool_results = []

    for tool_call in last.tool_calls:
        if tool_call["name"] == "search_documents":
            result = search_documents.invoke(tool_call["args"])
            tool_results.append(
                ToolMessage(content=result, tool_call_id=tool_call["id"])
            )

    return {**state, "messages": tool_results}


def correlate_node(state: AgentState) -> AgentState:
    try:
        from correlate_agent import correlate
        dataset_a = state.get("dataset_a", "")
        dataset_b = state.get("dataset_b", "")
        print(f"[CorrelateNode] {dataset_a} vs {dataset_b}")
        result = correlate(dataset_a, dataset_b)
        return {**state, "messages": [AIMessage(content=json.dumps(result, ensure_ascii=False))]}
    except Exception as e:
        return {**state, "error": str(e)}


def route_by_task(state: AgentState) -> str:
    if state.get("error"):
        return "end"
    task = state.get("task", "")
    if task == "ingest":
        return "ingest"
    elif task == "chat":
        return "chat"
    elif task == "correlate":
        return "correlate"
    return "end"


def route_after_ingest(state: AgentState) -> str:
    if state.get("error"):
        return "end"
    return "charts"


def route_after_chat(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "end"


def build_graph(checkpointer=None) -> StateGraph:
    builder = StateGraph(AgentState)

    builder.add_node("router", router_node)
    builder.add_node("ingest", ingest_node)
    builder.add_node("charts", charts_node)
    builder.add_node("broadcast", broadcast_node)
    builder.add_node("chat", chat_node)
    builder.add_node("tools", tool_node)
    builder.add_node("correlate", correlate_node)

    builder.add_edge(START, "router")

    builder.add_conditional_edges(
        "router",
        route_by_task,
        {
            "ingest": "ingest",
            "chat": "chat",
            "correlate": "correlate",
            "end": END
        }
    )

    builder.add_conditional_edges(
        "ingest",
        route_after_ingest,
        {
            "charts": "charts",
            "end": END
        }
    )

    builder.add_edge("charts", "broadcast")
    builder.add_edge("broadcast", END)

    builder.add_conditional_edges(
        "chat",
        route_after_chat,
        {
            "tools": "tools",
            "end": END
        }
    )

    builder.add_edge("tools", "chat")
    builder.add_edge("correlate", END)

    return builder.compile(checkpointer=checkpointer)


def run_ingest(filepath: Path, graph=None) -> int:
    if graph is None:
        graph = build_graph()
    result = graph.invoke(
        {
            "messages": [],
            "task": "ingest",
            "filepath": str(filepath),
            "thread_id": None,
            "dataset_a": None,
            "dataset_b": None,
            "chunks_indexed": 0,
            "charts_data": None,
            "error": None
        },
        config={"configurable": {"thread_id": str(uuid.uuid4())}}
    )
    return result.get("chunks_indexed", 0)


def run_chat(question: str, thread_id: str, graph=None) -> str:
    if graph is None:
        graph = build_graph()
    result = graph.invoke(
        {
            "messages": [HumanMessage(content=question)],
            "task": "chat",
            "filepath": None,
            "thread_id": thread_id,
            "dataset_a": None,
            "dataset_b": None,
            "chunks_indexed": 0,
            "charts_data": None,
            "error": None
        },
        config={"configurable": {"thread_id": thread_id}}
    )
    last = result["messages"][-1]
    content = last.content
    if isinstance(content, list):
        content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content


def run_correlate(dataset_a: str, dataset_b: str, graph=None) -> str:
    if graph is None:
        graph = build_graph()
    result = graph.invoke(
        {
            "messages": [],
            "task": "correlate",
            "filepath": None,
            "thread_id": None,
            "dataset_a": dataset_a,
            "dataset_b": dataset_b,
            "chunks_indexed": 0,
            "charts_data": None,
            "error": None
        },
        config={"configurable": {"thread_id": str(uuid.uuid4())}}
    )
    last = result["messages"][-1]
    return last.content if last else ""


if __name__ == "__main__":
    g = build_graph()
    print(g.get_graph().draw_mermaid())