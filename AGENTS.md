# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite + TypeScript frontend packaged with Tauri for Windows desktop use.

- `src/main.ts` wires app state, tabs, worker calls, file actions, and settings.
- `src/core/` contains analysis logic: inference, missing values, stats, dates, and correlation.
- `src/io/` handles CSV parsing, encoding detection, Excel parsing, and data loading.
- `src/ui/` renders DOM views, charts, overview, missing-value, distribution, correlation, and report screens.
- `src/worker/` contains the analysis worker.
- `src/assets/samples/` stores shipped UTF-8 and Big5 sample CSV files.
- `tests/` contains Vitest tests; `e2e/` contains Playwright smoke tests.
- `src-tauri/` contains Rust commands, Tauri config, icons, and desktop packaging files.

## Build, Test, and Development Commands

- `npm install`: install JavaScript dependencies.
- `npm run dev`: start the browser dev server on port `1420`.
- `npm run tauri dev`: run the Tauri desktop app in development mode.
- `npm run check`: run TypeScript type checking.
- `npm test`: run Vitest unit and contract tests.
- `npm run test:e2e`: run Playwright smoke tests.
- `npm run build`: type-check and build frontend files into `dist/`.
- `npm run tauri build`: produce the desktop executable and NSIS installer.
- `build-desktop.bat`: double-click wrapper for desktop builds.

## Coding Style & Naming Conventions

Use TypeScript ES modules, two-space indentation, semicolons, and double-quoted imports. Use `camelCase` for variables/functions and `PascalCase` for types. Keep domain logic in `src/core/`, import/export logic in `src/io/`, and DOM/chart rendering in `src/ui/`.

## Testing Guidelines

Use Vitest for unit and worker-contract tests. Name test files `*.test.ts` and place them in `tests/`. Use Playwright for browser smoke checks in `e2e/`, especially for tab navigation, charts, responsive layout, and visible export controls. Before handoff, run `npm run check`, `npm test`, and relevant build or e2e commands.

## Commit & Pull Request Guidelines

No Git history is available, so no existing commit convention can be inferred. Use concise imperative messages, for example `Fix table overflow on narrow screens`. Pull requests should include a summary, verification commands, screenshots for UI changes, and notes for Tauri behavior requiring manual validation.

## Security & Configuration Tips

The app is local-first: file reading, analysis, clipboard use, and exports happen on the local machine. Do not add network upload behavior without explicit documentation. Keep real `.env` files ignored; document only safe examples in `.env.example`.
