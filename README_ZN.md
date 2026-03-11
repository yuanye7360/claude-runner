# Nuxt 4 Monorepo 模板

精簡的 Nuxt 4 起步專案：pnpm workspace + Turborepo，單一應用（`apps/web`），Tailwind CSS、Nuxt UI。適合落地頁或作為擴充基底。

## 基于 Nuxt 4 构建

查看 [Nuxt 4 文档](https://nuxt.com/docs/getting-started/introduction) 了解更多。

## 安装

首先确保已安装 pnpm：

```bash
npm install -g pnpm
```

然后安装依赖：

```bash
pnpm install
```

## 开发服务器

在 `http://localhost:3000` 启动开发服务器：

```bash
pnpm dev
```

这将使用 Turborepo 运行 monorepo 中所有应用的开发服务器。

运行特定应用：

```bash
pnpm --filter web dev
```

## 生产构建

构建生产版本：

```bash
pnpm build
```

这将使用 Turborepo 构建 monorepo 中的所有应用。

构建特定应用：

```bash
pnpm --filter web build
```

本地预览生产构建：

```bash
pnpm --filter web preview
```

## Language / 语言

- [English](./README.md)
- [中文](./README_ZN.md)
