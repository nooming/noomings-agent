/**
 * Shared Mermaid classDef for strategy panorama (appended at end of diagram by viewer.js).
 * Palette aligned with teacher reference flowchart (start/cond/core/invalid/success).
 */
const STRATEGY_MERMAID_CLASS_DEFS = [
  'classDef stratStart fill:#e2e8f0,stroke:#475569,stroke-width:2px',
  'classDef stratCond fill:#eff6ff,stroke:#1d4ed8,stroke-width:2px',
  'classDef stratToggle fill:#eff6ff,stroke:#1d4ed8,stroke-width:2px',
  'classDef stratCore fill:#fff7ed,stroke:#ea580c,stroke-width:2px',
  'classDef stratAction fill:#fff7ed,stroke:#ea580c,stroke-width:2px',
  'classDef stratTeach fill:#fff7ed,stroke:#ea580c,stroke-width:2px',
  'classDef stratOp fill:#fff7ed,stroke:#ea580c,stroke-width:2px',
  'classDef stratSuccess fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,font-weight:bold',
  'classDef stratResult fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,font-weight:bold',
  'classDef stratEnd fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,font-weight:bold',
  'classDef stratRetry fill:#fff7ed,stroke:#ea580c,stroke-width:2px',
  'classDef stratTrap fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#991b1b',
  'classDef stratInvalid fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#991b1b',
].join('\n');

if (typeof window !== 'undefined') window.STRATEGY_MERMAID_CLASS_DEFS = STRATEGY_MERMAID_CLASS_DEFS;
else if (typeof globalThis !== 'undefined') globalThis.STRATEGY_MERMAID_CLASS_DEFS = STRATEGY_MERMAID_CLASS_DEFS;
