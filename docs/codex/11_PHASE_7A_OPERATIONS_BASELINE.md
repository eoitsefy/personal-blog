# Phase 7A Operations and Security Baseline

## Status

`[IN PROGRESS]` The production read-only audit completed on 2026-07-19. Certificate ownership and renewal were standardized on `acme.sh`; the named operator, SSH hardening, and host UFW port cleanup passed production acceptance. The remaining cloud and repository controls are still staged on `agent/phase-7a-operations-baseline`.

## Verified production baseline

- Production commit was `e5646d290b2fcca5d90531cf0cb34ea2c24d8fad`; application, AMap, and DeepSeek health gates passed.
- Public listeners were SSH 22 and Nginx 80/443. The application was bound only to `127.0.0.1:3000`.
- No process listened on historical port 3002, but UFW still allowed 3002 for IPv4 and IPv6.
- Root filesystem usage was 42% with 22 GiB available after the Phase 6A capacity recovery. Docker retained three rollback application images and had no build cache.
- The application container was unprivileged but ran with its image default user, without memory, CPU, PID, capability, or log-size limits.
- SSH allowed root login, password authentication, X11 forwarding, and TCP forwarding. No named sudo operator existed, fail2ban was absent, and 63 rejected or invalid SSH events occurred in 24 hours.
- The latest database dump passed `gzip -t`, but backups were mode 0644, upload backups were deployment-only, and no off-host destination or `rclone` installation existed.
- `/etc/fstab` contained the same `/swapfile` entry twice. The active 2 GiB swap itself was healthy.
- The Nginx-served Certbot certificate expires on 2026-08-08. `certbot.service` has failed since 2026-07-10. A separate `acme.sh` installation successfully issued an ECDSA certificate on 2026-07-08 that expires on 2026-10-06 and installs to `/etc/nginx/ssl/eastherphil.cn`, but Nginx does not use that path yet.
- The current `acme.sh` domain record has `Le_Domain='eastherphil.cn'` and `Le_Alt='no'`. Because the Nginx virtual host also serves `www.eastherphil.cn`, the replacement certificate must prove both SANs before Nginx is switched and Certbot is disabled.
- TLS 1.0 and 1.1 handshakes were rejected. Corrected probes verified TLS 1.2 and TLS 1.3. HSTS was not observed.
- Twenty-four package upgrades were available and no reboot was required at audit time.

## Completed production change: certificate ownership

- On 2026-07-19, `acme.sh` issued an ECDSA certificate covering both `eastherphil.cn` and `www.eastherphil.cn`, valid through 2026-10-16.
- Nginx now reads `/etc/nginx/ssl/eastherphil.cn/fullchain.pem` and `/etc/nginx/ssl/eastherphil.cn/privkey.pem` rather than the old Certbot live path.
- Both SNI names served certificate DER SHA-256 `6eda8715a32713f7d607af1837831f077645ff0b9888964f0dfc8ccf6601ffa1` during migration acceptance.
- The root `acme.sh` cron entry completed successfully and selected its next ARI renewal window for 2026-09-17. The obsolete `certbot.timer` was disabled without uninstalling Certbot.
- The first switch probe safely rolled back after observing an old Nginx worker during graceful reload. The corrected bounded retry then accepted the new certificate on both names. Rollback evidence is retained under `/root/backups/phase7a-certificate-20260719-011752`; the successful migration backup is `/root/backups/phase7a-certificate-20260719-012445`.
- A separate read-only verification produced `phase7a_certificate_acceptance=passed`, confirmed application health with AMap and DeepSeek enabled, and was saved locally as `phase7a-certificate-acceptance-20260719-074623.txt`. Browser checks of both public names completed without certificate warnings.

## Completed production change: named operator and SSH hardening

- On 2026-07-19, the named `blogops` account was created with UID/GID 1000, membership in the `sudo` group, a locked password, and a unique Ed25519 public key.
- `/etc/sudoers.d/90-personal-blog-ops` passed `visudo`; an independent connection as `blogops` proved public-key-only login and non-interactive sudo access to UID 0.
- SSH hardening was then applied through `/etc/ssh/sshd_config.d/00-personal-blog-hardening.conf` with a 15-minute automatic rollback. A second session proved `blogops` and temporary root public-key emergency access before the rollback timer was cancelled.
- Effective policy now has password and keyboard-interactive authentication disabled, root limited to public-key authentication, X11/agent/TCP forwarding disabled, `MaxAuthTries 3`, and `LoginGraceTime 30`. The Alibaba Cloud console and temporary root key remain the emergency path until the final Phase 7A access cleanup.

## Completed production change: host firewall port cleanup

- On 2026-07-19, a second listener check confirmed that historical port 3002 was unused before any firewall change.
- UFW configuration, numbered/verbose status, IPv4/IPv6 rules, and listeners were backed up under `/root/backups/phase7a-ufw-20260719-093059`.
- The exact `3002/tcp` allowance was deleted for both IPv4 and IPv6. `OpenSSH`, `80/tcp`, and `443/tcp` remained allowed for both address families.
- Post-change checks passed for the `127.0.0.1:3000` health endpoint and local-SNI HTTPS. Evidence is retained in `/root/server-ops/logs/phase7a-stale-port-20260719-093059.log`.
- Alibaba Cloud security-group reconciliation remains a separate control-plane task; no completion is claimed until its inbound rules are inspected.

## Repository-side controls in this phase

- Build the runtime image from production dependencies only and run the Next.js process as the Alpine `node` user.
- Add application, PostgreSQL, and Redis health checks; apply resource, PID, log rotation, and `no-new-privileges` controls.
- Generate database and upload backups atomically under an exclusive lock, verify archives before publication, use mode 0600, and retain 14 days locally.
- Restore the newest dump into a uniquely named temporary database, validate core tables, and always clean up the temporary database.
- Add bounded Docker builder/image/container cleanup with seven-day unused-image retention.
- Add a health script for disk, inode, containers, HTTP health, database backup freshness, and certificate expiry, with a forced-failure acceptance mode.
- Add a provider-neutral `rclone` off-site transfer script. It remains disabled until a dedicated remote and credentials are configured outside the repository.

## Staged production rollout

1. Back up the database, uploads, environment, Nginx, SSH, UFW, Docker, and fstab configuration.
2. `[COMPLETE 2026-07-19]` Issue an `acme.sh` certificate covering both names, prove its key pair and SANs, switch Nginx with an immediate rollback path, verify renewal/reload, and disable the obsolete Certbot timer.
3. `[COMPLETE 2026-07-19]` Create and independently verify `blogops`, then disable password SSH with automatic rollback protection while retaining and testing temporary root public-key emergency access.
4. `[PARTIAL 2026-07-19]` The stale IPv4/IPv6 UFW 3002 rules were removed with backup and health verification. Reconcile the Alibaba Cloud security group, preserving 22/80/443.
5. Deploy the container and local operations controls. Confirm upload ownership for UID 1000 before replacing the application container.
6. Run normal and forced-failure alert checks, a temporary-database restore drill, and an application image rollback drill.
7. Configure and verify an off-host backup destination, then remove temporary root deployment access.

## Rollback boundaries

- Keep the verified `blogops` key, current root public-key emergency path, SSH backup, and Alibaba Cloud console available until the remaining Phase 7A server changes are accepted; only then consider `PermitRootLogin no` and remove the temporary root key.
- Keep the 2026-07-19 Nginx and certificate backups until the next automatic `acme.sh` renewal and reload complete successfully.
- Keep the current application image tag and environment backup until health, uploads, media playback, map, assistant, and login checks pass.
- UFW changes must be applied by numbered rule or exact rule and immediately followed by listener and remote connectivity checks.

## Acceptance criteria

- `[PASSED 2026-07-19]` The served certificate covers both names, its stable path is documented, and issuance, installation, reload, cron, and fingerprint checks passed. The Phase 7A expiry alert deployment remains pending.
- `[PASSED 2026-07-19]` Named operator login and sudo passed; password SSH is disabled; rollback protection, a second operator session, and temporary root public-key emergency access were verified before confirmation.
- `[PASSED — HOST UFW 2026-07-19; CLOUD PENDING]` UFW allows only intended SSH/HTTP/HTTPS ports; the Alibaba Cloud security group still requires control-plane verification.
- Containers are healthy, the app runs non-root, logs rotate, limits are visible through `docker inspect`, and uploads remain writable.
- Normal operations checks pass; a forced alert fails predictably and writes auditable evidence.
- Fresh database and upload backups pass integrity checks, a temporary restore drill succeeds and cleans up, and an off-host copy is verified by checksum.
- Application rollback is demonstrated without losing database or upload data.
