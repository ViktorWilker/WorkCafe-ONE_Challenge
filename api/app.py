import os
import sys
import uuid
import shutil
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).parent.parent / "agents"))
sys.path.append(str(Path(__file__).parent.parent / "ingestion"))

from graph import build_graph, run_chat, run_ingest, run_correlate, set_broadcast_callback
from chart_agent import build_charts_data
from langgraph.checkpoint.memory import MemorySaver

DOCS_DIR = Path(__file__).parent.parent / "docs"
ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".csv"}
BASE_DIR = Path(__file__).parent.parent

active_connections: list[WebSocket] = []
graph = None
_charts_cache = None

async def broadcast_charts(data: dict):
    for connection in active_connections.copy():
        try:
            await connection.send_json(data)
        except Exception:
            active_connections.remove(connection)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global graph
    set_broadcast_callback(broadcast_charts)
    checkpointer = MemorySaver()
    graph = build_graph(checkpointer=checkpointer)
    print("[API] Graph built and ready")
    yield


app = FastAPI(title="Cafe Agent API", lifespan=lifespan)

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str
    thread_id: str = None


class ChatResponse(BaseModel):
    answer: str
    thread_id: str


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    thread_id = request.thread_id or str(uuid.uuid4())
    answer = run_chat(request.question, thread_id, graph)
    return ChatResponse(answer=answer, thread_id=thread_id)


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return {"error": f"Tipo {suffix} não suportado. Use pdf, xlsx ou csv."}

    dest = DOCS_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    global _charts_cache
    _charts_cache = None  # invalida cache

    chunks = run_ingest(dest, graph)
    return {"message": f"Arquivo '{file.filename}' indexado.", "chunks": chunks}

class CorrelateRequest(BaseModel):
    dataset_a: str
    dataset_b: str

class CorrelateResponse(BaseModel):
    insights: list
    dataset_a: str
    dataset_b: str

@app.post("/correlate", response_model=CorrelateResponse)
async def correlate_endpoint(request: CorrelateRequest):
    import json
    raw = run_correlate(request.dataset_a, request.dataset_b, graph)
    print(f"[Correlate] raw output: {raw}")
    try:
        parsed = json.loads(raw)
    except Exception as e:
        print(f"[Correlate] parse error: {e}")
        parsed = {"insights": []}
    return CorrelateResponse(
        insights=parsed.get("insights", []),
        dataset_a=request.dataset_a,
        dataset_b=request.dataset_b
    )


@app.websocket("/ws/charts")
async def websocket_charts(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json(build_charts_data())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)

@app.get("/charts")
async def charts():
    global _charts_cache
    if _charts_cache is None:
        _charts_cache = build_charts_data()
    return _charts_cache


@app.get("/health")
async def health():
    return {"status": "ok"}

app.mount("/app", StaticFiles(directory=BASE_DIR / "web/workcafe", html=True), name="web")

@app.get("/documents")
async def list_documents():
    import chromadb
    CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_or_create_collection(name="cafe_docs")
    
    result = collection.get(include=["metadatas"])
    
    docs = {}
    for meta in result["metadatas"]:
        source = meta.get("source", "desconhecido")
        if source not in docs:
            docs[source] = {
                "name": source,
                "category": meta.get("category", "geral"),
                "type": meta.get("type", ""),
                "chunks": 0,
                "updated_at": meta.get("updated_at", "—")
            }
        docs[source]["chunks"] += 1
    
    return {"documents": list(docs.values())}