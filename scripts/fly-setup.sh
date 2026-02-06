#!/bin/bash
# MagmaProp Affiliate — Fly.io Setup Script
# Run this AFTER `fly launch` and `fly postgres create`

set -e

echo "🔥 MagmaProp Affiliate — Fly.io Setup"
echo "======================================="

APP_NAME="magmaprop-affiliate"

# 1. Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)

echo ""
echo "Setting secrets..."
fly secrets set \
  JWT_SECRET="$JWT_SECRET" \
  JWT_EXPIRES_IN="7d" \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  CORS_ORIGIN="https://magmaprop.com" \
  SITE_URL="https://magmaprop.com" \
  -a "$APP_NAME"

echo ""
echo "✅ Secrets set!"
echo ""
echo "📋 SAVE YOUR WEBHOOK SECRET (you'll need it for magmaprop.com integration):"
echo "   $WEBHOOK_SECRET"
echo ""
echo "Next steps:"
echo "  1. Run: fly deploy"
echo "  2. Run: fly postgres connect -a <your-pg-app-name>"
echo "     Then paste the contents of src/db/schema.sql"
echo "  3. Run: fly ssh console -a $APP_NAME -C 'node src/db/seed-admin.js'"
echo "  4. Visit: https://$APP_NAME.fly.dev/admin/"
echo ""
