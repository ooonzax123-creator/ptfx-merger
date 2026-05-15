#!/usr/bin/env bun
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

const HTML = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ptfx-merger</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f0f13;--surface:#1a1a24;--surface2:#22222f;--border:#2e2e42;
  --accent:#7c5cfc;--accent2:#a07cf8;--green:#3ecf8e;--red:#f87171;
  --yellow:#fbbf24;--text:#e4e4f0;--muted:#6b6b8a;
  --mono:'JetBrains Mono','Fira Code',monospace;
}
body{background:var(--bg);color:var(--text);font-family:'Inter',-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column}
header{padding:1.25rem 2rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:.75rem;background:var(--surface)}
header h1{font-size:1.1rem;font-weight:600;letter-spacing:-.02em}
header p{font-size:.8rem;color:var(--muted);margin-top:.1rem}
main{flex:1;display:grid;grid-template-columns:1fr 1fr;min-height:0}
.panel{padding:1.75rem;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:1.25rem;overflow-y:auto}
.panel-right{border-right:none;background:var(--surface)}
label{font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:.4rem}
input[type=text]{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:.5rem .75rem;border-radius:6px;font-size:.9rem;font-family:var(--mono);outline:none;transition:border-color .15s}
input[type=text]:focus{border-color:var(--accent)}
.drop-zone{border:2px dashed var(--border);border-radius:10px;padding:2rem;text-align:center;transition:all .2s;background:var(--surface2);position:relative}
.drop-zone.drag-over{border-color:var(--accent);background:rgba(124,92,252,.06)}
.pick-btn{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:.35rem .8rem;font-size:.8rem;cursor:pointer;transition:border-color .15s}
.pick-btn:hover{border-color:var(--accent);color:var(--accent2)}
.drop-zone .icon{font-size:2rem;margin-bottom:.5rem}
.drop-zone p{color:var(--muted);font-size:.85rem}
.drop-zone strong{color:var(--text)}
.file-list{display:flex;flex-direction:column;gap:.4rem;max-height:180px;overflow-y:auto}
.file-item{display:flex;align-items:center;gap:.5rem;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:.5rem .75rem;font-size:.82rem;font-family:var(--mono)}
.file-item .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-item .remove{background:none;border:none;color:var(--muted);cursor:pointer;padding:0 .2rem;font-size:1rem;line-height:1;transition:color .15s}
.file-item .remove:hover{color:var(--red)}
button.merge-btn{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:.7rem 1.5rem;font-size:.95rem;font-weight:600;cursor:pointer;transition:background .15s,transform .1s;width:100%}
button.merge-btn:hover{background:var(--accent2)}
button.merge-btn:active{transform:scale(.98)}
button.merge-btn:disabled{background:var(--border);cursor:not-allowed}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}
.stat-card{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:.75rem;text-align:center}
.stat-card .value{font-size:1.4rem;font-weight:700;color:var(--accent2)}
.stat-card .label{font-size:.72rem;color:var(--muted);margin-top:.2rem}
.status-bar{display:flex;align-items:center;gap:.5rem;font-size:.82rem;padding:.5rem .75rem;border-radius:6px;border:1px solid var(--border)}
.status-bar.ok{border-color:var(--green);color:var(--green);background:rgba(62,207,142,.06)}
.status-bar.err{border-color:var(--red);color:var(--red);background:rgba(248,113,113,.06)}
.status-bar.warn{border-color:var(--yellow);color:var(--yellow);background:rgba(251,191,36,.06)}
.status-bar.idle{color:var(--muted)}
.output-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}
.output-header span{font-size:.8rem;color:var(--muted)}
.download-btn{background:var(--green);color:#0a1f14;border:none;border-radius:6px;padding:.35rem .9rem;font-size:.8rem;font-weight:700;cursor:pointer;transition:opacity .15s}
.download-btn:hover{opacity:.85}
.download-btn:disabled{background:var(--border);color:var(--muted);cursor:not-allowed}
pre#xml-output{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:var(--mono);font-size:.75rem;line-height:1.6;overflow:auto;white-space:pre;color:#c9d1d9;min-height:200px}
.tag{color:#7c9ef8}.attr{color:#a3be8c}.val{color:#ebcb8b}.cmt{color:#6b7280;font-style:italic}
.lua-snippet{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:.9rem 1rem;font-family:var(--mono);font-size:.78rem;line-height:1.7;color:#c9d1d9;max-height:180px;overflow-y:auto}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(124,92,252,.3);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
.badge{font-size:.7rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:.1rem .4rem;color:var(--muted);margin-left:.4rem}
.badge.dds{border-color:var(--yellow);color:var(--yellow)}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:900px){main{grid-template-columns:1fr}.panel{border-right:none;border-bottom:1px solid var(--border)}}
</style>
</head>
<body>
<header>
  <div style="font-size:1.4rem">⚡</div>
  <div>
    <h1>ptfx-merger</h1>
    <p>รวม GTA V .ypt.xml หลาย project → custom particle dictionary พร้อม ZIP</p>
  </div>
</header>
<main>
  <div class="panel">
    <div>
      <label>Output Asset Name</label>
      <input type="text" id="output-name" placeholder="lee_core" value="lee_core" />
    </div>
    <div>
      <label>Prefix</label>
      <input type="text" id="prefix" placeholder="lee_" value="lee_" />
    </div>
    <div>
      <label>เลือกไฟล์ / Folder</label>
      <div class="drop-zone" id="drop-zone">
        <div class="icon">📂</div>
        <p><strong>Drag &amp; drop</strong> folder หรือไฟล์ที่นี่</p>
        <p style="color:var(--muted);font-size:.78rem;margin:.3rem 0">.ypt.xml จะถูก merge — .dds จะถูก pack ใน ZIP</p>
        <p style="margin-top:.6rem;display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap">
          <button class="pick-btn" id="pick-files">📄 เลือกไฟล์</button>
          <button class="pick-btn" id="pick-folder">📁 เลือก Folder</button>
        </p>
        <input type="file" id="file-input" accept=".xml,.dds" multiple style="display:none" />
        <input type="file" id="folder-input" multiple style="display:none" webkitdirectory />
      </div>
    </div>
    <div>
      <label>
        ไฟล์ที่เลือก
        <span id="file-count" class="badge">0 xml</span>
        <span id="dds-count" class="badge dds" style="display:none">0 dds</span>
      </label>
      <div class="file-list" id="file-list"></div>
    </div>
    <button class="merge-btn" id="merge-btn" disabled>Merge &amp; Pack ZIP →</button>
    <div class="status-bar idle" id="status">เลือกไฟล์อย่างน้อย 1 ไฟล์เพื่อเริ่ม</div>
  </div>

  <div class="panel panel-right">
    <div>
      <label>Stats</label>
      <div class="stats">
        <div class="stat-card"><div class="value" id="s-files">0</div><div class="label">XML Files</div></div>
        <div class="stat-card"><div class="value" id="s-items">0</div><div class="label">Items</div></div>
        <div class="stat-card"><div class="value" id="s-sections">0</div><div class="label">Sections</div></div>
        <div class="stat-card"><div class="value" id="s-dds">0</div><div class="label">DDS packed</div></div>
      </div>
    </div>
    <div>
      <label>Lua Usage</label>
      <div class="lua-snippet" id="lua-snippet"><span style="color:#6b7280">-- จะแสดงหลัง merge...</span></div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column">
      <div class="output-header">
        <label style="margin:0">XML Preview</label>
        <button class="download-btn" id="download-btn" disabled>⬇ Download ZIP</button>
      </div>
      <pre id="xml-output"><span style="color:var(--muted)">ผลลัพธ์จะแสดงที่นี่...</span></pre>
    </div>
  </div>
</main>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
// ── Elements
const fileInput   = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const dropZone    = document.getElementById('drop-zone');
const fileList    = document.getElementById('file-list');
const fileCount   = document.getElementById('file-count');
const ddsCount    = document.getElementById('dds-count');
const mergeBtn    = document.getElementById('merge-btn');
const status      = document.getElementById('status');
const xmlOutput   = document.getElementById('xml-output');
const downloadBtn = document.getElementById('download-btn');
const luaSnippet  = document.getElementById('lua-snippet');

let yptFiles = [];   // File[] — .ypt.xml only
let ddsFiles = [];   // File[] — .dds only
let lastXml  = '';
let lastEffects = [];

// ── Helpers
const isYpt = f => f.name.endsWith('.ypt.xml');
const isDds = f => f.name.toLowerCase().endsWith('.dds');
const fileKey = f => f.name + '_' + f.size;

function addFiles(newFiles) {
  let addedYpt = 0, addedDds = 0;
  for (const f of newFiles) {
    if (isYpt(f) && !yptFiles.find(x => fileKey(x) === fileKey(f))) {
      yptFiles.push(f); addedYpt++;
    } else if (isDds(f) && !ddsFiles.find(x => fileKey(x) === fileKey(f))) {
      ddsFiles.push(f); addedDds++;
    }
  }
  if (addedYpt === 0 && addedDds === 0 && newFiles.length > 0) {
    setStatus('warn', 'ไม่พบ .ypt.xml หรือ .dds ในไฟล์ที่เลือก');
  }
  renderFileList();
}

function renderFileList() {
  fileCount.textContent = yptFiles.length + ' xml';
  if (ddsFiles.length > 0) {
    ddsCount.textContent = ddsFiles.length + ' dds';
    ddsCount.style.display = '';
  } else {
    ddsCount.style.display = 'none';
  }

  fileList.innerHTML = '';
  for (let i = 0; i < yptFiles.length; i++) {
    const p = yptFiles[i].webkitRelativePath || yptFiles[i].name;
    const d = document.createElement('div');
    d.className = 'file-item';
    d.innerHTML = '<span>📄</span><span class="name" title="' + p + '">' + p + '</span><button class="remove" data-i="' + i + '">×</button>';
    fileList.appendChild(d);
  }
  mergeBtn.disabled = yptFiles.length === 0;
  if (yptFiles.length === 0) setStatus('idle', 'เลือกไฟล์หรือ folder');
  else setStatus('idle', yptFiles.length + ' xml + ' + ddsFiles.length + ' dds — กด Merge & Pack');
}

fileList.addEventListener('click', e => {
  const btn = e.target.closest('.remove');
  if (!btn) return;
  yptFiles.splice(+btn.dataset.i, 1);
  renderFileList();
});

// ── Pickers
document.getElementById('pick-files').addEventListener('click', e => { e.stopPropagation(); fileInput.value = ''; fileInput.click(); });
document.getElementById('pick-folder').addEventListener('click', e => { e.stopPropagation(); folderInput.value = ''; folderInput.click(); });
fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));
folderInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));

// ── Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const items = Array.from(e.dataTransfer.items || []);
  if (items.length && items[0].webkitGetAsEntry) {
    setStatus('idle', 'กำลังสแกน folder...');
    const collected = [];
    await Promise.all(items.map(item => collectEntry(item.webkitGetAsEntry(), collected)));
    addFiles(collected);
  } else {
    addFiles(Array.from(e.dataTransfer.files));
  }
});

async function collectEntry(entry, out) {
  if (!entry) return;
  if (entry.isFile) {
    if (entry.name.endsWith('.ypt.xml') || entry.name.toLowerCase().endsWith('.dds')) {
      const f = await new Promise(res => entry.file(res));
      out.push(f);
    }
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    await new Promise(res => {
      function readBatch() {
        reader.readEntries(async entries => {
          if (!entries.length) { res(); return; }
          await Promise.all(entries.map(e2 => collectEntry(e2, out)));
          readBatch();
        });
      }
      readBatch();
    });
  }
}

// ── Status
function setStatus(type, msg) {
  status.className = 'status-bar ' + type;
  status.innerHTML = type === 'loading' ? '<span class="spinner"></span> ' + msg : msg;
}

// ── Highlight (safe — no ^ in string literals, use charCode for quotes)
function highlight(xml) {
  const q = String.fromCharCode(39);
  const escaped = xml.replace(/&/g, '&amp;').replace(/</g, '\x00L').replace(/>/g, '\x00G');
  const re = /\x00L(\/?)([\w][\w\-:]*)((?:\s[\w\-:\.]+=(?:"[^"]*"))*\s*\/?\x00G|\s*\/?\x00G)/g;
  const out = escaped.replace(re, (_, sl, tag, rest) =>
    '&lt;' + sl + '<span class="tag">' + tag + '</span>' + rest.replace('\x00G', '&gt;')
  );
  return out.replace(/\x00L/g, '&lt;').replace(/\x00G/g, '&gt;');
}

// ── Extract effect names from merged XML
function extractEffects(xml) {
  const m = xml.match(/<EffectRuleDictionary>([\s\S]*?)<\/EffectRuleDictionary>/);
  if (!m) return [];
  const names = [];
  const re = /<Name>([^<:]+)<\/Name>/g;
  let x;
  while ((x = re.exec(m[1])) !== null) {
    const n = x[1].trim();
    if (n) names.push(n);
  }
  return names;
}

// ── Generate fxmanifest.lua
function genManifest(name) {
  return 'fx_version ' + String.fromCharCode(39) + 'cerulean' + String.fromCharCode(39) + '\\n' +
    'game ' + String.fromCharCode(39) + 'gta5' + String.fromCharCode(39) + '\\n\\n' +
    'name ' + String.fromCharCode(39) + name + String.fromCharCode(39) + '\\n' +
    'version ' + String.fromCharCode(39) + '1.0.0' + String.fromCharCode(39) + '\\n\\n' +
    "data_file 'PTFXDICT' 'stream/" + name + ".ypt'\\n\\n" +
    "client_script 'client.lua'\\n\\n" +
    "files {\\n" +
    "  'stream/" + name + "/*.dds',\\n" +
    "}\\n";
}

// ── Generate client.lua
function genClientLua(assetName, effects) {
  const list = effects.map(e => '  "' + e + '",').join('\\n');
  return [
    'local ASSET = "' + assetName + '"',
    '',
    'local EFFECTS = {',
    list,
    '}',
    '',
    "AddEventHandler('onClientResourceStart', function(res)",
    '  if res ~= GetCurrentResourceName() then return end',
    '  RequestNamedPtfxAsset(ASSET)',
    '  local t = 0',
    '  while not HasNamedPtfxAssetLoaded(ASSET) do',
    '    Wait(10); t = t + 10',
    '    if t > 5000 then print("^1[" .. ASSET .. "] load failed"); return end',
    '  end',
    '  print("^2[" .. ASSET .. "] loaded " .. #EFFECTS .. " effects")',
    'end)',
    '',
    'local function FireAt(name, coords, scale)',
    '  UseParticleFxAssetNextCall(ASSET)',
    '  StartParticleFxNonLoopedAtCoord(name, coords.x, coords.y, coords.z, 0,0,0, scale or 1.0, false,false,false)',
    'end',
    '',
    'RegisterCommand("ptfx", function(_, args)',
    '  local name = args[1]',
    '  if not name then',
    '    for _, e in ipairs(EFFECTS) do print(e) end',
    '    return',
    '  end',
    '  FireAt(name, GetEntityCoords(PlayerPedId()), tonumber(args[2]) or 1.0)',
    'end, false)',
    '',
    'RegisterCommand("ptfxall", function()',
    '  local base = GetEntityCoords(PlayerPedId())',
    '  for i, name in ipairs(EFFECTS) do',
    '    local a = (i-1) * (360/#EFFECTS) * math.pi/180',
    '    FireAt(name, base + vector3(math.cos(a)*2, math.sin(a)*2, 0))',
    '    Wait(80)',
    '  end',
    'end, false)',
  ].join('\\n');
}

// ── Deduplicate DDS files by name (keep largest)
function dedupDds(files) {
  const map = new Map();
  for (const f of files) {
    const existing = map.get(f.name);
    if (!existing || f.size > existing.size) map.set(f.name, f);
  }
  return Array.from(map.values());
}

// ── Merge & Pack
mergeBtn.addEventListener('click', async () => {
  if (yptFiles.length === 0) return;

  const prefix = document.getElementById('prefix').value.trim();
  const outputName = document.getElementById('output-name').value.trim() || 'lee_core';

  const formData = new FormData();
  formData.append('prefix', prefix);
  formData.append('outputName', outputName);
  yptFiles.forEach(f => formData.append('files', f));

  mergeBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus('loading', 'กำลัง merge XML...');

  try {
    const res = await fetch('/merge', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok || data.error) { setStatus('err', '❌ ' + (data.error || 'error')); return; }

    lastXml = data.xml;
    lastEffects = extractEffects(data.xml);
    const uniqueDds = dedupDds(ddsFiles);

    // Update stats
    const s = data.stats;
    document.getElementById('s-files').textContent = s.filesProcessed;
    document.getElementById('s-items').textContent = s.totalItems;
    document.getElementById('s-sections').textContent = s.sectionsFound.length;
    document.getElementById('s-dds').textContent = uniqueDds.length;

    // Preview XML (first 200 lines)
    const preview = lastXml.split('\\n').slice(0, 200).join('\\n');
    xmlOutput.innerHTML = highlight(preview);

    // Build ZIP
    setStatus('loading', 'กำลัง pack ZIP... (DDS ' + uniqueDds.length + ' ไฟล์)');
    const zip = new JSZip();
    const root = zip.folder(outputName);
    root.file('fxmanifest.lua', genManifest(outputName));
    root.file('client.lua', genClientLua(outputName, lastEffects));
    const stream = root.folder('stream');
    stream.file(outputName + '.ypt.xml', lastXml);
    const texDir = stream.folder(outputName);
    for (const f of uniqueDds) {
      const buf = await f.arrayBuffer();
      texDir.file(f.name, buf);
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const zipUrl = URL.createObjectURL(blob);

    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = outputName + '_resource.zip';
      a.click();
    };

    // Lua snippet
    const firstEffect = lastEffects[0] || prefix + 'your_effect';
    luaSnippet.innerHTML = [
      '<span style="color:#6b7280">-- ' + lastEffects.length + ' effects | ' + uniqueDds.length + ' textures</span>',
      '<span style="color:#7c9ef8">RequestNamedPtfxAsset</span>(<span style="color:#ebcb8b">"' + outputName + '"</span>)',
      '<span style="color:#7c9ef8">while not HasNamedPtfxAssetLoaded</span>(<span style="color:#ebcb8b">"' + outputName + '"</span>) <span style="color:#7c9ef8">do</span> Wait(0) <span style="color:#7c9ef8">end</span>',
      '',
      '<span style="color:#7c9ef8">UseParticleFxAssetNextCall</span>(<span style="color:#ebcb8b">"' + outputName + '"</span>)',
      '<span style="color:#7c9ef8">StartParticleFxNonLoopedAtCoord</span>(<span style="color:#ebcb8b">"' + firstEffect + '"</span>, coords, 0,0,0, 1.0, false,false,false)',
      '',
      '<span style="color:#6b7280">-- /ptfx ' + firstEffect + '    /ptfxall    /ptfxlist</span>',
    ].join('\\n');

    const warns = s.conflicts && s.conflicts.length > 0 ? ' ⚠️ ' + s.conflicts.length + ' conflicts' : '';
    setStatus('ok', '✅ ' + s.totalItems + ' items | ' + uniqueDds.length + ' dds | ZIP พร้อมโหลด' + warns);

  } catch (err) {
    setStatus('err', '❌ ' + err.message);
  } finally {
    mergeBtn.disabled = false;
  }
});
</script>
</body>
</html>`;

// ─── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: values.port,

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "POST" && url.pathname === "/merge") {
      try {
        const form = await req.formData();
        const prefix = (form.get("prefix") as string) ?? "";
        const outputName = (form.get("outputName") as string) ?? "merged";
        const fileEntries = form.getAll("files") as File[];

        if (fileEntries.length === 0) {
          return Response.json({ error: "ไม่มีไฟล์" }, { status: 400 });
        }

        const tmpDir = join(tmpdir(), `ptfx-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
        const tempPaths: string[] = [];

        for (const file of fileEntries) {
          const bytes = await file.arrayBuffer();
          const tmpPath = join(tmpDir, file.name);
          writeFileSync(tmpPath, Buffer.from(bytes));
          tempPaths.push(tmpPath);
        }

        const { xml, stats } = mergeToString({
          prefix,
          outputName,
          inputs: tempPaths,
          noPrefix: !prefix,
          verbose: false,
        });

        for (const p of tempPaths) { try { unlinkSync(p); } catch {} }
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
