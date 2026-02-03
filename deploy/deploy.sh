#!/usr/bin/env bash
#
# FirstClick V2 - Monorepo Deployment Script
#
# Deploys backend + frontend from repo to production paths.
# Runs npm install, migrations, restarts service, and health checks.
#
# Usage:
#   cd /path/to/firstclick-v2
#   sudo ./deploy/deploy.sh
#
# Requirements:
#   - Run from repo root (where backend/, frontend/, deploy/ exist)
#   - /etc/firstclick/firstclick.env must exist with valid secrets
#   - setup-server.sh should have been run first
#

set -euo pipefail

# ===========================================================================
# Configuration
# ===========================================================================
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_BACKEND="/srv/firstclick/prod/backend"
PROD_FRONTEND="/srv/firstclick/prod/frontend"
SERVICE_NAME="firstclick-api"
HEALTH_URL="http://127.0.0.1:3000/health"
GIT_BRANCH="${DEPLOY_BRANCH:-main}"

# ===========================================================================
# Helper functions
# ===========================================================================
log_step() {
    echo ""
    echo "───────────────────────────────────────────"
    echo "$1"
    echo "───────────────────────────────────────────"
}

die() {
    echo "❌ $1" >&2
    exit 1
}

# ===========================================================================
# Pre-flight checks
# ===========================================================================
echo "═══════════════════════════════════════════════════════════════"
echo "  FirstClick V2 - Deployment"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════"

# Check we're in repo root
[[ -d "$REPO_ROOT/backend" ]] || die "backend/ not found. Run from repo root."
[[ -d "$REPO_ROOT/frontend" ]] || die "frontend/ not found. Run from repo root."

# Check production dirs exist
[[ -d "$PROD_BACKEND" ]] || die "$PROD_BACKEND not found. Run setup-server.sh first."

# Check env file exists
[[ -f /etc/firstclick/firstclick.env ]] || die "/etc/firstclick/firstclick.env not found."

# ===========================================================================
# Step 1: Pull latest code
# ===========================================================================
log_step "📥 Step 1/6: Pull latest code"
cd "$REPO_ROOT"
if [[ -d .git ]]; then
    git fetch origin
    git reset --hard "origin/$GIT_BRANCH"
    echo "✅ Reset to origin/$GIT_BRANCH"
    git log -1 --oneline
else
    echo "ℹ️  Not a git repo, skipping pull"
fi

# ===========================================================================
# Step 2: Sync backend to production
# ===========================================================================
log_step "📦 Step 2/6: Sync backend to production"
rsync -av --delete \
    --exclude='node_modules' \
    --exclude='uploads' \
    --exclude='storage' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='*.log' \
    "$REPO_ROOT/backend/" "$PROD_BACKEND/"
echo "✅ Backend synced to $PROD_BACKEND"

# ===========================================================================
# Step 3: Sync frontend to production
# ===========================================================================
log_step "🌐 Step 3/6: Sync frontend to production"
mkdir -p "$PROD_FRONTEND"
rsync -av --delete \
    "$REPO_ROOT/frontend/" "$PROD_FRONTEND/"
echo "✅ Frontend synced to $PROD_FRONTEND"

# ===========================================================================
# Step 4: Install dependencies
# ===========================================================================
log_step "📚 Step 4/6: Install npm dependencies"
cd "$PROD_BACKEND"
npm ci --omit=dev
echo "✅ Dependencies installed"

# ===========================================================================
# Step 5: Run database migrations
# ===========================================================================
log_step "🗄️  Step 5/6: Run database migrations"
cd "$PROD_BACKEND"
if [[ -f db-setup.js ]]; then
    # Source env file for database connection
    set -a
    source /etc/firstclick/firstclick.env
    set +a
    
    if node db-setup.js --migrate 2>&1; then
        echo "✅ Migrations complete"
    else
        echo "⚠️  Migration returned non-zero (may be OK if no new migrations)"
    fi
else
    echo "ℹ️  No db-setup.js found, skipping migrations"
fi

# ===========================================================================
# Step 6: Restart service and health check
# ===========================================================================
log_step "🚀 Step 6/6: Restart service"
systemctl restart "$SERVICE_NAME"
echo "✅ Service restarted"

# Health check with retries
echo ""
echo "Waiting for service to become healthy..."
MAX_RETRIES=10
RETRY_DELAY=2
for i in $(seq 1 $MAX_RETRIES); do
    sleep $RETRY_DELAY
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "  ✅ DEPLOYMENT SUCCESSFUL"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "Service: $SERVICE_NAME"
        echo "Backend: $PROD_BACKEND"
        echo "Frontend: $PROD_FRONTEND"
        echo "Health: $HEALTH_URL"
        echo ""
        echo "Commands:"
        echo "  View logs:    journalctl -u $SERVICE_NAME -f"
        echo "  Status:       systemctl status $SERVICE_NAME"
        echo ""
        exit 0
    fi
    echo "  Attempt $i/$MAX_RETRIES: waiting..."
done

# Health check failed
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ❌ DEPLOYMENT FAILED - Health check not passing"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Troubleshooting:"
echo "  1. Check logs:     journalctl -u $SERVICE_NAME -n 100"
echo "  2. Check status:   systemctl status $SERVICE_NAME"
echo "  3. Test manually:  curl -i $HEALTH_URL"
echo "  4. Check env:      cat /etc/firstclick/firstclick.env"
echo ""
exit 1
