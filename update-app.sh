#!/bin/bash

# Script to update the JKPT Web3 application
# This script should be run from the application directory

# Exit on error
set -e

# Configuration
APP_DIR="/var/www/jkpt-web3"  # Update this to match your application directory
APP_NAME="jkpt-web3"          # Update this to match your PM2 application name
GIT_BRANCH="master"             # Update this to match your branch

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

# Check if running in the correct directory
if [ ! -d "$APP_DIR/.git" ]; then
  print_error "This script must be run from the application directory or with the correct APP_DIR set"
  exit 1
fi

# Navigate to the application directory
cd $APP_DIR

# Create a backup
print_section "Creating Backup"
BACKUP_DIR="/var/backups/jkpt-web3"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/jkpt-web3_$TIMESTAMP.tar.gz"
print_info "Creating backup at $BACKUP_FILE"
tar -czf $BACKUP_FILE --exclude="node_modules" --exclude=".next" .
print_info "Backup created successfully"

# Pull latest changes
print_section "Pulling Latest Changes"
git fetch
git checkout $GIT_BRANCH
git pull origin $GIT_BRANCH

# Install dependencies
print_section "Installing Dependencies"
pnpm install

# Build the application
print_section "Building Application"
pnpm build

# Restart the application
print_section "Restarting Application"
pm2 restart $APP_NAME

# Check application status
print_section "Application Status"
pm2 status $APP_NAME

print_section "Update Complete!"
echo -e "Your application has been updated and restarted."
echo -e "Backup created at: ${GREEN}$BACKUP_FILE${NC}"
echo -e "To view logs, run: ${YELLOW}pm2 logs $APP_NAME${NC}"
