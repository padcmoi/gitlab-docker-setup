# 🚀 GitLab Docker Setup

_[🇬🇧 English version](readme.md) | 🇫🇷 Version française_

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://docker.com)
[![GitLab CE](https://img.shields.io/badge/GitLab-CE%20Latest-orange.svg)](https://gitlab.com)

> **Déploiement rapide et simple de GitLab Community Edition avec Docker Compose. Configuration SMTP optionnelle et support des proxys Apache2/Nginx inclus.**

## 🎯 À quoi sert ce projet ?

Ce projet vous permet de déployer votre propre serveur GitLab en quelques minutes avec :

- **GitLab Community Edition** : Votre instance GitLab privée
- **Configuration SMTP** : Envoi d'emails (notifications, invitations, etc.)
- **Proxy reverse** : Configurations Apache2 et Nginx prêtes à l'emploi
- **SSL/TLS** : Support Let's Encrypt et certificats personnalisés
- **Production ready** : Optimisé pour les petits et moyens serveurs

## � Installation rapide (5 minutes)

### Étape 1 : Prérequis

```bash
# Vérifier que Docker est installé
docker --version
docker-compose --version

# Si pas installé (Ubuntu/Debian)
sudo apt update
sudo apt install docker.io docker-compose
```

### Étape 2 : Télécharger le projet

```bash
git clone https://github.com/padcmoi/gitlab-docker-setup.git
cd gitlab-docker-setup
```

### Étape 3 : Configuration

```bash
# Copier le fichier d'exemple
cp .env.sample .env

# Éditer avec vos paramètres
nano .env
```

**Paramètres minimum à modifier dans `.env` :**

```env
GITLAB_HOST=votre-domaine.com
GITLAB_ROOT_EMAIL=admin@votre-domaine.com
GITLAB_ROOT_PASSWORD=VotreMotDePasseSecurise123!
```

> ⚠️ **CRITIQUE** : `GITLAB_ROOT_PASSWORD` doit être fort (12+ caractères avec majuscules, minuscules, chiffres, symboles) sinon GitLab plantera au démarrage !

### Étape 4 : Démarrage

```bash
# Démarrer GitLab
docker-compose up -d

# Suivre les logs (premier démarrage = 2-5 minutes)
docker-compose logs -f
```

### Étape 5 : Accès

- **URL** : `http://votre-domaine.com:1584`
- **Login** : `root`
- **Mot de passe** : Celui défini dans `GITLAB_ROOT_PASSWORD`

## ⚙️ Configuration

### Variables importantes

| Variable               | Description                                                                                                  | Exemple              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| `GITLAB_HOST`          | Votre nom de domaine                                                                                         | `gitlab.exemple.com` |
| `GITLAB_ROOT_EMAIL`    | Email administrateur                                                                                         | `admin@exemple.com`  |
| `GITLAB_ROOT_PASSWORD` | Mot de passe admin (12+ caractères) **⚠️ IMPORTANT : Utilisez un mot de passe fort sinon GitLab plantera !** | `MonMotDePasse123!`  |
| `SMTP_ENABLE`          | Activer les emails (true/false)                                                                              | `true`               |
| `HTTP_PORT`            | Port d'accès GitLab                                                                                          | `1584`               |

### Configuration SMTP (optionnel)

Si vous voulez que GitLab envoie des emails, configurez ces variables :

```env
SMTP_ENABLE=true
SMTP_ADDRESS=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre-email@gmail.com
SMTP_PASS=votre-mot-de-passe-application
```

Pour désactiver les emails :

```env
SMTP_ENABLE=false
```

## 🌐 Proxy reverse (optionnel)

### Avec Apache2

```bash
# Copier la config
sudo cp apache-gitlab.conf /etc/apache2/sites-available/gitlab.conf

# Modifier votre domaine
sudo nano /etc/apache2/sites-available/gitlab.conf

# Activer
sudo a2enmod proxy proxy_http ssl headers
sudo a2ensite gitlab.conf
sudo systemctl reload apache2
```

### Avec Nginx

```bash
# Copier la config
sudo cp nginx-gitlab.conf /etc/nginx/sites-available/gitlab

# Modifier votre domaine
sudo nano /etc/nginx/sites-available/gitlab

# Activer
sudo ln -s /etc/nginx/sites-available/gitlab /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 🔒 SSL avec Let's Encrypt

```bash
# Installer Certbot (version standalone pour ne pas modifier les configs)
sudo apt install certbot

# Générer le certificat SANS modifier les configurations Apache/Nginx
sudo certbot certonly --standalone -d votre-domaine.com

# OU si port 80 occupé par Apache/Nginx, utiliser webroot :
# sudo mkdir -p /var/www/html
# sudo certbot certonly --webroot -w /var/www/html -d votre-domaine.com
```

**Important** : Arrêtez temporairement Apache/Nginx pendant la génération avec `--standalone` :

```bash
sudo systemctl stop apache2  # ou nginx
sudo certbot certonly --standalone -d votre-domaine.com
sudo systemctl start apache2  # ou nginx
```

Puis décommentez les lignes SSL dans votre fichier de configuration proxy.

## 🛠️ Commandes utiles

```bash
# Voir l'état
docker-compose ps

# Logs en temps réel
docker-compose logs -f

# Logs en temps réel directement du conteneur
docker logs -f gitlab_ce

# Redémarrer GitLab
docker-compose restart

# Mettre à jour GitLab
docker-compose pull && docker-compose up -d

# Arrêter GitLab
docker-compose down

# Sauvegarde
docker-compose exec gitlab_ce gitlab-backup create
```

## 🔍 Problèmes courants

**GitLab ne démarre pas** :

```bash
# Vérifier les logs
docker-compose logs
# Vérifier l'espace disque
df -h
```

**Impossible d'accéder** :

```bash
# Vérifier si GitLab fonctionne
docker-compose ps
# Vérifier la connectivité réseau
ping votre-domaine.com
```

**Emails ne partent pas** :

- Vérifier les paramètres SMTP dans `.env`
- Tester : `docker-compose exec gitlab_ce gitlab-rails console`

## 🙏 Crédits

**Auteur** : [Julien Jean](https://www.linkedin.com/in/julienjean-nice/) 💼 [LinkedIn pour contact](https://www.linkedin.com/in/julienjean-nice/)

Ce projet vous aide à déployer GitLab rapidement pour vos projets personnels ou professionnels.

## 📄 License

Ce projet est sous licence MIT - voir le fichier [LICENSE.md](LICENSE.md) pour les détails.

---

⭐ **Ce projet vous a aidé ? N'hésitez pas à lui donner une étoile !** ⭐
