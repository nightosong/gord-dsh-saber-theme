#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
node scripts/manage.mjs uninstall "$@" || { read -r -p 'Restore failed. Press Enter to close...'; exit 1; }
read -r -p 'Done. Reopen DeepSeek Harness. Press Enter to close...'
