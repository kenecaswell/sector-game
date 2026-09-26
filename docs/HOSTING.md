# Sector 42 — Hosting Guide

How we plan to host Sector 42 on AWS under `kenecaswell.com`, alongside the existing portfolio site.

> **Status:** plan, not yet deployed. Update this doc as each step is completed, and record any deviations in the Decisions section at the bottom.

---

## Overview

The game has two halves that need two different kinds of hosting:

| Part | What it is | Where it runs | Address |
|---|---|---|---|
| **Client** | Vite build of React + Phaser: static HTML/JS/CSS | AWS Amplify Hosting (new app, separate from the portfolio) | `https://play.kenecaswell.com` |
| **Server** | Node + Colyseus: a long-running process holding WebSocket connections and match state in memory | Amazon Lightsail instance (Ubuntu), fronted by Caddy for HTTPS | `wss://game.kenecaswell.com` |
| **Portfolio** | Existing static site | Existing Amplify app, unchanged | `https://kenecaswell.com` |

```
Player's browser
   │
   ├── HTTPS ──► play.kenecaswell.com ──► Amplify CDN (client/dist)
   │
   └── WSS ────► game.kenecaswell.com ──► Lightsail static IP
                                            └─ Caddy :443 (TLS)
                                                 └─ node dist/index.js :2567
```

**Why the server can't go on Amplify:** Amplify, Lambda and other serverless hosts run short request/response functions. The Colyseus server needs one process that stays up for the whole match: it runs the 20 Hz tick loop, keeps room state in memory and holds each player's WebSocket open. That requires an always-on machine.

**DNS:** the domain is registered at GoDaddy, but its nameservers point at Route 53, so every record below is created in the existing Route 53 hosted zone for `kenecaswell.com`. Nothing changes at GoDaddy.

---

## Part 1 — Client on Amplify

### 1.1 Create the app

1. Amplify console → **Create new app** → GitHub → pick the Sector 42 repo and the `main` branch.
2. Tick **"My app is a monorepo"** and set the app root to `client`.
3. Replace the generated build settings with the `amplify.yml` below. Commit it at the repo root so it's versioned.

```yaml
version: 1
applications:
    - appRoot: client
      frontend:
          phases:
              preBuild:
                  commands:
                      - nvm install 24
                      - nvm use 24
                      - npm ci
              build:
                  commands:
                      - npm run build
          artifacts:
              baseDirectory: dist
              files:
                  - '**/*'
          cache:
              paths:
                  - node_modules/**/*
```

The project needs Node 22.13+ (it's developed on 24), and Amplify's default build image may ship an older Node. That's why the `nvm` lines are there.

### 1.2 Environment variables

In **Hosting → Environment variables**:

| Variable | Value |
|---|---|
| `VITE_SERVER_URL` | `wss://game.kenecaswell.com` |
| `AMPLIFY_MONOREPO_APP_ROOT` | `client` (usually set automatically by the monorepo option) |

Vite bakes `VITE_SERVER_URL` into the bundle at build time, so changing it requires a redeploy.

### 1.3 Custom domain

1. **Hosting → Custom domains → Add domain** → `kenecaswell.com` → configure only the `play` subdomain for this app.
2. The zone is in Route 53, so Amplify creates the DNS record and the SSL certificate for you. It can take a few minutes up to about 30 minutes.
3. ⚠️ If the portfolio app has a wildcard subdomain (`*.kenecaswell.com`) or "automatic subdomains" enabled, turn it off first or the two apps will conflict.

### 1.4 SPA rewrite (when needed)

When shareable room links like `/play/ABC123` are built, add a rewrite in **Hosting → Rewrites and redirects** so every path serves the app:

| Source | Target | Type |
|---|---|---|
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 (Rewrite) |

Until then, the app is served from `/` and no rewrite is required.

### 1.5 Deploys

Every push to `main` triggers a build and deploy automatically. Client deploys don't affect matches in progress, because the WebSocket connection is to the server, not to Amplify. A player who reloads mid-match gets the new client and rejoins via their reconnection token.

---

## Part 2 — Server on Lightsail

### 2.1 Create the instance

1. Lightsail → **Create instance** → Linux/Unix → **OS only → Ubuntu 24.04 LTS**.
2. Plan: **$7/month (1 GB RAM, 2 vCPU, 40 GB SSD, 2 TB transfer)**. The $5 plan's 512 MB is too tight to run `npm ci` + `tsc` on the box.
3. Region: pick the one closest to most players (e.g. `us-west-2` Oregon).
4. **Networking → Create static IP** and attach it to the instance (free while attached).
5. **Networking → IPv4 firewall:** allow TCP **22** (SSH), **80** (HTTP, used by Caddy for certificate issuance and redirects) and **443** (HTTPS/WSS). Don't open 2567; only Caddy talks to Node.

### 2.2 DNS record

In Route 53 → hosted zone `kenecaswell.com` → **Create record**:

| Name | Type | Value | TTL |
|---|---|---|---|
| `game` | A | *Lightsail static IP* | 300 |

### 2.3 Install Node and the app

SSH in (Lightsail's browser SSH works), then:

```bash
# Node 24 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Optional safety net for builds on a 1 GB box
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# App
sudo mkdir -p /opt/sector42 && sudo chown ubuntu:ubuntu /opt/sector42
git clone https://github.com/<owner>/<repo>.git /opt/sector42
cd /opt/sector42/server
npm ci
npm run build
```

If the repo is private, add a read-only **deploy key** on GitHub for this instance instead of using personal credentials.

### 2.4 Run it as a service (systemd)

`/etc/systemd/system/sector42.service`:

```ini
[Unit]
Description=Sector 42 game server (Colyseus)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/sector42/server
Environment=NODE_ENV=production
Environment=PORT=2567
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sector42
sudo systemctl status sector42          # should be "active (running)"
journalctl -u sector42 -f               # live logs
```

Never set `PHASE_TIME_SCALE` in production. It's a dev-only switch for shortening matches.

### 2.5 HTTPS/WSS with Caddy

Browsers block plain `ws://` from an `https://` page, so the server has to be reachable over `wss://`. Caddy handles the certificate (Let's Encrypt, auto-renewing) and proxies WebSocket upgrades with no extra config.

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```
game.kenecaswell.com {
    reverse_proxy localhost:2567
}
```

```bash
sudo systemctl reload caddy
```

The DNS record from 2.2 must already resolve to the instance, or certificate issuance will fail.

### 2.6 Deploying server updates

```bash
cd /opt/sector42
git pull
cd server
npm ci
npm run build
sudo systemctl restart sector42
```

⚠️ **A restart ends every match in progress:** room state lives only in the Node process's memory, and reconnection tokens don't survive a restart. Deploy when nobody is playing. This can later become a `deploy.sh` script or a GitHub Action that SSHes in.

---

## Part 3 — Tightening for production

- **CORS:** `server/src/index.ts` currently uses `app.use(cors())`, which allows any origin. Once live, restrict it:
  ```ts
  app.use(cors({ origin: ['https://play.kenecaswell.com', 'http://localhost:5173'] }));
  ```
- **Snapshots:** enable Lightsail automatic snapshots (about $0.05/GB-month) or take a manual one after setup, so the box can be rebuilt quickly.
- **Monitoring:** add a Lightsail metric alarm on CPU. Optionally, a free uptime checker can ping `https://game.kenecaswell.com/health`.
- **OS updates:** `sudo apt-get update && sudo apt-get upgrade` occasionally, or enable `unattended-upgrades`.

---

## Verification checklist

- [ ] `https://game.kenecaswell.com/health` returns `{"status":"ok"}` with a valid certificate
- [ ] `https://play.kenecaswell.com` loads with a valid certificate and no mixed-content errors in the console
- [ ] Join Game → Start Game works from a desktop browser
- [ ] A second player joins from a phone on cellular (not Wi-Fi), so it goes over the real internet
- [ ] Kill the phone's connection for ~10s, restore it: the player reconnects and keeps their hexes
- [ ] `sudo systemctl restart sector42` → clients show reconnecting, then can start a fresh game
- [ ] `https://kenecaswell.com` (portfolio) is unaffected

---

## Cost estimate

Assumes about 15 matches a month with up to 10 players each. Prices were checked September 2026; confirm on the AWS pricing pages.

| Item | Basis | Monthly |
|---|---|---|
| Lightsail instance | $7 plan (1 GB), includes static IP and 2 TB transfer | **$7.00** |
| Server bandwidth | ~15 matches × ~10 players × ~6.5 min ≈ well under 5 GB, far inside the 2 TB allowance | $0.00 |
| Amplify build minutes | ~20 deploys × ~3 min = ~60 min at $0.01/min (free under the 1,000-min free tier if eligible) | $0.00–$0.60 |
| Amplify data transfer | ~150 page loads × a few MB ≈ <1 GB at $0.15/GB (free under the 15 GB free tier if eligible) | $0.00–$0.15 |
| Amplify storage | a few MB at $0.023/GB-month | ~$0.00 |
| Route 53 | Existing hosted zone ($0.50/mo) is already paid; the extra records and queries are negligible | ~$0.00 |
| Lightsail snapshots (optional) | ~40 GB × $0.05/GB-month | ~$2.00 |
| **Total** | | **≈ $7–8/mo** (≈ $9–10 with snapshots) |

The cost is almost entirely the always-on server, not usage. It stays the same whether there are 15 matches or 500. Traffic would have to grow by orders of magnitude before bandwidth mattered.

---

## Future scaling (not needed now)

The current design is a **single Node process**, which is enough for many concurrent 10-player rooms. If that ever stops being enough:

1. Resize to a bigger Lightsail plan (snapshot → new instance from snapshot).
2. Past one machine: multiple Colyseus processes need Colyseus's Redis presence/driver so matchmaking can route players to the right process. At that point, ECS Fargate or EC2 behind an Application Load Balancer (sticky sessions) becomes worthwhile, at roughly $16+/mo for the load balancer alone.

---

## Decisions

| Decision | Chosen | Alternatives considered | Rationale |
|---|---|---|---|
| Client hosting | Amplify Hosting, new app, `play.` subdomain | S3 + CloudFront, same Amplify app as the portfolio | Same workflow as the portfolio, git-push deploys, free TLS; a separate app keeps the game's deploys independent |
| Server hosting | Lightsail, $7 plan | EC2, ECS Fargate + ALB, App Runner, Amplify/Lambda | Flat low price with bandwidth and static IP included; Fargate + ALB costs more and adds complexity only useful for multiple servers; App Runner has historically lacked WebSocket support; serverless can't hold long-lived stateful connections |
| TLS for the server | Caddy reverse proxy | Nginx + certbot, Lightsail load balancer ($18/mo) | Automatic certificates and WebSocket proxying with a three-line config |
| Process manager | systemd | pm2 | Already on Ubuntu, restarts on crash and boot, logs via `journalctl`; no extra dependency |
| Subdomains | `play.` (client), `game.` (server) | Server on a path of the same host | Separate hosts keep the static CDN and the stateful server fully independent |
