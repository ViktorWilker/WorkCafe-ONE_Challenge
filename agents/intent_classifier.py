import os
import json
import pickle
import time
import numpy as np
from pathlib import Path
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sklearn.linear_model import LogisticRegression

load_dotenv()

MODEL_PATH = Path(__file__).parent / "intent_model.pkl"
TRAINING_DATA_PATH = Path(__file__).parent / "training_data.json"

_embeddings = None


def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=os.getenv("GOOGLE_API_KEY_EMBED")
        )
    return _embeddings


def load_training_data() -> list[dict]:
    with open(TRAINING_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def train():
    data = load_training_data()
    texts = [d["text"] for d in data]
    labels = [d["category"] for d in data]

    print(f"Generating embeddings for {len(texts)} examples...")
    embeddings = get_embeddings()

    batch_size = 20
    vectors = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        vectors.extend(embeddings.embed_documents(batch))
        print(f"  batch {i // batch_size + 1} done")
        time.sleep(15)

    X = np.array(vectors)
    clf = LogisticRegression(max_iter=1000, C=10)
    clf.fit(X, labels)

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)

    print(f"Model trained and saved to {MODEL_PATH}")
    return clf


def load_model():
    if not MODEL_PATH.exists():
        return train()
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def classify(question: str) -> tuple[str, float]:
    embeddings = get_embeddings()
    vector = np.array(embeddings.embed_query(question)).reshape(1, -1)
    model = load_model()
    category = model.predict(vector)[0]
    confidence = round(float(model.predict_proba(vector).max()), 3)
    return category, confidence