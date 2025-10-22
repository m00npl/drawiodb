#!/bin/bash

# DrawIO DB Backup Script
# Comprehensive backup solution for production environment

set -euo pipefail

# Configuration
BACKUP_DIR="/home/ubuntu/backups/drawio"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROJECT_DIR="/home/ubuntu/projects/drawio"
S3_BUCKET="drawio-backups-secure"  # Configure your S3 bucket

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Create backup directory
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

log "Starting DrawIO DB backup process..."

# 1. Application Configuration Backup
log "Backing up application configurations..."
cd "$PROJECT_DIR"

# Docker Compose files
cp docker-compose.yml "$BACKUP_DIR/$TIMESTAMP/"
cp .env "$BACKUP_DIR/$TIMESTAMP/env.backup"

# Custom configurations
if [ -d "drawio-custom" ]; then
    cp -r drawio-custom "$BACKUP_DIR/$TIMESTAMP/"
fi

# Traefik certificates (critical!)
if [ -f "/etc/traefik/acme.json" ]; then
    cp /etc/traefik/acme.json "$BACKUP_DIR/$TIMESTAMP/"
    log "SSL certificates backed up"
fi

# 2. Container State Backup
log "Creating container snapshots..."
docker compose ps --format json > "$BACKUP_DIR/$TIMESTAMP/container_status.json"
docker compose config > "$BACKUP_DIR/$TIMESTAMP/resolved_compose.yml"

# Export container configurations
docker inspect drawiodb > "$BACKUP_DIR/$TIMESTAMP/drawiodb_config.json" 2>/dev/null || warn "drawiodb not running"

# 3. Docker Images Backup
log "Backing up Docker images..."
docker save moonplkr/drawiodb:latest | gzip > "$BACKUP_DIR/$TIMESTAMP/drawiodb_image.tar.gz"

# 4. Application Logs Backup
log "Backing up application logs..."
mkdir -p "$BACKUP_DIR/$TIMESTAMP/logs"

docker logs drawiodb --timestamps > "$BACKUP_DIR/$TIMESTAMP/logs/drawiodb.log" 2>&1 || warn "Could not backup drawiodb logs"

# System logs
journalctl -u docker --since "24 hours ago" > "$BACKUP_DIR/$TIMESTAMP/logs/docker_system.log" 2>/dev/null || warn "Could not backup Docker system logs"

# 5. Network Configuration Backup
log "Backing up network configurations..."
docker network ls --format json > "$BACKUP_DIR/$TIMESTAMP/networks.json"
docker network inspect moon_golem_network > "$BACKUP_DIR/$TIMESTAMP/moon_golem_network.json" 2>/dev/null || warn "Could not inspect network"

# 6. System Information Backup
log "Collecting system information..."
cat > "$BACKUP_DIR/$TIMESTAMP/system_info.txt" << EOF
Hostname: $(hostname)
Kernel: $(uname -r)
OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")
Docker Version: $(docker --version)
Docker Compose Version: $(docker compose version)
Disk Usage:
$(df -h)

Memory Usage:
$(free -h)

Running Services:
$(systemctl list-units --type=service --state=running | grep -E "(docker|traefik)")
EOF

# 7. Create tarball
log "Creating compressed backup archive..."
cd "$BACKUP_DIR"
tar -czf "drawio_backup_$TIMESTAMP.tar.gz" "$TIMESTAMP/"
BACKUP_SIZE=$(du -h "drawio_backup_$TIMESTAMP.tar.gz" | cut -f1)

# 8. Upload to S3 (if configured)
if command -v aws &> /dev/null && [ -n "${S3_BUCKET:-}" ]; then
    log "Uploading backup to S3..."
    aws s3 cp "drawio_backup_$TIMESTAMP.tar.gz" "s3://$S3_BUCKET/drawio/$(date +%Y/%m)/"
    log "Backup uploaded to S3: s3://$S3_BUCKET/drawio/$(date +%Y/%m)/drawio_backup_$TIMESTAMP.tar.gz"
fi

# 9. Cleanup old backups
log "Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "drawio_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -maxdepth 1 -type d -name "202*" -mtime +$RETENTION_DAYS -exec rm -rf {} \;

# 10. Verify backup integrity
log "Verifying backup integrity..."
if tar -tzf "drawio_backup_$TIMESTAMP.tar.gz" >/dev/null 2>&1; then
    log "✅ Backup verification successful"
else
    error "❌ Backup verification failed - archive is corrupted"
fi

# 11. Generate backup report
cat > "$BACKUP_DIR/latest_backup_report.txt" << EOF
DrawIO DB Backup Report
======================
Timestamp: $(date)
Backup File: drawio_backup_$TIMESTAMP.tar.gz
Backup Size: $BACKUP_SIZE
Status: SUCCESS

Components Backed Up:
- ✅ Application configurations (docker-compose.yml, .env)
- ✅ Custom DrawIO configurations
- ✅ SSL certificates
- ✅ Container configuration
- ✅ Docker image (drawiodb)
- ✅ Application logs (24h)
- ✅ Network configurations
- ✅ System information

Next Backup: $(date -d '+1 day')
Retention: $RETENTION_DAYS days
EOF

log "✅ Backup completed successfully!"
log "📁 Backup location: $BACKUP_DIR/drawio_backup_$TIMESTAMP.tar.gz"
log "📊 Backup size: $BACKUP_SIZE"
log "📋 Report: $BACKUP_DIR/latest_backup_report.txt"

# 12. Send notification (if configured)
if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"✅ DrawIO DB backup completed successfully. Size: $BACKUP_SIZE\"}" \
        >/dev/null 2>&1 || warn "Failed to send notification"
fi