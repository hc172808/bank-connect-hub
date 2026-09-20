# GYDS Node — Build & Run on Your Server

`deploy.sh` already does all of this automatically (Step 13). Use this file when you
want to build and verify the node **by hand**, before wiring it into the wallet.

---

## 0. Prerequisites (Ubuntu 22.04 / 24.04)

```bash
sudo apt-get update
sudo apt-get install -y curl git ca-certificates ufw jq
# Docker + Compose v2
curl -fsSL https://get.docker.com | sudo bash
sudo systemctl enable --now docker
docker compose version
```

## 1. Get the code

```bash
sudo mkdir -p /opt/netlifecash
sudo git clone <YOUR_REPO_URL> /opt/netlifecash 2>/dev/null || (cd /opt/netlifecash && sudo git pull)
cd /opt/netlifecash/public/rpcnode
```

## 2. Configure the node

```bash
sudo cp .env.example .env
sudo nano .env      # set GYDS_CHAIN_ID, GYDS_RPC_PORT=8545, GYDS_P2P_PORT=30305
```

## 3. Build and start it

```bash
sudo docker compose build          # Go 1.22 multi-stage build
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -f --tail=100 gyds-rpcnode    # Ctrl-C to exit
```

## 4. Confirm it listens on 8545

```bash
sudo ss -tlnp | grep -E '8545|8546|30305'
curl -s http://localhost:8545/health
curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' | jq
curl -s -X POST http://localhost:8545 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq
```

Expected: `eth_chainId` returns a hex chain id, `eth_blockNumber` increases every ~5s.

## 5. Open the firewall

```bash
sudo ufw allow 8545/tcp   comment 'GYDS JSON-RPC'
sudo ufw allow 8546/tcp   comment 'GYDS WebSocket'
sudo ufw allow 30305/tcp  comment 'GYDS P2P'
sudo ufw allow 30305/udp
sudo ufw status numbered
```

## 6. Wire the Docker socket (build server / container control)

```bash
sudo groupadd -f docker
sudo usermod -aG docker "$USER"          # log out/in afterwards
sudo chgrp docker /var/run/docker.sock
sudo chmod 660 /var/run/docker.sock
# the app container must mount it:
#   volumes:
#     - /var/run/docker.sock:/var/run/docker.sock
docker ps                                 # must work without sudo
```

## 7. Auto-start on reboot

```bash
sudo systemctl enable gyds-rpcnode     # created by deploy.sh
sudo systemctl status gyds-rpcnode
```

Manual unit, if you skipped deploy.sh:

```bash
sudo tee /etc/systemd/system/gyds-rpcnode.service >/dev/null <<'EOF'
[Unit]
Description=GYDS Chain RPC Node
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/netlifecash/public/rpcnode
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now gyds-rpcnode
```

## 8. Full one-shot install (everything above, automated)

```bash
cd /opt/netlifecash
sudo bash deploy.sh
```

## 9. Point the app at the node

In the admin area → **Blockchain Settings**, set:

- RPC URL: `http://<SERVER_IP>:8545` (or `https://rpc.yourdomain.com` behind Nginx)
- Chain ID: value returned by `eth_chainId`
- Native coin: `GYDS`

## Troubleshooting

| Symptom | Command |
|---|---|
| Container restarting | `sudo docker compose logs --tail=200 gyds-rpcnode` |
| Port not listening | `sudo ss -tlnp \| grep 8545` |
| Build fails | `sudo docker compose build --no-cache` |
| Reset chain data | `sudo docker compose down -v && sudo docker compose up -d` |
