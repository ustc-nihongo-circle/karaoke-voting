import { existsSync } from 'node:fs';
import config from './theme.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

if (typeof config.theme !== 'string' || !/^[a-z][a-z0-9-]*$/.test(config.theme)) {
  throw new Error('theme.json 需要一个有效的主题目录名');
}
const themeFile = fileURLToPath(new URL('./src/themes/' + config.theme + '/theme.module.css', import.meta.url));
if (!existsSync(themeFile)) throw new Error('找不到观众端主题：' + config.theme);

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@audience-theme': themeFile, '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist/client', rollupOptions: { output: {
    assetFileNames: asset => asset.names?.some(name => name.endsWith('.webp'))
      ? 'assets/covers/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]',
  } } },
});
