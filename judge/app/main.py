from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Engineering Notebook Judge Service", version="0.1.0")


class EvaluateRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    rubric: str = Field(default="REC Foundation Design Award")
    entry_ids: list[str] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/judge/evaluate")
def evaluate(payload: EvaluateRequest) -> dict:
    return {
        "projectId": payload.project_id,
        "rubric": payload.rubric,
        "summary": "Stub rubric audit response. Connect this endpoint to your LLM provider for full scoring.",
        "scores": {
            "design_cycle_completeness": 0,
            "chronological_consistency": 0,
            "test_repeatability": 0,
        },
        "advice": [
            {
                "entryId": payload.entry_ids[0] if payload.entry_ids else None,
                "message": "Add evidence of iteration and measurable test outcomes.",
            }
        ],
    }
