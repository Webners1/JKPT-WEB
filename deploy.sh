#!/bin/bash

# Deployment script for JKPT Web3 application on Ubuntu with NodeJS
# This script will set up a production environment for the Next.js application

# Exit on error
set -e

# Configuration - MODIFY THESE VALUES
APP_NAME="jkpt-web3"
DOMAIN="jackpt.com"  # Your domain
GIT_REPO="https://github.com/Webners1/JKPT-WEB.git"  # Using the repo from package.json
GIT_BRANCH="main"  # Using main branch
NODE_VERSION="20.13.0"  # LTS version as specified in README
PNPM_VERSION="9.1.0"  # As specified in README
USE_SSL=true  # Set to true to set up SSL
USER=$(whoami)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print section header
print_section() {
  echo -e "\n${GREEN}==== $1 ====${NC}\n"
}

# Print info message
print_info() {
  echo -e "${YELLOW}INFO: $1${NC}"
}

# Print error message
print_error() {
  echo -e "${RED}ERROR: $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  print_error "Please run as root or with sudo"
  exit 1
fi

# Update system
print_section "Updating System"
apt update
apt upgrade -y

# Install required packages
print_section "Installing Required Packages"
apt install -y curl git build-essential nginx

# Install Node.js using NVM
print_section "Installing Node.js $NODE_VERSION"
if ! command -v nvm &> /dev/null; then
  print_info "Installing NVM..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

  # Add NVM to .bashrc for the current user
  if [ "$USER" = "root" ]; then
    BASHRC_PATH="/root/.bashrc"
  else
    BASHRC_PATH="/home/$USER/.bashrc"
  fi

  if ! grep -q "NVM_DIR" $BASHRC_PATH; then
    echo 'export NVM_DIR="$HOME/.nvm"' >> $BASHRC_PATH
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> $BASHRC_PATH
    echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> $BASHRC_PATH
  fi

  # Source the .bashrc to make nvm available
  source $BASHRC_PATH
fi

# Install Node.js
nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION

# Install pnpm
print_section "Installing pnpm $PNPM_VERSION"
npm install -g pnpm@$PNPM_VERSION

# Install PM2 for process management
print_section "Installing PM2"
npm install -g pm2

# Create app directory
print_section "Setting up Application Directory"
APP_DIR="/var/www/$APP_NAME"
mkdir -p $APP_DIR
chown -R $USER:$USER $APP_DIR

# Clone repository
print_section "Cloning Repository"
if [ -d "$APP_DIR/.git" ]; then
  print_info "Git repository already exists. Pulling latest changes..."
  cd $APP_DIR
  git pull origin $GIT_BRANCH
else
  print_info "Cloning fresh repository..."
  git clone -b $GIT_BRANCH $GIT_REPO $APP_DIR
  cd $APP_DIR
fi

# Install dependencies
print_section "Installing Dependencies"
cd $APP_DIR
pnpm install

# Build the application
print_section "Building Application"
pnpm build

# Setup PM2 configuration
print_section "Configuring PM2"
cat > $APP_DIR/ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '$APP_DIR',
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

# Setup Nginx configuration
print_section "Configuring Nginx"
cat > /etc/nginx/sites-available/$APP_NAME << EOL
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Add location for static assets if needed
    location /_next/static/ {
        alias $APP_DIR/.next/static/;
        expires 365d;
        access_log off;
    }

    # Add location for public assets
    location /public/ {
        alias $APP_DIR/public/;
        expires 365d;
        access_log off;
    }
}
EOL

# Enable the site
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t

# Set up SSL with Let's Encrypt if requested
if [ "$USE_SSL" = true ]; then
  print_section "Setting up SSL with Let's Encrypt"

  # Install Certbot
  apt install -y certbot python3-certbot-nginx

  # Get SSL certificate
  certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
    print_error "Failed to obtain SSL certificate. Continuing without SSL..."
    USE_SSL=false
  }

  # Auto-renew cron job
  if ! crontab -l | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
  fi
fi

# Restart Nginx
systemctl restart nginx

# Start the application with PM2
print_section "Starting Application with PM2"
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Set up PM2 to start on boot
if [ "$USER" = "root" ]; then
  env PATH=$PATH:/root/.nvm/versions/node/v$NODE_VERSION/bin pm2 startup systemd -u root --hp /root
  systemctl enable pm2-root
else
  env PATH=$PATH:/home/$USER/.nvm/versions/node/v$NODE_VERSION/bin pm2 startup systemd -u $USER --hp /home/$USER
  systemctl enable pm2-$USER
fi

print_section "Deployment Complete!"
echo -e "Your application is now running at: ${GREEN}https://$DOMAIN${NC}"
echo -e "To check the status of your application, run: ${YELLOW}pm2 status${NC}"
echo -e "To view logs, run: ${YELLOW}pm2 logs $APP_NAME${NC}"
echo -e "To restart the application, run: ${YELLOW}pm2 restart $APP_NAME${NC}"

# Print final instructions
print_section "Next Steps"
echo -e "1. Update your DNS settings to point to this server's IP address"
echo -e "2. Modify the configuration in ${YELLOW}$APP_DIR/src/app/providers.tsx${NC} if needed"
echo -e "3. Consider setting up a firewall with: ${YELLOW}ufw enable${NC} and ${YELLOW}ufw allow 'Nginx Full'${NC}"
echo -e "4. Set up regular backups of your application"
