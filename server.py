# -*- coding: utf-8 -*-
"""
Obsidian Local Web

A tiny local web server that reads and writes an Obsidian vault directly,
so any device on the same network (phone, old laptop) can view and edit
notes with just a browser. Notes are saved as plain .md files, and the
Obsidian desktop app picks up the changes instantly.

Usage:
    python server.py                start and open the browser
    python server.py --no-browser   start without opening the browser
    python server.py --vault PATH   use a specific vault folder
    python server.py --port 8124    use a specific port

On first run the vault folder is detected automatically (from Obsidian's
own registry and common folders); otherwise you are asked for the path.
No third-party packages required - Python 3.7+ standard library only.
"""

import hashlib
import json
import os
import re
import shutil
import socket
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")

NOTE_EXTS = {".md"}
ATTACHMENT_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif",
    ".pdf", ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".mp4", ".webm",
}
SKIP_DIRS = {".obsidian", ".trash", ".git", ".smart-env", "node_modules"}
FORBIDDEN_NAME_CHARS = set('<>:"|?*')

VAULT_PATH = ""
PORT = 8124
LANG = "auto"

_last_paths = None            # note paths from the previous scan (delete detection)
_paths_lock = threading.Lock()

# Error codes sent to the client; the web UI translates them.
# (no_path, bad_path, hidden_path, outside_vault, not_md, not_found,
#  empty_name, bad_chars, name_exists, no_content, no_task, bad_type,
#  bad_json, bad_endpoint, server_error)


# ---------------------------------------------------------------- config

def default_config():
    return {"vault": "", "port": 8124, "lang": "auto"}


def load_raw_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if isinstance(cfg, dict):
                return cfg
        except (OSError, ValueError):
            print("Warning: config.json could not be read; it will be recreated.")
    return default_config()


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except OSError as e:
        print("Warning: could not save config.json (%s)" % e)


# ---------------------------------------------------------------- vault detection

def detect_vaults():
    """Look for Obsidian vaults in Obsidian's own registry and common folders."""
    found = []  # (path, is_open, ts)

    def add(path, is_open=False, ts=0):
        try:
            p = os.path.abspath(os.path.expanduser(os.path.expandvars(str(path))))
        except (TypeError, ValueError):
            return
        if not os.path.isdir(p):
            return
        if any(os.path.normcase(p) == os.path.normcase(q[0]) for q in found):
            return
        found.append((p, is_open, ts or 0))

    # 1) Obsidian's own registry file (most reliable source)
    home = os.path.expanduser("~")
    registry_candidates = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        registry_candidates.append(os.path.join(appdata, "obsidian", "obsidian.json"))
    registry_candidates.append(os.path.join(home, ".config", "obsidian", "obsidian.json"))
    registry_candidates.append(
        os.path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"))
    for reg in registry_candidates:
        if not os.path.isfile(reg):
            continue
        try:
            with open(reg, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        vaults = data.get("vaults") if isinstance(data, dict) else None
        if isinstance(vaults, dict):
            for v in vaults.values():
                if isinstance(v, dict) and v.get("path"):
                    add(v["path"], bool(v.get("open")), v.get("ts"))

    # 2) Scan common folders for directories containing a .obsidian folder
    if not found:
        bases = [
            home,
            os.path.join(home, "Documents"),
            os.path.join(home, "Desktop"),
            os.path.join(home, "Belgeler"),
            os.path.join(home, "OneDrive"),
            os.path.join(home, "OneDrive", "Documents"),
            os.path.join(home, "OneDrive", "Belgeler"),
        ]
        for base in bases:
            if not os.path.isdir(base):
                continue
            try:
                names = os.listdir(base)
            except OSError:
                continue
            for name in names:
                p = os.path.join(base, name)
                if os.path.isdir(os.path.join(p, ".obsidian")):
                    add(p)

    # Prefer the currently open vault, then the most recently used one
    found.sort(key=lambda x: (not x[1], -(x[2] or 0), x[0].casefold()))
    return [f[0] for f in found]


def choose_vault_interactive(candidates):
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    try:
        interactive = sys.stdin is not None and sys.stdin.isatty()
    except (ValueError, OSError):
        interactive = False
    if not interactive:
        return candidates[0]
    print("Found more than one Obsidian vault:")
    for i, p in enumerate(candidates, 1):
        print("  %d) %s" % (i, p))
    try:
        answer = input("Which one should be used? [1]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("")
        return candidates[0]
    if answer.isdigit() and 1 <= int(answer) <= len(candidates):
        return candidates[int(answer) - 1]
    return candidates[0]


def ask_vault_path():
    print("No Obsidian vault was found automatically.")
    print("Enter the full path of your vault folder")
    print(r"(example: C:\Users\you\Documents\My Vault) or press Enter to exit.")
    while True:
        try:
            raw = input("Vault path: ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            print("")
            return None
        if not raw:
            return None
        p = os.path.abspath(os.path.expanduser(os.path.expandvars(raw)))
        if os.path.isdir(p):
            return p
        print("Not a folder: %s" % p)


def resolve_vault(cfg):
    vault = str(cfg.get("vault") or "").strip()
    if vault:
        p = os.path.abspath(os.path.expanduser(os.path.expandvars(vault)))
        if os.path.isdir(p):
            return p
        print("Configured vault folder was not found: %s" % p)
    choice = choose_vault_interactive(detect_vaults())
    if choice is None:
        choice = ask_vault_path()
    if choice is None:
        print("No vault selected. Set 'vault' in config.json or run again.")
        sys.exit(1)
    print("Using vault: %s" % choice)
    cfg["vault"] = choice
    save_config(cfg)
    return choice


def load_config():
    global VAULT_PATH, PORT, LANG
    cfg = load_raw_config()
    for flag, key in (("--vault", "vault"), ("--port", "port")):
        if flag in sys.argv:
            i = sys.argv.index(flag)
            if i + 1 < len(sys.argv):
                cfg[key] = sys.argv[i + 1]
    VAULT_PATH = resolve_vault(cfg)
    try:
        PORT = int(cfg.get("port") or 8124)
    except (TypeError, ValueError):
        PORT = 8124
    LANG = str(cfg.get("lang") or "auto")


# ---------------------------------------------------------------- path safety

def split_rel(raw):
    """Split a relative path into safe components; blocks escaping the vault."""
    if raw is None:
        raise ValueError("no_path")
    rel = str(raw).replace("\\", "/").strip().strip("/")
    parts = []
    for part in rel.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError("bad_path")
        if part.startswith("."):
            raise ValueError("hidden_path")
        parts.append(part)
    if not parts:
        raise ValueError("no_path")
    return parts


def abs_from_rel(parts):
    root = os.path.abspath(VAULT_PATH)
    target = os.path.abspath(os.path.join(root, *parts))
    if os.path.commonpath([target, root]) != root:
        raise ValueError("outside_vault")
    return target


def is_note(parts):
    return bool(parts) and os.path.splitext(parts[-1])[1].lower() in NOTE_EXTS


def get_query(qs, key):
    vals = urllib.parse.parse_qs(qs).get(key)
    return vals[0] if vals else None


def read_text(abs_path):
    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def atomic_write(abs_path, text):
    """Write to a temp file first, then rename over the target (no partial files)."""
    data = text.encode("utf-8")
    d = os.path.dirname(abs_path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, abs_path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def sanitize_note_path(raw):
    parts = split_rel(raw)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts:
        raise ValueError("empty_name")
    for p in parts:
        bad = FORBIDDEN_NAME_CHARS.intersection(p)
        if bad:
            raise ValueError("bad_chars")
    if not parts[-1].lower().endswith(".md"):
        parts[-1] += ".md"
    return parts


# ---------------------------------------------------------------- vault operations

def build_tree():
    def walk(abs_dir, rel_prefix):
        entries = []
        try:
            names = os.listdir(abs_dir)
        except OSError:
            return entries
        dirs, files = [], []
        for name in names:
            if name.startswith(".") or name in SKIP_DIRS:
                continue
            if os.path.isdir(os.path.join(abs_dir, name)):
                dirs.append(name)
            elif os.path.splitext(name)[1].lower() in NOTE_EXTS:
                files.append(name)
        for name in sorted(dirs, key=str.casefold):
            sub = rel_prefix + [name]
            entries.append({
                "type": "folder",
                "name": name,
                "path": "/".join(sub),
                "children": walk(os.path.join(abs_dir, name), sub),
            })
        for name in sorted(files, key=str.casefold):
            entries.append({
                "type": "note",
                "name": name,
                "path": "/".join(rel_prefix + [name]),
            })
        return entries

    return walk(VAULT_PATH, [])


def iter_notes():
    for abs_dir, dirnames, filenames in os.walk(VAULT_PATH):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() in NOTE_EXTS:
                abs_p = os.path.join(abs_dir, name)
                rel = os.path.relpath(abs_p, VAULT_PATH).replace("\\", "/")
                yield abs_p, rel


def build_file_index():
    """Filename (case-insensitive) -> relative path inside the vault."""
    files = {}
    for abs_dir, dirnames, filenames in os.walk(VAULT_PATH):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in NOTE_EXTS or ext in ATTACHMENT_EXTS:
                rel = os.path.relpath(os.path.join(abs_dir, name), VAULT_PATH).replace("\\", "/")
                files.setdefault(name.casefold(), rel)
    return files


def search_notes(q, limit=100, per_note=5):
    qf = q.casefold()
    results = []
    for abs_p, rel in iter_notes():
        try:
            text = read_text(abs_p)
        except OSError:
            continue
        hits = []
        for i, line in enumerate(text.splitlines(), 1):
            if qf in line.casefold():
                hits.append({"n": i, "text": line.strip()[:160]})
                if len(hits) >= per_note:
                    break
        name_match = qf in os.path.basename(rel).casefold()
        if name_match or hits:
            results.append({
                "path": rel,
                "name": os.path.basename(rel),
                "nameMatch": name_match,
                "lines": hits,
            })
            if len(results) >= limit:
                break
    return results


def changed_notes(since):
    """Return notes changed since `since` plus notes removed since the last scan."""
    global _last_paths
    changed = []
    current = set()
    for abs_p, rel in iter_notes():
        current.add(rel)
        try:
            if os.path.getmtime(abs_p) > since:
                changed.append(rel)
        except OSError:
            continue
    with _paths_lock:
        removed = sorted(_last_paths - current) if _last_paths is not None else []
        _last_paths = current
    return changed, removed


TASK_RE = re.compile(r"^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s*)(.*)$")


def toggle_task(abs_path, text):
    """Flip the checkbox of the first task line matching the given text."""
    content = read_text(abs_path)
    lines = content.splitlines(keepends=True)
    needle = re.sub(r"[*_`~\[\]!]", "", text).strip().casefold()
    if not needle:
        return None
    for idx, line in enumerate(lines):
        stripped = line.rstrip("\r\n")
        eol = line[len(stripped):]
        m = TASK_RE.match(stripped)
        if not m:
            continue
        body = re.sub(r"[*_`~\[\]!]", "", m.group(4)).strip().casefold()
        if needle in body or body in needle:
            new_mark = " " if m.group(2) != " " else "x"
            lines[idx] = m.group(1) + new_mark + m.group(3) + m.group(4) + eol
            new_content = "".join(lines)
            atomic_write(abs_path, new_content)
            return new_content
    return None


# ---------------------------------------------------------------- HTTP handler

MIME_BY_EXT = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".bmp": "image/bmp", ".avif": "image/avif", ".pdf": "application/pdf",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".m4a": "audio/mp4", ".flac": "audio/flac", ".mp4": "video/mp4",
    ".webm": "video/webm",
}


class VaultRequestHandler(SimpleHTTPRequestHandler):
    server_version = "ObsidianLocalWeb/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "GET /api/changes" in msg:
            return
        sys.stdout.write("%s\n" % msg)
        sys.stdout.flush()

    # ---- response helpers ----

    def send_json(self, payload, code=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_attachment(self, abs_path, ext):
        try:
            with open(abs_path, "rb") as f:
                data = f.read()
        except OSError:
            self.send_json({"error": "not_found"}, 404)
            return
        self.send_response(200)
        self.send_header("Content-Type", MIME_BY_EXT.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ValueError("bad_json")

    # ---- GET ----

    def do_GET(self):
        try:
            parsed = urllib.parse.urlsplit(self.path)
            route, qs = parsed.path, parsed.query

            if route == "/api/tree":
                self.send_json({"vault": os.path.basename(VAULT_PATH), "tree": build_tree()})

            elif route == "/api/note":
                parts = split_rel(get_query(qs, "path"))
                if not is_note(parts):
                    raise ValueError("not_md")
                abs_p = abs_from_rel(parts)
                if not os.path.isfile(abs_p):
                    raise FileNotFoundError(abs_p)
                self.send_json({
                    "path": "/".join(parts),
                    "name": parts[-1],
                    "content": read_text(abs_p),
                    "mtime": os.path.getmtime(abs_p),
                })

            elif route == "/api/index":
                files = build_file_index()
                self.send_json({
                    "vault": os.path.basename(VAULT_PATH),
                    "files": files,
                    "paths": sorted(set(files.values())),
                    "lang": LANG,
                })

            elif route == "/api/search":
                q = (get_query(qs, "q") or "").strip()
                self.send_json({"results": search_notes(q) if len(q) >= 2 else []})

            elif route == "/api/changes":
                try:
                    since = float(get_query(qs, "since") or 0)
                except ValueError:
                    since = 0
                changed, removed = changed_notes(since)
                self.send_json({"changed": changed, "removed": removed, "now": time.time()})

            elif route == "/file":
                parts = split_rel(get_query(qs, "path"))
                ext = os.path.splitext(parts[-1])[1].lower() if parts else ""
                if ext not in ATTACHMENT_EXTS:
                    raise ValueError("bad_type")
                abs_p = abs_from_rel(parts)
                if not os.path.isfile(abs_p):
                    raise FileNotFoundError(abs_p)
                self.send_attachment(abs_p, ext)

            else:
                super().do_GET()

        except FileNotFoundError:
            self.send_json({"error": "not_found"}, 404)
        except ValueError as e:
            self.send_json({"error": str(e)}, 400)
        except BrokenPipeError:
            pass
        except Exception as e:
            self.send_json({"error": "server_error", "detail": str(e)}, 500)

    # ---- POST ----

    def do_POST(self):
        try:
            route = urllib.parse.urlsplit(self.path).path
            body = self.read_body()

            if route == "/api/save":
                parts = split_rel(body.get("path"))
                if not is_note(parts):
                    raise ValueError("not_md")
                content = body.get("content")
                if not isinstance(content, str):
                    raise ValueError("no_content")
                abs_p = abs_from_rel(parts)
                atomic_write(abs_p, content)
                self.send_json({"ok": True, "mtime": os.path.getmtime(abs_p)})

            elif route == "/api/create":
                parts = sanitize_note_path(body.get("path"))
                abs_p = abs_from_rel(parts)
                if os.path.exists(abs_p):
                    self.send_json({"error": "name_exists"}, 409)
                    return
                title = os.path.splitext(parts[-1])[0]
                atomic_write(abs_p, "# %s\n\n" % title)
                self.send_json({"ok": True, "path": "/".join(parts)})

            elif route == "/api/delete":
                parts = split_rel(body.get("path"))
                if not is_note(parts):
                    raise ValueError("not_md")
                abs_p = abs_from_rel(parts)
                if not os.path.isfile(abs_p):
                    raise FileNotFoundError(abs_p)
                trash = os.path.join(VAULT_PATH, ".trash")
                os.makedirs(trash, exist_ok=True)
                trash_name = "%s_%s" % (time.strftime("%Y%m%d-%H%M%S"), parts[-1])
                shutil.move(abs_p, os.path.join(trash, trash_name))
                self.send_json({"ok": True, "trash": ".trash/" + trash_name})

            elif route == "/api/toggle":
                parts = split_rel(body.get("path"))
                if not is_note(parts):
                    raise ValueError("not_md")
                abs_p = abs_from_rel(parts)
                new_content = toggle_task(abs_p, str(body.get("text") or ""))
                if new_content is None:
                    self.send_json({"error": "no_task"}, 404)
                    return
                self.send_json({
                    "ok": True,
                    "content": new_content,
                    "mtime": os.path.getmtime(abs_p),
                })

            else:
                self.send_json({"error": "bad_endpoint"}, 404)

        except FileNotFoundError:
            self.send_json({"error": "not_found"}, 404)
        except ValueError as e:
            self.send_json({"error": str(e)}, 400)
        except Exception as e:
            self.send_json({"error": "server_error", "detail": str(e)}, 500)


# ---------------------------------------------------------------- startup

MARKED_URL = "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"
MARKED_SHA256 = "15fabce5b65898b32b03f5ed25e9f891a729ad4c0d6d877110a7744aa847a894"


def ensure_static_assets():
    """The repo ships static/marked.min.js; if it is missing, fetch it once."""
    target = os.path.join(STATIC_DIR, "marked.min.js")
    if os.path.isfile(target) and os.path.getsize(target) > 1024:
        return
    print("Downloading marked.min.js ...")
    try:
        with urllib.request.urlopen(MARKED_URL, timeout=20) as r:
            data = r.read()
        if hashlib.sha256(data).hexdigest() != MARKED_SHA256:
            print("Warning: marked.min.js checksum mismatch - skipping.")
            print("Markdown will be shown as plain text.")
            return
        with open(target, "wb") as f:
            f.write(data)
        print("OK: static/marked.min.js")
    except Exception as e:
        print("Warning: could not download marked.min.js (%s)." % e)
        print("Markdown will be shown as plain text until the file is present.")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    load_config()
    ensure_static_assets()
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

    server = None
    actual_port = PORT
    for candidate in range(PORT, PORT + 10):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", candidate), VaultRequestHandler)
            actual_port = candidate
            break
        except OSError:
            continue
    if server is None:
        print("Could not bind to any port between %d and %d." % (PORT, PORT + 9))
        sys.exit(1)
    server.daemon_threads = True
    if actual_port != PORT:
        print("Port %d was busy, using %d instead." % (PORT, actual_port))

    url = "http://localhost:%d/" % actual_port
    print("=" * 60)
    print("Obsidian Local Web is running")
    print("Vault          : %s" % VAULT_PATH)
    print("This computer  : %s" % url)
    print("On your network: http://%s:%d/" % (lan_ip(), actual_port))
    print("Close this window to stop the server.")
    print("=" * 60)

    if "--no-browser" not in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
