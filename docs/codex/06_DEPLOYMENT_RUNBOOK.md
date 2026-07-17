# Deployment Runbook

> Production commands are templates derived from the documented environment. Verify service names, paths, environment files, and Compose configuration before execution.

## Environment

- Server project: `/root/personal-blog-web`
- Domain: `eastherphil.cn`
- Nginx -> app: `127.0.0.1:3000`
- Containers: `blog-app`, `blog-postgres`, `blog-redis`
- Backup directory: `/root/backups`
- Upload directory: `/var/www/personal-blog/uploads`
- Operations logs: `/root/server-ops/logs`

## Pre-deployment checklist

```bash
cd /root/personal-blog-web
git status
git remote -v
git fetch --all --prune
git log --oneline --decorate -10
df -h
docker compose ps
sudo nginx -t
sudo ss -lntp
sudo crontab -l
tail -n 100 /root/backups/backup.log
```

Confirm:

- working tree is clean;
- target commit is reviewed;
- only intended ports are exposed;
- database backup is recent;
- upload directory is mounted/preserved;
- certificate is currently valid;
- the previous application image/tag or commit is recorded.
- `POSTGRES_PASSWORD` and `DATABASE_URL` contain non-placeholder production values. Phase 4B sessions are opaque, hashed database records and no longer require `JWT_SECRET`.
- `UPLOAD_ROOT=/app/uploads`, `MAX_UPLOAD_BYTES` is an approved positive per-file limit, `MAX_MEDIA_STORAGE_BYTES` is an approved positive total quota, and `/var/www/personal-blog/uploads` exists with write access for the application container.
- the Phase 1B migration has been reviewed; it adds taxonomy, login-throttle, and soft-delete columns without dropping content.
- the Phase 2 migration has been reviewed; it adds optional asset filename/dimension metadata and an asset recycle-bin index without dropping media records.
- the Phase 4B migration has been reviewed; it converts roles to a closed enum, adds account status and database sessions, and intentionally signs administrators out once during deployment.
- the Phase 4B lifecycle migration has been reviewed; invitation and password-reset tokens are random, stored only as hashes, expire, and can be used once.

## Manual backup before a risky release

Prefer the existing tested script:

```bash
/root/personal-blog-web/scripts/backup-db.sh
```

Then verify the newest file:

```bash
ls -lhtr /root/backups | tail
gzip -t /root/backups/<newest-backup>.sql.gz
```

Do not place database dumps in the Git repository.

## Deployment sequence

A conservative flow:

```bash
cd /root/personal-blog-web
git fetch origin
git checkout main
git pull --ff-only origin main
```

Record the deployment commit:

```bash
git rev-parse HEAD
```

Build and inspect using the actual Compose service names:

```bash
docker compose build app
```

If Prisma migrations exist, inspect them before deployment and run the repository-approved command. A common pattern is:

```bash
docker compose run --rm app npx prisma migrate deploy
```

Do not run `prisma migrate dev` in production.

For a first deployment, create the administrator after migrations with `npm run admin:create`. Supply `ADMIN_EMAIL` and `ADMIN_PASSWORD` through an approved temporary secret mechanism, and remove the plaintext password from the environment immediately afterward. Re-running the command rotates the password for the same administrator; it refuses to create a second administrator.

Start/update services:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=200 app
```

Validate Nginx and reload only when configuration changed:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Post-deployment checks

```bash
curl -I http://eastherphil.cn
curl -I https://eastherphil.cn
curl -fsS https://eastherphil.cn/api/healthz

docker compose ps
docker compose logs --tail=200 app
sudo tail -n 100 /var/log/nginx/error.log
```

Functional checks:

- home and post pages load;
- HTTP redirects to HTTPS;
- admin login works;
- create/edit/preview/publish flow works;
- keyword/category/tag filters return only published, non-deleted posts;
- moving a test draft to the recycle bin and restoring it leaves it as a draft;
- a valid JPEG/PNG/WebP upload is stored and served from a stable `/uploads/...` URL;
- an invalid or oversized upload is rejected, a referenced image cannot be deleted, and an unreferenced image can complete the recycle-bin restore/purge lifecycle;
- database and cache operations succeed;
- AI feature flag is disabled if provider connectivity is not healthy;
- no repeated errors appear in application or Nginx logs.

## Application rollback

Before each release, record:

- previous Git commit;
- previous image tag/digest;
- migration status;
- backup filename.

If rollback does not require reversing a destructive migration:

```bash
cd /root/personal-blog-web
git checkout <previous-known-good-commit>
docker compose build app
docker compose up -d
```

Prefer immutable image tags when the Compose workflow supports them. Verify all health and functional checks after rollback.

Do not automatically reverse database migrations. Restore or write a forward-fix only after understanding data impact.

## Database restore drill

Always restore to a temporary database first.

High-level sequence:

1. Select and verify a `.sql.gz` backup.
2. Create an isolated temporary database/container.
3. Decompress and restore the dump.
4. Run table-count and application-level validation.
5. Record duration, errors, and backup filename.
6. Remove the temporary environment after evidence is saved.

A production restore requires:

- current database snapshot first;
- approved downtime/maintenance plan;
- verified target backup;
- explicit rollback/abort criteria.

## Upload preservation

Before changing volumes or paths:

```bash
sudo ls -la /var/www/personal-blog/uploads
sudo du -sh /var/www/personal-blog/uploads
```

Verify ownership and that the application can write only to the intended directory. Never mount the entire `/root` directory into Nginx or the application for uploads.

The HTTPS Nginx server should cap request bodies slightly above `MAX_UPLOAD_BYTES` (the checked-in configuration uses `10m` for the default 8 MiB application limit) and serve `/uploads/` from `/var/www/personal-blog/uploads/` with directory listing disabled.

## Routine operations

Documented cron:

```cron
59 19 * * * "/root/.acme.sh"/acme.sh --cron --home "/root/.acme.sh" > /dev/null
30 3 * * * /root/personal-blog-web/scripts/backup-db.sh
0 6 * * * /root/server-ops/scripts/daily-check.sh
```

Weekly checks:

- container state and restart count;
- disk and inode use;
- backup continuity and gzip integrity;
- certificate expiry and renewal logs;
- Nginx/app error trends;
- unexpected listeners and processes;
- upload growth.

Monthly checks:

- database restore drill;
- application rollback drill;
- security group/UFW review;
- dependency and base-image updates;
- off-site backup verification after implemented.

## Incident triage

Collect evidence before restarting repeatedly:

```bash
date
df -h
free -h
uptime
sudo ss -lntp
docker compose ps
docker compose logs --tail=500 app
sudo tail -n 300 /var/log/nginx/error.log
sudo journalctl -u docker --since "30 minutes ago"
```

For AI-only failures, disable the AI feature flag or provider adapter and preserve core blog availability.

## Security cautions

- Do not expose 3000, 5432, or 6379 publicly.
- Do not commit `.env`, certificates, private keys, dumps, or upload content.
- Do not disable TLS verification.
- Do not change SSH/root access until a tested alternative administrator session is open.
- Treat external requests and indexed content as untrusted.
- Review suspicious methods and payloads; public scan traffic is already present.
