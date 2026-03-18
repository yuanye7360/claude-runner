// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  // 开发服务器配置
  devServer: {
    port: 3000,
    host: '0.0.0.0',
  },

  // 源目录配置（Nuxt 4 使用 app 目录）
  srcDir: 'app',

  // CSS 配置
  css: ['~/assets/css/main.css'],

  // PostCSS 配置
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {},
    },
  },

  // 模块配置
  modules: ['@nuxt/ui', '@nuxt/image'],

  // Nuxt UI 配置
  ui: {
    fonts: true, // 启用 @nuxt/fonts
  },

  // 字体配置 - 禁用 googleicons 提供商（需访问 Google API，在部分网络环境下不可用）
  fonts: {
    providers: {
      googleicons: false,
    },
  },

  // 运行时配置
  runtimeConfig: {
    // 私有配置（仅服务端可用）
    apiSecret: '',
    // 数据库连接（由 NUXT_DATABASE_* 环境变量注入）
    database: {
      host: '',
      port: 3306,
      user: '',
      password: '',
      database: '',
      connectionLimit: 10,
    },
    // 公共配置（会暴露给客户端）
    public: {
      apiBase: '',
      siteUrl: '',
      siteName: '',
      demoTheme: '',
    },
  },

  // TypeScript 配置
  typescript: {
    strict: true,
    // typeCheck: true, // 开发时禁用，IDE 已提供类型检查；构建时会自动进行类型检查
  },

  // 性能优化
  experimental: {
    payloadExtraction: false,
  },

  // 构建优化
  nitro: {
    compressPublicAssets: true,
    minify: true,
  },

  // SEO 配置
  app: {
    head: {
      charset: 'utf8',
      viewport: 'width=device-width, initial-scale=1',
      titleTemplate: '%s - Nuxtship',
      meta: [
        { name: 'description', content: '使用 Nuxt 构建的现代化 Web 应用' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    },
  },
});
