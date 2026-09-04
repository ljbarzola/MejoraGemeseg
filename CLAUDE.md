# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> This repo already has two hand-maintained docs that are more detailed than this file: **`AGENTS.md`** (tech stack, deploy topology, business rules per module, credentials, "LO QUE NO DEBES HACER") and **`README.md`** (feature list, user stories). Read `AGENTS.md` first — this file only adds commands and cross-file architecture notes that aren't there yet, and should be kept in sync with it as the code evolves.

## Commands

### Backend (`backend/`, NestJS + Prisma v7)
```bash
npm run start:dev        # http://localhost:3000, watch mode
npm run build             # nest build
npm run lint               # eslint --fix
npm test                   # jest, unit specs (*.spec.ts)
npm test -- custodias.service   # run specs matching a name pattern
npm run test:cov
npm run test:e2e           # jest --config ./test/jest-e2e.json (backend/test/app.e2e-spec.ts)
npx prisma migrate dev --name <nombre>   # new migration, uses prisma.config.js for the DB URL (not schema.prisma)
npx prisma generate
node prisma/seed.js        # seed test users/companies/projects
```
Prisma v7 note: `schema.prisma` has no `datasource url` — the connection URL lives in `backend/prisma.config.js` (reads `DATABASE_URL` from env). Don't add `url` back to the datasource block.

### Frontend (`frontend/`, React 18 + Vite)
```bash
npm run dev        # http://localhost:5173
npm run build       # tsc -b && vite build
npm run lint
```
No frontend test runner is configured (no test script, no test files) — don't assume `npm test` works here.

### Local infra
```bash
docker-compose -f docker-compose.dev.yml up   # Postgres + Redis for local dev
```

### Backend unit test pattern
Services take a single `PrismaService` dependency, so specs instantiate the class directly (`new XService(mockPrisma as unknown as PrismaService)`) instead of spinning up a Nest `TestingModule` — faster and enough for pure unit coverage. `mockPrisma` is a plain object of `jest.fn()`s shaped like the Prisma delegates the service actually calls (e.g. `{ custodia: { findFirst: jest.fn(), ... } }`), not a real `PrismaClient`. See `custodias.service.spec.ts`, `permissions.service.spec.ts`, and `ventas-contratos.service.spec.ts` for the pattern, including how `ventas-contratos.service.spec.ts` handles `jest.mock('fs')`/`jest.mock('axios')` (spying on the real built-in `fs` module directly causes a "Cannot redefine property" error in this project's Jest/Node combo — always auto-mock it instead). `eslint.config.mjs` has a `**/*.spec.ts` override that downgrades `no-unsafe-*`/`unbound-method` to warnings, since Jest's own types (`expect.objectContaining`, `mock.calls`) are inherently `any`-typed.

## Architecture

### Deployment: Cloud Run (API only) + Firebase Hosting (frontend only)
`backend/Dockerfile` builds only the NestJS API; `cloudbuild.yaml` pushes it and deploys to Cloud Run (`mejora-gemeseg-backend`, us-central1) with `--set-secrets` for `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `BOLDSIGN_API_KEY`. It does not build or serve the frontend.

The frontend is built and deployed independently by `.github/workflows/firebase-hosting-merge.yml` on every push to `main` (`npm run build` in `frontend/`, `VITE_API_URL` from a GitHub secret), published to **Firebase Hosting**. `firebase.json` proxies `/api/**`, `/health`, `/docs/**` from Hosting to the Cloud Run service, so the two deploy independently but are served under one origin. The production URL is a custom domain (`app.gemeseg.com`) mapped onto Firebase Hosting, not the raw Cloud Run URL. Don't reintroduce building the frontend into `backend/Dockerfile` — that was removed because it duplicated this pipeline and could drift from what Firebase Hosting actually serves.

### Authorization has two independent layers — check both when adding a route
1. **Role guard** (`common/guards/roles.guard.ts` + `@Roles(UserRole.ADMIN)` decorator): coarse ADMIN/MANAGER/EMPLOYEE check, enforced per-endpoint.
2. **Section permissions** (`modules/permissions/`): a separate, DB-backed system gating whole feature areas. `PermissionsService.ALL_SECTIONS` is the master list (DASHBOARD, PROJECTS, ADMIN, TOOLS, AGENTS, CACAO, COMPANY_SETTINGS, COMPANIES, CUSTODIAS, PERSONAL, VENTAS). A company only sees a section if it's `alwaysEnabled` or explicitly turned on via `CompanySection` (set through `/admin/permissions`, super-admin only); within an enabled section, individual users can be further restricted per-section via `UserPermission.canView/canWrite` (set through `/admin/user-permissions`, company-admin). Super admin (`companyId: null`) bypasses all of this and sees every section.

   On the frontend, `contexts/PermissionsContext.tsx` + `hooks/usePermissions.ts` expose `canView(section)`, consumed by the `<SectionRoute section="...">` wrapper in `App.tsx` around every module's routes. Adding a new module means: add it to `ALL_SECTIONS`, gate its API endpoints, and wrap its frontend routes in `SectionRoute`.

   This permission model is not documented in `AGENTS.md` yet — update that file's "Reglas de Negocio" section if you change it.

### Multi-tenancy via `companyId`, not a shared-nothing model
`User.companyId` is the only tenancy boundary; most other domain data (projects, tasks, cacao, custodias, ventas records) is scoped indirectly through the acting user, not through its own `companyId` filter everywhere — check each service's query before assuming isolation is automatic. `companyId: null` on a user means super-admin (see `admin@general.com`), not "no company" — that sentinel shows up throughout `permissions`, `companies`, and `ventas` services (e.g. `SuperAdmin Handling` in `backend/.agents/CONTRATOS-PLAN.md`).

### Domain modules under `backend/src/modules/`
Each is a self-contained NestJS module wired into `app.module.ts`. Business-facing ones beyond the core PM/admin stack (`auth`, `users`, `projects`, `tasks`, `tools`, `agents`, `companies`, `ai`, `queue`, `cache`, `permissions`):
- **`cacao/`** — cacao trading back-office, split into its own sub-modules (`suppliers`, `clients`, `receptions`, `lots`, `settlements`, `shipments`, `payables`, `receivables`, `price-fixings`, `qualities`, `kardex`, `unit-config`, `dashboard`). Each is CRUD-ish and mirrors a physical business process (reception → lot → settlement → shipment → payable/receivable).
- **`custodias/`** — route/transport/payroll module for security escort trips. Naming: "Custodias" = trips/payroll here; the security *staff* live in `personal` under "Guardias". States flow `LISTO_PARA_CUSTODIAR → EN_CAMINO → LLEGO`, and payroll only settles on `LLEGO`. Includes a "GEME-BOT" query assistant endpoint and PDFKit-generated PDFs (orden de custodia, nómina).
- **`personal/`** — HR: recruitment pipeline (Kanban + Google Drive sync for candidate docs), certifications with expiry alerts, compliance checklists per employee (cédula), job positions.
- **`ventas/`** — sales/CRM: leads, client visits, sales goals, webhook ingestion, and a contract-generation subsystem (`ventas-templates.*`, `ventas-contratos.*`) that converts uploaded `.docx` templates to HTML (mammoth) for a visual field-placement editor, then sends signature requests through BoldSign (`BOLDSIGN_API_KEY`). See `backend/.agents/CONTRATOS-PLAN.md` for the full design of that subsystem — it's the most detailed spec of any module in the repo and should be the first read before touching contracts/templates code.

Several `cacao/` and `personal/` and `ventas/` modules integrate with external services (Google Drive via `googleapis`, BoldSign) — check for API keys/tokens in env/Secret Manager before assuming a feature works locally without them.

### Frontend structure
- `src/pages/<module>/` mirrors the backend module split (`cacao/`, `custodias/`, `personal/`, `ventas/`, plus `admin/`, `projects/`, `tasks/`, `tools/`, `profile/`).
- `src/services/` are thin Axios wrappers (one per backend module), all going through a single JWT-interceptor Axios instance.
- Every non-trivial page is lazy-loaded (`React.lazy`) in `App.tsx`; new pages should follow that pattern rather than being imported eagerly.
- `contexts/ThemeContext.tsx` (`CompanyProvider`) drives white-label branding (colors/logo per company); `contexts/PermissionsContext.tsx` drives the section-gating described above.
