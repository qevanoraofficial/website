#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$HOME/Digiestore-no-telegram-push"
REMOTE="git@github.com:digiestore/Digiestore.git"
BRANCH="main"

echo "=== PUSH FIX DIGIE STORE TANPA TELEGRAM ==="
pkg install git rsync -y >/dev/null

if [ -d "$WORK_DIR/.git" ]; then
  echo "Memperbarui repository kerja..."
  git -C "$WORK_DIR" fetch origin "$BRANCH"
  git -C "$WORK_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$WORK_DIR"
  echo "Clone repository Digie Store..."
  GIT_SSH_COMMAND="ssh -o HostName=ssh.github.com -p 443 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 -o Compression=yes" \
    git clone --branch "$BRANCH" "$REMOTE" "$WORK_DIR"
fi

echo "Menyalin seluruh perbaikan..."
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.vercel/' \
  --exclude='.next/' \
  --exclude='node_modules/' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='.env.development' \
  --exclude='.env.test' \
  "$SOURCE_DIR/" "$WORK_DIR/"

cd "$WORK_DIR"
git config user.name "DIGIE STORE"
git config user.email "digiestore26@gmail.com"
git add -A

if git diff --cached --quiet; then
  echo "Tidak ada perubahan baru untuk dipush."
  exit 0
fi

git commit -m "fix: remove Telegram dependency from checkout"

GIT_SSH_COMMAND="ssh -o HostName=ssh.github.com -p 443 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 -o Compression=yes" \
  git push origin "$BRANCH"

echo
echo "✅ Berhasil push ke GitHub."
echo "Tunggu deployment digiestore di Vercel menjadi Ready."
