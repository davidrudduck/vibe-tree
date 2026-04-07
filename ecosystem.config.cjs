module.exports = {
  apps: [
    {
      name: 'vibetree-server',
      cwd: '/data/Code/vibe-tree',
      script: 'pnpm',
      args: 'dev:server',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '5s',
      env: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0',
        PORT: '3003',
      },
      error_file: '/tmp/vibetree-server-error.log',
      out_file: '/tmp/vibetree-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
