# Changesets

This folder contains configuration and changeset files for the workspace packages. Cherry Studio Lite does **not** run the upstream `release-packages.yml` workflow; packages stay private to this repo unless a maintainer publishes them by hand.

## What is Changesets?

Changesets is a tool to help manage versioning and publishing for multi-package repositories. It tracks changes to packages and automates:

- Version bumping based on semantic versioning
- Changelog generation
- Package publishing
- Dependency updates between packages

## Quick Start

### Adding a changeset

When you make changes that should be published, run:

```bash
pnpm changeset add
```

This will:

1. Ask which packages have changed
2. Ask for the type of change (patch/minor/major)
3. Ask for a description of the change
4. Create a changeset file in `.changeset/`

> **Note**: This fork’s macOS pipeline does not enforce or publish changesets. Keep them if you touch a workspace package so the changelog stays usable.

### Versioning and publishing

Versioning and publishing are handled automatically by CI — you do **not** need to run `changeset version` or `changeset publish` locally. See the [CI/CD Integration](#cicd-integration) section below.

## Configuration

See `config.json` for the changeset configuration:

- **changelog**: Uses `@changesets/changelog-github` to generate GitHub-linked changelogs
- **access**: `public` - packages are published publicly
- **baseBranch**: `main` - PRs target this branch
- **updateInternalDependencies**: `patch` - internal deps are updated on any change

## Packages managed

| Package | Description |
| --- | --- |
| `@cherrystudio/ai-core` | Unified AI Provider Interface |
| `@cherrystudio/ai-sdk-provider` | AI SDK provider bundle with CherryIN routing |

### Dependency relationships

```
ai-core (peer-depends on) → ai-sdk-provider
```

Changeset automatically handles updating peer dependency ranges when `ai-sdk-provider` is published.

## Publishing

There is no automated package-publish job in this fork. If a workspace package must go to npm, a maintainer runs `pnpm changeset:version` and `pnpm changeset:publish` locally after reviewing the pending files.

## Learn more

- [Changesets documentation](https://github.com/changesets/changesets)
- [Common questions](https://github.com/changesets/changesets/blob/main/docs/common-questions.md)
