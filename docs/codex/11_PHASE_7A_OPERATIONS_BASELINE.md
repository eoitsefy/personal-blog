# Phase 7A Operations and Security Baseline

## Status

`[IN PROGRESS]` The production read-only audit completed on 2026-07-19. Repository-side changes are implemented on `agent/phase-7a-operations-baseline`; production changes and acceptance evidence remain pending.

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
2. Issue or verify an `acme.sh` certificate covering both `eastherphil.cn` and `www.eastherphil.cn`, prove its key pair and SANs, switch Nginx with an immediate rollback path, then prove automated renewal and reload before disabling Certbot.
3. Create a named operations account with a unique public key and sudo access; verify a second concurrent login before changing SSH policy.
4. Remove the stale UFW 3002 rules and reconcile the Alibaba Cloud security group. Preserve 22/80/443 until SSH and HTTPS acceptance passes.
5. Deploy the container and local operations controls. Confirm upload ownership for UID 1000 before replacing the application container.
6. Run normal and forced-failure alert checks, a temporary-database restore drill, and an application image rollback drill.
7. Configure and verify an off-host backup destination, then remove temporary root deployment access.

## Rollback boundaries

- Do not disable root or password login until the named account, key, sudo, and emergency console path are verified.
- Keep the current certificate and Nginx backup until the selected ACME client proves both required SANs, completes a renewal test, and reloads Nginx successfully.
- Keep the current application image tag and environment backup until health, uploads, media playback, map, assistant, and login checks pass.
- UFW changes must be applied by numbered rule or exact rule and immediately followed by listener and remote connectivity checks.

## Acceptance criteria

- The served certificate covers both the apex and `www` names, its path is documented, renewal/reload verification succeeds, and the expiry alert passes.
- Named operator login and sudo work; password SSH is disabled; emergency access is documented and tested.
- Only intended public ports are allowed in both UFW and the Alibaba Cloud security group.
- Containers are healthy, the app runs non-root, logs rotate, limits are visible through `docker inspect`, and uploads remain writable.
- Normal operations checks pass; a forced alert fails predictably and writes auditable evidence.
- Fresh database and upload backups pass integrity checks, a temporary restore drill succeeds and cleans up, and an off-host copy is verified by checksum.
- Application rollback is demonstrated without losing database or upload data.
