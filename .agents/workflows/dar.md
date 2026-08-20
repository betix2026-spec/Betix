---
description: DAR method (Diagnosis - Ablation - Reconstruction) for resolving major issues.
---

This structured method is designed to resolve complex technical issues, environment instability, or resource saturation.

### 🩺 Phase 1: Clinical Diagnosis (Factual Audit)
- **Stop-and-Watch**: No code changes are allowed during this phase.
- **Vital Metrics**: Record RAM and CPU usage, and build/response times.
- **Root Isolation**: Identify the "true" error (the structural blocker) among the cascade of errors.
- **Clinical Report**: Present a purely factual analysis with no immediate corrective action.

### 🗑️ Phase 2: Ablation & Sanitization (The Hard Reset)
- **Cache Cleanup**: Remove build folders (`.next/`, `build/`, `dist/`).
- **Dependency Cleanup**: Remove the `node_modules` folder.
- **Structural Alignment**: Eliminate conflicting or duplicated lockfiles (`package-lock.json`, `yarn.lock`) in parent folders.

### 🏗️ Phase 3: Layered Reconstruction (Sequential)
1. **Layer 1 (Dependencies)**: Cleanly reinstall packages and verify the install succeeded.
2. **Layer 2 (Infrastructure)**: Audit the config files (`package.json`, `postcss`, `tailwind`, etc.) to ensure consistency.
3. **Layer 3 (Source Code)**: Adjust the source to align with the now-stabilized infrastructure.

### 📈 Phase 4: Verifying Stability
- Restart the system (`npm run dev`).
- Confirm system performance and response times are back to normal.
