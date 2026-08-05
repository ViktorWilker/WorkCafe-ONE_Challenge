import os
from langchain.tools import tool
from intent_classifier import classify
from hybrid_search import hybrid_search

CONFIDENCE_THRESHOLD = 0.35

@tool
def search_documents(query: str) -> str:
    """Search the cafe's internal documents to answer questions about
    HR, financials, stock, suppliers, or menu. Use this for any question
    about the cafe's operations. For questions about schedules or shifts,
    search broadly to retrieve all relevant employee records."""

    category, confidence = classify(query)

    if confidence >= CONFIDENCE_THRESHOLD:
        results = hybrid_search(query, category=category, top_k=20)
    else:
        results = hybrid_search(query, category=None, top_k=5)

    if not results:
        return "No relevant documents found for this query."

    output = f"[Category detected: {category} | Confidence: {confidence}]\n\n"
    for i, r in enumerate(results, 1):
        source = r["metadata"].get("source", "unknown")
        score = r["score"]
        output += f"[{i}] (source: {source} | score: {score})\n{r['content']}\n\n"

    return output.strip()

