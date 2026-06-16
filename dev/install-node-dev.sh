#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${1:-22}"

echo "[1/6] Mise à jour des paquets..."
sudo apt update && sudo apt upgrade -y

echo "[2/6] Installation des prérequis..."
sudo apt install -y ca-certificates curl gnupg build-essential git

echo "[3/6] Ajout du dépôt NodeSource pour Node.js ${NODE_MAJOR}.x..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -

echo "[4/6] Installation de Node.js et npm..."
sudo apt install -y nodejs

echo "[5/6] Vérification des versions..."
node -v
npm -v

echo "[6/6] Activation de corepack (pnpm / yarn)..."
sudo corepack enable || true

echo
echo "Installation terminée."
echo "Version Node : $(node -v)"
echo "Version npm  : $(npm -v)"