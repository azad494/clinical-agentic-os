from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# The URL to connect to your PostgreSQL container
# Use the service name defined in your docker-compose.yml (e.g., 'db')
SQLALCHEMY_DATABASE_URL = "postgresql://admin:supersecurepassword@postgres:5432/clinical_os"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency to use in FastAPI endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()