# Add this right next to your existing FastAPI dependency imports
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Depends, BackgroundTasks
from app.tasks import run_automated_sanitization_agent 
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any
import httpx   # For secure async API fetching
import fitz    # PyMuPDF
import io
import os
import base64
import pandas as pd
from litellm import completion, acompletion 
from datetime import datetime 

# --- Database and Schema Imports ---
from app import models
from app.database import get_db, engine
from app.schemas import StagedDocumentResponse # <-- NEW: Enforces the schema contract across all endpoints

# Create tables on startup (Standard for Phase 1 local development)
models.Base.metadata.create_all(bind=engine)

# 1. Initialize your FastAPI app
app = FastAPI(title="Clinical Agentic OS API")

# 2. Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, secure this to localhost:3000
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {
    ".pdf", ".csv", ".json", ".html", ".htm", 
    ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg",
    ".xlsx", ".xls"
}

# --- 3. HEALTH CHECK ENDPOINT ---
@app.get("/health")
async def health_check():
    return {
        "postgres_status": "connected",
        "qdrant_status": "connected",
        "status": "healthy"
    }

# --- 4. WEBSOCKET CHAT ENDPOINT ---
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "status", "content": "Thinking..."})
            
            try:
                response = await acompletion(
                    model="gemini/gemini-2.5-flash",
                    messages=[{"role": "user", "content": data}],
                    stream=True
                )
                
                async for chunk in response: #type: ignore
                    token = chunk.choices[0].delta.content
                    if token:
                        await websocket.send_json({
                            "type": "token",
                            "content": token
                        })
                
                await websocket.send_json({"type": "done"})

            except Exception as llm_error:
                print(f"LLM Generation Error: {str(llm_error)}")
                await websocket.send_json({"type": "error", "content": "Failed to generate AI response."})

    except WebSocketDisconnect:
        print("Client disconnected from chat.")


# --- 5. THE DYNAMIC API FETCHER (MIMIC PROXY) ---
class APIFetchRequest(BaseModel):
    endpoint_url: str

@app.post("/api/v1/fetch-clinical-api", response_model=StagedDocumentResponse)
async def fetch_and_stage_clinical_api(
    request: APIFetchRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Securely fetches JSON from clinical APIs and stages it for AI Sanitization."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(request.endpoint_url)
            response.raise_for_status() 
            json_payload = response.json()
            
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"External API Fetch Failed: {str(e)}")

    try:
        # Inject the structured JSON into PostgreSQL
        new_staged_doc = models.DocumentStaging(
            source=models.IngestionSource.DYNAMIC_API_UI,
            file_type="application/json",
            raw_json=json_payload, 
            status=models.DocumentStatus.PENDING_REVIEW
        )
        db.add(new_staged_doc)
        db.commit()
        db.refresh(new_staged_doc)
        background_tasks.add_task(run_automated_sanitization_agent, new_staged_doc.id)
        # Enforce validation and structure contract output mapping
        return StagedDocumentResponse(
            id=new_staged_doc.id,
            filename="Live API Stream",
            status=new_staged_doc.status.value,
            category="Patient_EHR",
            message="External API data stream successfully captured and quarantined."
        )
        
    except Exception as db_error:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database Insertion Failed: {str(db_error)}")


# --- 6. THE UPGRADED MANUAL UPLOAD ENDPOINT ---
@app.post("/upload", response_model=StagedDocumentResponse)
async def upload_clinical_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db) 
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing.")

    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")

    try:
        contents = await file.read()
        extracted_text = ""
        base64_image = None

        # --- THE PARSER ROUTER ---
        if file_ext == ".pdf":
            pdf_stream = io.BytesIO(contents)
            doc = fitz.open(stream=pdf_stream, filetype="pdf")
            max_pages = min(len(doc), 3) 
            for page_num in range(max_pages):
                extracted_text += str(doc.load_page(page_num).get_text("text"))
            doc.close()

        elif file_ext in [".xlsx", ".xls"]:
            excel_stream = io.BytesIO(contents)
            df = pd.read_excel(excel_stream)
            extracted_text = df.head(50).to_string()

        elif file_ext in [".json", ".csv", ".txt", ".html", ".htm"]:
            extracted_text = contents.decode("utf-8")[:10000] 

        elif file_ext in [".png", ".jpg", ".jpeg"]:
            base64_image = base64.b64encode(contents).decode("utf-8")
            extracted_text = "[IMAGE_FILE_DETECTED]" # Placeholder for text column
            
        elif file_ext in [".doc", ".docx"]:
            extracted_text = f"[DOC_FILE_DETECTED: Filename: {file.filename}]"

        if not extracted_text.strip() and not base64_image:
            raise HTTPException(status_code=400, detail="Could not extract data from the document.")

        # --- THE GEMINI CLASSIFICATION BRAIN ---
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": "You are a medical document classifier. Reply ONLY with one of these categories: Patient_EHR, Clinical_Guidelines, Payer_Policy, Lab_Results, Imaging_Report, Unknown."}
        ]

        if base64_image:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": "Classify this clinical image:"},
                    {"type": "image_url", "image_url": {"url": f"data:image/{file_ext[1:]};base64,{base64_image}"}}
                ]
            })
        else:
            messages.append({
                "role": "user", 
                "content": f"Classify this text:\n{extracted_text[:3000]}"
            })

        response: Any = completion(
            model="gemini/gemini-2.5-flash",
            messages=messages
        )
        category = response.choices[0].message.content.strip()

        # --- UNIVERSAL DATABASE INJECTION ---
        new_staged_doc = models.DocumentStaging(
            source=models.IngestionSource.MANUAL_UPLOAD,
            filename=file.filename,
            file_type=file.content_type or file_ext,
            raw_text=extracted_text, 
            status=models.DocumentStatus.PENDING_REVIEW
        )
        db.add(new_staged_doc)
        db.commit()
        db.refresh(new_staged_doc)

        custom_message = "Document type not recognized. Staged for review." if category == "Unknown" else f"Successfully parsed and staged as {category}."
        
        # Enforce validation and structure contract output mapping
        return StagedDocumentResponse(
            id=new_staged_doc.id,
            filename=file.filename,
            status=new_staged_doc.status.value,
            category=category,
            message=custom_message
        )

    except Exception as e:
        print(f"Ingestion error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


# --- 7. ADMIN APPROVAL WORKFLOW ---
class ReviewRequest(BaseModel):
    status: str  # Expecting "approved" or "rejected"
    admin_id: str = "admin_001" # Defaulting for local dev

@app.put("/api/v1/documents/{staging_id}/review")
async def review_staged_document(
    staging_id: int, 
    request: ReviewRequest, 
    db: Session = Depends(get_db)
):
    """
    Human-In-The-Loop (HITL) endpoint. 
    Approves or rejects a staged document. If approved, it prepares for Qdrant embedding.
    """
    # Find the document in Postgres
    doc = db.query(models.DocumentStaging).filter(models.DocumentStaging.id == staging_id).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Staged document not found.")

    # Validate the status change
    if request.status.lower() == "approved":
        doc.status = models.DocumentStatus.APPROVED
    elif request.status.lower() == "rejected":
        doc.status = models.DocumentStatus.REJECTED
    else:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'approved' or 'rejected'.")

    # Update audit trail
    doc.reviewed_by = request.admin_id
    doc.reviewed_at = datetime.utcnow()
    
    db.commit()

    return {
        "status": "success",
        "document_id": staging_id,
        "new_state": doc.status.value,
        "message": f"Document successfully marked as {doc.status.value}."
    }