import sys
import os
import asyncio
import logging

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from scripts.updates.process_daily_matches import DailyMatchProcessor

class LogCaptureHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.logs = []

    def emit(self, record):
        self.logs.append(self.format(record))

async def main():
    print("🚀 Starting test: running process_daily_matches.py...")
    
    # Intercepting logs from process_daily_matches
    logger = logging.getLogger("betix.updates")
    capture_handler = LogCaptureHandler()
    capture_handler.setFormatter(logging.Formatter("%(message)s"))
    # Only capture INFO or higher to avoid noise
    capture_handler.setLevel(logging.INFO)
    logger.addHandler(capture_handler)
    
    # Run the processor
    processor = DailyMatchProcessor()
    try:
        await processor.run()
    finally:
        logger.removeHandler(capture_handler)
        
    print("\n" + "="*60)
    print("📊 PROCESS DAILY MATCHES: TEST EXECUTION REPORT")
    print("="*60)
    
    total_found = 0
    total_updated = 0
    total_triggered_sequence = 0
    total_robustness_triggers = 0
    
    for line in capture_handler.logs:
        # Match count detection
        if "active/pending matches" in line and "Found" in line:
            import re
            m = re.search(r"Found (\d+)", line)
            if m:
                total_found += int(m.group(1))
                
        # Updated matches detection
        elif "✅ Updated" in line:
            total_updated += 1
            
        # Robustness triggers
        elif "🛡️ Robustness Check" in line:
            total_robustness_triggers += 1
            total_triggered_sequence += 1
            
        # Standard triggers
        elif "Match" in line and "FINISHED! Triggering Sequence" in line and "Robustness" not in line:
            total_triggered_sequence += 1

    print(f"Total matches detected (active or scheduled in the window) : {total_found}")
    print(f"Total matches updated in the database                       : {total_updated}")
    print(f"Total pipeline dispatches (Stats, H2H, Rolling)             : {total_triggered_sequence}")
    print(f"  --> of which ROBUSTNESS triggers (missing stats)          : {total_robustness_triggers}")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(main())
