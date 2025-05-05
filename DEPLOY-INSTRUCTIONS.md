# Deployment Instructions for JKPT Web3 Application

Follow these steps to deploy your application on your Ubuntu server.

## Server Details
- IP Address: 134.209.83.136
- Domain: jackpt.com
- User: root

## Deployment Steps

### 1. Connect to Your Server

```bash
ssh root@134.209.83.136
```

When prompted, enter your password: ``

### 2. Download and Run the Installation Script

Once connected to your server, run the following commands:

```bash
# Create a temporary directory
mkdir -p ~/deployment
cd ~/deployment

# Download the installation script
curl -O https://raw.githubusercontent.com/yourusername/JKPT/main/install.sh || {
  echo "Failed to download from GitHub. Creating script locally..."
  cat > install.sh << 'EOL'
#!/bin/bash

# Simple installation script to download and run the deployment script
# Run this on your Ubuntu server

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}==== JKPT Web3 Application Installer ====${NC}"
echo -e "${YELLOW}This script will download and run the deployment script for your application.${NC}"
echo -e "${YELLOW}Make sure you are running this as root or with sudo.${NC}"
echo

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}ERROR: Please run as root or with sudo${NC}"
  exit 1
fi

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
cd $TEMP_DIR

echo -e "${GREEN}Downloading deployment script...${NC}"
curl -O https://raw.githubusercontent.com/4D5A90/quickstart-nextjs-web3/main/deploy.sh || {
  echo -e "${RED}Failed to download deployment script. Creating it locally...${NC}"
  
  # Create the deployment script locally
  cat > deploy.sh << 'EOL'
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
EOL
}

# Make the script executable
chmod +x deploy.sh

echo -e "${GREEN}Running deployment script...${NC}"
./deploy.sh

# Clean up
cd -
rm -rf $TEMP_DIR

echo -e "${GREEN}Installation complete!${NC}"
EOL
}

# Make the script executable
chmod +x install.sh

# Run the installation script
./install.sh
```

### 3. Wait for the Installation to Complete

The installation process will:
1. Update your system
2. Install Node.js, pnpm, and other dependencies
3. Clone the repository
4. Build the application
5. Configure Nginx as a reverse proxy
6. Set up SSL with Let's Encrypt
7. Start your application with PM2

This process may take 10-15 minutes to complete.

### 4. Verify the Deployment

After the installation is complete, you can verify that your application is running:

```bash
# Check the status of your application
pm2 status

# View the application logs
pm2 logs jkpt-web3
```

You should be able to access your application at:
- https://jackpt.com
- https://www.jackpt.com

### 5. Troubleshooting

If you encounter any issues:

1. Check the Nginx error logs:
   ```bash
   tail -f /var/log/nginx/error.log
   ```

2. Check the application logs:
   ```bash
   pm2 logs jkpt-web3
   ```

3. Restart the application:
   ```bash
   pm2 restart jkpt-web3
   ```

4. Restart Nginx:
   ```bash
   systemctl restart nginx
   ```

### 6. Updating the Application

To update your application in the future:

```bash
cd /var/www/jkpt-web3
git pull
pnpm install
pnpm build
pm2 restart jkpt-web3
```

## Security Recommendations

1. Set up a firewall:
   ```bash
   ufw enable
   ufw allow 'Nginx Full'
   ufw allow OpenSSH
   ```

2. Create a non-root user for future management:
   ```bash
   adduser newuser
   usermod -aG sudo newuser
   ```

3. Set up regular backups of your application:
   ```bash
   mkdir -p /var/backups/jkpt-web3
   tar -czf /var/backups/jkpt-web3/backup-$(date +%Y%m%d).tar.gz /var/www/jkpt-web3
   ```
