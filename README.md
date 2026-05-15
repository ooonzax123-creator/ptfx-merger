# ptfx-merger

รวม GTA V `.ypt` XML files หลาย project เป็น custom particle dictionary ไฟล์เดียว — เหมือน `[core]` ของตัวเอง

## ติดตั้ง

```bash
bun install
```

## วิธีใช้

### 1. Export `.ypt` เป็น XML ด้วย CodeWalker

CodeWalker → เปิด `.ypt` → คลิกขวา → **Export XML**

### 2. Merge

```bash
# รวม 2 project ด้วย prefix "lee_"
bun src/merge.ts --prefix lee_ --output output/lee_core.ypt.xml projectA.ypt.xml projectB.ypt.xml

# รวมหลายไฟล์
bun src/merge.ts -p lee_ -o output/lee_core.ypt.xml effects/*.ypt.xml

# ไม่ใช้ prefix (ชื่อ effect ต้องไม่ซ้ำกัน)
bun src/merge.ts --no-prefix -o merged.ypt.xml a.ypt.xml b.ypt.xml
```

### 3. Import กลับด้วย CodeWalker

CodeWalker → **File > Import XML** → เลือก `lee_core.ypt.xml` → Save

### 4. ใช้ใน Lua/FiveM

```lua
-- โหลดครั้งเดียว ใช้ได้ทุก effect ใน dictionary
RequestNamedPtfxAsset("lee_core")
while not HasNamedPtfxAssetLoaded("lee_core") do Wait(0) end

-- เรียก effect
UseParticleFxAssetNextCall("lee_core")
StartParticleFxNonLoopedAtCoord("lee_fire_burst", coords, 0, 0, 0, 1.0, false, false, false)
```

```lua
-- fxmanifest.lua (FiveM)
data_file 'PTFXDICT' 'stream/lee_core.ypt'
```

## Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--prefix` | `-p` | `""` | Prefix เติมหน้าชื่อ effect ทุกตัว (แนะนำ: ชื่อย่อ project) |
| `--output` | `-o` | `output/merged.ypt.xml` | ไฟล์ output |
| `--no-prefix` | | `false` | Merge โดยไม่เติม prefix |
| `--verbose` | `-v` | `false` | Log ละเอียด |

## สิ่งที่ merger ทำ

- รวม `EffectRules`, `ParticleRules`, `EmitterRules` จากทุกไฟล์
- เติม prefix ให้ item `name` attribute ทุกตัว
- **อัปเดต internal references อัตโนมัติ** — `ref="fire_emitter"` → `ref="lee_fire_emitter"`
- แจ้งเตือน name conflicts ถ้าไม่ใช้ prefix
- สร้าง output directory อัตโนมัติ

## ตัวอย่างใน examples/

```
examples/
├── projectA.ypt.xml   — fire effect (EffectRule + ParticleRule + EmitterRule)
└── projectB.ypt.xml   — portal effect
```

```bash
bun src/merge.ts -p lee_ -o output/lee_core.ypt.xml examples/projectA.ypt.xml examples/projectB.ypt.xml
```
