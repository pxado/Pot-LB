#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Root Linux sandbox required'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq > /tmp/waytrace-apt.log 2>&1
apt-get install -y --no-install-recommends rsyslog rsyslog-gnutls openssl nginx shellcheck >> /tmp/waytrace-apt.log 2>&1
npm ci --no-audit --no-fund
npx playwright-core install --with-deps chromium > /tmp/waytrace-browser-install.log 2>&1
install -d -m 0700 /var/lib/waytrace-lab
shellcheck config-Help/config.bash labs/test-installer.bash labs/install-lab-dependencies.bash
npm run check
npm test > /var/lib/waytrace-lab/linux-tests.txt 2>&1
tail -n 10 /var/lib/waytrace-lab/linux-tests.txt
