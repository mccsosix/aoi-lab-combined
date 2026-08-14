import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 离线单文件构建：
// 把全部 JS / CSS / 数据内联进一个 offline/index.html，
// 在任何电脑（无需 Node、无需网络、无需安装任何东西）双击即可在浏览器打开。
// 数据更新后，在开发机上重新运行 `npm run build:offline` 即可重新打包。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'offline',
    emptyOutDir: true,
  },
});
