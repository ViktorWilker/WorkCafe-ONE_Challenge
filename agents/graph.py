import os
import sys
import asyncio
import json
from ingestion.ingest import ingest_file
from agents.chart_agent import build_charts_data
from pathlib import Path
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).parent.parent / "ingestion"))

_broadcast_callback = None


def set_broadcast_callback(callback):
    global _broadcast_callback
    _broadcast_callback = callback


class AgentState(TypedDict):
    task: str
    filepath: str | None
    question: str | None
    thread_id: str | None
    dataset_a: str | None
    dataset_b: str | None
    chunks_indexed: int
    charts_data: dict | None
    answer: str | None
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
            asyncio.run(_broadcast_callback(state["charts_data"]))
            print("[BroadcastNode] Charts pushed to clients")
        except Exception as e:
            print(f"[BroadcastNode] Error: {e}")
    return state


def chat_node(state: AgentState) -> AgentState:
    try:
        from agent import build_agent
        print(f"[ChatNode] Question: {state['question']}")
        agent = build_agent()
        result = agent.invoke(
            {"messages": [{"role": "user", "content": state["question"]}]},
            config={"configurable": {"thread_id": state.get("thread_id", "default")}}
        )
        last = result["messages"][-1]
        content = last.content
        if isinstance(content, list):
            content = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
        print(f"[ChatNode] Done")
        return {**state, "answer": content}
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

def correlate_node(state: AgentState) -> AgentState:
    try:
        from correlate_agent import correlate
        dataset_a = state.get("dataset_a", "")
        dataset_b = state.get("dataset_b", "")
        print(f"[CorrelateNode] {dataset_a} vs {dataset_b}")
        result = correlate(dataset_a, dataset_b)
        return {**state, "answer": json.dumps(result, ensure_ascii=False)}
    except Exception as e:
        return {**state, "error": str(e)}

def build_graph(checkpointer=None) -> StateGraph:
    builder = StateGraph(AgentState)

    builder.add_node("router", router_node)
    builder.add_node("ingest", ingest_node)
    builder.add_node("charts", charts_node)
    builder.add_node("broadcast", broadcast_node)
    builder.add_node("chat", chat_node)
    builder.add_node("correlate", correlate_node)
    builder.add_edge("correlate", END)
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
    builder.add_edge("chat", END)

    return builder.compile(checkpointer=checkpointer)


def run_ingest(filepath: Path, graph=None) -> int:
    if graph is None:
        graph = build_graph()
    result = graph.invoke({
        "task": "ingest",
        "filepath": str(filepath),
        "question": None,
        "thread_id": None,
        "chunks_indexed": 0,
        "charts_data": None,
        "answer": None,
        "error": None
    })
    return result.get("chunks_indexed", 0)


def run_chat(question: str, thread_id: str, graph=None) -> str:
    if graph is None:
        graph = build_graph()
    result = graph.invoke(
        {
            "task": "chat",
            "filepath": None,
            "question": question,
            "thread_id": thread_id,
            "chunks_indexed": 0,
            "charts_data": None,
            "answer": None,
            "error": None
        },
        config={"configurable": {"thread_id": thread_id}}
    )
    return result.get("answer", "Erro ao processar a pergunta.")

def run_correlate(dataset_a: str, dataset_b: str, graph=None) -> str:
    import uuid
    if graph is None:
        graph = build_graph()
    result = graph.invoke(
        {
            "task": "correlate",
            "filepath": None,
            "question": None,
            "thread_id": None,
            "dataset_a": dataset_a,
            "dataset_b": dataset_b,
            "chunks_indexed": 0,
            "charts_data": None,
            "answer": None,
            "error": None
        },
        config={"configurable": {"thread_id": str(uuid.uuid4())}}
    )
    return result.get("answer", "Erro ao processar correlação.")


if __name__ == "__main__":
    g = build_graph()
    print(g.get_graph().draw_mermaid())