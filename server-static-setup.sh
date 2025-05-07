#!/bin/bash

# Server setup script for static Next.js site
# This script sets up Nginx to serve the static files

# Exit on error
set -e

# Configuration
DOMAIN="jackpt.com"
APP_NAME="jkpt-web3"
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
apt install -y nginx

# Setup Nginx configuration
print_section "Configuring Nginx"
cat > /etc/nginx/sites-available/$APP_NAME << EOL
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    root $APP_DIR;
    index index.html;

    # Serve static files
    location / {
        try_files \$uri \$uri.html \$uri/ /index.html;
        add_header Cache-Control "public, max-age=3600";
    }

    # Cache static assets
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Cache other static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
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

# Set up SSL with Let's Encrypt
print_section "Setting up SSL with Let's Encrypt"

# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
  print_error "Failed to obtain SSL certificate. Continuing without SSL..."
}

# Auto-renew cron job
if ! crontab -l | grep -q "certbot renew"; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet") | crontab -
fi

# Restart Nginx
systemctl restart nginx

# Set up basic firewall
print_section "Setting up Firewall"
apt install -y ufw
ufw allow OpenSSH
ufw allow 'Nginx Full'
echo "y" | ufw enable

print_section "Setup Complete!"
echo -e "Your static site is now running at: ${GREEN}https://$DOMAIN${NC}"
