#!/bin/bash
# ArthaA VPS Deployment Script
# Run on a fresh Ubuntu 22.04 VPS as root or sudo user
# Usage: curl -sSL https://your-repo/deploy.sh | bash
# Or: chmod +x deploy.sh && ./deploy.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────

check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "Please run as root: sudo ./deploy.sh"
    fi
}

install_docker() {
    if command -v docker &>/dev/null; then
        info "Docker already installed: $(docker --version)"
        return
    fi
    info "Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    info "Docker installed: $(docker --version)"
}

# ── .env Setup ────────────────────────────────────────────────────────────────

setup_env() {
    if [ -f .env ]; then
        warn ".env already exists — skipping. Edit it manually if needed."
        return
    fi

    if [ ! -f .env.production ]; then
        error ".env.production not found. Are you in the project root?"
    fi

    cp .env.production .env

    # Generate SECRET_KEY
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))" 2>/dev/null || \
                 openssl rand -base64 48)
    sed -i "s|GENERATE_AND_PASTE_A_LONG_RANDOM_KEY_HERE|${SECRET_KEY}|g" .env

    warn "----------------------------------------------"
    warn "Edit .env with your actual values before continuing:"
    warn "  - DOMAIN (your domain or VPS IP)"
    warn "  - EMAIL (for SSL certificate)"
    warn "  - DB_PASSWORD (strong password)"
    warn "----------------------------------------------"
    read -p "Press Enter after editing .env to continue..."
}

load_env() {
    if [ ! -f .env ]; then
        error ".env not found. Run setup first."
    fi
    export $(grep -v '^#' .env | grep -v '^$' | xargs)
    if [ -z "$DOMAIN" ]; then
        error "DOMAIN is not set in .env"
    fi
    if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "CHANGE_THIS_TO_A_STRONG_PASSWORD" ]; then
        error "DB_PASSWORD is not set properly in .env"
    fi
}

# ── Nginx Config ──────────────────────────────────────────────────────────────

setup_nginx_http() {
    info "Setting up HTTP nginx config (for SSL certificate acquisition)..."
    mkdir -p nginx
    sed "s/YOUR_DOMAIN/${DOMAIN}/g" nginx/nginx.http.conf > nginx/nginx.conf
    info "Nginx HTTP config ready."
}

setup_nginx_https() {
    info "Switching to HTTPS nginx config..."
    sed "s/YOUR_DOMAIN/${DOMAIN}/g" nginx/nginx.https.conf > nginx/nginx.conf
    docker compose exec nginx nginx -s reload
    info "Nginx HTTPS config active."
}

# ── SSL Certificate ───────────────────────────────────────────────────────────

obtain_ssl() {
    if [ -d "/var/lib/docker/volumes/arthaa_certbot_certs/_data/live/${DOMAIN}" ]; then
        info "SSL certificate already exists for ${DOMAIN}."
        return
    fi

    info "Obtaining SSL certificate for ${DOMAIN}..."

    # Temporarily allow certbot ACME challenge
    docker compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "${EMAIL}" \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}" \
        -d "www.${DOMAIN}" || warn "www.${DOMAIN} cert failed — only ${DOMAIN} certified (ok if no www DNS)"

    info "SSL certificate obtained."
}

# ── Build & Deploy ────────────────────────────────────────────────────────────

build_and_start() {
    info "Building Docker images (this takes a few minutes)..."
    docker compose build --no-cache

    info "Starting core services (DB, Ollama, Backend, Frontend, Nginx)..."
    docker compose up -d db ollama backend frontend nginx certbot

    info "Waiting for backend to be healthy..."
    timeout 120 bash -c 'until docker compose ps backend | grep -q "healthy"; do sleep 5; done' || \
        warn "Backend health check timeout — check logs: docker compose logs backend"
}

pull_ollama_model() {
    info "Pulling Ollama model: ${OLLAMA_MODEL:-deepseek-r1:7b}"
    info "This downloads ~4-5GB — will take several minutes..."
    docker compose up ollama-init
    docker compose rm -f ollama-init
    info "Ollama model ready."
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    info "=== ArthaA VPS Deployment ==="

    check_root
    install_docker
    setup_env
    load_env

    # Phase 1: Start with HTTP nginx
    setup_nginx_http
    build_and_start

    # Phase 2: Get SSL cert
    obtain_ssl

    # Phase 3: Switch to HTTPS
    setup_nginx_https

    # Phase 4: Pull AI model (background — takes time)
    pull_ollama_model

    info "=== Deployment Complete ==="
    info "App:    https://${DOMAIN}"
    info "Docs:   https://${DOMAIN}/docs"
    info ""
    info "Useful commands:"
    info "  docker compose logs -f backend    # backend logs"
    info "  docker compose logs -f ollama     # ollama logs"
    info "  docker compose ps                 # service status"
    info "  docker compose restart backend    # restart backend"
}

main "$@"
