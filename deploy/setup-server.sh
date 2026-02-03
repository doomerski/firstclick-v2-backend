#!/usr/bin/env bash
#
# FirstClick API - Ubuntu Server Setup Script
#
# Safe to rerun. Skips steps that are already complete.
# Run as root or with sudo.
#
# Usage:
#   chmod +x setup-server.sh
#   sudo ./setup-server.sh
#

set -euo pipefail

# ===========================================================================
# Configuration
# ===========================================================================
APP_USER="www-data"
APP_DIR="/srv/firstclick/prod/backend"
FRONTEND_DIR="/srv/firstclick/prod/frontend"
LOG_DIR="/var/log/firstclick"
CONFIG_DIR="/etc/firstclick"
NODE_VERSION="20"

# ===========================================================================
# Helper functions
# ===========================================================================
log_step() {
    echo ""
    echo "───────────────────────────────────────────"
    echo "$1"
    echo "───────────────────────────────────────────"
}

already_done() {
    echo "ℹ️  Already done, skipping"
}

echo "═══════════════════════════════════════════════════════════════"
echo "  FirstClick API - Ubuntu Server Setup"
echo "  Safe to rerun"
echo "═══════════════════════════════════════════════════════════════"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)"
   exit 1
fi

# ===========================================================================
# Step 1: System updates and dependencies
# ===========================================================================
log_step "📦 Step 1/8: System updates and dependencies"
apt-get update
apt-get install -y curl ca-certificates git nginx ufw build-essential
echo "✅ System dependencies installed"

# ===========================================================================
# Step 2: Install Node.js
# ===========================================================================
log_step "📦 Step 2/8: Install Node.js ${NODE_VERSION}.x"
if command -v node &> /dev/null && node --version | grep -q "v${NODE_VERSION}"; then
    echo "✅ Node.js $(node --version) already installed"
else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
    echo "✅ Node.js $(node --version) installed"
fi

# ===========================================================================
# Step 3: Install PostgreSQL
# ===========================================================================
log_step "📦 Step 3/8: Install PostgreSQL"
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL already installed"
else
    apt-get install -y postgresql postgresql-contrib
fi
# Ensure service is enabled and running (idempotent)
systemctl enable postgresql
systemctl start postgresql
echo "✅ PostgreSQL is running"

# ===========================================================================
# Step 4: Create application directories
# ===========================================================================
log_step "📁 Step 4/8: Create application directories"

# Application code directory (owned by root, read-only at runtime)
mkdir -p "$APP_DIR"
mkdir -p "$FRONTEND_DIR"

# Writable directories for the service (owned by www-data)
mkdir -p "$APP_DIR/uploads"
mkdir -p "$APP_DIR/storage"
mkdir -p "$LOG_DIR"
mkdir -p "$CONFIG_DIR"

# Code directory: owned by root, world-readable (service reads, deploy writes)
chown -R root:root /srv/firstclick
chmod -R a+rX /srv/firstclick

# Writable paths: owned by service user, mode 700 (matches UMask=0077)
chown -R "$APP_USER:$APP_USER" "$APP_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/storage"
chown -R "$APP_USER:$APP_USER" "$LOG_DIR"
chmod 700 "$APP_DIR/uploads"
chmod 700 "$APP_DIR/storage"
chmod 750 "$LOG_DIR"

# Config dir: restricted (root owns env file with secrets)
chmod 750 "$CONFIG_DIR"
echo "✅ Directories created and permissions set"

# ===========================================================================
# Step 5: Create environment file template (only if missing)
# ===========================================================================
log_step "🔐 Step 5/8: Environment file"
if [[ -f "$CONFIG_DIR/firstclick.env" ]]; then
    echo "✅ Environment file already exists at $CONFIG_DIR/firstclick.env"
    echo "   (Not overwriting - edit manually if needed)"
else
    cat > "$CONFIG_DIR/firstclick.env" << 'EOF'
# FirstClick Production Environment
# ⚠️  Replace all placeholder values before starting the service!

NODE_ENV=production
PORT=3000

# Frontend origin (for CORS - NOT the API subdomain)
WEB_ORIGIN=https://firstclick.it.com

# Database
DATABASE_URL=postgresql://firstclick_user:CHANGE_ME@localhost:5432/firstclick_db
PG_POOL_MAX=10
PG_IDLE_TIMEOUT_MS=30000

# Authentication
JWT_SECRET=GENERATE_A_STRONG_SECRET_HERE
JWT_EXPIRES_IN=7d
SESSION_TTL_DAYS=30

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# Logging
LOG_LEVEL=info

# Proxy (set to 1 since we're behind nginx)
TRUST_PROXY=1

# Email (default to log mode - change to smtp for production)
EMAIL_MODE=log
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@firstclick.it.com
SUPERADMIN_EMAIL=admin@firstclick.it.com
EOF
    chmod 600 "$CONFIG_DIR/firstclick.env"
    chown root:root "$CONFIG_DIR/firstclick.env"
    echo "✅ Created $CONFIG_DIR/firstclick.env"
    echo "⚠️  IMPORTANT: Edit this file with real secrets before starting!"
fi

# ===========================================================================
# Step 6: Install systemd service and journald config
# ===========================================================================
log_step "🔧 Step 6/8: Install systemd service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/firstclick-api.service" ]]; then
    cp "$SCRIPT_DIR/firstclick-api.service" /etc/systemd/system/
    systemctl daemon-reload
    echo "✅ Installed systemd service"
    echo "   Run 'sudo systemctl enable firstclick-api' after deploying code"
else
    echo "⚠️  Service file not found at $SCRIPT_DIR/firstclick-api.service"
fi

# Install journald log retention config (prevents log bloat)
if [[ -f "$SCRIPT_DIR/firstclick-journald.conf" ]]; then
    mkdir -p /etc/systemd/journald.conf.d
    cp "$SCRIPT_DIR/firstclick-journald.conf" /etc/systemd/journald.conf.d/
    systemctl restart systemd-journald
    echo "✅ Installed journald config (500M max)"
fi

# ===========================================================================
# Step 7: Configure nginx
# ===========================================================================
log_step "🌐 Step 7/8: Configure nginx"

# Install http-level config (rate limit zone, WebSocket map) to conf.d
# Files in conf.d/ are included inside the http{} block automatically
if [[ -f "$SCRIPT_DIR/firstclick-common.conf" ]]; then
    cp "$SCRIPT_DIR/firstclick-common.conf" /etc/nginx/conf.d/firstclick-common.conf
    echo "✅ Installed http-level config to /etc/nginx/conf.d/"
else
    echo "⚠️  Common config not found at $SCRIPT_DIR/firstclick-common.conf"
fi

# Install site configuration
if [[ -f "$SCRIPT_DIR/firstclick-api.nginx" ]]; then
    cp "$SCRIPT_DIR/firstclick-api.nginx" /etc/nginx/sites-available/firstclick-api
    
    # Use -sf to force symlink (idempotent), explicit target name
    ln -sf /etc/nginx/sites-available/firstclick-api /etc/nginx/sites-enabled/firstclick-api
    
    # Remove default site to avoid conflicts
    rm -f /etc/nginx/sites-enabled/default
    echo "✅ Installed site config to sites-available"
else
    echo "⚠️  Nginx site config not found at $SCRIPT_DIR/firstclick-api.nginx"
fi

# Test config before reload
if nginx -t; then
    systemctl reload nginx
    echo "✅ Nginx configured and reloaded"
else
    echo "❌ Nginx config test failed!"
    nginx -t
    exit 1
fi

# Enable nginx service
systemctl enable nginx

# ===========================================================================
# Step 8: Configure firewall
# ===========================================================================
log_step "🔥 Step 8/8: Configure firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
if ! ufw status | grep -q "Status: active"; then
    ufw --force enable
    echo "✅ Firewall enabled"
else
    echo "✅ Firewall already active"
fi
ufw status

# ===========================================================================
# Complete
# ===========================================================================
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Server setup complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "1. Create PostgreSQL database (if not already done):"
echo "   sudo -u postgres psql"
echo "   CREATE USER firstclick_user WITH PASSWORD 'your_password';"
echo "   CREATE DATABASE firstclick_db OWNER firstclick_user;"
echo "   \\q"
echo ""
echo "2. Edit environment file with real secrets:"
echo "   sudo nano $CONFIG_DIR/firstclick.env"
echo ""
echo "3. Deploy application code to $APP_DIR"
echo "   (git clone, scp, or rsync)"
echo ""
echo "4. Run the deploy script:"
echo "   cd $APP_DIR && ./deploy/deploy.sh"
echo ""
echo "5. (Optional) Set up SSL with Certbot:"
echo "   sudo apt install certbot python3-certbot-nginx -y"
echo "   sudo certbot --nginx -d api.firstclick.it.com"
echo ""
