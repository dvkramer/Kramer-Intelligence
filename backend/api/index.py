import sys
from pathlib import Path
from fastapi import FastAPI
from langgraph.server import add_routes

FILE_PATH = Path(__file__).resolve()
API_DIR = FILE_PATH.parent
BACKEND_DIR = API_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.src.agent.graph import graph as agent_executor
from backend.src.agent.state import OverallState as StreamGraphState # Alias OverallState
from backend.src.agent.configuration import Configuration

app = FastAPI(title="Research Agent API")

add_routes(
    app,
    agent_executor,
    path="/agent",
    input_schema=StreamGraphState,
    output_schema=StreamGraphState,
    stream_chunk_schema=StreamGraphState,
    config_keys=list(Configuration.model_fields.keys()),
)

@app.get("/")
async def read_root():
    return {"message": "FastAPI app for Agent is running. LangGraph agent is at /agent."}
