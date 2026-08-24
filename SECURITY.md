# Security policy

## Supported code

Security fixes target the current `main` branch.

## Reporting a vulnerability

Do not open a public issue containing credentials, access tokens, private
provider payloads, or a working exploit. Contact the repository owner through
their GitHub profile and include only the minimum information needed to arrange
a private report.

## Secrets and production data

- Never commit `.env`, `.env.local`, provider keys, database exports, access
  tokens, cookies, or deployment credentials.
- Keep production `.openai/hosting.json`, database bindings, and personal
  configuration outside the public repository.
- Use `config/team.config.example.json` only as a non-production example.
- Treat odds, injury, and weather provider responses as runtime data. Do not
  add cached production payloads to fixtures.
- Revoke and rotate any credential exposed in chat, an issue, a log, or a
  commit—even if Git history is later rewritten.

Before pushing, run:

```bash
pnpm verify
git diff --check
```

Review the staged files and confirm that environment values remain empty.
