import sys
import os
import asyncio

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.services.ingestion.base_client import SupabaseREST
from app.config import get_settings

def fetch_all(db, table, select="*", filters=None):
    all_rows = []
    offset = 0
    limit = 1000
    while True:
        params = [f"select={select}", f"limit={limit}", f"offset={offset}"]
        if filters:
            for k, v in filters.items():
                if isinstance(v, tuple) and len(v) == 2:
                    op, val = v
                    params.append(f"{k}={op}.{val}")
                else:
                    params.append(f"{k}=eq.{v}")
        query = "&".join(params)
        rows = db.select_raw(table, query)
        if not rows: break
        all_rows.extend(rows)
        if len(rows) < limit: break
        offset += limit
    return all_rows

async def main():
    print("🚀 Starting cleanup of Tennis Ghost matches")
    
    settings = get_settings()
    db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="analytics")
    public_db = SupabaseREST(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY, schema="public")
    
    # 1. Fetch all tennis matches
    print("Fetching all tennis matches...")
    all_matches = fetch_all(db, "tennis_matches", "id,api_id,player1_id,player2_id")
    print(f"Total tennis matches found: {len(all_matches)}")
    
    # 2. Fetch all known players
    print("Fetching all known players...")
    all_players = fetch_all(db, "players", "id")
    known_player_ids = set([p["id"] for p in all_players])
    print(f"Total known players found: {len(known_player_ids)}")
    
    # 3. Identify ghost matches
    ghost_matches = []
    ghost_api_ids = []
    
    for m in all_matches:
        home_id = m.get("player1_id")
        away_id = m.get("player2_id")
        
        # If either player is missing from our known_players database, it's a ghost match
        if home_id not in known_player_ids or away_id not in known_player_ids:
            ghost_matches.append(m["id"])
            ghost_api_ids.append(m["api_id"])
            
    print(f"👻 Ghost matches detected: {len(ghost_matches)}")
    
    if not ghost_matches:
        print("✅ No cleanup needed.")
        return
        
    print(f"Example API IDs: {ghost_api_ids[:5]}...")
    
    # 4. DELETION
    # We delete from public.matches first, then analytics.tennis_matches
    print(f"🗑️ Cleaning public.matches (sport='tennis')...")
    
    deleted_public = 0
    # Batch delete in chunks of 100 to avoid URL length issues
    chunk_size = 100
    for i in range(0, len(ghost_api_ids), chunk_size):
        chunk = ghost_api_ids[i:i + chunk_size]
        chunk_str = ",".join(map(str, chunk))
        try:
            # Note: We must use raw string building for 'in' operator natively
            # Since SupabaseREST doesn't natively support easy IN array deletes, we'll iterate or use raw
            query = f"sport=eq.tennis&api_sport_id=in.({chunk_str})"
            import httpx
            # Hacky way to delete using the client directly
            resp = httpx.delete(
                f"{public_db.base_url}/matches?{query}", 
                headers=public_db.headers,
                timeout=30.0
            )
            resp.raise_for_status()
            deleted_public += len(chunk)
            print(f"  -> Deleted chunk of {len(chunk)} from public schema")
        except Exception as e:
            print(f"Deletion error (public): {e}")
            
    print(f"✅ Deleted from public.matches: {deleted_public}")
            
    print(f"🗑️ Cleaning analytics.tennis_matches...")
    deleted_analytics = 0
    for i in range(0, len(ghost_matches), chunk_size):
        chunk = ghost_matches[i:i + chunk_size]
        chunk_str = ",".join(map(str, chunk))
        try:
            query = f"id=in.({chunk_str})"
            import httpx
            resp = httpx.delete(
                f"{db.base_url}/tennis_matches?{query}", 
                headers=db.headers,
                timeout=30.0
            )
            resp.raise_for_status()
            deleted_analytics += len(chunk)
            print(f"  -> Deleted chunk of {len(chunk)} from analytics schema")
        except Exception as e:
            print(f"Deletion error (analytics): {e}")
            
    print(f"✅ Deleted from analytics.tennis_matches: {deleted_analytics}")
    print("🎉 Cleanup completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
