// ZIP mínimo (sin dependencias): cada archivo comprimido con deflate, o guardado tal cual si no achica.
import { crc32, deflateRawSync } from 'node:zlib'

export type ZipEntry = { path: string; data: Buffer | string }

/** Fecha y hora en el formato de MS-DOS que usa el ZIP. */
function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export function zip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosTime(now)
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8')
    const raw = typeof e.data === 'string' ? Buffer.from(e.data, 'utf8') : e.data
    const deflated = deflateRawSync(raw)
    const stored = deflated.length >= raw.length
    const body = stored ? raw : deflated
    const crc = crc32(raw)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // versión necesaria
    head.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    head.writeUInt16LE(stored ? 0 : 8, 8)
    head.writeUInt16LE(time, 10)
    head.writeUInt16LE(date, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(body.length, 18)
    head.writeUInt32LE(raw.length, 22)
    head.writeUInt16LE(name.length, 26)
    head.writeUInt16LE(0, 28)
    locals.push(head, name, body)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(time, 12)
    dir.writeUInt16LE(date, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(body.length, 20)
    dir.writeUInt32LE(raw.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    central.push(dir, name)
    offset += head.length + name.length + body.length
  }
  const dirSize = central.reduce((a, b) => a + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dirSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...central, end])
}
