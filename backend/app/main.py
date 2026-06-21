from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Clinical Agentic OS",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {
        "postgres_status": "connected",
        "qdrant_status": "connected"
    }

# --- NEW: The Upload Door ---
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # 1. Print to the terminal so we can see it arrived safely
    print(f"=====================================")
    print(f"📥 RECEIVED FILE: {file.filename}")
    print(f"=====================================")
    
    # 2. (Future Step) Here is where we will send it to Qdrant/LangChain
    
    # 3. Send a thumbs-up back to the React frontend
    return {"filename": file.filename, "status": "Successfully received by Python backend!"}