# Contributing
1. `cd frontend && npm ci && npm run dev` (web app). The server is optional: `cd server-api && NM_SECRET=$(openssl rand -hex 16) node server.mjs`.
2. Before a pull request run: `npx tsc -b`, `npx eslint src server --quiet`, `npm run test:unit`, `npm run test:server`, `npm run build && node tools/budget.mjs`, then with `npx vite preview --port 5300` running: `BASE=http://127.0.0.1:5300 npm run test:e2e`.
3. Keep the first-load bundle under the budget (heavy libraries go in lazy chunks), never commit keys, and add a test with every fix.
