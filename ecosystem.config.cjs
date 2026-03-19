const path = require('path');

module.exports = {
  apps: [
    {
      name: 'claude-runner',
      port: 5688,
      script: '.output/server/index.mjs',
      cwd: path.join(__dirname, 'apps/web'),
      env: {
        PORT: 5688,
        HOST: '0.0.0.0',
        NODE_ENV: 'production',
      },
    },
  ],
};
