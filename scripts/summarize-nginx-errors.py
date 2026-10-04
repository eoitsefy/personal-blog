"""Summarize legacy Nginx errors without ever returning raw log text.

Run on the server, before output crosses SSH. Intentionally lossy: no URLs,
query values, paths, headers, IPs, or arbitrary error messages are returned.
This does not alter logs or replace credential rotation / safe logging.
"""
import argparse
from collections import Counter, deque
import gzip
import json
from pathlib import Path
import re


HEADER = re.compile(
    r"^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}) "
    r"\[(emerg|alert|crit|error|warn|notice|info|debug)\]"
)
CATEGORIES = (
    ("permission_denied", "permission denied"),
    ("upstream_timeout", "upstream timed out"),
    ("upstream_refused", "connection refused"),
    ("upstream_closed", "upstream prematurely closed connection"),
    ("upstream_tls", "ssl_do_handshake() failed"),
    ("upstream_dns", "could not be resolved"),
    ("rate_limited", "limiting requests"),
)


def summarize(lines):
    counts = Counter()
    first = last = None
    for line in lines:
        match = HEADER.match(line)
        level = match.group(2) if match else "unparsed"
        if match:
            first = first or match.group(1)
            last = match.group(1)
        lower = line.lower()
        category = next((name for name, marker in CATEGORIES if marker in lower), "other")
        counts[(level, category)] += 1
    return {
        "first_time": first,
        "last_time": last,
        "records": sum(counts.values()),
        "counts": [
            {"level": level, "category": category, "count": count}
            for (level, category), count in sorted(counts.items())
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", default="/var/log/nginx/error.log")
    parser.add_argument("--lines", type=int, default=200)
    args = parser.parse_args()
    if not 1 <= args.lines <= 10000:
        parser.error("--lines must be between 1 and 10000")
    path = Path(args.file)
    opener = gzip.open if path.suffix == ".gz" else open
    try:
        with opener(path, "rt", encoding="utf-8", errors="replace") as stream:
            # Keep memory bounded even for unusually large or malformed records.
            lines = deque(iter(lambda: stream.readline(65536), ""), maxlen=args.lines)
        print(json.dumps(summarize(lines)))
    except (OSError, EOFError):
        # Exception text may contain user-controlled paths; never print it.
        raise SystemExit("Unable to read log; check path and permissions on the server.")


if __name__ == "__main__":
    main()
