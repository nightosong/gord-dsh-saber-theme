#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22+ is required. Install Node.js and try again.'
  read -r -p 'Press Enter to close...'
  exit 1
fi
echo 'Close DeepSeek Harness before installation. Existing settings will be backed up.'
node scripts/manage.mjs install "$@" || { read -r -p 'Installation failed. Press Enter to close...'; exit 1; }
read -r -p 'Done. Reopen DeepSeek Harness. Press Enter to close...'
