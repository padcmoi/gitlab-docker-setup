# 🚀 GitLab Docker Setup

_🇬🇧 English version | [🇫🇷 Version française](readme-fr.md)_

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://docker.com)
[![GitLab CE](https://img.shields.io/badge/GitLab-CE%20Latest-orange.svg)](https://gitlab.com)

> **Fast and simple GitLab Community Edition deployment with Docker Compose. Optional SMTP configuration and Apache2/Nginx reverse proxy support included.**

## 🎯 What is this project for?

This project allows you to deploy your own GitLab server in just a few minutes with:

- **GitLab Community Edition**: Your private GitLab instance
- **SMTP Configuration**: Email sending (notifications, invitations, etc.)
- **Reverse Proxy**: Ready-to-use Apache2 and Nginx configurations
- **SSL/TLS**: Let's Encrypt and custom certificates support
- **Production Ready**: Optimized for small and medium servers

## 🚀 Quick Installation (5 minutes)

### Step 1: Prerequisites

```bash
# Check Docker is installed
docker --version
docker-compose --version

# If not installed (Ubuntu/Debian)
sudo apt update
sudo apt install docker.io docker-compose
```

### Step 2: Download the project

```bash
git clone https://github.com/padcmoi/gitlab-docker-setup.git
cd gitlab-docker-setup
```

### Step 3: Configuration

```bash
# Copy the sample environment file
cp .env.sample .env

# Edit with your settings
nano .env
```

**Minimum parameters to modify in `.env`:**

```env
GITLAB_HOST=your-domain.com
GITLAB_ROOT_EMAIL=admin@your-domain.com
GITLAB_ROOT_PASSWORD=YourSecurePassword123!
```

> ⚠️ **CRITICAL**: `GITLAB_ROOT_PASSWORD` must be strong (12+ characters with uppercase, lowercase, numbers, symbols) or GitLab will crash during startup!

### Step 4: Start

```bash
# Start GitLab
docker-compose up -d

# Follow logs (first startup = 2-5 minutes)
docker-compose logs -f
```

### Step 5: Access

- **URL**: `http://your-domain.com:1584`
- **Login**: `root`
- **Password**: The one set in `GITLAB_ROOT_PASSWORD`

## ⚙️ Configuration

### Important Variables

| Variable               | Description                                                                                   | Example              |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| `GITLAB_HOST`          | Your domain name                                                                              | `gitlab.example.com` |
| `GITLAB_ROOT_EMAIL`    | Administrator email                                                                           | `admin@example.com`  |
| `GITLAB_ROOT_PASSWORD` | Admin password (12+ characters) **⚠️ IMPORTANT: Use a strong password or GitLab will crash!** | `MyPassword123!`     |
| `SMTP_ENABLE`          | Enable emails (true/false)                                                                    | `true`               |
| `HTTP_PORT`            | GitLab access port                                                                            | `1584`               |

### SMTP Configuration (optional)

If you want GitLab to send emails, configure these variables:

```env
SMTP_ENABLE=true
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

To disable emails:

```env
SMTP_ENABLE=false
```

## 🌐 Reverse Proxy (optional)

### With Apache2

```bash
# Copy config
sudo cp apache-gitlab.conf /etc/apache2/sites-available/gitlab.conf

# Edit your domain
sudo nano /etc/apache2/sites-available/gitlab.conf

# Enable
sudo a2enmod proxy proxy_http ssl headers
sudo a2ensite gitlab.conf
sudo systemctl reload apache2
```

### With Nginx

```bash
# Copy config
sudo cp nginx-gitlab.conf /etc/nginx/sites-available/gitlab

# Edit your domain
sudo nano /etc/nginx/sites-available/gitlab

# Enable
sudo ln -s /etc/nginx/sites-available/gitlab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 🔒 SSL with Let's Encrypt

```bash
# Install Certbot (standalone version to avoid modifying configs)
sudo apt install certbot

# Generate certificate WITHOUT modifying Apache/Nginx configurations
sudo certbot certonly --standalone -d your-domain.com

# OR if port 80 is occupied by Apache/Nginx, use webroot:
# sudo mkdir -p /var/www/html
# sudo certbot certonly --webroot -w /var/www/html -d your-domain.com
```

**Important**: Temporarily stop Apache/Nginx during generation with `--standalone`:

```bash
sudo systemctl stop apache2  # or nginx
sudo certbot certonly --standalone -d your-domain.com
sudo systemctl start apache2  # or nginx
```

Then uncomment the SSL lines in your proxy configuration file.

## 🛠️ Useful Commands

```bash
# View status
docker-compose ps

# Real-time logs
docker-compose logs -f

# Real-time logs directly from container
docker logs -f gitlab_ce

# Restart GitLab
docker-compose restart

# Update GitLab
docker-compose pull && docker-compose up -d

# Stop GitLab
docker-compose down

# Backup
docker-compose exec gitlab_ce gitlab-backup create
```

## 🔍 Common Issues

**GitLab won't start**:

```bash
# Check logs
docker-compose logs
# Check disk space
df -h
```

**Cannot access**:

```bash
# Check if GitLab is running
docker-compose ps
# Check network connectivity
ping your-domain.com
```

**Emails not working**:

- Check SMTP settings in `.env`
- Test: `docker-compose exec gitlab_ce gitlab-rails console`

## 🙏 Credits

**Author**: [Julien Jean](https://www.linkedin.com/in/julienjean-nice/) 💼 [LinkedIn for contact](https://www.linkedin.com/in/julienjean-nice/)

This project helps you deploy GitLab quickly for your personal or professional projects.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

---

⭐ **Did this project help you? Don't hesitate to give it a star!** ⭐
