import os
import psycopg2
from qdrant_client import QdrantClient
from dotenv import load_dotenv

# Load the credentials from the .env file in the parent directory
load_dotenv(dotenv_path="../.env")

def test_postgres():
    try:
        print("Testing PostgreSQL connection...")
        conn = psycopg2.connect(
            dbname=os.getenv("POSTGRES_DB"),
            user=os.getenv("POSTGRES_USER"),
            password=os.getenv("POSTGRES_PASSWORD"),
            host=os.getenv("POSTGRES_HOST"),
            port=os.getenv("POSTGRES_PORT", "5432")
        )
        print("✅ PostgreSQL: Connected successfully!")
        conn.close()
    except Exception as e:
        print(f"❌ PostgreSQL Error: {e}")

def test_qdrant():
    try:
        print("\nTesting Qdrant connection...")
        client = QdrantClient(
            host=os.getenv("QDRANT_HOST", "localhost"),
            port=int(os.getenv("QDRANT_PORT", "6333")) # Default string fixes Pylance type error
        )
        # Fetch collections to verify we can read data
        collections = client.get_collections()
        print("✅ Qdrant: Connected successfully!")
    except Exception as e:
        print(f"❌ Qdrant Error: {e}")

if __name__ == "__main__":
    print("--- Starting Infrastructure Diagnostics ---\n")
    test_postgres()
    test_qdrant()
    print("\n--- Diagnostics Complete ---")