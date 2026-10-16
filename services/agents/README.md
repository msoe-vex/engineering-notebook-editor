# Agents service

Rubric audit microservice.

- `POST /v1/orgs/:orgId/notebooks/:notebookId/audit` — BYOK (default) or Vertex when `grants.platformAi`
- Scorecards: `organizations/{orgId}/notebooks/{notebookId}/audits/{auditId}`

- Contracts: [docs/03-reference/api-contracts.md](../../docs/03-reference/api-contracts.md)
- Local testing: [docs/04-guides/local-development.md](../../docs/04-guides/local-development.md)

```bash
npm install && npm run dev
```

```bash
curl -X POST http://localhost:8000/v1/orgs/demo/notebooks/test-123/audit \
  -H "Authorization: Bearer local-user" \
  -H "Content-Type: application/json" \
  -d '{"provider":"byok","rubric":"REC Foundation Design Award"}'
```
