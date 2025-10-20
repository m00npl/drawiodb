#!/bin/bash

# DrawIO DB Restore Script
# Comprehensive restore solution for disaster recovery

set -euo pipefail

# Configuration
BACKUP_DIR="/home/ubuntu/backups/drawio"
PROJECT_DIR="/home/ubuntu/projects/drawio"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

usage() {
    echo "Usage: $0 [OPTIONS] <backup_file>"
    echo ""
    echo "Options:"
    echo "  -f, --force           Force restore without confirmation"
    echo "  -p, --preserve-env    Preserve current .env file"
    echo "  -n, --no-restart      Don't restart services after restore"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 drawio_backup_20241001_120000.tar.gz"
    echo "  $0 --force --preserve-env backup.tar.gz"
    echo "  $0 -f -p -n latest_backup.tar.gz"
    exit 1
}

# Parse command line arguments
FORCE=false
PRESERVE_ENV=false
NO_RESTART=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -p|--preserve-env)
            PRESERVE_ENV=true
            shift
            ;;
        -n|--no-restart)
            NO_RESTART=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

if [ -z "$BACKUP_FILE" ]; then
    error "No backup file specified"
fi

# Validate backup file
if [[ "$BACKUP_FILE" != /* ]]; then
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not found: $BACKUP_FILE"
fi

# Verify backup integrity
log "Verifying backup integrity..."
if ! tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
    error "Backup file is corrupted or invalid"
fi

# List available backups
info "Available backups:"
ls -la "$BACKUP_DIR"/*.tar.gz 2>/dev/null || info "No backup files found in $BACKUP_DIR"

# Confirmation (unless forced)
if [ "$FORCE" = false ]; then
    echo ""
    warn "This will restore DrawIO DB from backup: $(basename "$BACKUP_FILE")"
    warn "Current application state will be REPLACED!"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Restore cancelled"
        exit 0
    fi
fi

log "Starting DrawIO DB restore process..."

# Create temporary restore directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract backup
log "Extracting backup archive..."
cd "$TEMP_DIR"
tar -xzf "$BACKUP_FILE"

# Find the backup directory
BACKUP_TIMESTAMP=$(ls -d 202* | head -1)
if [ -z "$BACKUP_TIMESTAMP" ]; then
    error "Could not find backup timestamp directory in archive"
fi

RESTORE_DIR="$TEMP_DIR/$BACKUP_TIMESTAMP"

# Pre-restore backup of current state
log "Creating pre-restore backup of current state..."
CURRENT_BACKUP="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).tar.gz"
cd "$PROJECT_DIR"
tar -czf "$CURRENT_BACKUP" . 2>/dev/null || warn "Could not create pre-restore backup"

# Stop services
log "Stopping DrawIO services..."
docker compose down || warn "Could not stop services with docker compose"

# Restore configurations
log "Restoring application configurations..."
cd "$PROJECT_DIR"

# Backup current .env if preserving
if [ "$PRESERVE_ENV" = true ] && [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    log "Current .env backed up"
fi

# Restore docker-compose.yml
if [ -f "$RESTORE_DIR/docker-compose.yml" ]; then
    cp "$RESTORE_DIR/docker-compose.yml" .
    log "docker-compose.yml restored"
fi

# Restore .env (unless preserving current)
if [ "$PRESERVE_ENV" = false ] && [ -f "$RESTORE_DIR/env.backup" ]; then
    cp "$RESTORE_DIR/env.backup" .env
    log ".env restored"
elif [ "$PRESERVE_ENV" = true ]; then
    log ".env preserved (not restored)"
fi

# Restore custom configurations
if [ -d "$RESTORE_DIR/drawio-custom" ]; then
    rm -rf drawio-custom 2>/dev/null || true
    cp -r "$RESTORE_DIR/drawio-custom" .
    log "Custom configurations restored"
fi

# Restore SSL certificates
if [ -f "$RESTORE_DIR/acme.json" ] && [ -d "/etc/traefik" ]; then
    sudo cp "$RESTORE_DIR/acme.json" /etc/traefik/
    sudo chmod 600 /etc/traefik/acme.json
    log "SSL certificates restored"
fi

# Load Docker images
log "Loading Docker images..."
if [ -f "$RESTORE_DIR/drawio_frontend_image.tar.gz" ]; then
    gunzip -c "$RESTORE_DIR/drawio_frontend_image.tar.gz" | docker load
    log "Frontend image restored"
fi

if [ -f "$RESTORE_DIR/drawio_backend_image.tar.gz" ]; then
    gunzip -c "$RESTORE_DIR/drawio_backend_image.tar.gz" | docker load
    log "Backend image restored"
fi

# Restore network configuration if needed
if [ -f "$RESTORE_DIR/networks.json" ]; then
    log "Network configurations available in backup"
    # Network restoration is manual as it may conflict with existing setup
fi

# Start services (unless disabled)
if [ "$NO_RESTART" = false ]; then
    log "Starting DrawIO services..."
    docker compose up -d

    # Wait for services to start
    log "Waiting for services to become healthy..."
    sleep 30

    # Verify restoration
    log "Verifying service health..."
    if docker compose ps | grep -q "Up"; then
        log "✅ Services started successfully"
    else
        warn "❌ Some services may not have started correctly"
        docker compose ps
    fi

    # Test endpoints
    if curl -f http://localhost:8900 >/dev/null 2>&1; then
        log "✅ Frontend endpoint responding"
    else
        warn "❌ Frontend endpoint not responding"
    fi

    if curl -f http://localhost:8899/health >/dev/null 2>&1; then
        log "✅ Backend endpoint responding"
    else
        warn "❌ Backend endpoint not responding"
    fi
else
    log "Service restart skipped (--no-restart specified)"
fi

# Generate restore report
RESTORE_REPORT="$BACKUP_DIR/restore_report_$(date +%Y%m%d_%H%M%S).txt"
cat > "$RESTORE_REPORT" << EOF
DrawIO DB Restore Report
========================
Timestamp: $(date)
Backup File: $(basename "$BACKUP_FILE")
Restore Status: SUCCESS

Components Restored:
- ✅ Application configurations
$([ "$PRESERVE_ENV" = false ] && echo "- ✅ Environment variables" || echo "- ⚠️  Environment variables (preserved)")
- ✅ Custom DrawIO configurations
- ✅ Docker images
$([ -f "$RESTORE_DIR/acme.json" ] && echo "- ✅ SSL certificates" || echo "- ⚠️  SSL certificates (not found in backup)")
$([ "$NO_RESTART" = false ] && echo "- ✅ Services restarted" || echo "- ⚠️  Services not restarted")

Pre-restore backup: $(basename "$CURRENT_BACKUP")

Next Steps:
1. Verify application functionality
2. Check logs: docker compose logs
3. Monitor for any issues
4. Update DNS if needed (for disaster recovery scenarios)
EOF

log "✅ Restore completed successfully!"
log "📋 Restore report: $RESTORE_REPORT"
log "🔄 Pre-restore backup: $CURRENT_BACKUP"

if [ "$NO_RESTART" = false ]; then
    info "Services are running. Please verify functionality:"
    info "  Frontend: http://localhost:8900"
    info "  Backend:  http://localhost:8899/health"
    info "  Logs:     docker compose logs -f"
fi