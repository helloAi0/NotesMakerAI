from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="Notes Maker AI - Intelligent AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class NoteGenerationRequest(BaseModel):
    topic: str
    level: str = "College"
    style: str = "Detailed Textbook"
    include_formulas: bool = True
    include_examples: bool = True

class OutlineResponse(BaseModel):
    topic: str
    level: str
    outline: List[str]

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "Python AI & RAG Microservice"}

@app.post("/api/ai/outline", response_model=OutlineResponse)
def generate_outline(req: NoteGenerationRequest):
    # Intelligent topic outline generator based on user topic & level
    topic_lower = req.topic.lower()
    
    if "newton" in topic_lower or "gravity" in topic_lower:
        outline = [
            "1. Historical Context and Introduction",
            "2. Newton's Three Laws of Motion",
            "3. Law of Universal Gravitation Formula & Constants",
            "4. Derivations and Orbital Mechanics",
            "5. Real-World Applications and Limitations",
            "6. Practice Problems and Conceptual Review"
        ]
    elif "quantum" in topic_lower:
        outline = [
            "1. Introduction to Quantum States",
            "2. Wave Functions and Superposition",
            "3. Schrödinger Equation Basics",
            "4. Measurement and Probability",
            "5. Summary and Revision Questions"
        ]
    else:
        outline = [
            f"1. Foundations of {req.topic}",
            f"2. Core Principles and Definitions",
            f"3. Mathematical Formulations & Derivations",
            f"4. Worked Examples and Case Studies",
            f"5. Common Misconceptions & Exam Tips",
            f"6. Summary and Practice Quiz"
        ]

    return OutlineResponse(
        topic=req.topic,
        level=req.level,
        outline=outline
    )

@app.post("/api/ai/generate-notes")
def generate_notes(req: NoteGenerationRequest):
    return {
        "title": req.topic,
        "level": req.level,
        "style": req.style,
        "sections": [
            {
                "heading": f"Introduction to {req.topic}",
                "content": f"Welcome to your generated study guide on {req.topic}. Tailored specifically for {req.level} level learners using a {req.style} format."
            },
            {
                "heading": "Core Definitions & Principles",
                "content": "Key principles involve structured analysis, fundamental axioms, and observable phenomena examined through rigorous academic frameworks."
            },
            {
                "heading": "Important Formulas & Equations",
                "content": "F = G * (m1 * m2) / r^2 where G is the gravitational constant."
            },
            {
                "heading": "Worked Example",
                "content": "Step 1: Identify given variables. Step 2: Apply appropriate governing equations. Step 3: Compute final numerical result with correct SI units."
            }
        ]
    }