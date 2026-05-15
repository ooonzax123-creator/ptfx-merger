#!/usr/bin/env bun
/**
 * ptfx-merger web UI — drag & drop .ypt.xml files, merge in browser
 * Usage: bun src/server.ts [--port 3000]
 */
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { mergeToString } from "./lib/merger.ts";

const { values } = Bun.argv.reduce(
  (acc, arg, i, arr) => {
    if (arg === "--port") acc.values.port = parseInt(arr[i + 1] ?? "3000");
    return acc;
  },
  { values: { port: 3000 } }
);

// ─── HTML ─────────────────────────────────────────────────────────────────────

const HTML = /* html */ `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ptfx-merger — GTA V Particle Effect Merger</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f0f13;
    --surface: #1a1a24;
    --surface2: #22222f;
    --border: #2e2e42;
    --accent: #7c5cfc;
    --accent2: #a07cf8;
    --green: #3ecf8e;
    --red: #f87171;
    --yellow: #fbbf24;
    --text: #e4e4f0;
    --muted: #6b6b8a;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 1.25rem 2rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
  }

  header .logo { font-size: 1.4rem; }
  header h1 { font-size: 1.1rem; font-weight: 600; letter-spacing: -0.02em; }
  header p { font-size: 0.8rem; color: var(--muted); margin-top: 0.1rem; }

  main {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    min-height: 0;
  }

  .panel {
    padding: 1.75rem;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    overflow-y: auto;
  }

  .panel-right {
    border-right: none;
    background: var(--surface);
  }

  label { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.4rem; }

  input[type="text"] {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: var(--font-mono);
    outline: none;
    transition: border-color 0.15s;
  }
  input[type="text"]:focus { border-color: var(--accent); }

  /* Drop zone */
  .drop-zone {
    border: 2px dashed var(--border);
    border-radius: 10px;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--surface2);
    position: relative;
  }
  .drop-zone:hover, .drop-zone.drag-over {
    border-color: var(--accent);
    background: rgba(124, 92, 252, 0.06);
  }
  .drop-zone input[type="file"] {
    position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
  }
  .drop-zone .icon { font-size: 2rem; margin-bottom: 0.5rem; }
  .drop-zone p { color: var(--muted); font-size: 0.85rem; }
  .drop-zone strong { color: var(--text); }

  /* File list */
  .file-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    font-family: var(--font-mono);
  }
  .file-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-item .remove {
    background: none; border: none; color: var(--muted); cursor: pointer;
    padding: 0 0.2rem; font-size: 1rem; line-height: 1;
    transition: color 0.15s;
  }
  .file-item .remove:hover { color: var(--red); }

  /* Button */
  button.merge-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.7rem 1.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    width: 100%;
  }
  button.merge-btn:hover { background: var(--accent2); }
  button.merge-btn:active { transform: scale(0.98); }
  button.merge-btn:disabled { background: var(--border); cursor: not-allowed; }

  /* Stats */
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  .stat-card {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    text-align: center;
  }
  .stat-card .value { font-size: 1.6rem; font-weight: 700; color: var(--accent2); }
  .stat-card .label { font-size: 0.72rem; color: var(--muted); margin-top: 0.2rem; }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .status-bar.ok { border-color: var(--green); color: var(--green); background: rgba(62, 207, 142, 0.06); }
  .status-bar.err { border-color: var(--red); color: var(--red); background: rgba(248, 113, 113, 0.06); }
  .status-bar.warn { border-color: var(--yellow); color: var(--yellow); background: rgba(251, 191, 36, 0.06); }
  .status-bar.idle { color: var(--muted); }

  /* Output */
  .output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }
  .output-header span { font-size: 0.8rem; color: var(--muted); }

  .download-btn {
    background: var(--green);
    color: #0a1f14;
    border: none;
    border-radius: 6px;
    padding: 0.35rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .download-btn:hover { opacity: 0.85; }
  .download-btn:disabled { background: var(--border); color: var(--muted); cursor: not-allowed; }

  pre#xml-output {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    line-height: 1.6;
    overflow: auto;
    white-space: pre;
    color: #c9d1d9;
    min-height: 300px;
  }

  /* Syntax colors */
  .tag { color: #7c9ef8; }
  .attr { color: #a3be8c; }
  .val { color: #ebcb8b; }
  .cmt { color: #6b7280; font-style: italic; }

  .lua-snippet {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.9rem 1rem;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    line-height: 1.7;
    color: #c9d1d9;
  }

  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(124,92,252,0.3);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 900px) {
    main { grid-template-columns: 1fr; }
    .panel { border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>
</head>
<body>

<header>
  <div class="logo">⚡</div>
  <div>
    <h1>ptfx-merger</h1>
    <p>รวม GTA V .ypt.xml หลาย project เป็น custom particle dictionary</p>
  </div>
</header>

<main>
  <!-- LEFT: Controls -->
  <div class="panel">

    <div>
      <label>Output Asset Name</label>
      <input type="text" id="output-name" placeholder="lee_core" value="lee_core" />
    </div>

    <div>
      <label>Prefix (เติมหน้าชื่อ effect ทุกตัว)</label>
      <input type="text" id="prefix" placeholder="lee_" value="lee_" />
    </div>

    <div>
      <label>เลือก .ypt.xml files</label>
      <div class="drop-zone" id="drop-zone">
        <input type="file" id="file-input" accept=".xml" multiple />
        <div class="icon">📂</div>
        <p><strong>Drag & drop</strong> .ypt.xml files ที่นี่</p>
        <p>หรือคลิกเพื่อเลือกไฟล์</p>
      </div>
    </div>

    <div>
      <label>ไฟล์ที่เลือก (<span id="file-count">0</span>)</label>
      <div class="file-list" id="file-list"></div>
    </div>

    <button class="merge-btn" id="merge-btn" disabled>
      Merge →
    </button>

    <div class="status-bar idle" id="status">
      เลือกไฟล์อย่างน้อย 1 ไฟล์เพื่อเริ่ม
    </div>

  </div>

  <!-- RIGHT: Output -->
  <div class="panel panel-right">

    <div>
      <label>Stats</label>
      <div class="stats">
        <div class="stat-card"><div class="value" id="s-files">0</div><div class="label">Files</div></div>
        <div class="stat-card"><div class="value" id="s-items">0</div><div class="label">Items</div></div>
        <div class="stat-card"><div class="value" id="s-sections">0</div><div class="label">Sections</div></div>
      </div>
    </div>

    <div>
      <label>Lua Usage</label>
      <div class="lua-snippet" id="lua-snippet">
<span style="color:#6b7280">-- จะแสดง code หลัง merge...</span>
      </div>
    </div>

    <div style="flex:1; display:flex; flex-direction:column">
      <div class="output-header">
        <label style="margin:0">XML Output</label>
        <button class="download-btn" id="download-btn" disabled>⬇ Download</button>
      </div>
      <pre id="xml-output"><span style="color:var(--muted)">ผลลัพธ์จะแสดงที่นี่หลัง merge...</span></pre>
    </div>

  </div>
</main>

<script>
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const mergeBtn = document.getElementById('merge-btn');
const status = document.getElementById('status');
const xmlOutput = document.getElementById('xml-output');
const downloadBtn = document.getElementById('download-btn');
const luaSnippet = document.getElementById('lua-snippet');

let files = [];
let lastXml = '';

// ── File handling
function addFiles(newFiles) {
  for (const f of newFiles) {
    if (!files.find(x => x.name === f.name)) files.push(f);
  }
  renderFileList();
}

function renderFileList() {
  fileCount.textContent = files.length;
  fileList.innerHTML = '';
  for (let i = 0; i < files.length; i++) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = \`
      <span>📄</span>
      <span class="name" title="\${files[i].name}">\${files[i].name}</span>
      <button class="remove" data-i="\${i}">×</button>
    \`;
    fileList.appendChild(div);
  }
  mergeBtn.disabled = files.length === 0;
  if (files.length === 0) setStatus('idle', 'เลือกไฟล์อย่างน้อย 1 ไฟล์เพื่อเริ่ม');
  else setStatus('idle', \`เลือก \${files.length} ไฟล์แล้ว — กด Merge เพื่อรวม\`);
}

fileList.addEventListener('click', e => {
  const btn = e.target.closest('.remove');
  if (!btn) return;
  files.splice(+btn.dataset.i, 1);
  renderFileList();
});

fileInput.addEventListener('change', e => addFiles(e.target.files));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles(e.dataTransfer.files);
});

// ── Status
function setStatus(type, msg) {
  status.className = 'status-bar ' + type;
  status.innerHTML = (type === 'loading')
    ? \`<span class="spinner"></span> \${msg}\`
    : msg;
}

// ── Syntax highlight (minimal)
function highlight(xml) {
  return xml
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(&lt;\\/?)([\\w\\-:]+)/g, '$1<span class="tag">$2</span>')
    .replace(/ (\\w+)="([^"]*)"/g, ' <span class="attr">$1</span>="<span class="val">$2</span>"')
    .replace(/(&lt;!--[\\s\\S]*?--&gt;)/g, '<span class="cmt">$1</span>');
}

// ── Merge
mergeBtn.addEventListener('click', async () => {
  if (files.length === 0) return;

  const prefix = document.getElementById('prefix').value.trim();
  const outputName = document.getElementById('output-name').value.trim() || 'lee_core';

  const formData = new FormData();
  formData.append('prefix', prefix);
  formData.append('outputName', outputName);
  files.forEach(f => formData.append('files', f));

  mergeBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('loading', 'กำลัง merge...');

  try {
    const res = await fetch('/merge', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || data.error) {
      setStatus('err', '❌ ' + (data.error || 'เกิดข้อผิดพลาด'));
      return;
    }

    lastXml = data.xml;
    xmlOutput.innerHTML = highlight(data.xml);
    downloadBtn.disabled = false;

    const s = data.stats;
    document.getElementById('s-files').textContent = s.filesProcessed;
    document.getElementById('s-items').textContent = s.totalItems;
    document.getElementById('s-sections').textContent = s.sectionsFound.length;

    // Lua snippet
    luaSnippet.innerHTML = \`<span style="color:#6b7280">-- โหลด asset</span>
<span style="color:#7c9ef8">RequestNamedPtfxAsset</span>(<span style="color:#ebcb8b">"\${outputName}"</span>)
<span style="color:#7c9ef8">while not HasNamedPtfxAssetLoaded</span>(<span style="color:#ebcb8b">"\${outputName}"</span>) <span style="color:#7c9ef8">do</span> Wait(<span style="color:#ebcb8b">0</span>) <span style="color:#7c9ef8">end</span>

<span style="color:#6b7280">-- เรียก effect</span>
<span style="color:#7c9ef8">UseParticleFxAssetNextCall</span>(<span style="color:#ebcb8b">"\${outputName}"</span>)
<span style="color:#7c9ef8">StartParticleFxNonLoopedAtCoord</span>(<span style="color:#ebcb8b">"\${prefix}your_effect"</span>, coords, 0, 0, 0, 1.0, false, false, false)\`;

    const warns = s.conflicts.length > 0
      ? \` ⚠️ \${s.conflicts.length} name conflicts\`
      : '';
    setStatus('ok', \`✅ Merge สำเร็จ — \${s.totalItems} items จาก \${s.filesProcessed} files\${warns}\`);

  } catch (err) {
    setStatus('err', '❌ ' + err.message);
  } finally {
    mergeBtn.disabled = false;
  }
});

// ── Download
downloadBtn.addEventListener('click', () => {
  if (!lastXml) return;
  const name = (document.getElementById('output-name').value.trim() || 'merged') + '.ypt.xml';
  const blob = new Blob([lastXml], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
});
</script>
</body>
</html>`;

// ─── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: values.port,

  async fetch(req) {
    const url = new URL(req.url);

    // ── GET / → serve UI
    if (req.method === "GET" && url.pathname === "/") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ── POST /merge → merge files
    if (req.method === "POST" && url.pathname === "/merge") {
      try {
        const form = await req.formData();
        const prefix = (form.get("prefix") as string) ?? "";
        const outputName = (form.get("outputName") as string) ?? "merged";
        const fileEntries = form.getAll("files") as File[];

        if (fileEntries.length === 0) {
          return Response.json({ error: "ไม่มีไฟล์" }, { status: 400 });
        }

        // Write to temp files
        const tmpDir = join(tmpdir(), `ptfx-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
        const tempPaths: string[] = [];

        for (const file of fileEntries) {
          const bytes = await file.arrayBuffer();
          const tmpPath = join(tmpDir, file.name);
          writeFileSync(tmpPath, Buffer.from(bytes));
          tempPaths.push(tmpPath);
        }

        // Merge
        const { xml, stats } = mergeToString({
          prefix,
          outputName,
          inputs: tempPaths,
          noPrefix: !prefix,
          verbose: false,
        });

        // Cleanup temp files
        for (const p of tempPaths) {
          try { unlinkSync(p); } catch {}
        }
        try { unlinkSync(tmpDir); } catch {}

        return Response.json({ xml, stats });

      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n⚡ ptfx-merger web UI`);
console.log(`   http://localhost:${server.port}\n`);
