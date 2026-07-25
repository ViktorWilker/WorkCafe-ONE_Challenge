import os
import sys
import asyncio
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).parent.parent / "ingestion"))

from ingest import ingest_file
from chart_agent import build_charts_data

DOCS_DIR = Path(__file__).parent.parent / "docs"
ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".csv"}

_broadcast_callback = None


def set_broadcast_callback(callback):
    global _broadcast_callback
    _broadcast_callback = callback


class DocsEventHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        filepath = Path(event.src_path)
        if filepath.suffix.lower() in ALLOWED_EXTENSIONS:
            print(f"[Orchestrator] New file detected: {filepath.name}")
            self._process(filepath)

    def on_modified(self, event):
        if event.is_directory:
            return
        filepath = Path(event.src_path)
        if filepath.suffix.lower() in ALLOWED_EXTENSIONS:
            print(f"[Orchestrator] Modified file detected: {filepath.name}")
            self._process(filepath)

    def _process(self, filepath: Path):
        print(f"[Orchestrator] Starting ingestion: {filepath.name}")
        chunks = ingest_file(filepath)
        print(f"[Orchestrator] Ingestion complete: {chunks} chunks indexed")

        charts_data = build_charts_data()
        print(f"[Orchestrator] Charts data updated")

        if _broadcast_callback:
            asyncio.run(_broadcast_callback(charts_data))


def start_observer() -> Observer:
    observer = Observer()
    observer.schedule(DocsEventHandler(), path=str(DOCS_DIR), recursive=False)
    observer.start()
    print(f"[Orchestrator] Watching: {DOCS_DIR}")
    return observer