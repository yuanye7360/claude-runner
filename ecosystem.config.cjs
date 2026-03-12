module.exports = {
  apps: [
    {
      name: 'claude-runner',
      port: 5688,
      script: '.output/server/index.mjs',
      cwd: './apps/web',
      env: {
        PORT: 5688,
        HOST: '0.0.0.0',
        NODE_ENV: 'production',
      },
    },
  ],
};
