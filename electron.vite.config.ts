import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react-swc'
import { CodeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

// assert not supported by biome
// import pkg from './package.json' assert { type: 'json' }
import pkg from './package.json'
import { uiContractPlugin } from './scripts/uiContract/vitePlugin'

const visualizerPlugin = (type: 'renderer' | 'main') => {
  return process.env[`VISUALIZER_${type.toUpperCase()}`] ? [visualizer({ open: true })] : []
}

const isDev = process.env.NODE_ENV === 'development'
const isProd = process.env.NODE_ENV === 'production'

// Bundle/externalize split for the main process: everything in `dependencies` is
// marked `external` below (kept in node_modules of the packaged app), and everything
// NOT in `dependencies` (i.e. in `devDependencies`) is bundled into the main bundle by
// rollup. The API gateway's Elysia stack (`elysia`, `@elysia/*`) is intentionally in
// `devDependencies` for exactly this reason — it is pure JS and bundles cleanly. Do NOT
// move it to `dependencies`: that would externalize it, and since devDependencies are
// pruned from production packages, the packaged app would fail at runtime with
// MODULE_NOT_FOUND (no test catches this).
const mainExternalDependencies = Object.keys(pkg.dependencies)
const mainExternalModules = ['bufferutil', 'utf-8-validate', 'electron', ...mainExternalDependencies]

export const isMainExternalModule = (id: string) => {
  return mainExternalModules.some((moduleId) => id === moduleId || id.startsWith(`${moduleId}/`))
}

export default defineConfig({
  main: {
    plugins: [...visualizerPlugin('main')],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@application': resolve('src/main/core/application/Application'),
        '@data': resolve('src/main/data'),
        '@shared': resolve('src/shared'),
        '@logger': resolve('src/main/core/logger/LoggerService'),
        '@cherrystudio/web-search/catalog': resolve('packages/web-search/src/catalog.ts'),
        '@cherrystudio/web-search/providers/zhipu': resolve('packages/web-search/src/providers/zhipu.ts'),
        '@cherrystudio/web-search/providers/tavily': resolve('packages/web-search/src/providers/tavily.ts'),
        '@cherrystudio/web-search/providers/searxng': resolve('packages/web-search/src/providers/searxng.ts'),
        '@cherrystudio/web-search/providers/exa': resolve('packages/web-search/src/providers/exa.ts'),
        '@cherrystudio/web-search/providers/exa-mcp': resolve('packages/web-search/src/providers/exaMcp.ts'),
        '@cherrystudio/web-search/providers/bocha': resolve('packages/web-search/src/providers/bocha.ts'),
        '@cherrystudio/web-search/providers/querit': resolve('packages/web-search/src/providers/querit.ts'),
        '@cherrystudio/web-search/providers/jina': resolve('packages/web-search/src/providers/jina.ts'),
        '@cherrystudio/web-search/providers/firecrawl': resolve('packages/web-search/src/providers/firecrawl.ts'),
        '@cherrystudio/web-search/providers/crawl4ai': resolve('packages/web-search/src/providers/crawl4ai.ts'),
        '@cherrystudio/web-search/providers/parallel': resolve('packages/web-search/src/providers/parallel.ts'),
        '@cherrystudio/web-search/providers/serply': resolve('packages/web-search/src/providers/serply.ts'),
        '@cherrystudio/web-search/providers/yuanbao': resolve('packages/web-search/src/providers/yuanbao.ts'),
        '@cherrystudio/web-search/providers/deepseek': resolve('packages/web-search/src/providers/deepseek.ts'),
        '@cherrystudio/web-search/providers/desearch': resolve('packages/web-search/src/providers/desearch.ts'),
        '@cherrystudio/web-search/providers/searchapi': resolve('packages/web-search/src/providers/searchapi.ts'),
        '@cherrystudio/web-search/tools/config': resolve('packages/web-search/src/tools/config.ts'),
        '@cherrystudio/web-search/tools/url-filter': resolve('packages/web-search/src/tools/urlFilter.ts'),
        '@cherrystudio/web-search/tools/content': resolve('packages/web-search/src/tools/content.ts'),
        '@cherrystudio/web-search': resolve('packages/web-search/src/index.ts'),
        '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core'),
        '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
        '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
        '@cherrystudio/ai-core': resolve('packages/aiCore/src'),
        '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
        '@cherrystudio/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
        '@cherrystudio/provider-registry': resolve('packages/provider-registry/src'),
        '@test-mocks': resolve('tests/__mocks__'),
        '@test-helpers': resolve('tests/helpers')
      }
    },
    build: {
      lib: { entry: resolve(__dirname, 'src/main/main.ts') },
      rollupOptions: {
        external: isMainExternalModule,
        output: {
          manualChunks: undefined, // 彻底禁用代码分割 - 返回 null 强制单文件打包
          inlineDynamicImports: true // 内联所有动态导入，这是关键配置
        },
        onwarn(warning, warn) {
          if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
          warn(warning)
        }
      },
      sourcemap: isDev
    },
    esbuild: isProd ? { legalComments: 'none' } : {},
    optimizeDeps: {
      noDiscovery: isDev
    }
  },
  preload: {
    plugins: [
      react({
        tsDecorators: true
      })
    ],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@cherrystudio/web-search/catalog': resolve('packages/web-search/src/catalog.ts'),
        '@cherrystudio/web-search/providers/zhipu': resolve('packages/web-search/src/providers/zhipu.ts'),
        '@cherrystudio/web-search/providers/tavily': resolve('packages/web-search/src/providers/tavily.ts'),
        '@cherrystudio/web-search/providers/searxng': resolve('packages/web-search/src/providers/searxng.ts'),
        '@cherrystudio/web-search/providers/exa': resolve('packages/web-search/src/providers/exa.ts'),
        '@cherrystudio/web-search/providers/exa-mcp': resolve('packages/web-search/src/providers/exaMcp.ts'),
        '@cherrystudio/web-search/providers/bocha': resolve('packages/web-search/src/providers/bocha.ts'),
        '@cherrystudio/web-search/providers/querit': resolve('packages/web-search/src/providers/querit.ts'),
        '@cherrystudio/web-search/providers/jina': resolve('packages/web-search/src/providers/jina.ts'),
        '@cherrystudio/web-search/providers/firecrawl': resolve('packages/web-search/src/providers/firecrawl.ts'),
        '@cherrystudio/web-search/providers/crawl4ai': resolve('packages/web-search/src/providers/crawl4ai.ts'),
        '@cherrystudio/web-search/providers/parallel': resolve('packages/web-search/src/providers/parallel.ts'),
        '@cherrystudio/web-search/providers/serply': resolve('packages/web-search/src/providers/serply.ts'),
        '@cherrystudio/web-search/providers/yuanbao': resolve('packages/web-search/src/providers/yuanbao.ts'),
        '@cherrystudio/web-search/providers/deepseek': resolve('packages/web-search/src/providers/deepseek.ts'),
        '@cherrystudio/web-search/providers/desearch': resolve('packages/web-search/src/providers/desearch.ts'),
        '@cherrystudio/web-search/providers/searchapi': resolve('packages/web-search/src/providers/searchapi.ts'),
        '@cherrystudio/web-search/tools/config': resolve('packages/web-search/src/tools/config.ts'),
        '@cherrystudio/web-search/tools/url-filter': resolve('packages/web-search/src/tools/urlFilter.ts'),
        '@cherrystudio/web-search/tools/content': resolve('packages/web-search/src/tools/content.ts'),
        '@cherrystudio/web-search': resolve('packages/web-search/src/index.ts'),
        '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core')
      }
    },
    build: {
      sourcemap: isDev,
      rollupOptions: {
        // Unlike renderer which auto-discovers entries from HTML files,
        // preload requires explicit entry point configuration for multiple scripts
        input: {
          preload: resolve(__dirname, 'src/preload/preload.ts'),
          simplest: resolve(__dirname, 'src/preload/simplest.ts') // Minimal preload
        },
        external: ['electron'],
        output: {
          entryFileNames: '[name].js',
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [
      uiContractPlugin(),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve('src/renderer/routes'),
        generatedRouteTree: resolve('src/renderer/routeTree.gen.ts')
      }),
      (async () => (await import('@tailwindcss/vite')).default())(),
      react({
        tsDecorators: true
      }),
      ...(isDev ? [CodeInspectorPlugin({ bundler: 'vite' })] : []), // 只在开发环境下启用 CodeInspectorPlugin
      ...visualizerPlugin('renderer')
    ],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
        '@logger': resolve('src/renderer/services/LoggerService'),
        '@data': resolve('src/renderer/data'),
        '@cherrystudio/web-search/catalog': resolve('packages/web-search/src/catalog.ts'),
        '@cherrystudio/web-search/providers/zhipu': resolve('packages/web-search/src/providers/zhipu.ts'),
        '@cherrystudio/web-search/providers/tavily': resolve('packages/web-search/src/providers/tavily.ts'),
        '@cherrystudio/web-search/providers/searxng': resolve('packages/web-search/src/providers/searxng.ts'),
        '@cherrystudio/web-search/providers/exa': resolve('packages/web-search/src/providers/exa.ts'),
        '@cherrystudio/web-search/providers/exa-mcp': resolve('packages/web-search/src/providers/exaMcp.ts'),
        '@cherrystudio/web-search/providers/bocha': resolve('packages/web-search/src/providers/bocha.ts'),
        '@cherrystudio/web-search/providers/querit': resolve('packages/web-search/src/providers/querit.ts'),
        '@cherrystudio/web-search/providers/jina': resolve('packages/web-search/src/providers/jina.ts'),
        '@cherrystudio/web-search/providers/firecrawl': resolve('packages/web-search/src/providers/firecrawl.ts'),
        '@cherrystudio/web-search/providers/crawl4ai': resolve('packages/web-search/src/providers/crawl4ai.ts'),
        '@cherrystudio/web-search/providers/parallel': resolve('packages/web-search/src/providers/parallel.ts'),
        '@cherrystudio/web-search/providers/serply': resolve('packages/web-search/src/providers/serply.ts'),
        '@cherrystudio/web-search/providers/yuanbao': resolve('packages/web-search/src/providers/yuanbao.ts'),
        '@cherrystudio/web-search/providers/deepseek': resolve('packages/web-search/src/providers/deepseek.ts'),
        '@cherrystudio/web-search/providers/desearch': resolve('packages/web-search/src/providers/desearch.ts'),
        '@cherrystudio/web-search/providers/searchapi': resolve('packages/web-search/src/providers/searchapi.ts'),
        '@cherrystudio/web-search/tools/config': resolve('packages/web-search/src/tools/config.ts'),
        '@cherrystudio/web-search/tools/url-filter': resolve('packages/web-search/src/tools/urlFilter.ts'),
        '@cherrystudio/web-search/tools/content': resolve('packages/web-search/src/tools/content.ts'),
        '@cherrystudio/web-search': resolve('packages/web-search/src/index.ts'),
        '@mcp-trace/trace-core': resolve('packages/mcp-trace/trace-core'),
        '@cherrystudio/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
        '@cherrystudio/ai-core/built-in/plugins': resolve('packages/aiCore/src/core/plugins/built-in'),
        '@cherrystudio/ai-core': resolve('packages/aiCore/src'),
        '@cherrystudio/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
        '@cherrystudio/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
        '@cherrystudio/provider-registry': resolve('packages/provider-registry/src'),
        '@cherrystudio/ui/icons': resolve('packages/ui/src/components/icons'),
        '@cherrystudio/ui': resolve('packages/ui/src'),
        '@test-mocks': resolve('tests/__mocks__')
      }
    },
    optimizeDeps: {
      exclude: ['pyodide'],
      esbuildOptions: {
        target: 'esnext' // for dev
      }
    },
    worker: {
      format: 'es'
    },
    build: {
      target: 'esnext', // for build
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/windows/main/index.html'),
          audioHost: resolve(__dirname, 'src/renderer/windows/audioHost/index.html'),
          quickAssistant: resolve(__dirname, 'src/renderer/windows/quickAssistant/index.html'),
          selectionToolbar: resolve(__dirname, 'src/renderer/windows/selection/toolbar/index.html'),
          selectionAction: resolve(__dirname, 'src/renderer/windows/selection/action/index.html'),
          migrationV2: resolve(__dirname, 'src/renderer/windows/migrationV2/index.html'),
          userDataRelocation: resolve(__dirname, 'src/renderer/windows/userDataRelocation/index.html'),
          subWindow: resolve(__dirname, 'src/renderer/windows/subWindow/index.html')
        },
        onwarn(warning, warn) {
          if (warning.code === 'COMMONJS_VARIABLE_IN_ESM') return
          warn(warning)
        }
      }
    },
    esbuild: isProd ? { legalComments: 'none' } : {}
  }
})
