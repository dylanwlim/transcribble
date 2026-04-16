# Transcribble Agent Notes

Check `README.md`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, and `next.config.mjs` first.

Stack:
- Next.js 15 app router
- React 19
- TypeScript
- ESLint 9
- Node test runner via `tsx`

Canonical validation:
- `npm run typecheck`
- `npm run validate`

Recent verified bug fixes:
- `tests/projects.test.ts`: project fixture now includes required `savedRanges` so typecheck matches the `TranscriptProject` contract.
- `lib/transcribble/storage.ts`: storage usage ratio now preserves `0` instead of treating empty usage as missing data.
- `package.json`: `typecheck` now runs `next typegen` before `tsc --noEmit`, and `validate` runs the full suite sequentially.
