"use strict";

/* Obsidian Local Web - browser UI.
   Talks to the local Python server; reads/writes the vault's .md files directly. */

const $ = (id) => document.getElementById(id);

const view = $("view");
const editor = $("editor");
const welcome = $("welcome");
const content = $("content");
const treeEl = $("tree");
const searchInput = $("search");
const searchResults = $("search-results");
const searchClose = $("search-close");
const tabName = $("tab-name");
const tabPath = $("tab-path");
const banner = $("banner");
const toastEl = $("toast");
const vaultName = $("vault-name");
const btnEdit = $("btn-edit");
const btnSave = $("btn-save");
const btnCancel = $("btn-cancel");
const btnDelete = $("btn-delete");
const btnReload = $("btn-reload");
const rbNew = $("rb-new");
const rbSearch = $("rb-search");
const rbRefresh = $("rb-refresh");

const state = {
  current: null,   // open note: {path, name, content, mtime}
  editing: false,
  index: null,     // {files: {filename: relpath}, paths: Set}
  lastPoll: 0,
  lang: "en",
};

const openFolders = new Set(JSON.parse(localStorage.getItem("vw_open") || "[]"));

/* ---------------------------------------------------------------- i18n */

const I18N = {
  tr: {
    new_note: "Yeni not",
    search_title: "Ara (Ctrl+K)",
    refresh: "Yenile",
    search_ph: "Notlarda ara…",
    search_close: "Aramayı kapat",
    files: "Dosyalar",
    footer_hint: "Telefon/laptopdan erişim: sunucu penceresindeki ağ adresi",
    no_note: "Not seçilmedi",
    edit: "Düzenle",
    save: "Kaydet",
    cancel: "Vazgeç",
    delete: "Sil (çöp klasörüne taşır)",
    reload: "Yeniden yükle",
    changed_banner: "Bu not masaüstünde değişti.",
    editor: "Not düzenleyici",
    welcome_title: "Obsidian Local Web",
    welcome_p1: "Bu arayüz vault klasörünü doğrudan okur ve yazar. Buradan aldığın notlar .md dosyası olarak kaydedilir; masaüstündeki Obsidian değişikliği anında görür.",
    welcome_p2: "Soldaki listeden bir not seç ya da kalem simgesiyle yeni not oluştur.",
    sr_count: "{n} not bulundu",
    toast_saved: "Kaydedildi",
    toast_deleted: "Çöp klasörüne taşındı",
    toast_removed: "Bu not başka yerden silinmiş ya da taşınmış",
    toast_bad_name: "Geçerli bir isim gir",
    toast_no_server: "Sunucuya ulaşılamadı",
    new_prompt: "Not adı (klasör de yazabilirsin, örn: Ders/Matematik/Yeni Konu):",
    confirm_delete: "\"{name}\" .trash klasörüne taşınacak. Onaylıyor musun?",
    confirm_cancel: "Kaydedilmemiş değişiklikler var. Vazgeçilsin mi?",
    confirm_reload: "Masaüstündeki yeni sürüm yüklenecek; editördeki değişiklikler silinecek. Devam?",
    tree_empty: "Not bulunamadı",
    folder_empty: "boş",
  },
  en: {
    new_note: "New note",
    search_title: "Search (Ctrl+K)",
    refresh: "Refresh",
    search_ph: "Search notes…",
    search_close: "Close search",
    files: "Files",
    footer_hint: "From phone/laptop: use the network address printed in the server window",
    no_note: "No note selected",
    edit: "Edit",
    save: "Save",
    cancel: "Discard",
    delete: "Delete (moves to trash)",
    reload: "Reload",
    changed_banner: "This note changed on the desktop.",
    editor: "Note editor",
    welcome_title: "Obsidian Local Web",
    welcome_p1: "This UI reads and writes your vault folder directly. Notes you take here are saved as .md files; the Obsidian desktop app sees the change instantly.",
    welcome_p2: "Pick a note from the list, or create one with the pen icon.",
    sr_count: "{n} notes found",
    toast_saved: "Saved",
    toast_deleted: "Moved to trash",
    toast_removed: "This note was deleted or moved elsewhere",
    toast_bad_name: "Enter a valid name",
    toast_no_server: "Could not reach the server",
    new_prompt: "Note name (folders allowed, e.g. School/Math/New Topic):",
    confirm_delete: "\"{name}\" will be moved to the .trash folder. Are you sure?",
    confirm_cancel: "There are unsaved changes. Discard them?",
    confirm_reload: "The desktop version will be loaded and your editor changes will be lost. Continue?",
    tree_empty: "No notes found",
    folder_empty: "empty",
  },
};

/* Server error codes -> human text */
const ERR = {
  tr: {
    no_path: "Yol belirtilmedi",
    bad_path: "Geçersiz yol",
    hidden_path: "Gizli dosya/klasöre erişilemez",
    outside_vault: "Yol vault dışına çıkıyor",
    not_md: "Sadece .md dosyaları desteklenir",
    not_found: "Dosya bulunamadı",
    empty_name: "Boş isim",
    bad_chars: "İsimde kullanılamayan karakter var",
    name_exists: "Bu isimde bir not zaten var",
    no_content: "İçerik eksik",
    no_task: "Görev satırı bulunamadı",
    bad_type: "Desteklenmeyen dosya türü",
    bad_json: "Geçersiz istek",
    bad_endpoint: "Bilinmeyen işlem",
    server_error: "Sunucu hatası",
  },
  en: {
    no_path: "No path given",
    bad_path: "Invalid path",
    hidden_path: "Hidden files are not accessible",
    outside_vault: "Path escapes the vault",
    not_md: "Only .md files are supported",
    not_found: "File not found",
    empty_name: "Empty name",
    bad_chars: "Name contains characters that are not allowed",
    name_exists: "A note with this name already exists",
    no_content: "Content is missing",
    no_task: "Task line was not found",
    bad_type: "Unsupported file type",
    bad_json: "Invalid request",
    bad_endpoint: "Unknown action",
    server_error: "Server error",
  },
};

function t(key, params) {
  let s = (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  if (params) {
    for (const k of Object.keys(params)) s = s.split("{" + k + "}").join(params[k]);
  }
  return s;
}

function errorText(code) {
  if (!code) return t("server_error");
  return (ERR[state.lang] && ERR[state.lang][code]) || ERR.en[code] || code;
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}

/* ---------------------------------------------------------------- helpers */

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function icon(name, cls) {
  return `<svg class="ic ${cls || ""}"><use href="#i-${name}"/></svg>`;
}

let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

async function api(url, body) {
  const opts = body !== undefined
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  try {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast(d.error ? errorText(d.error) : "Error: " + r.status);
      return null;
    }
    return d;
  } catch (e) {
    toast(t("toast_no_server"));
    return null;
  }
}

/* ---------------------------------------------------------------- resolution */

function resolveNote(target) {
  if (!state.index || !target) return null;
  let s = String(target).replace(/\\/g, "/").trim().toLowerCase();
  if (!s) return null;
  const withMd = s.endsWith(".md") ? s : s + ".md";
  if (state.index.paths.has(withMd)) return withMd;
  if (state.index.paths.has(s)) return s;
  const base = withMd.split("/").pop();
  return state.index.files[base] || null;
}

function resolveAttachment(name) {
  if (!state.index || !name) return null;
  const base = String(name).replace(/\\/g, "/").split("/").pop().toLowerCase();
  return state.index.files[base] || null;
}

function noteDir() {
  if (!state.current) return "";
  const i = state.current.path.lastIndexOf("/");
  return i === -1 ? "" : state.current.path.slice(0, i);
}

/* ---------------------------------------------------------------- markdown */

const CALLOUT_LABELS = {
  tr: {
    note: "Not", abstract: "Özet", info: "Bilgi", todo: "Yapılacak",
    tip: "İpucu", success: "Başarı", question: "Soru", warning: "Uyarı",
    danger: "Önemli", error: "Hata", bug: "Hata ayıklama", example: "Örnek",
    quote: "Alıntı",
  },
  en: {
    note: "Note", abstract: "Abstract", info: "Info", todo: "Todo",
    tip: "Tip", success: "Success", question: "Question", warning: "Warning",
    danger: "Important", error: "Error", bug: "Bug", example: "Example",
    quote: "Quote",
  },
};

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "m4a", "flac"];
const VIDEO_EXTS = ["mp4", "webm"];

function fileUrl(rel) {
  return "/file?path=" + encodeURIComponent(rel);
}

function calloutHtml(m, inner) {
  const mm = inner.match(/^\s*<p>\[!(\w+)\][+-]?[ \t]*(.*?)<\/p>/);
  if (!mm) return m;
  const type = mm[1].toLowerCase();
  const labels = CALLOUT_LABELS[state.lang] || CALLOUT_LABELS.en;
  const title = mm[2].trim() || labels[type] || type;
  const rest = inner.slice(mm[0].length);
  return `<div class="callout c-${escAttr(type)}"><div class="callout-title">${title}</div><div class="callout-body">${rest}</div></div>`;
}

function embedHtml(m, target, alias) {
  target = (target || "").trim();
  if (!target) return m;
  const found = resolveAttachment(target);
  if (!found) return `<span class="wiki unresolved">${esc(target)}</span>`;
  const ext = (target.split(".").pop() || "").toLowerCase();
  const src = fileUrl(found);
  if (IMAGE_EXTS.includes(ext)) {
    const w = alias && /^\d+$/.test(alias.trim()) ? ` style="width:${parseInt(alias, 10)}px"` : "";
    return `<img class="embed" src="${src}" alt="${escAttr(target)}"${w}>`;
  }
  if (AUDIO_EXTS.includes(ext)) return `<audio controls src="${src}"></audio>`;
  if (VIDEO_EXTS.includes(ext)) return `<video controls src="${src}"></video>`;
  return `<a class="file-embed" href="${src}" target="_blank" rel="noopener">${esc(target)}</a>`;
}

function wikiHtml(m, target, anchorPart, alias) {
  target = (target || "").trim();
  if (!target) return m;
  const anchor = anchorPart ? anchorPart.slice(1).trim() : "";
  const label = (alias || target).trim();
  const found = resolveNote(target);
  if (!found) return `<span class="wiki unresolved">${esc(label)}</span>`;
  return `<a href="#" class="wiki" data-note="${escAttr(found)}" data-anchor="${escAttr(anchor)}">${esc(label)}</a>`;
}

function fixImageSrc(m, pre, src, post) {
  if (/^(https?:|data:|\/)/i.test(src)) return m;
  const dir = noteDir();
  const rel = ((dir ? dir + "/" : "") + src.replace(/^\.\//, "")).replace(/\\/g, "/");
  if (state.index && state.index.paths.has(rel.toLowerCase())) {
    return `${pre}/file?path=${encodeURIComponent(rel)}${post}`;
  }
  const found = resolveAttachment(src);
  return found ? `${pre}/file?path=${encodeURIComponent(found)}${post}` : m;
}

function processSegment(s) {
  // make marked's task checkboxes clickable
  s = s.replace(/<input([^>]*type="checkbox"[^>]*)>/g, (m, attrs) => {
    const checked = /checked/.test(attrs) ? " checked" : "";
    return `<input type="checkbox" class="task"${checked}>`;
  });
  s = s.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, calloutHtml);
  s = s.replace(/!\[\[([^\][|]+)(?:\|([^\][]+))?\]\]/g, embedHtml);
  s = s.replace(/\[\[([^\][|#]+)(#[^\][|]*)?(?:\|([^\][]+))?\]\]/g, wikiHtml);
  s = s.replace(/<img\s([^>]*?)src="([^"]*?)"([^>]*?)>/g, fixImageSrc);
  s = s.replace(/href="([^"]+\.md)"/gi, (m, href) => {
    const found = resolveNote(href);
    return found ? `href="#" data-note="${escAttr(found)}"` : m;
  });
  s = s.replace(/(^|[\s(>])#([\p{L}\p{N}][\p{L}\p{N}/_-]*)/gu, (m, pre, tag) =>
    `${pre}<span class="tag" data-tag="${escAttr(tag)}">#${esc(tag)}</span>`);
  s = s.replace(/==([^=\n<>]+)==/g, "<mark>$1</mark>");
  return s;
}

function postProcess(html) {
  // never touch text inside <pre> and <code> blocks
  const parts = html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) parts[i] = processSegment(parts[i]);
  }
  return parts.join("");
}

function frontmatterHtml(fm) {
  const rows = fm.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const m = l.match(/^([^:]+):(.*)$/);
    if (m) return `<tr><th>${esc(m[1].trim())}</th><td>${esc(m[2].trim())}</td></tr>`;
    return `<tr><td colspan="2">${esc(l)}</td></tr>`;
  }).join("");
  return `<details class="frontmatter"><summary>properties</summary><table>${rows}</table></details>`;
}

function renderNote(raw) {
  if (!window.marked) {
    view.innerHTML = `<pre class="raw">${esc(raw)}</pre>`;
    return;
  }
  let fm = null;
  let body = raw;
  const m = raw.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (m) {
    fm = m[0].replace(/^---[ \t]*\r?\n/, "").replace(/\r?\n---[ \t]*(?:\r?\n|$)$/, "");
    body = raw.slice(m[0].length);
  }
  let html = marked.parse(body);
  html = postProcess(html);
  view.innerHTML = (fm ? frontmatterHtml(fm) : "") + html;
}

function scrollToHeading(anchor) {
  const target = String(anchor).toLowerCase();
  for (const h of view.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (h.textContent.trim().toLowerCase() === target) {
      h.scrollIntoView();
      return;
    }
  }
}

/* ---------------------------------------------------------------- open/close note */

function updateButtons() {
  const has = !!state.current;
  btnEdit.disabled = !has || state.editing;
  btnDelete.disabled = !has;
  btnSave.hidden = !state.editing;
  btnCancel.hidden = !state.editing;
  btnEdit.hidden = state.editing;
}

function setTab(path) {
  if (!path) {
    tabName.textContent = t("no_note");
    tabPath.textContent = "";
    return;
  }
  const parts = path.split("/");
  const name = parts.pop();
  tabName.textContent = name.replace(/\.md$/i, "");
  tabPath.textContent = parts.join(" / ");
}

function markActive() {
  treeEl.querySelectorAll(".tree-note").forEach((b) => {
    b.classList.toggle("active", !!state.current && b.dataset.path === state.current.path);
  });
}

async function openNote(path, anchor) {
  const d = await api("/api/note?path=" + encodeURIComponent(path));
  if (!d) return false;
  state.current = d;
  state.editing = false;
  localStorage.setItem("vw_last", d.path);
  banner.hidden = true;
  welcome.hidden = true;
  editor.hidden = true;
  renderNote(d.content);
  view.hidden = false;
  setTab(d.path);
  updateButtons();
  markActive();
  document.title = d.name.replace(/\.md$/i, "") + " · Obsidian Local Web";
  if (anchor) scrollToHeading(anchor);
  else content.scrollTop = 0;
  return true;
}

function showWelcome() {
  state.current = null;
  state.editing = false;
  view.hidden = true;
  editor.hidden = true;
  banner.hidden = true;
  welcome.hidden = false;
  setTab(null);
  updateButtons();
  markActive();
  document.title = "Obsidian Local Web";
}

async function refreshCurrent() {
  if (!state.current) return;
  const scroll = content.scrollTop;
  const d = await api("/api/note?path=" + encodeURIComponent(state.current.path));
  if (!d) return;
  state.current = d;
  if (!state.editing) {
    renderNote(d.content);
    view.hidden = false;
    content.scrollTop = scroll;
  }
}

/* ---------------------------------------------------------------- editing */

function startEdit() {
  if (!state.current) return;
  editor.value = state.current.content;
  view.hidden = true;
  welcome.hidden = true;
  banner.hidden = true;
  editor.hidden = false;
  state.editing = true;
  updateButtons();
  editor.focus();
}

function cancelEdit() {
  if (!state.current) return;
  if (editor.value !== state.current.content && !confirm(t("confirm_cancel"))) return;
  state.editing = false;
  editor.hidden = true;
  renderNote(state.current.content);
  view.hidden = false;
  updateButtons();
}

async function saveNote() {
  if (!state.editing || !state.current) return;
  const text = editor.value;
  const d = await api("/api/save", { path: state.current.path, content: text });
  if (!d) return;
  state.current.content = text;
  state.current.mtime = d.mtime;
  state.editing = false;
  editor.hidden = true;
  renderNote(text);
  view.hidden = false;
  updateButtons();
  toast(t("toast_saved"));
}

/* ---------------------------------------------------------------- task toggle */

function liText(li) {
  const clone = li.cloneNode(true);
  clone.querySelectorAll("ul,ol,input").forEach((n) => n.remove());
  return clone.textContent.trim();
}

async function onTaskToggle(e) {
  const input = e.target;
  if (!input.classList || !input.classList.contains("task") || !state.current) return;
  const li = input.closest("li");
  const text = li ? liText(li) : "";
  const d = await api("/api/toggle", { path: state.current.path, text });
  if (d && d.ok) {
    state.current.content = d.content;
    state.current.mtime = d.mtime;
    renderNote(d.content);
  } else {
    input.checked = !input.checked;
  }
}

/* ---------------------------------------------------------------- file tree */

function nodeHtml(n) {
  if (n.type === "folder") {
    const open = openFolders.has(n.path) ? " open" : "";
    const inner = n.children.length
      ? `<ul>${n.children.map(nodeHtml).join("")}</ul>`
      : `<p class="tree-empty">${t("folder_empty")}</p>`;
    return `<li><details class="tree-folder" data-fpath="${escAttr(n.path)}"${open}>` +
      `<summary>${icon("chevron", "chev")}${icon("folder", "fld")}<span class="nm">${esc(n.name)}</span></summary>` +
      `<div class="children">${inner}</div></details></li>`;
  }
  return `<li><button class="tree-note" data-path="${escAttr(n.path)}" title="${escAttr(n.path)}">` +
    `${icon("file", "doc")}<span class="nm">${esc(n.name.replace(/\.md$/i, ""))}</span></button></li>`;
}

async function loadTree() {
  // snapshot expand/collapse state from the live DOM before re-rendering
  treeEl.querySelectorAll("details").forEach((d) => {
    if (!d.dataset.fpath) return;
    if (d.open) openFolders.add(d.dataset.fpath);
    else openFolders.delete(d.dataset.fpath);
  });
  const d = await api("/api/tree");
  if (!d) return;
  if (d.vault) vaultName.textContent = d.vault;
  treeEl.innerHTML = d.tree && d.tree.length
    ? `<ul>${d.tree.map(nodeHtml).join("")}</ul>`
    : `<p class="tree-empty">${t("tree_empty")}</p>`;
  markActive();
}

async function loadIndex() {
  const idx = await api("/api/index");
  if (!idx) return;
  state.index = { files: idx.files || {}, paths: new Set(idx.paths || []) };
  if (idx.vault) vaultName.textContent = idx.vault;
  if (idx.lang === "tr" || idx.lang === "en") state.lang = idx.lang;
}

async function reloadAll() {
  await loadIndex();
  await loadTree();
  if (state.current) await refreshCurrent();
  toast(t("refresh"));
}

/* ---------------------------------------------------------------- search */

function markLine(text, q) {
  return esc(text).replace(new RegExp(escRe(q), "gi"), (m) => `<mark>${m}</mark>`);
}

function closeSearch() {
  searchInput.value = "";
  searchClose.hidden = true;
  searchResults.hidden = true;
  treeEl.hidden = false;
}

async function runSearch() {
  const q = searchInput.value.trim();
  if (q.length < 2) { closeSearch(); return; }
  const d = await api("/api/search?q=" + encodeURIComponent(q));
  if (!d) return;
  searchClose.hidden = false;
  treeEl.hidden = true;
  searchResults.hidden = false;
  const items = d.results.map((r) =>
    `<button class="sr-item" data-path="${escAttr(r.path)}">` +
    `<span class="sr-name">${icon("file", "doc")}${esc(r.name.replace(/\.md$/i, ""))}</span>` +
    r.lines.map((l) => `<span class="sr-line">${markLine(l.text, q)}</span>`).join("") +
    `</button>`).join("");
  searchResults.innerHTML =
    `<div class="sr-count">${t("sr_count", { n: d.results.length })}</div>` + (items || "");
}

/* ---------------------------------------------------------------- change polling */

async function poll() {
  try {
    const r = await fetch("/api/changes?since=" + state.lastPoll);
    if (!r.ok) return;
    const d = await r.json();
    state.lastPoll = d.now || state.lastPoll;
    const changed = d.changed || [];
    const removed = d.removed || [];
    if (changed.length || removed.length) {
      loadTree();
      if (state.current && removed.includes(state.current.path)) {
        state.current = null;
        showWelcome();
        toast(t("toast_removed"));
        return;
      }
      if (state.current && changed.includes(state.current.path)) {
        if (state.editing) banner.hidden = false;
        else refreshCurrent();
      }
    }
  } catch (e) {
    /* server may be down; stay quiet */
  }
}

/* ---------------------------------------------------------------- events */

async function newNote() {
  const base = state.current ? state.current.path.replace(/\/[^/]*$/, "") : "";
  const raw = prompt(t("new_prompt"), base ? base + "/" : "");
  if (raw === null) return;
  const name = raw.replace(/[<>:"|?*]/g, "").replace(/\s+/g, " ").trim()
    .replace(/^\/+|\/+$/g, "");
  if (!name) { toast(t("toast_bad_name")); return; }
  const d = await api("/api/create", { path: name });
  if (!d) return;
  await loadIndex();
  await loadTree();
  await openNote(d.path);
  startEdit();
}

function bindEvents() {
  treeEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tree-note");
    if (btn) openNote(btn.dataset.path);
  });

  // remember folder expand state (toggle does not bubble; capture catches it)
  treeEl.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.tagName !== "DETAILS" || !d.dataset.fpath) return;
    if (d.open) openFolders.add(d.dataset.fpath);
    else openFolders.delete(d.dataset.fpath);
    localStorage.setItem("vw_open", JSON.stringify([...openFolders]));
  }, true);

  searchResults.addEventListener("click", (e) => {
    const btn = e.target.closest(".sr-item");
    if (btn) { closeSearch(); openNote(btn.dataset.path); }
  });

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  });
  searchClose.addEventListener("click", closeSearch);

  view.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-note]");
    if (a) {
      e.preventDefault();
      openNote(a.dataset.note, a.dataset.anchor);
      return;
    }
    const tag = e.target.closest(".tag");
    if (tag) {
      closeSearch();
      searchInput.value = "#" + tag.dataset.tag;
      searchInput.dispatchEvent(new Event("input"));
      return;
    }
    const img = e.target.closest("img.embed");
    if (img) window.open(img.src, "_blank");
  });

  view.addEventListener("change", onTaskToggle);

  btnEdit.addEventListener("click", startEdit);
  btnSave.addEventListener("click", saveNote);
  btnCancel.addEventListener("click", cancelEdit);
  rbNew.addEventListener("click", newNote);

  rbSearch.addEventListener("click", () => {
    searchInput.focus();
    searchInput.select();
  });

  rbRefresh.addEventListener("click", reloadAll);

  btnDelete.addEventListener("click", async () => {
    if (!state.current) return;
    if (!confirm(t("confirm_delete", { name: state.current.name }))) return;
    const d = await api("/api/delete", { path: state.current.path });
    if (!d) return;
    toast(t("toast_deleted"));
    showWelcome();
    await loadIndex();
    loadTree();
  });

  btnReload.addEventListener("click", async () => {
    banner.hidden = true;
    if (state.editing && editor.value !== state.current.content && !confirm(t("confirm_reload"))) return;
    await refreshCurrent();
  });

  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      editor.setRangeText("  ", editor.selectionStart, editor.selectionEnd, "end");
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveNote();
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === "Escape" && searchInput.value) {
      closeSearch();
    }
  });
}

/* ---------------------------------------------------------------- boot */

(async function init() {
  const nav = (navigator.language || "").toLowerCase();
  state.lang = nav.startsWith("tr") ? "tr" : "en";
  bindEvents();
  if (window.marked) marked.use({ gfm: true, breaks: true });
  await loadIndex();
  applyI18n();
  await loadTree();
  const last = localStorage.getItem("vw_last");
  if (last && !(await openNote(last))) {
    localStorage.removeItem("vw_last");
    showWelcome();
  } else if (!last) {
    showWelcome();
  }
  setInterval(poll, 8000);
})();
