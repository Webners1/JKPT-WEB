# Deployment Guide for JKPT Web3 Application

This guide explains how to deploy the JKPT Web3 application on an Ubuntu server with Node.js.

## Prerequisites

- An Ubuntu server (preferably Ubuntu 22.04 LTS or newer)
- A domain name pointing to your server
- Root or sudo access to the server

## Deployment Options

### Option 1: Automated Deployment Script

We've provided a deployment script that automates the entire setup process.

1. Upload the `deploy.sh` script to your server:
   ```bash
   scp deploy.sh user@your-server-ip:~/
   ```

2. Connect to your server:
   ```bash
   ssh user@your-server-ip
   ```

3. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```

4. Edit the configuration variables at the top of the script:
   ```bash
   nano deploy.sh
   ```
   
   Update the following variables:
   - `APP_NAME`: Name for your application (used for directories and configuration)
   - `DOMAIN`: Your domain name (e.g., example.com)
   - `GIT_REPO`: URL of your Git repository
   - `GIT_BRANCH`: Branch to deploy (usually main or master)
   - `USE_SSL`: Set to true to configure SSL with Let's Encrypt

5. Run the script with sudo:
   ```bash
   sudo ./deploy.sh
   ```

6. The script will:
   - Update the system
   - Install Node.js, pnpm, and other dependencies
   - Clone your repository
   - Build the application
   - Configure Nginx as a reverse proxy
   - Set up SSL with Let's Encrypt (if enabled)
   - Configure PM2 for process management
   - Start your application

### Option 2: Manual Deployment

If you prefer to deploy manually or need more control over the process, follow these steps:

#### 1. Update System and Install Dependencies

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx
```

#### 2. Install Node.js

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20.13.0
nvm use 20.13.0
nvm alias default 20.13.0
```

#### 3. Install pnpm and PM2

```bash
npm install -g pnpm@9.1.0
npm install -g pm2
```

#### 4. Clone and Build the Application

```bash
sudo mkdir -p /var/www/jkpt-web3
sudo chown -R $USER:$USER /var/www/jkpt-web3
git clone https://github.com/yourusername/JKPT.git /var/www/jkpt-web3
cd /var/www/jkpt-web3
pnpm install
pnpm build
```

#### 5. Configure PM2

Create an ecosystem.config.js file:

```bash
cat > /var/www/jkpt-web3/ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'jkpt-web3',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/jkpt-web3',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOL
```

#### 6. Configure Nginx

Create a new Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/jkpt-web3
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /_next/static/ {
        alias /var/www/jkpt-web3/.next/static/;
        expires 365d;
        access_log off;
    }

    location /public/ {
        alias /var/www/jkpt-web3/public/;
        expires 365d;
        access_log off;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/jkpt-web3 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 7. Set Up SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

#### 8. Start the Application with PM2

```bash
cd /var/www/jkpt-web3
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Maintenance and Operations

### Updating the Application

To update the application to the latest version:

```bash
cd /var/www/jkpt-web3
git pull
pnpm install
pnpm build
pm2 restart jkpt-web3
```

### Monitoring

Monitor your application with PM2:

```bash
pm2 status
pm2 logs jkpt-web3
pm2 monit
```

### Backup

Regularly backup your application:

```bash
# Example backup script
tar -czf /backup/jkpt-web3-$(date +%Y%m%d).tar.gz /var/www/jkpt-web3
```

## Troubleshooting

### Application Not Starting

Check the PM2 logs:

```bash
pm2 logs jkpt-web3
```

### Nginx Issues

Check the Nginx error logs:

```bash
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Issues

Check the Certbot logs:

```bash
sudo certbot renew --dry-run
```

## Security Considerations

1. Set up a firewall:
   ```bash
   sudo ufw enable
   sudo ufw allow 'Nginx Full'
   sudo ufw allow OpenSSH
   ```

2. Keep your system updated:
   ```bash
   sudo apt update
   sudo apt upgrade
   ```

3. Consider setting up fail2ban to protect against brute force attacks:
   ```bash
   sudo apt install fail2ban
   ```

4. Regularly check for security updates for your Node.js application:
   ```bash
   pnpm audit
   ```
