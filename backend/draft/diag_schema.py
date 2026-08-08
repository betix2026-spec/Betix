
import asyncio
import os
import sys
from app.services.supabase_client import SC

async def diagnostic():
    print("--- Analytics Tables Diagnostic ---")
    tables = ["football_matches", "basketball_matches", "tennis_matches"]
    
    for table in tables:
        try:
            # Fetch one row to see the structure
            res = SC.analytics.select_raw(table, "select=*&limit=1")
            if res:
                print(f"\nTable: {table}")
                for key, value in res[0].items():
                    print(f"  - {key}: {type(value).__name__} (Value: {value})")
            else:
                print(f"\nTable {table} is empty.")
        except Exception as e:
            print(f"\nError on {table}: {e}")

if __name__ == "__main__":
    # Path setup for imports
    sys.path.insert(0, os.path.abspath("."))
    asyncio.run(diagnostic())
