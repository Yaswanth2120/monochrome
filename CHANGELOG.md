# Changelog

All notable changes to MonoChrome are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Settings page** (**,** or the ⚙ button):
  - a routine editor for tasks (add, edit, delete, drag or arrow reordering, type, steps, counter goals, bonus flag, time window and icon) and vows (with a seal time);
  - Account (change passcode, sign out) and Preferences.
- **Your routine lives in your account.** New accounts start from the default routine. The world, dock, calendar and streaks all follow your own list.
- **Edits wait for tomorrow** once you've started the day, with **Apply now** before that. A scheduled change can be cancelled.
- **Frozen day scores**, so routine edits never change past days.
- **Sign in with Google.** The lock screen asks you to sign in once per device, then to create a personal 4-digit passcode. The passcode is stored only as a salted PBKDF2 hash in your private account, and is used to unlock from then on. Includes "Sign out" and "Forgot passcode?" (re-confirm with Google, then set a new one).
- **Live sync.** Your day history lives in your account and updates across devices within a second, and works offline. History already in the browser is copied to your account the first time you sign in.
- Stricter Firestore rules: per-field validation for profiles and day records.
- Local Firebase emulators for development (`pnpm emulators`, `pnpm dev:emulators`).
- Firebase project setup: a Firestore database in us-central1, deny-by-default security rules, the Hosting config, and a lazily loaded Firebase client (`src/lib/firebase.ts`) with an offline cache.
- Deploy workflow that publishes `main` to Firebase Hosting after every merge, once the deploy key is added.
- `.env.example`. Firebase config comes from environment variables, and the app falls back to local-only mode without them.
- CI on every pull request: typecheck, lint (oxlint), format check (oxfmt) and build.
- Dependabot updates for npm packages and GitHub Actions.
- MIT license, contributing guide, code of conduct, security policy, and issue and pull request templates.

### Fixed

- The ring world's camera no longer snaps back to the automatic angle 3.5 seconds after you look around. Your angle is kept, turns with the ring as you walk, and resets with **0** or the reset button.

### Changed

- New accounts start from a neutral **sample routine** (14 tasks and 2 vows that show off steps, a counter, bonus tasks and a timed lights-out). Personal routines live only in each user's account.
- The help panel lists your own vows instead of fixed ones.
- The lock screen's residents use their own fixed demo checklist instead of the user's routine.
- The lights-out countdown and the counter messages work with any routine.
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
