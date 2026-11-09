/**
 * scripts/lib/comparePixels.mjs: compares the two screenshots of one view, pixel by pixel. The computed
 * styles see what they list, and the pixels see the rest: a transform, a hidden element, a reversed row,
 * new words that leave every box the same size. Chrome draws a page at rest the same way each time, so a
 * pixel that differs is a change to read.
 *
 * It reads the PNG files Chrome writes: 8 bits per channel, grey, grey and alpha, RGB or RGBA, not
 * interlaced. Any other PNG is compared as its decoded bytes, which says whether the shots differ but not
 * by how many pixels. Node's zlib is all it needs.
 *
 * HOW TO CHANGE IT
 *   Another kind of PNG: CHANNELS_BY_COLOUR_TYPE, and a test with a file of that kind.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHUNK_HEADER = 8;
const CHUNK_TAIL = 4;
const SUPPORTED_DEPTH = 8;

/** How many bytes a pixel takes, by the PNG colour type. */
const CHANNELS_BY_COLOUR_TYPE = Object.freeze({ 0: 1, 2: 3, 4: 2, 6: 4 });

/** The PNG's header and its image data, still compressed: { width, height, depth, colourType, interlace, data }. */
function readChunks(bytes) {
  if (!bytes.subarray(0, SIGNATURE.length).equals(SIGNATURE)) return null;
  const parts = [];
  let header = null;
  let offset = SIGNATURE.length;
  while (offset + CHUNK_HEADER <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + CHUNK_HEADER);
    const body = bytes.subarray(offset + CHUNK_HEADER, offset + CHUNK_HEADER + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colourType: body[9], interlace: body[12] };
    }
    if (type === 'IDAT') parts.push(body);
    if (type === 'IEND') break;
    offset += CHUNK_HEADER + length + CHUNK_TAIL;
  }
  return header === null ? null : { ...header, data: Buffer.concat(parts) };
}

/** The Paeth predictor of the PNG standard. */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** The value a row's filter adds back to one byte. */
function predictor(filter, left, up, upLeft) {
  switch (filter) {
    case 1: return left;
    case 2: return up;
    case 3: return (left + up) >> 1;
    case 4: return paeth(left, up, upLeft);
    default: return 0;
  }
}

/** Undoes each row's filter. `stride` is a row's bytes, `step` a pixel's. */
function unfilter(raw, { height, stride, step }) {
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const lineStart = row * (stride + 1) + 1;
    const here = row * stride;
    const above = here - stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= step ? pixels[here + index - step] : 0;
      const up = row > 0 ? pixels[above + index] : 0;
      const upLeft = row > 0 && index >= step ? pixels[above + index - step] : 0;
      pixels[here + index] = (raw[lineStart + index] + predictor(filter, left, up, upLeft)) & 0xff;
    }
  }
  return pixels;
}

/**
 * One PNG file as { width, height, step, raw }: its size, a pixel's bytes, and its image data inflated but
 * still filtered. `step` is null when this reader cannot read its pixels. Null for a file that is no PNG.
 */
export function readPng(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return null;
  }
  const png = readChunks(bytes);
  if (png === null) return null;
  const known = CHANNELS_BY_COLOUR_TYPE[png.colourType];
  const readable = known !== undefined && png.depth === SUPPORTED_DEPTH && png.interlace === 0;
  return { width: png.width, height: png.height, step: readable ? known : null, raw: zlib.inflateSync(png.data) };
}

/** A PNG's pixels, one `step` of bytes each, row after row. */
function pixelsOf({ width, height, step, raw }) {
  return unfilter(raw, { height, stride: width * step, step });
}

/** True when two pixels at one index differ. */
function pixelDiffers(a, b, start, step) {
  for (let offset = 0; offset < step; offset += 1) {
    if (a[start + offset] !== b[start + offset]) return true;
  }
  return false;
}

/**
 * The two shots of a view compared: { compared, differing, total }. `compared` is false when a shot is
 * missing or no PNG. Shots of two sizes differ in every pixel. `differing` is null when the shots differ
 * and this reader cannot count by how many pixels.
 */
export function comparePixels(beforeFile, afterFile) {
  const before = readPng(beforeFile);
  const after = readPng(afterFile);
  if (before === null || after === null) return { compared: false, differing: null, total: null };
  const total = Math.max(before.width * before.height, after.width * after.height);
  const sameSize = before.width === after.width && before.height === after.height;
  if (!sameSize) return { compared: true, differing: total, total };
  if (before.raw.equals(after.raw)) return { compared: true, differing: 0, total };
  if (before.step === null || after.step === null || before.step !== after.step) return { compared: true, differing: null, total };
  const [a, b] = [pixelsOf(before), pixelsOf(after)];
  let differing = 0;
  for (let start = 0; start < a.length; start += before.step) {
    if (pixelDiffers(a, b, start, before.step)) differing += 1;
  }
  return { compared: true, differing, total };
}
