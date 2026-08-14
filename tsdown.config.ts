/**
 * Build config for dsh-password-prompt.
 *
 * Two artifacts, mirroring DeepSeek Harness' dual-face plugin layout:
 *
 *  - lib/index.js   — the NODE half (ESM): a normal Cordis plugin that
 *    registers the model-facing `password_prompt` tool.
 *  - lib/client.js  — the BROWSER half (CJS closure factory): the artifact
 *    the DSH web client-modules scanner serves at /plugins/<id>/client.js.
 *    It must call window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 *    exactly like the harness' own clientBundle helper, so the browser
 *    loader can register the plugin against the frozen module table.
 *
 * Dev-time note: the @deepseek-ai/* peer packages are provided by the host
 * DSH installation at runtime and by a linked DSH checkout at build time
 * (see README). The browser half externalizes only react (+ jsx-runtime);
 * every other import it makes is type-only and erased at build time.
 */
import { defineConfig } from 'tsdown'

const id = 'dsh-password-prompt'

export default defineConfig([
  {
    name: id,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: false,
    // The host DSH installation provides the @deepseek-ai peer packages at
    // runtime (resolved through the profile tree's node_modules); the node
    // half must never inline them.
    external: [/^@deepseek-ai\//],
  },
  {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: ['react', 'react/jsx-runtime'],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
