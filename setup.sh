#!/bin/bash
set -e

echo "ClaudeRunner Setup"
echo "===================="
echo ""

# 1. Check prerequisites
check_cmd() {
  if ! command -v "$1" &> /dev/null; then
    echo "ERROR: $1 is required but not installed."
    exit 1
  fi
  echo "OK: $1 found: $(command -v "$1")"
}

echo "Checking prerequisites..."
check_cmd node
check_cmd pnpm
check_cmd claude
check_cmd gh

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js >= 20 required (found: $(node -v))"
  exit 1
fi
echo ""

# 2. Install dependencies
echo "Installing dependencies..."
pnpm install
echo ""

# 3. Setup .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "JIRA credentials can be configured in the Settings panel in the UI."
fi

# 4. Optional: config.local.yaml
if [ ! -f config.local.yaml ]; then
  echo "TIP: If your repos are not in ~/KKday/, create config.local.yaml to override paths."
  echo "   Example: cp config.yaml config.local.yaml && edit config.local.yaml"
  echo ""
fi

# 5. Database setup
echo "Setting up database..."
set -a
source .env
set +a
cd apps/web
npx prisma migrate deploy
cd ../..
echo ""

# 6. Create .env.production for build (Nuxt uses --dotenv .env.production)
if [ ! -f .env.production ]; then
  cp .env .env.production
fi

# 7. Build
echo "Building..."
pnpm build
echo ""

# 8. Start
echo "Starting ClaudeRunner..."
pnpm pm2:start
echo ""
echo "ClaudeRunner is running at http://localhost:5688"
echo ""
echo "Useful commands:"
echo "  pnpm pm2:logs   - View logs"
echo "  pnpm pm2:stop   - Stop server"
echo "  pnpm dev        - Run in dev mode (with hot reload)"
