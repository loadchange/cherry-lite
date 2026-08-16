# V2 数据分类工具

本目录只保留数据层代码生成管线，不再放重构工作笔记。

```
v2-refactor-temp/
└── tools/data-classify/   # 从 classification.json 生成 Preference / BootConfig schema 与迁移映射
```

`classification.json` 是数据层 key 的单一来源。生成物写到正式目录，不要手改：

- `src/shared/data/preference/preferenceSchemas.ts`
- `src/shared/data/bootConfig/bootConfigSchemas.ts`
- `src/main/data/migration/v2/migrators/mappings/PreferencesMappings.ts`
- `src/main/data/migration/v2/migrators/mappings/BootConfigMappings.ts`

改 `tools/data-classify/data/classification.json` 或 `target-key-definitions.json` 后：

```bash
cd v2-refactor-temp/tools/data-classify && npm run generate
```

详见 [tools/data-classify/README.md](./tools/data-classify/README.md)。
