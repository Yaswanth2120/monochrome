# Contributing to MonoChrome

Thanks for helping out. This guide covers how work moves from an idea to `main`.

## Setup

1. Install Node 22 and pnpm 10. The exact versions are pinned in `.mise.toml`; with [mise](https://mise.jdx.dev), run `mise install`.
2. Install dependencies and start the dev server:

   ```bash
   pnpm install
   pnpm dev   # http://localhost:8443
   ```

## Workflow

`main` is protected. Nobody pushes to it directly, maintainers included. Every change goes through a pull request.

1. Start from an up-to-date `main`:

   ```bash
   git checkout main && git pull
   ```

2. Create a branch named `<type>/<short-description>` in lowercase kebab-case:

   | Prefix      | Use it for                                    | Example                    |
   | ----------- | --------------------------------------------- | -------------------------- |
   | `feature/`  | New functionality                             | `feature/google-login`     |
   | `fix/`      | Bug fixes                                     | `fix/bus-stop-timing`      |
   | `hotfix/`   | Urgent fixes to something live                | `hotfix/lock-screen-crash` |
   | `refactor/` | Restructuring code without changing behaviour | `refactor/town-routes`     |
   | `style/`    | Visual or formatting changes                  | `style/logo-sizing`        |
   | `perf/`     | Speed improvements                            | `perf/phone-traffic`       |
   | `docs/`     | Documentation and screenshots                 | `docs/setup-guide`         |
   | `chore/`    | Tooling, config and dependencies              | `chore/ci-build-check`     |
   | `test/`     | Tests                                         | `test/routine-rules`       |

3. Commit in small, focused steps and push your branch as you go.
4. Open a pull request into `main` and fill in the template.
5. CI must pass and every review conversation must be resolved. PRs are **squash-merged**, and the branch is deleted automatically.

## Pull request titles

The PR title becomes the commit message on `main`, so it follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Google sign-in
fix: stop the bus at Rocky's stop on every lap
docs: add setup guide
chore(deps): update three to 0.188
```

Use `feat`, `fix`, `refactor`, `style`, `perf`, `docs`, `chore`, `test` or `ci`.

## Before you push

Run what CI runs:

```bash
pnpm check   # typecheck, lint, format check, build
pnpm format  # fix formatting if the check fails
```

If your change touches the 3D scenes or the lock screen, open the app and try it on both a desktop window and a phone-sized one. To force a layout, add `?device=desktop`, `?device=tablet` or `?device=phone` to the URL.

## Code style

- TypeScript strict mode, with no `any` unless there's a written reason.
- Formatting is handled by oxfmt (`.oxfmtrc.json`) and linting by oxlint (`.oxlintrc.json`). Don't fight the formatter.
- Keep the world black, white and grey. No coloured lights or UI colours.
- Comments explain _why_, not what.

## Reporting bugs and ideas

Use the issue templates. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
