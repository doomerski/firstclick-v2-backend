/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup  # run the command it prints to enable auto-start on boot
 *
 * Commands:
 *   pm2 logs firstclick-api
 *   pm2 status
 *   pm2 restart firstclick-api
 *   pm2 stop firstclick-api
 */

module.exports = {
  apps: [
    {
      name: 'firstclick-api',
      script: 'server.js',
      cwd: '/srv/firstclick/prod/backend',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables (dotenv handles the rest via .env.production)
      env: {
        NODE_ENV: 'production'
      },
      
      // Restart behavior
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 5000,
      shutdown_with_message: true,
      
      // Logging (pino already handles structured logs, but PM2 captures stdout)
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/firstclick/pm2-error.log',
      out_file: '/var/log/firstclick/pm2-out.log',
      merge_logs: true,
      
      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', '.git']
    }
  ]
};
