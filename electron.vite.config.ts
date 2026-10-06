import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      // music-metadata là ESM-only nên bundle thẳng vào main; các dep còn lại (native) để external.
      externalizeDeps: { exclude: ['music-metadata'] },
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          exportWorker: resolve(__dirname, 'src/main/export/worker.ts'),
          asrWorker: resolve(__dirname, 'src/main/lyrics/asrWorker.ts')
        }
      }
    },
    // AI căn lời: transformers.js được bundle vào asrWorker (ONNX Runtime để external vì có file native / .wasm);
    // nó import sharp (xử lý ảnh) dù chỉ dùng âm thanh → thay bằng bản rỗng
    resolve: { alias: { sharp: resolve(__dirname, 'src/main/lyrics/sharpStub.ts') } }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    // momi-ui (thư viện giao diện) dựng trên Tailwind CSS v4; một bản React duy nhất kể cả khi momi-ui cài bằng file:
    resolve: { dedupe: ['react', 'react-dom'] },
    plugins: [react(), tailwindcss()]
  }
})
