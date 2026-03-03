/**
 * PM2 Ecosystem File
 * Start:   pm2 start ecosystem.config.js
 * Restart: pm2 restart artsite
 * Logs:    pm2 logs artsite
 */
module.exports = {
    apps: [
        {
            name: "artsite",
            script: "server.js",
            cwd: "/var/www/artsite",
            env: {
                NODE_ENV: "production",
                PORT: 3000
            },
            instances: 1,
            autorestart: true,
            max_memory_restart: "256M"
        }
    ]
};
