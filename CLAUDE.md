# Claude Code project entrypoint

Read and follow `AGENTS.md` in full. It is the canonical GeoCheck Agent Contract for all coding agents; this file does not maintain a second copy.

Before substantial changes, read the required project documents listed there. Do not rely on automatic memory as the sole source of truth. Supplemental rules remain in `.claude/rules/research.md`, `.claude/rules/learning.md`, and `.claude/rules/coding.md`; read the relevant rules for the task. User authorization takes precedence, and the same approval must not be requested twice.

Current directory ownership is described in root `README.md`; file relocations are recorded in `docs/maintenance/layout-migration-2026-09-08.json`. `mock-api/` is compatibility only. Since 2026-10-21 the public quick check uses MCAC 0.2.0 (four results read separately, no total; spec `docs/MCAC_V0.md`, decision LSL-D-006 in the ls-labs repo). AI Trust Index v1 is the Classic method, kept for research batches and old reports; archived V2/V3 specifications are historical, not current authority.

Platform (Developer API, Console, SDK, platform.lslabs.tw pages) moved to ls-labs `products/platform` on 2026-10-21 (LSL-D-009). Do not recreate Platform code, tests or pages in this repo; the four provider-layer files kept for MCAC and Classic are listed in `docs/CURRENT_STATE.md`.
