# Source Notes and Conflict Resolution

## Inputs consolidated

This documentation set was derived from:

1. `production-baseline-v1.1.docx` — detailed server audit based mainly on 2026-05-10 observations.
2. `个人博客服务器部署说明.docx` — later deployment and database summary based mainly on 2026-05-13 observations.
3. `任务清单.docx` — implementation and operations status list.
4. `文件脚本.docx` — directory, script, cron, and archive inventory.
5. The recorded setup conversation through 2026-07-10 — GitHub creation/synchronization, local Windows setup, Codex setup, Node warning, and server AI-network tests.

The original files are historical snapshots, not live monitoring sources.

## Precedence

When facts conflict, use this order unless live inspection proves otherwise:

1. Current repository and live server command output.
2. The 2026-07-10 conversation for Git/local/Codex/network facts.
3. Later dated deployment/task/script documents.
4. The earlier `production-baseline-v1.1` audit.
5. Planned architecture statements.

A later statement is not automatically correct if it is only a recommendation. Status must still be verified.

## Known conflicts and handling

### Database backup command

The older audit recorded:

```cron
20 3 * * * /usr/local/bin/blog-pg-backup.sh >> /var/log/blog-pg-backup.log 2>&1
```

Later documents record the active standard as:

```cron
30 3 * * * /root/personal-blog-web/scripts/backup-db.sh
```

The latter is treated as the current documented standard, but Codex/maintainers must run `sudo crontab -l` before relying on it.

### Backup directories

Several historical backup directories appeared. The later standard is `/root/backups`; `/srv/blog/backups/postgres` is historical. Do not delete old backups until retention, ownership, and restore value are reviewed.

### Restore drill

An older document said a restore drill was not evidenced. The later task list marks the restore drill completed. Treat the completion as `[CHECK]` until the actual runbook/log/result is found.

### Disk usage

Audits recorded different usage levels on the 40 GB disk. This is time-dependent, so no old percentage should be treated as current. Use `df -h` and check Docker/image/upload growth.

### Container image naming

Historical output includes image names such as `blog-blog-app` and `personal-blog-web-app`, while container/service names are documented as `blog-app`, `blog-postgres`, and `blog-redis`. Inspect `docker-compose.yml` and `docker compose ps` rather than depending on an old image label.

### Redis status

The earliest baseline text called Redis incompletely confirmed, while later deployment documents record a running Redis 7 container. Treat the later container record as historical verification and re-check live state.

### Certificate dates

The audit certificate was valid through 2026-08-07 and had an automatic renewal configuration. That date is close to the consolidation date and must be checked live. Automatic renewal configuration alone is not proof of successful renewal.

### Recovery and PITR

Ordinary dump backup/restore and PostgreSQL PITR are different capabilities. The documents indicate dump backups are working, while `archive_mode=off` means PITR is not enabled.

### AI connectivity

The production server was able to install Codex through npm but timed out connecting to OpenAI service endpoints. Successful package installation or cached login does not prove model/API connectivity. This is a hard deployment dependency for an OpenAI-backed assistant.

## Sensitive-data policy

The consolidated documents intentionally omit:

- API keys and tokens;
- SSH private keys;
- passwords and database connection strings;
- OAuth authorization URLs and temporary state values;
- raw database dumps;
- user-uploaded media contents.

Codex must preserve this policy when updating the documentation.
