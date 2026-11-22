# Changelog

All notable changes to MonoChrome are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Firebase project setup: a Firestore database in us-central1, deny-by-default security rules, the Hosting config, and a lazily loaded Firebase client (`src/lib/firebase.ts`) with an offline cache.
- Deploy workflow that publishes `main` to Firebase Hosting after every merge, once the deploy key is added.
- `.env.example`. Firebase config comes from environment variables, and the app falls back to local-only mode without them.
- CI on every pull request: typecheck, lint (oxlint), format check (oxfmt) and build.
- Dependabot updates for npm packages and GitHub Actions.
- MIT license, contributing guide, code of conduct, security policy, and issue and pull request templates.

### Changed

- The codebase is formatted with a shared oxfmt config.
- Latest-value refs update in effects instead of during render.

## [1.0.0] - 2026-11-22

The first public release.

### Added

- **Routine world:** a ring of 15 task islands with hold-to-commit, strict ordering, counter and bonus tasks, a timed lights-out window, and all-day vows with an honest "I slipped" button.
- **Streak calendar:** a year-of-days heatmap, a month grid with day details, and a dashboard with streaks and 30-day consistency.
- **Sound effects** generated with Web Audio, with a mute toggle.
- **Lock screen:** a passcode gate with a Mac-style panel on computers and an iPhone- or iPad-style keypad on touch devices.
- **The city:** Rocky and five neighbours (Ferris, Gollum, Lebowski, Flash and Nina), each with discipline-level house signs and live checklist boards. Around them are civic buildings, a downtown grid, a suburb, a stadium, a park, about 50 moving vehicles and pedestrians.
- **Camera controls:** orbit, zoom, pan, follow, click-to-visit and "Back to Rocky".
- The MonoChrome name, tagline and split-circle logo.

[Unreleased]: https://github.com/Yaswanth2120/monochrome/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Yaswanth2120/monochrome/releases/tag/v1.0.0
