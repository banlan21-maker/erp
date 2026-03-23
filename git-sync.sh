#!/bin/bash
# .env 파일에서 GITHUB_TOKEN 정보를 읽어옵니다.
if [ -f .env ]; then
  export $(grep ^GITHUB_TOKEN .env | xargs)
fi

echo ">>> Checking repository status..."

if [ ! -d ".git" ]; then
  echo ">>> .git directory not found. Initializing repository manually..."
  if [ -z "$GITHUB_TOKEN" ]; then
    sudo docker compose run --rm git-sync sh -c "git config --global --add safe.directory /git && git init && git remote add origin https://github.com/banlan21-maker/erp.git && git fetch origin master && git checkout -f master"
  else
    sudo docker compose run --rm git-sync sh -c "git config --global --add safe.directory /git && git init && git remote add origin https://x-access-token:${GITHUB_TOKEN}@github.com/banlan21-maker/erp.git && git fetch origin master && git checkout -f master"
  fi
else
  echo ">>> Syncing with GitHub (Pull)..."
  sudo docker compose run --rm git-sync sh -c "git config --global --add safe.directory /git && git pull origin master"
fi

if [ $? -eq 0 ]; then
  echo ">>> Sync successful. Building services..."
  sudo docker compose up -d --build
else
  echo ">>> Failed. Check your TOKEN or Network."
  exit 1
fi
