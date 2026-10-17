#!/usr/bin/env python3
"""Submit the public sitemap (or homepage fallback) to IndexNow after deployment."""
import json
import os
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

host = os.environ["INDEXNOW_HOST"].strip().lower()
base_url = os.environ["INDEXNOW_BASE_URL"].rstrip("/")
key_file = Path(os.environ["INDEXNOW_KEY_FILE"])
key = key_file.read_text(encoding="utf-8").strip()

if not re.fullmatch(r"[a-f0-9]{32}", key):
    raise SystemExit("IndexNow key must be a 32-character lowercase hexadecimal value.")
if key_file.name != key + ".txt":
    raise SystemExit("IndexNow key filename must match the key value.")
if urlparse(base_url).scheme != "https" or urlparse(base_url).hostname != host:
    raise SystemExit("INDEXNOW_BASE_URL must be HTTPS and match INDEXNOW_HOST.")

key_url = f"{base_url}/{key}.txt"
sitemap_url = f"{base_url}/sitemap.xml"
user_agent = "Chalamandra-DecoX-IndexNow/1.0"


def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.status, response.read()


def sitemap_urls(xml_body):
    root = ET.fromstring(xml_body)
    urls = [
        element.text.strip()
        for element in root.iter()
        if element.tag.rsplit("}", 1)[-1] == "loc" and element.text
    ]
    if not urls:
        raise ValueError("Sitemap contains no <loc> URLs.")
    for url in urls:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != host:
            raise ValueError(f"Sitemap contains a URL outside the canonical host: {url}")
    return urls


last_error = None
urls = None
for attempt in range(1, 31):
    try:
        key_status, remote_key = get_bytes(key_url)
        if key_status != 200 or remote_key.decode("utf-8").strip() != key:
            raise ValueError("The public IndexNow key file does not match the repository key.")

        try:
            sitemap_status, sitemap_body = get_bytes(sitemap_url)
            if sitemap_status != 200:
                raise ValueError(f"Sitemap returned HTTP {sitemap_status}.")
            urls = sitemap_urls(sitemap_body)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            print(f"Sitemap returned HTTP 404; submitting homepage only: {exc}")
            urls = [base_url + "/"]
        break
    except Exception as exc:
        last_error = str(exc)
        if attempt < 30:
            print(f"Waiting for public deployment ({attempt}/30): {last_error}")
            time.sleep(10)
else:
    raise SystemExit(f"Public IndexNow key is not ready: {last_error}")

payload = {
    "host": host,
    "key": key,
    "keyLocation": key_url,
    "urlList": urls,
}
request = urllib.request.Request(
    "https://api.indexnow.org/indexnow",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json; charset=utf-8"},
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        status = response.status
        body = response.read().decode("utf-8", errors="replace")
except urllib.error.HTTPError as exc:
    status = exc.code
    body = exc.read().decode("utf-8", errors="replace")

print(f"IndexNow HTTP {status}; host={host}; URLs submitted={len(urls)}")
if status not in (200, 202):
    raise SystemExit(f"IndexNow rejected the request: HTTP {status} {body}")
