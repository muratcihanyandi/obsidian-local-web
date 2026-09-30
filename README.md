# Obsidian Local Web

Read and edit your Obsidian vault from any browser on your local network —
your phone, that old 32-bit laptop, a tablet. One tiny Python file, zero
dependencies, no cloud, no account.

The server runs on the computer that holds the vault (or any machine with
access to it), reads and writes the `.md` files in place, and the Obsidian
desktop app picks up the changes instantly.

## Features

- **Obsidian-style UI** — dark theme, file explorer, tab bar and callout
  colors modeled after the Obsidian app.
- **Zero dependencies** — Python 3.7+ standard library only. No pip install.
- **Automatic vault detection** — finds your vault via Obsidian's own
  registry (or common folders) on first run; asks only if it cannot.
- **Full editing** — create, edit, save and delete notes (deleted notes go
  to the vault's `.trash` folder, nothing is hard-deleted).
- **Obsidian-flavored markdown** — `[[wikilinks]]`, `![[embeds]]`, `#tags`
  (clickable), callouts (`> [!warning]`), task lists with **clickable
  checkboxes**, tables, frontmatter properties, image embeds.
- **Search** across all notes with matched-line previews.
- **Live sync** — changes made in Obsidian on the desktop show up in the
  browser automatically, and vice versa.
- **Bilingual UI** — Turkish / English, chosen from your browser language.
- **Light on old hardware** — plain ES5-ish JavaScript, no frameworks.

## Quick start

1. Install [Python 3](https://www.python.org/downloads/) (Windows: check
   *"Add python.exe to PATH"* during setup).
2. Download or clone this repository.
3. Start the server:
   - **Windows:** double-click `baslat.bat`
   - **macOS / Linux:** `./start.sh`
   - **Or directly:** `python server.py`
4. First run only: the vault folder is detected and saved to `config.json`.
   If detection fails you will be asked for the path.
5. Your browser opens at `http://localhost:8124/`.

### Using it from another device (LAN)

The server prints a network address at startup, e.g.
`http://192.168.1.20:8124/`. Open that address on your phone or laptop
(same Wi-Fi network).

On **Windows**, allow the app through the firewall the first time, or run
`firewall-izni.bat` once (right-click → *Run as administrator*) to add the
rule automatically. On macOS/Linux you usually don't need to do anything.

## Command line

```
python server.py                 start, open the browser
python server.py --no-browser    start without opening the browser
python server.py --vault PATH    use a specific vault folder
python server.py --port 8124     use a specific port (falls back to the next free one)
```

## Configuration

`config.json` is created next to `server.py` on first run:

```json
{
  "vault": "C:\\Users\\you\\Documents\\My Vault",
  "port": 8124,
  "lang": "auto"
}
```

| Key    | Meaning                                                        |
|--------|----------------------------------------------------------------|
| `vault`| Absolute path to your Obsidian vault folder                    |
| `port` | Port to listen on (tries the next free port if busy)           |
| `lang` | `auto` (browser language), `tr` or `en`                        |

Run the server once with a wrong vault path and it will offer to detect the
vault again.

## How it works

- The server binds to `0.0.0.0` on your LAN and serves a small web UI.
- Notes are read from and written to the vault as plain UTF-8 `.md` files
  (atomic writes: a temp file is renamed over the target, so you never get
  half-written notes).
- Deleted notes are moved to `.trash/` inside the vault instead of being
  erased.
- The browser polls for file changes every 8 seconds; if a note you are
  reading changed on the desktop, it reloads, and if you are editing, it
  shows a "changed on desktop" banner instead of overwriting your work.

## Safety notes

- **This tool has no authentication.** It is meant for a trusted home
  network. Do not expose it to the internet (no port forwarding!).
- Avoid editing the *same note* in Obsidian and in the browser at the same
  time — the last save wins. Different notes are always safe.
- Your notes never leave your machines unless your vault folder itself is
  synced (e.g. Google Drive, OneDrive) — that is independent of this tool.

## Files

| File              | Purpose                                          |
|-------------------|--------------------------------------------------|
| `server.py`       | The whole server (Python stdlib only)            |
| `static/`         | Web UI (HTML/CSS/JS + bundled marked.js)         |
| `baslat.bat`      | Windows launcher                                 |
| `start.sh`        | macOS / Linux launcher                           |
| `firewall-izni.bat` | Windows helper: adds the firewall rule (run as admin) |
| `config.json`     | Your local settings (git-ignored)                |

The bundled markdown renderer (`static/marked.min.js`, [marked](https://github.com/markedjs/marked) v12, MIT)
is vendored into the repo. To update it, run the *Vendor marked.js* workflow in
the Actions tab — or simply delete the file, and the server re-downloads it
(checksum-verified) on the next start.

## Troubleshooting

- **"Python was not found"** — install Python 3 and make sure it is on PATH.
- **Phone/laptop cannot connect** — same Wi-Fi network? Windows firewall rule
  for TCP 8124 added? Some routers isolate Wi-Fi clients from each other
  ("AP isolation") — disable that.
- **Port already in use** — the server picks the next free port
  automatically; check the printed address.
- **Notes look odd** — the UI renders Obsidian-flavored markdown; very rare
  constructs (Dataview, Excalidraw blocks, LaTeX) are shown as plain text.

## License

MIT — see [LICENSE](LICENSE). Bundled [marked](https://github.com/markedjs/marked)
is MIT licensed.

---

Turkish documentation: [README.tr.md](README.tr.md)
