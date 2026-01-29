# Publishing

This project uses **semantic-release** with **npm trusted publishing (OIDC)** for fully automated releases. No npm tokens or secrets are required.

## How It Works

1. Push commits to `main` using [conventional commits](https://www.conventionalcommits.org/)
2. The `release.yml` GitHub Action runs automatically
3. `semantic-release` analyzes commits, determines the version bump, publishes to npm, creates a GitHub release, and updates `CHANGELOG.md`

### Commit Types and Version Bumps

| Commit | Version |
|---|---|
| `feat: ...` | minor (0.x.0) |
| `fix: ...` | patch (0.0.x) |
| `perf: ...` | patch |
| `docs(README): ...` | patch |
| `feat!: ...` or `BREAKING CHANGE:` | major (x.0.0) |
| `chore:`, `ci:`, `refactor:`, `test:` | no release |

## One-Time Setup: NPM Trusted Publisher

Configure OIDC trusted publishing on npmjs.com so GitHub Actions can publish without tokens:

1. Go to https://www.npmjs.com/package/convex-notifications/access
2. Under **Publishing access**, add a trusted publisher
3. Set:
   - **Owner**: `chiemerieokorie`
   - **Repository**: `convex-notifications`
   - **Workflow**: `release.yml`
4. Save

Once configured, any push to `main` with a releasable commit will auto-publish.

## Building a One-Off Package

```sh
npm run build:clean
npm pack
```

Provide the `.tgz` file to others via `npm install ./path/to/convex-notifications-x.x.x.tgz`.
