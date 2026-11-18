// Vite 設定：一個專案、三個頁面（手機互動、大螢幕、管理頁）
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { localApi } from './scripts/local-api-plugin.js';

export default defineConfig({
  plugins: [
    react(),
    // 本機測試用的小後端：還沒接 Firebase 前，手機和大螢幕靠它互通資料
    localApi(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), // 手機互動 App
        screen: resolve(__dirname, 'screen.html'), // 展場大螢幕
        admin: resolve(__dirname, 'admin.html'), // 管理頁（刪除不當內容）
      },
    },
  },
  // 去背套件用到 WebAssembly，不要讓 Vite 預先打包它
  optimizeDeps: { exclude: ['@imgly/background-removal'] },
});
