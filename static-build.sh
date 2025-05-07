#!/bin/bash

# Static build script for Next.js application
# This script builds a static export of your Next.js app

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

# Build the application locally
print_section "Building Static Export"
print_info "Installing dependencies..."
yarn install

print_info "Building static export..."
yarn build

if [ $? -ne 0 ]; then
  print_error "Build failed. Exiting."
  exit 1
fi

print_info "Static export created successfully in the 'out' directory."
print_info "You can now upload the contents of the 'out' directory to your web server."

# List the contents of the out directory
print_section "Contents of 'out' Directory"
ls -la ./out

print_section "Next Steps"
echo -e "1. Upload the contents of the ${GREEN}out${NC} directory to your web server"
echo -e "2. Configure your web server to serve the static files"
echo -e "3. Set up SSL for your domain"
echo -e ""
echo -e "For a complete deployment, you can use the ${GREEN}static-build-deploy.sh${NC} script"
