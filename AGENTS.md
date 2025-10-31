# Repository Guidelines

## Project Structure & Module Organization
The Vite entry point is `index.html`, which loads the ES module bundle under `js/`. Core controllers live in files such as `js/main.js`, `js/data-store.js`, and `js/project-config.js`, while feature-specific modules (graph, rewards, comparisons) are grouped by concern using kebab-case filenames. Shared styles are in `css/`, mirroring the JS module names, and static reference data sits in `data/` (e.g., `data/books.json`). Built assets in `dist/` are disposable; never edit them directly.

## Build, Test, and Development Commands
- `npm install` – install dependencies before your first run.
- `npm run dev` – start the Vite dev server with hot module reload at the port reported in the console.
- `npm run build` – produce the static bundle in `dist/`; use before publishing artifacts.
- `npm run preview` – serve the production bundle locally to sanity-check deployable output.

## Coding Style & Naming Conventions
Favor modern ES modules and keep business logic in dedicated files instead of inflating `main.js`. Use two-space indentation, trailing semicolons, and descriptive `const` declarations for DOM selectors and configuration objects. File names stay lowercase kebab-case (`project-defaults.js`, `progress-summary.js`) to align JS/CSS pairs. Run formatters manually before sending a PR; `npm run lint` is not configured, so apply Prettier or eslint rules locally if needed. Keep Supabase credentials in `.env` (variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) and never hard-code secrets.

## Testing Guidelines
Automated tests are not yet in place. Until we add a test runner, exercise critical flows manually: launch `npm run dev`, verify word entry, graph updates, and settings persistence in localStorage. When introducing new modules, stub future tests under a `tests/` directory using your preferred framework (Vitest integrates smoothly with Vite) and name files `module-name.test.js`. Document manual QA steps in the PR when automated coverage is missing.

## Commit & Pull Request Guidelines
Follow concise, imperative commit subjects (e.g., `Add progress summary controller`). Group related changes and avoid slipping unrelated refactors into the same commit. For pull requests, include: a short summary of intent, linked issue numbers, before/after screenshots or GIFs for UI-impacting work, a list of functional/manual checks performed, and configuration notes (such as required `.env` keys). Request review once the branch builds cleanly with `npm run build` and the preview renders as expected.

## Data & Configuration Tips
Seed data like `data/books.json` should remain lightweight and documented—note any schema changes in the PR description. Use feature flags defined in `js/config.js` to guard experimental work instead of removing code paths, and update defaults in `js/project-defaults.js` when revising onboarding experiences.
