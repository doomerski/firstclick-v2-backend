# FirstClick V2

A service marketplace platform connecting customers with contractors.

## Repository Structure

```
firstclick-v2/
├── backend/          # Node.js/Express API server
├── frontend/         # Static HTML/CSS/JS frontend
├── db/               # Database schema and migrations
│   ├── schema.sql
│   ├── migrations/
│   └── expansion-proposals-schema.sql
├── deploy/           # Deployment scripts and configs
│   ├── deploy.sh
│   ├── setup-server.sh
│   ├── firstclick-api.service
│   ├── firstclick-api.nginx
│   └── ...
├── .gitignore
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20.x
- PostgreSQL 14+
- Git

### Setup

1. **Clone the repository:**
   ```bash
   git clone git@github.com:doomerski/firstclick-v2.git
   cd firstclick-v2
   ```

2. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Create local environment file:**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your local settings
   ```

4. **Set up local database:**
   ```bash
   createdb firstclick_dev
   psql firstclick_dev < ../db/schema.sql
   ```

5. **Run the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

6. **Open frontend:**
   Open `frontend/index.html` in your browser, or serve it:
   ```bash
   cd frontend
   npx serve .
   ```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | API server port | `3000` |
| `WEB_ORIGIN` | Frontend origin (CORS) | `http://localhost:5000` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@localhost:5432/firstclick_dev` |
| `JWT_SECRET` | Secret for JWT signing | `your-secret-key` |

---

## Production Deployment

### Server Requirements

- Ubuntu 22.04+ LTS
- 1GB+ RAM
- Domain pointed to server IP

### First-Time Server Setup

1. **SSH into server and clone repo:**
   ```bash
   ssh root@your-server-ip
   cd /opt
   git clone git@github.com:doomerski/firstclick-v2.git
   cd firstclick-v2
   ```

2. **Run setup script (installs Node, PostgreSQL, nginx, etc.):**
   ```bash
   sudo chmod +x deploy/setup-server.sh
   sudo ./deploy/setup-server.sh
   ```

3. **Create PostgreSQL database:**
   ```bash
   sudo -u postgres psql
   CREATE USER firstclick_user WITH PASSWORD 'your_password';
   CREATE DATABASE firstclick_db OWNER firstclick_user;
   \q
   ```

4. **Edit production environment file:**
   ```bash
   sudo nano /etc/firstclick/firstclick.env
   # Set DATABASE_URL, JWT_SECRET, WEB_ORIGIN, etc.
   ```

5. **Deploy:**
   ```bash
   sudo ./deploy/deploy.sh
   ```

6. **Enable service to start on boot:**
   ```bash
   sudo systemctl enable firstclick-api
   ```

7. **(Optional) Set up SSL:**
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d api.firstclick.it.com
   ```

### Deploying Updates

After pushing to `main`:

```bash
ssh root@your-server-ip
cd /opt/firstclick-v2
sudo ./deploy/deploy.sh
```

Or automate with GitHub Actions.

---

## Production Configuration

### File Locations

| Purpose | Path |
|---------|------|
| Environment file | `/etc/firstclick/firstclick.env` |
| Backend code | `/srv/firstclick/prod/backend/` |
| Frontend files | `/srv/firstclick/prod/frontend/` |
| Uploads | `/srv/firstclick/prod/backend/uploads/` |
| Logs | `journalctl -u firstclick-api` |

### Service Management

```bash
# Status
sudo systemctl status firstclick-api

# Start/Stop/Restart
sudo systemctl start firstclick-api
sudo systemctl stop firstclick-api
sudo systemctl restart firstclick-api

# View logs
journalctl -u firstclick-api -f
journalctl -u firstclick-api -n 100 --no-pager
```

### Nginx

- **Config:** `/etc/nginx/sites-available/firstclick-api`
- **Host:** `api.firstclick.it.com`
- **Test config:** `sudo nginx -t`
- **Reload:** `sudo systemctl reload nginx`

---

## Database

### Schema Location

- Main schema: `db/schema.sql`
- Migrations: `db/migrations/`
- Expansion proposals: `db/expansion-proposals-schema.sql`

### Running Migrations

Migrations run automatically during deployment. To run manually:

```bash
cd /srv/firstclick/prod/backend
source /etc/firstclick/firstclick.env
node db-setup.js --migrate
```

---

## API Documentation

See [backend/API_INTEGRATION_GUIDE.md](backend/API_INTEGRATION_GUIDE.md) for full API documentation.

### Quick Reference

```bash
# Health check
curl http://localhost:3000/health

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

---

## License

Proprietary - All rights reserved.
