# Milestone 1 validation

Run the standard gates from the repository root:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite covers the validated seed and relationships, financial fields left unknown, funnel formulas, zero denominators, local save/reload and storage failures, prompt context, complete strategy output, malformed output, provider configuration, transport shape, sanitized error responses, response/request size limits, and API input/origin validation.

Browser acceptance flow:

1. Open the Dashboard and all six feature pages at desktop and mobile widths.
2. Edit Business DNA, save, reload and confirm persistence.
3. Generate without a key: the gateway setup state appears and navigation still works.
4. Review the successful strategy rendering with a deterministic local test provider; then return malformed output and confirm the last good strategy is retained.
5. Add content, change an approval status, and check the dashboard count.
6. Inspect the calendar and move between months.
7. Edit/create a campaign brief and confirm saved changes after reload.
8. Add another business and confirm data remains scoped to the selected business.
9. Check mobile navigation, horizontal overflow and browser runtime errors.

No real ads, publishing actions, external model usage or monetary transactions are part of these checks.

## Results — September 13, 2026

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm test`: all 12 tests passed.
- `npm run build`: passed; all seven pages and the server strategy route generated successfully.
- Isolated Chromium acceptance checks passed on the production build at 1440px and 390px. All seven screens fit their viewport without page-level horizontal overflow; mobile navigation worked.
- DNA edits persisted after reload. Content creation/approval changed dashboard counts. Campaign changes persisted. Calendar month navigation worked. A second business had separate content and strategy state.
- The full UI → Next.js route → OpenAI-compatible local test gateway → Zod → rendered result flow passed using edited DNA. Credential error, generating, success and malformed output states were checked. A malformed retry retained the last valid strategy after reload.
- No browser runtime exceptions. Desktop/mobile dashboard screenshots were visually inspected during validation. A textarea accessible-label issue discovered during reload testing was fixed before these passing results.
- Environment ignore rules and source/client boundaries reviewed. Only the blank-key environment example is tracked; no real credentials, build output, node_modules or test-browser artifacts are committed.

A real FreeLLMAPI instance was not available in this cloud workspace. Live gateway generation remains a configuration check for the owner's local setup. No real upstream model usage or deployment was performed.
