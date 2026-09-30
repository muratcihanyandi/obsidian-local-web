#!/usr/bin/env bash
# Obsidian Local Web launcher for macOS / Linux
cd "$(dirname "$0")" || exit 1

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Python 3 is required. Install it from https://www.python.org"
  exit 1
fi

exec "$PY" server.py "$@"
