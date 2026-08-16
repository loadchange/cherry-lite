# 应用更新

## 概览

Cherry Studio Lite 通过本仓库的 GitHub Releases 检查更新，不走上游的 `releases.cherry-ai.com`。

打包配置见 `electron-builder.yml` 的 `publish`：

```yaml
publish:
  provider: github
  owner: loadchange
  repo: cherry-studio-lite
```

开发态 `forceDevUpdateConfig = true`，electron-updater 读仓库根目录的 `dev-app-update.yml`（同样指向这个 GitHub 仓库）。

## 通道

客户端始终使用 `latest`。About 页已去掉测试通道开关；即便偏好里还留着 `app.dist.test_plan.*`，更新服务也会忽略，不会切到 `rc` / `beta`。

## 请求头

每次检查前会带上：

| Header | 值 |
| --- | --- |
| `Client-Id` | 本机客户端 ID |
| `App-Name` | 应用名 |
| `App-Version` | 当前版本，带 `v` 前缀 |
| `OS` | `process.platform` |
| `X-Region` | 中国为 `cn`，否则 `global` |
| `User-Agent` | 生成的应用 UA |
| `Cache-Control` | `no-cache` |

## 检查节奏

手动检查在开发态和已打包的非 portable 构建里可用。portable 不查更新。已打包的非 portable 构建还会在主进程里定时检查：成功后按正常间隔，失败则指数退避。进度通过 IpcApi 推到主窗口。
