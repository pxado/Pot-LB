#!/usr/bin/env bash
# Destructive only to this explicitly initialized lab's temporary configuration.
set -Eeuo pipefail
[[ $(uname -s) == Linux && $EUID == 0 && -f /var/lib/waytrace-lab/state.json ]] || { echo 'Initialize the isolated VPS lab before running these tests.' >&2; exit 1; }
umask 077
test_dir=$(mktemp -d /var/lib/waytrace-lab/installer-tests.XXXXXX)
target=/etc/rsyslog.d/60-waytrace.conf
cp -p "$target" "$test_dir/original.conf"
cleanup() { cp -p "$test_dir/original.conf" "$target"; rm -f /etc/rsyslog.d/10-waytrace-lab-imfile.conf; }
trap cleanup EXIT
snapshot() { sha256sum "$target" /etc/waytrace/ca.crt /etc/waytrace/client.crt /etc/waytrace/client.key; stat -c '%a %g' /etc/waytrace/client.key; }
baseline=$(snapshot)
bundle=$(cat /var/lib/waytrace-lab/bundle-path)
[[ $bundle == /var/lib/waytrace-lab/bundles/* && -d $bundle ]] || { echo 'Invalid lab bundle path'; exit 1; }
cp -a "$bundle" "$test_dir/corrupt"
printf '# tampered\n' >> "$test_dir/corrupt/waytrace.conf"
if bash config-Help/config.bash install "$test_dir/corrupt" --no-restart > "$test_dir/checksum.log" 2>&1; then echo 'Tampered bundle was accepted'; exit 1; fi
[[ $(snapshot) == "$baseline" ]]
echo 'PASS: checksum failure preserves installed files/key'
cp -a "$bundle" "$test_dir/mismatch"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$test_dir/other.key" -out "$test_dir/mismatch/client.crt" -days 2 -subj /CN=wrong-key >/dev/null 2>&1
(cd "$test_dir/mismatch" && sha256sum waytrace.conf ca.crt client.crt config.bash README.txt > SHA256SUMS)
if bash config-Help/config.bash install "$test_dir/mismatch" --no-restart > "$test_dir/identity.log" 2>&1; then echo 'Untrusted identity was accepted'; exit 1; fi
[[ $(snapshot) == "$baseline" ]]
echo 'PASS: untrusted certificate preserves installed files/key'
cp -a "$bundle" "$test_dir/wrong-key"
openssl req -new -key "$test_dir/other.key" -out "$test_dir/other.csr" -subj /CN=wrong-key >/dev/null 2>&1
openssl x509 -req -in "$test_dir/other.csr" -CA /var/lib/waytrace-lab/pki/ca.crt -CAkey /var/lib/waytrace-lab/pki/ca.key -CAcreateserial -out "$test_dir/wrong-key/client.crt" -days 2 -extfile /var/lib/waytrace-lab/pki/client.ext >/dev/null 2>&1
(cd "$test_dir/wrong-key" && sha256sum waytrace.conf ca.crt client.crt config.bash README.txt > SHA256SUMS)
if bash config-Help/config.bash install "$test_dir/wrong-key" --no-restart > "$test_dir/wrong-key.log" 2>&1; then echo 'Wrong local private key was accepted'; exit 1; fi
grep -q 'does not match this VPS private key' "$test_dir/wrong-key.log"
[[ $(snapshot) == "$baseline" ]]
echo 'PASS: trusted certificate with wrong private key is rejected'
cp -a "$bundle" "$test_dir/invalid"
printf '\nWayTraceInvalidConfiguration(unrecognized="yes")\n' >> "$test_dir/invalid/waytrace.conf"
(cd "$test_dir/invalid" && sha256sum waytrace.conf ca.crt client.crt config.bash README.txt > SHA256SUMS)
if bash config-Help/config.bash install "$test_dir/invalid" --no-restart > "$test_dir/rollback.log" 2>&1; then echo 'Invalid rsyslog configuration was accepted'; exit 1; fi
[[ $(snapshot) == "$baseline" ]]
grep -q 'previous configuration/certificates restored' "$test_dir/rollback.log"
echo 'PASS: failed rsyslog validation rolls back installed files/key'
sed -i '/^module(load="imfile")$/d' "$target"
printf 'module(load="imfile")\n' > /etc/rsyslog.d/10-waytrace-lab-imfile.conf
bash config-Help/config.bash install "$bundle" --no-restart > "$test_dir/imfile.log" 2>&1
if grep -q '^module(load="imfile")$' "$target"; then echo 'Duplicate imfile load'; exit 1; fi
rsyslogd -N1 > "$test_dir/validate.log" 2>&1
echo 'PASS: existing imfile load is retained without a duplicate'
cleanup
bash config-Help/config.bash install "$bundle" --no-restart > "$test_dir/reinstall.log" 2>&1
[[ $(snapshot) == "$baseline" ]]
echo 'PASS: reinstall preserves local private key and configuration'
printf 'Installer integration: 6 passed, 0 failed. Diagnostic artifacts remain only in the private lab.\n'
