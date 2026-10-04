"""Isolated real-Nginx regression: synthetic credentials, loopback only, no AMap.

Requires nginx on PATH. Starts its own unprivileged instance with a temporary
prefix; never reads or reloads /etc/nginx or production logs/credentials.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, build_opener, ProxyHandler


ROOT = Path(__file__).resolve().parents[1]
SERVER_SECRET = "synthetic_server_secret_never_log"
CLIENT_SECRET = "synthetic_client_data_never_log"
FIELDS = {"time", "proxy", "route", "status", "upstream_status", "request_seconds", "upstream_seconds", "bytes"}


class Upstream(BaseHTTPRequestHandler):
    received = []

    def log_message(self, *_):
        pass

    def do_GET(self):
        query = parse_qs(urlsplit(self.path).query)
        self.received.append(query)
        if query.get("simulate") == ["reset"]:
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        self.send_response(403 if query.get("simulate") == ["denied"] else 200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"1"}')


def main():
    nginx = shutil.which("nginx")
    if not nginx:
        raise SystemExit("nginx is required for this integration test")
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    worker = threading.Thread(target=upstream.serve_forever, daemon=True)
    worker.start()
    process = None
    try:
        with tempfile.TemporaryDirectory(prefix="blog-amap-logs-") as directory:
            prefix = Path(directory)
            (prefix / "logs").mkdir()
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            upstream_url = f"http://127.0.0.1:{upstream.server_port}"
            proxy = (ROOT / "deploy/nginx/amap-service.conf.example").read_text()
            assert proxy.count("include /etc/nginx/snippets/personal-blog-amap-logging.conf;") == 2
            proxy = proxy.replace("/etc/nginx/snippets/personal-blog-amap-secret.conf", str(prefix / "secret.conf"))
            proxy = proxy.replace("/etc/nginx/snippets/personal-blog-amap-logging.conf", str(prefix / "policy.conf"))
            proxy = proxy.replace("https://webapi.amap.com", upstream_url).replace("https://restapi.amap.com", upstream_url)
            assert "proxy_pass https:" not in proxy
            policy = (ROOT / "deploy/nginx/amap-log-policy.conf.example").read_text()
            policy = policy.replace("/var/log/nginx/personal-blog-amap-access.log", str(prefix / "amap.log"))
            (prefix / "policy.conf").write_text(policy)
            (prefix / "secret.conf").write_text(f'set $amap_security_jscode "{SERVER_SECRET}";\n')
            log_format = (ROOT / "deploy/nginx/amap-log-format.conf.example").read_text()
            (prefix / "nginx.conf").write_text(f"""
daemon off;
master_process off;
pid {prefix}/nginx.pid;
error_log {prefix}/error.log info;
events {{ worker_connections 64; }}
http {{
    access_log {prefix}/general.log combined;
    client_body_temp_path {prefix}/client-temp;
    proxy_temp_path {prefix}/proxy-temp;
    {log_format}
    server {{
        listen 127.0.0.1:{port};
        {proxy}
        location = /ready {{ return 204; }}
        location = /ordinary-error {{ proxy_pass {upstream_url}; }}
    }}
}}
""")
            # Captured output contains only fake test credentials if a failure occurs.
            with (prefix / "process.log").open("w") as output:
                process = subprocess.Popen([nginx, "-p", str(prefix) + "/", "-c", "nginx.conf"], stdout=output, stderr=output)
                opener = build_opener(ProxyHandler({}))

                def request(path, headers=None):
                    try:
                        with opener.open(Request(f"http://127.0.0.1:{port}{path}", headers=headers or {}), timeout=5) as response:
                            response.read()
                            return response.status
                    except HTTPError as error:
                        error.read()
                        return error.code

                for _ in range(50):
                    if process.poll() is not None:
                        raise AssertionError("isolated Nginx did not start")
                    try:
                        if request("/ready") == 204:
                            break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise AssertionError("isolated Nginx readiness timed out")

                headers = {name: CLIENT_SECRET for name in ("Authorization", "Cookie", "Referer", "User-Agent")}
                for route in ("/_AMapService/v4/map/styles", "/_AMapService/v3/test"):
                    for mode, status in (("ok", 200), ("denied", 403), ("reset", 502)):
                        assert request(f"{route}?key={CLIENT_SECRET}&keyword={CLIENT_SECRET}&simulate={mode}", headers) == status
                assert len(Upstream.received) == 6
                assert all(query.get("jscode") == [SERVER_SECRET] for query in Upstream.received)
                assert request("/ordinary-error?simulate=reset") == 502
                process.terminate()
                process.wait(timeout=10)
                process = None

            records = [json.loads(line) for line in (prefix / "amap.log").read_text().splitlines()]
            assert len(records) == 6
            assert all(set(record) == FIELDS for record in records)
            assert {record["route"] for record in records} == {"styles", "service"}
            assert {record["status"] for record in records} == {200, 403, 502}
            assert all(record["upstream_status"] == str(record["status"]) for record in records)
            for log in [*prefix.glob("*.log"), *prefix.glob("logs/*")]:
                text = log.read_text(errors="replace")
                assert SERVER_SECRET not in text and CLIENT_SECRET not in text, "credential canary leaked"
            assert "upstream prematurely closed connection" in (prefix / "error.log").read_text()
            assert "/ordinary-error" in (prefix / "general.log").read_text()
            assert "/_AMapService" not in (prefix / "general.log").read_text()
            print("AMap logging passed: 2 routes, 200/403/502, secret injection preserved, no credential/header leakage; ordinary logs retained")
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        upstream.shutdown()
        upstream.server_close()


if __name__ == "__main__":
    main()
