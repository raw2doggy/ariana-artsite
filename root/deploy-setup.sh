#!/bin/bash
# ──────────────────────────────────────────────────────────────
# deploy-setup.sh — Run this ON the Droplet after SCP'ing files
# Usage:  sudo bash /var/www/artsite/deploy-setup.sh
# ──────────────────────────────────────────────────────────────
set -e

echo "── 1. Installing Node.js 22.x ──"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
echo "   Node $(node -v)  ·  npm $(npm -v)"

echo "── 2. Installing PM2 globally ──"
npm install -g pm2

echo "── 3. Installing app dependencies ──"
cd /var/www/artsite
npm install --omit=dev

echo "── 4. Setting up Nginx ──"
apt-get install -y nginx
cp /var/www/artsite/nginx-artsite.conf /etc/nginx/sites-available/artsite
ln -sf /etc/nginx/sites-available/artsite /etc/nginx/sites-enabled/artsite
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

echo "── 5. Starting app with PM2 ──"
cd /var/www/artsite
pm2 delete artsite 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo "── 6. Installing Certbot for SSL ──"
apt-get install -y certbot python3-certbot-nginx
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Setup complete!  Your site should be live on port 80."
echo ""
echo "  To enable HTTPS, run:"
echo "    sudo certbot --nginx -d arianasart.com -d www.arianasart.com"
echo ""
echo "  Useful commands:"
echo "    pm2 logs artsite        — view app logs"
echo "    pm2 restart artsite     — restart after code changes"
echo "    pm2 status              — check app status"
echo "══════════════════════════════════════════════════════════"
