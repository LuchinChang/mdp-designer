// Minimal ZIP writer: stored (uncompressed) entries only, enough to bundle a few text files.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.content)
    const crc = crc32(data)
    // Shared fields of the local header (from offset 4) and the central directory entry (from offset 6).
    const common = (v: DataView, at: number) => {
      v.setUint16(at, 20, true) // version needed
      v.setUint16(at + 2, 0x0800, true) // flags: UTF-8 names
      v.setUint16(at + 4, 0, true) // method: stored
      v.setUint32(at + 6, 0x00210000, true) // mod time/date: 1980-01-01
      v.setUint32(at + 10, crc, true)
      v.setUint32(at + 14, data.length, true)
      v.setUint32(at + 18, data.length, true)
      v.setUint16(at + 22, name.length, true)
    }
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    common(lv, 4)
    local.set(name, 30)
    const entry = new Uint8Array(46 + name.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    common(cv, 6)
    cv.setUint32(42, offset, true)
    entry.set(name, 46)
    parts.push(local, data)
    central.push(entry)
    offset += local.length + data.length
  }
  const size = central.reduce((k, e) => k + e.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, size, true)
  ev.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' })
}
