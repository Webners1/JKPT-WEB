#!/bin/bash

# Server setup script for JKPT Web3 application
# This script prepares the server environment and cleans up existing files

# Exit on error
set -e

# Configuration
APP_NAME="jkpt-web3"
DOMAIN="jackpt.com"
GIT_REPO="https://github.com/Webners1/JKPT-WEB.git"
GIT_BRANCH="master"
NODE_VERSION="20.13.0"
USE_SSL=true
APP_DIR="/var/www/$APP_NAME"

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
print_info "Installing Node.js $NODE_VERSION..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION

# Install yarn and PM2
print_section "Installing Yarn and PM2"
npm install -g yarn
npm install -g pm2

# Create app directory
print_section "Setting up Application Directory"
mkdir -p $APP_DIR

# Clean up existing directory if it's not empty
if [ "$(ls -A $APP_DIR)" ]; then
  print_info "Directory is not empty. Cleaning it first..."
  
  # Stop any running PM2 processes for this app
  if command -v pm2 &> /dev/null; then
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
  fi
  
  # Backup important files if needed
  if [ -f "$APP_DIR/.env" ]; then
    print_info "Backing up .env file..."
    cp $APP_DIR/.env $APP_DIR/.env.backup
  fi
  
  # Remove all files except backups
  find $APP_DIR -mindepth 1 -not -name "*.backup" -exec rm -rf {} \; 2>/dev/null || true
  
  print_info "Directory cleaned successfully"
fi

# Set proper ownership
chown -R $USER:$USER $APP_DIR

# Clone repository
print_section "Cloning Repository"
print_info "Cloning fresh repository..."
git clone -b $GIT_BRANCH $GIT_REPO $APP_DIR
cd $APP_DIR

# Install dependencies
print_section "Installing Dependencies"
yarn install

# Build the application
print_section "Building Application"
print_info "Building with memory limits to avoid OOM errors..."
export NODE_OPTIONS="--max-old-space-size=1024"

# Create swap file if it doesn't exist
if [ ! -f /swapfile ]; then
  print_info "Creating 2GB swap file to help with memory issues..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
  print_info "Swap file created and enabled"
fi

# Build the application
yarn build

# Setup PM2 configuration
print_section "Configuring PM2"
cat > $APP_DIR/ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '$APP_DIR',
    instances: '1',
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

# Remove default site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

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

# Set up basic firewall
print_section "Setting up Firewall"
apt install -y ufw
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo "y" | ufw enable

print_section "Deployment Complete!"
echo -e "Your application is now running at: ${GREEN}https://$DOMAIN${NC}"
echo -e "To check the status of your application, run: ${YELLOW}pm2 status${NC}"
echo -e "To view logs, run: ${YELLOW}pm2 logs $APP_NAME${NC}"
echo -e "To restart the application, run: ${YELLOW}pm2 restart $APP_NAME${NC}"
