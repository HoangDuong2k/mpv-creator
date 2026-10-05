// Trang landing của Playlist Video Maker: Astro (HTML tĩnh) + momi-ui, đăng lên GitHub Pages
// https://hoangduong2k.github.io/mpv-creator/  (tiếng Việt ở /, tiếng Anh ở /en/)
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://hoangduong2k.github.io',
  base: '/mpv-creator',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    sitemap({ i18n: { defaultLocale: 'vi', locales: { vi: 'vi-VN', en: 'en-US' } } })
  ],
  i18n: { defaultLocale: 'vi', locales: ['vi', 'en'], routing: { prefixDefaultLocale: false } },
  vite: {
    plugins: [tailwindcss()],
    resolve: { dedupe: ['react', 'react-dom'] },
    // Token màu dùng chung với app nằm ở ../src/shared/theme.css (và engine hiệu ứng sau này)
    server: { fs: { allow: ['..'] } }
  }
})
