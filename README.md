# Nuxt 4 Monorepo Template

Minimal Nuxt 4 starter with pnpm workspace and Turborepo. Single app (`apps/web`), Tailwind CSS, Nuxt UI. Suited for landing pages or as a base to extend.

## Built with Nuxt 4

Look at the [Nuxt 4 documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install pnpm first:

```bash
npm install -g pnpm
```

Then install the dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

This will run the dev server for all apps in the monorepo using Turborepo.

To run a specific app:

```bash
pnpm --filter web dev
```

## Production

Build the application for production:

```bash
pnpm build
```

This will build all apps in the monorepo using Turborepo.

To build a specific app:

```bash
pnpm --filter web build
```

Locally preview production build:

```bash
pnpm --filter web preview
```

## Language / 语言

- [English](./README.md)
- [中文](./README_ZN.md)
