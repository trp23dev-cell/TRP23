// ============================================================================
// GEOTIFF — just enough TIFF to read a float elevation raster.
//
// The Environment Agency's WCS hands back an uncompressed single-band float32
// TIFF. That is a small, very regular corner of the format, so this reads it
// directly rather than pulling in a full GeoTIFF library for one build script.
//
// Deliberately strict: anything outside that corner (compression, tiling, a
// different sample format) throws rather than returning quietly wrong heights.
// Silent nonsense here becomes a city built on a hill that is not there.
// ============================================================================

const TAG = {
  WIDTH: 256,
  HEIGHT: 257,
  BITS_PER_SAMPLE: 258,
  COMPRESSION: 259,
  STRIP_OFFSETS: 273,
  SAMPLES_PER_PIXEL: 277,
  ROWS_PER_STRIP: 278,
  STRIP_BYTE_COUNTS: 279,
  SAMPLE_FORMAT: 339,
  TILE_WIDTH: 322,
  TILE_LENGTH: 323,
  TILE_OFFSETS: 324,
  TILE_BYTE_COUNTS: 325,
};

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/**
 * @param {Buffer|ArrayBuffer} input
 * @returns {{width:number, height:number, data:Float32Array}} row-major, top-left origin
 */
export function readFloatTiff(input) {
  const buf = input instanceof ArrayBuffer ? Buffer.from(input) : input;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const magic = view.getUint16(0, false);
  const little = magic === 0x4949;
  if (!little && magic !== 0x4d4d) throw new Error("not a TIFF");
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);

  if (u16(2) !== 42) throw new Error("not a classic TIFF");

  const ifd = u32(4);
  const count = u16(ifd);
  const tags = new Map();
  for (let i = 0; i < count; i += 1) {
    const off = ifd + 2 + i * 12;
    const tag = u16(off);
    const type = u16(off + 2);
    const n = u32(off + 4);
    const size = (TYPE_SIZE[type] || 1) * n;
    const valueOffset = size > 4 ? u32(off + 8) : off + 8;
    const read = (k) => {
      const at = valueOffset + k * TYPE_SIZE[type];
      if (type === 3) return u16(at);
      if (type === 4) return u32(at);
      if (type === 1) return view.getUint8(at);
      return u32(at);
    };
    tags.set(tag, { n, read });
  }

  const one = (tag, fallback) => (tags.has(tag) ? tags.get(tag).read(0) : fallback);

  const width = one(TAG.WIDTH);
  const height = one(TAG.HEIGHT);
  if (!width || !height) throw new Error("TIFF has no dimensions");

  const compression = one(TAG.COMPRESSION, 1);
  if (compression !== 1) throw new Error(`compressed TIFF not supported (compression=${compression})`);

  const bits = one(TAG.BITS_PER_SAMPLE, 32);
  const format = one(TAG.SAMPLE_FORMAT, 3);
  const samples = one(TAG.SAMPLES_PER_PIXEL, 1);
  if (bits !== 32 || format !== 3) throw new Error(`expected float32 samples, got ${bits}-bit format ${format}`);
  if (samples !== 1) throw new Error(`expected a single band, got ${samples}`);

  const data = new Float32Array(width * height);

  // The same service answers in both layouts — a large window comes back as
  // strips, a small one as tiles — so both have to work.
  if (tags.has(TAG.TILE_OFFSETS)) {
    const tw = one(TAG.TILE_WIDTH);
    const th = one(TAG.TILE_LENGTH);
    const offsets = tags.get(TAG.TILE_OFFSETS);
    const across = Math.ceil(width / tw);

    for (let t = 0; t < offsets.n; t += 1) {
      const start = offsets.read(t);
      const originX = (t % across) * tw;
      const originY = Math.floor(t / across) * th;
      for (let y = 0; y < th; y += 1) {
        const dy = originY + y;
        if (dy >= height) break;
        for (let x = 0; x < tw; x += 1) {
          const dx = originX + x;
          // Tiles are padded out to full size at the right and bottom edges.
          if (dx >= width) continue;
          data[dy * width + dx] = view.getFloat32(start + (y * tw + x) * 4, little);
        }
      }
    }
    return { width, height, data };
  }

  const rowsPerStrip = one(TAG.ROWS_PER_STRIP, height);
  const offsets = tags.get(TAG.STRIP_OFFSETS);
  if (!offsets) throw new Error("TIFF has neither strip nor tile offsets");

  let written = 0;
  for (let s = 0; s < offsets.n; s += 1) {
    const start = offsets.read(s);
    const rows = Math.min(rowsPerStrip, height - s * rowsPerStrip);
    for (let i = 0; i < rows * width; i += 1) {
      data[written++] = view.getFloat32(start + i * 4, little);
    }
  }
  if (written !== width * height) {
    throw new Error(`TIFF short read: ${written} of ${width * height} samples`);
  }

  return { width, height, data };
}
