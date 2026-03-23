#!/bin/bash

echo ">>> Checking repository status..."

# .git 폴더가 없으면 최초 클론(Clone)을 진행합니다.
if [ ! -d ".git" ]; then
  echo ">>> .git directory not found. Initializing repository..."
  if [ -z "$GITHUB_TOKEN" ]; then
    docker-compose run --rm git-sync sh -c "git clone https://github.com/banlan21-maker/erp.git ."
  else
    docker-compose run --rm git-sync sh -c "git clone https://x-access-token:${GITHUB_TOKEN}@github.com/banlan21-maker/erp.git ."
  fi
else
  # 이미 존재하면 Pull 하여 동기화합니다.
  echo ">>> Syncing with GitHub using Docker container..."
  docker-compose run --rm git-sync
fi

if [ $? -eq 0 ]; then
  echo ">>> Sync successful. Rebuilding and restarting services..."
  docker-compose up -d --build
else
  echo ">>> Sync/Clone failed. Please check your GITHUB_TOKEN in .env or your network connection."
  exit 1
fi
