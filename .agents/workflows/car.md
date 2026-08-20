---
description: CAR method (Scoping - Assembly - Realization) for building new features.
---

This structured method is designed for building new features, ensuring a solid foundation and smooth integration into the existing codebase.

### 📝 Phase 1: Scoping (Feasibility Audit)
- **Target Definition**: Precisely identify the business goal and the end-user experience (input vs. output).
- **Data Audit**: Identify the data sources needed (API, existing DB) and any potential gaps.
- **Impact Analysis**: Anticipate how the new feature will change the existing system (orchestrator, DB, frontend).
- **Flow Modeling**: Map out the data's path before writing the business logic.

### 🏗️ Phase 2: Assembly (Structural Foundation)
- **Data Schema**: Create or modify tables, indexes, and relationships (refactor if needed).
- **Data Models**: Define types, classes, and interfaces (Pydantic models, SQLAlchemy, TypeScript).
- **Infrastructure Skeleton**: Prepare the files, folders, and stubs to isolate the future feature.
- **Foundation Check**: Confirm the foundation is ready to support the complex logic to come.

### 🛠️ Phase 3: Realization (Layered Implementation)
1. **Ingestion Layer**: Build the core data exchange (fetchers, scrapers, API clients).
2. **Business Layer**: Develop the computation logic (AI, algorithms, auditing, filters).
3. **Integration Layer**: Wire the feature into the orchestrator or automated triggers.

### ✅ Phase 4: Acceptance & Mastery
- **Unit Validation**: Test each layer independently to ensure robustness.
- **Data Audit**: Validate the quality and relevance of the produced results.
- **Documentation & UI**: Update the user interface and technical documentation (README, schemas).
