module.exports = {
  apps: [{
    name: 'jkpt-web3',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/jkpt-web3',  // Update this path if you use a different directory
    instances: 'max',           // Use max to utilize all available CPUs
    exec_mode: 'cluster',       // Run in cluster mode for load balancing
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',   // Restart if memory usage exceeds 1GB
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Optional: Configure log files
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/pm2/jkpt-web3-error.log',
    out_file: '/var/log/pm2/jkpt-web3-out.log',
    // Optional: Configure metrics for monitoring
    merge_logs: true,
    // Optional: Configure restart delay
    restart_delay: 4000,
    // Optional: Configure graceful shutdown
    kill_timeout: 5000,
    // Optional: Configure environment variables for different environments
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    }
  }]
};
