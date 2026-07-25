import os
import chromadb
import unicodedata
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

CHROMA_DIR = Path(__file__).parent.parent / "chroma_db"

_collection = None
_tfidf = None
_tfidf_docs = None
_tfidf_ids = None
_embeddings = None


def normalize(text: str) -> str:
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("utf-8").lower()


def get_collection():
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        _collection = client.get_collection("cafe_docs")
    return _collection


def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=os.getenv("GOOGLE_API_KEY_EMBED")
        )
    return _embeddings


def get_weights(category: str = None) -> tuple[float, float]:
    if category == "rh":
        return 0.85, 0.15
    elif category == "fornecedores":
        return 0.5, 0.5
    elif category in ("estoque", "cardapio"):
        return 0.65, 0.35
    else:
        return 0.7, 0.3


def build_tfidf_index(category: str = None):
    global _tfidf, _tfidf_docs, _tfidf_ids
    collection = get_collection()

    result = collection.get(where={"category": category}) if category else collection.get()
    _tfidf_docs = result["documents"]
    _tfidf_ids = result["ids"]

    _tfidf = TfidfVectorizer()
    _tfidf.fit([normalize(d) for d in _tfidf_docs])


def hybrid_search(query: str, category: str = None, top_k: int = 5) -> list[dict]:
    collection = get_collection()
    embeddings = get_embeddings()

    build_tfidf_index(category)
    semantic_weight, tfidf_weight = get_weights(category)

    query_vector = embeddings.embed_query(query)
    chroma_filter = {"category": category} if category else None

    semantic_results = collection.query(
        query_embeddings=[query_vector],
        n_results=top_k * 2,
        where=chroma_filter,
        include=["documents", "metadatas", "distances"]
    )

    semantic_docs = semantic_results["documents"][0]
    semantic_ids = semantic_results["ids"][0]
    semantic_distances = semantic_results["distances"][0]

    max_dist = max(semantic_distances) if semantic_distances else 1
    semantic_scores = {
        sid: 1 - (d / max_dist)
        for sid, d in zip(semantic_ids, semantic_distances)
    }

    query_tfidf = _tfidf.transform([normalize(query)])
    doc_tfidf = _tfidf.transform([normalize(d) for d in _tfidf_docs])
    tfidf_scores_raw = (doc_tfidf @ query_tfidf.T).toarray().flatten()

    max_tfidf = tfidf_scores_raw.max() if tfidf_scores_raw.max() > 0 else 1
    tfidf_scores = {
        _tfidf_ids[i]: float(tfidf_scores_raw[i] / max_tfidf)
        for i in range(len(_tfidf_ids))
    }

    all_ids = set(semantic_scores.keys()) | set(tfidf_scores.keys())
    hybrid_scores = {
        doc_id: semantic_weight * semantic_scores.get(doc_id, 0) + tfidf_weight * tfidf_scores.get(doc_id, 0)
        for doc_id in all_ids
    }

    top_ids = sorted(hybrid_scores, key=lambda x: hybrid_scores[x], reverse=True)[:top_k]

    all_docs = dict(zip(semantic_ids, semantic_docs))
    all_meta = dict(zip(semantic_ids, semantic_results["metadatas"][0]))

    missing_ids = [i for i in top_ids if i not in all_docs]
    if missing_ids:
        full_result = collection.get(ids=missing_ids)
        for doc_id, doc, meta in zip(full_result["ids"], full_result["documents"], full_result["metadatas"]):
            all_docs[doc_id] = doc
            all_meta[doc_id] = meta

    return [
        {
            "id": doc_id,
            "content": all_docs.get(doc_id, ""),
            "metadata": all_meta.get(doc_id, {}),
            "score": round(hybrid_scores[doc_id], 4)
        }
        for doc_id in top_ids
        if doc_id in all_docs
    ]