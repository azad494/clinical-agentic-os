import logging
from typing import cast, Optional
from sqlalchemy.orm import Session
from litellm import completion, ModelResponse
from app import models
from app.database import engine

# Setup localized background worker logging metrics
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BackgroundRefineryWorkers")

SANITIZATION_SYSTEM_PROMPT = (
    "You are an expert healthcare security and compliance system. Your sole task is to take "
    "unstructured medical text/JSON data and sanitize it to remove Protected Health Information (PHI) "
    "and Personally Identifiable Information (PII) to meet compliance regulations.\n\n"
    "Identify and replace any occurrence of the following categories with standard placeholder tags "
    "like [REDACTED_NAME], [REDACTED_DATE], [REDACTED_SSN], [REDACTED_PHONE], [REDACTED_MRN], or [REDACTED_ADDRESS]:\n"
    "1. Full names, partial names, or initials of patients and family members.\n"
    "2. All geographic subdivisions smaller than a state (addresses, cities, counties, zip codes).\n"
    "3. Specific dates (birthdates, admission dates, discharge dates) directly linked to an individual.\n"
    "4. Contact information (phone numbers, fax numbers, email addresses).\n"
    "5. Identification numbers (Social Security Numbers, Medical Record Numbers, Health Plan numbers, Account numbers).\n\n"
    "CRITICAL: Retain all underlying clinical intelligence, medical terminology, lab metrics, diagnoses, "
    "vitals, medications, and operational administrative data completely unchanged. Keep the clean text professional. "
    "Output ONLY the final sanitized clinical text or data block. Do not add conversational intros or descriptions."
)

def run_automated_sanitization_agent(staging_id: int) -> None:
    """
    Synchronous worker processing function.
    Reads raw quarantined contents, applies the Gemini 2.5 Flash sanitization agent,
    and updates the relational database states safely.
    """
    logger.info(f"Worker thread initializing processing loop for document ID: {staging_id}")
    
    # Establish isolated database transaction context session loop
    with Session(engine) as db:
        try:
            # Fetch the document tracking row using the primary key index
            doc = db.query(models.DocumentStaging).filter(models.DocumentStaging.id == staging_id).first()
            if not doc:
                logger.error(f"Execution failed: Document ID {staging_id} no longer exists inside relational tables.")
                return

            # State Machine Lock: Verify document is pending, then switch to CLEANING state
            if doc.status != models.DocumentStatus.PENDING_REVIEW and doc.status != models.DocumentStatus.FAILED:
                logger.warning(f"Aborting task: Document ID {staging_id} is already in state {doc.status.value}")
                return

            doc.status = models.DocumentStatus.CLEANING
            db.commit()
            db.refresh(doc)
            logger.info(f"Document ID {staging_id} flipped to CLEANING state. Concurrency lock secure.")

            # Extract content payload from the database context
            text_to_sanitize = ""
            if doc.raw_text and doc.raw_text.strip():
                text_to_sanitize = doc.raw_text
            elif doc.raw_json:
                # If data was pulled via API streams, convert the dictionary payload to string data fields
                text_to_sanitize = str(doc.raw_json)

            # Safeguard against unreadable data rows or specific vision files
            if not text_to_sanitize.strip() or text_to_sanitize == "[IMAGE_FILE_DETECTED]":
                logger.info(f"Document ID {staging_id} skipped. Contains placeholder metadata values rather than readable character data arrays.")
                doc.sanitized_text = doc.raw_text or "[No readable alphanumeric data array detected]"
                doc.status = models.DocumentStatus.PENDING_REVIEW
                db.commit()
                return

            logger.info(f"Routing payloads to gemini/gemini-2.5-flash context window for scrubbing...")
            
            # Execute standard completion call (without stream=True)
            raw_response = completion(
                model="gemini/gemini-2.5-flash",
                messages=[
                    {"role": "system", "content": SANITIZATION_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Please sanitize the following text block:\n\n{text_to_sanitize}"}
                ]
            )
            
            # Strict Type Cast: Forces Pylance to acknowledge raw_response as a static ModelResponse object
            response = cast(ModelResponse, raw_response)

            # Access choices property safely without linter warnings
            sanitized_result = response.choices[0].message.content

            # Persistence Phase: Inject results and restore pending review state for the admin UI dashboard
            doc.sanitized_text = sanitized_result
            doc.status = models.DocumentStatus.PENDING_REVIEW  # Awaiting human manual approval inside Next.js dashboard
            doc.error_message = None  # Flush out historic telemetry failures
            db.commit()
            logger.info(f"Refinery task completed successfully for Document ID {staging_id}. Staged for human verification.")

        except Exception as task_error:
            db.rollback()
            error_trace = str(task_error)
            logger.error(f"Refinery crash encountered on Document ID {staging_id}: {error_trace}")
            
            # Fallback block to write processing failure analytics state to Postgres
            try:
                doc_fail = db.query(models.DocumentStaging).filter(models.DocumentStaging.id == staging_id).first()
                if doc_fail:
                    doc_fail.status = models.DocumentStatus.FAILED
                    doc_fail.error_message = f"AI Sanitization Error: {error_trace}"
                    db.commit()
            except Exception as db_nested_error:
                logger.critical(f"Fatal crash: Unable to write runtime telemetry error to PostgreSQL tables: {str(db_nested_error)}")