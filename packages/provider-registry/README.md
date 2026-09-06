# @cherrystudio/provider-registry

Bundled AI provider and model catalog for Cherry Studio: static JSON data files plus TypeScript schemas for reading them.

> **Internal package — not published to npm.** It's `private` and consumed only inside this monorepo (the app resolves it to `src/` directly; the main process reads `data/*.json` from the bundled resources). The imports below are for in-repo consumers via the workspace, not an external install.

> **Contributing?** The `data/*.json` files are **generated** — never hand-edit them. Edit `src/creators/` / `src/providers/` and run `pnpm generate`. See [CLAUDE.md](CLAUDE.md) and [docs/architecture.md](docs/architecture.md).

## Data Files

```
data/
  models.json            # Base model catalog (capabilities, limits, pricing)
  providers.json         # Provider configurations (endpoints, API features)
  provider-models.json   # Per-provider model overrides
```

## Usage

```typescript
import {
  readModelRegistry,
  readProviderRegistry,
  readProviderModelRegistry
} from '@cherrystudio/provider-registry/node'

const models = readModelRegistry('/path/to/models.json')
const providers = readProviderRegistry('/path/to/providers.json')
const overrides = readProviderModelRegistry('/path/to/provider-models.json')
```

## Schema Types

```typescript
import type {
  ProtoModelConfig,
  ProtoProviderConfig,
  ProtoProviderModelOverride,
  EndpointType,
  ModelCapability,
  Modality
} from '@cherrystudio/provider-registry'
```

## Build

For selective backports, set `CATALOG_BASE_DIR` to an extracted copy of the existing
`data/` snapshot, `CATALOG_MODEL_IDS` to comma-separated model IDs, and
`CATALOG_PROVIDER_MODELS` to comma-separated `providerId/modelId` keys. Generation
then replaces only those rows; all other model metadata, prices, and served IDs
stay pinned to the snapshot. `CATALOG_REASONING_PROVIDERS` can additionally refresh
reasoning descriptors on existing rows for selected providers (for example,
`openrouter`). The normal `MODELSDEV_CACHE`, `OPENROUTER_CACHE`, and
`OPENROUTER_IMAGE_CACHE` inputs still allow an entirely offline run. Generated
versions and runtime patterns are rebuilt from the merged catalog.

```bash
pnpm build
```
