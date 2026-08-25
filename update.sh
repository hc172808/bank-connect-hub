# Update system packages, project dependencies, and Android SDK
sudo bash update-software.sh

# Update only project dependencies and rebuild the web app
bash update-software.sh --project

# Update Ubuntu/Debian/RHEL system packages
sudo bash update-software.sh --system

# Update installed Android SDK packages
sudo bash update-software.sh --android

# Pull and restart Docker Compose services
sudo bash update-software.sh --docker

# Full maintenance update
sudo bash update-software.sh --all

# Full update followed by a delayed reboot
sudo bash update-software.sh --all --reboot
