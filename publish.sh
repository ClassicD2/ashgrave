#!/bin/sh
# Builds the game and pushes source + build to github.com/ClassicD2/ashgrave (served by GitHub Pages).
set -e
cd /home/claude/askgraven && python3 build.py
R=/home/claude/ashgrave
rm -rf "$R/src" "$R/tools" && cp -r src tools "$R/" && rm -rf "$R"/src/__pycache__ "$R"/tools/__pycache__
cp build.py tiles.py publish.sh "$R/" && cp dist/index.html "$R/index.html" && rm -rf "$R/img" && cp -r dist/img "$R/img"
cd "$R" && git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UGkaHRVqa7ipSTFxKPoF56" || true
git fetch -q origin main && git rebase -q origin/main && git push -q origin HEAD:main
git log --oneline -1
