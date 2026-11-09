/**
 * scripts/__tests__/comparePixels.test.mjs: the screenshot comparison, on PNG files written here with
 * zlib, in each colour type Chrome or another tool may write, with every row filter.
 *
 * HOW TO CHANGE IT
 *   Another kind of PNG for comparePixels.mjs: a writer here, and a test that reads it.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { comparePixels, readPng } from '../lib/comparePixels.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** One PNG chunk. The checksum is left at 0: the reader does not check it. */
function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), body, Buffer.alloc(4)]);
}

/** The Paeth predictor, written out again here from the PNG standard, so the reader is checked against it. */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) => Math.abs(estimate - value));
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Filters one row of bytes as the PNG standard does, against the row above. */
function filterRow(filter, rowBytes, above, step) {
  const out = Buffer.alloc(rowBytes.length);
  for (let index = 0; index < rowBytes.length; index += 1) {
    const left = index >= step ? rowBytes[index - step] : 0;
    const up = above ? above[index] : 0;
    const upLeft = above && index >= step ? above[index - step] : 0;
    const predictors = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)];
    out[index] = (rowBytes[index] - predictors[filter]) & 0xff;
  }
  return out;
}

/** Writes a PNG of `pixels` (rows of byte arrays), each row with the next filter in turn. */
function writePng(file, { width, height, colourType = 6, step = 4, pixels, depth = 8, interlace = 0 }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  Object.assign(header, { 8: depth, 9: colourType, 10: 0, 11: 0, 12: interlace });
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    const filter = row % 5;
    const bytes = Buffer.from(pixels[row]);
    rows.push(Buffer.from([filter]), filterRow(filter, bytes, row > 0 ? Buffer.from(pixels[row - 1]) : null, step));
  }
  const data = zlib.deflateSync(Buffer.concat(rows));
  fs.writeFileSync(file, Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', data), chunk('IEND', Buffer.alloc(0))]));
}

/** A picture of `width` by `height` RGBA pixels, each a function of its place. */
function picture(width, height, paint = () => [10, 20, 30, 255]) {
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => paint(x, y)).flat());
}

/** A folder for the files of one test. */
function folder(t) {
  const made = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-pixels-'));
  t.after(() => fs.rmSync(made, { recursive: true, force: true }));
  return made;
}

const gradient = (x, y) => [x * 9 % 256, y * 7 % 256, (x + y) % 256, 255];

test('a PNG reads back the pixels written, through every row filter', (t) => {
  const file = path.join(folder(t), 'a.png');
  const pixels = picture(7, 10, gradient);
  writePng(file, { width: 7, height: 10, pixels });
  const png = readPng(file);
  assert.deepEqual([png.width, png.height, png.step], [7, 10, 4]);
  const same = path.join(path.dirname(file), 'b.png');
  writePng(same, { width: 7, height: 10, pixels });
  assert.deepEqual(comparePixels(file, same), { compared: true, differing: 0, total: 70 });
});

test('the count is the pixels that differ, whichever channel moved', (t) => {
  const where = folder(t);
  const [before, after] = ['before.png', 'after.png'].map((name) => path.join(where, name));
  writePng(before, { width: 6, height: 5, pixels: picture(6, 5, gradient) });
  const changed = (x, y) => (x === 2 && y < 3 ? [...gradient(x, y).slice(0, 3), 128] : gradient(x, y));
  writePng(after, { width: 6, height: 5, pixels: picture(6, 5, changed) });
  assert.deepEqual(comparePixels(before, after), { compared: true, differing: 3, total: 30 });
});

test('RGB and grey pictures are read too, and two sizes differ in every pixel', (t) => {
  const where = folder(t);
  const rgb = (x, y) => gradient(x, y).slice(0, 3);
  writePng(path.join(where, 'a.png'), { width: 4, height: 4, colourType: 2, step: 3, pixels: picture(4, 4, rgb) });
  writePng(path.join(where, 'b.png'), { width: 4, height: 4, colourType: 2, step: 3, pixels: picture(4, 4, (x, y) => (x === 1 && y === 1 ? [1, 2, 3] : rgb(x, y))) });
  assert.deepEqual(comparePixels(path.join(where, 'a.png'), path.join(where, 'b.png')), { compared: true, differing: 1, total: 16 });
  writePng(path.join(where, 'grey.png'), { width: 3, height: 2, colourType: 0, step: 1, pixels: picture(3, 2, (x) => [x * 40]) });
  assert.equal(readPng(path.join(where, 'grey.png')).step, 1);
  writePng(path.join(where, 'tall.png'), { width: 4, height: 5, colourType: 2, step: 3, pixels: picture(4, 5, rgb) });
  assert.deepEqual(comparePixels(path.join(where, 'a.png'), path.join(where, 'tall.png')), { compared: true, differing: 20, total: 20 });
});

test('a missing shot, or a file that is no PNG, is not compared', (t) => {
  const where = folder(t);
  writePng(path.join(where, 'a.png'), { width: 2, height: 2, pixels: picture(2, 2) });
  fs.writeFileSync(path.join(where, 'text.png'), 'not a picture');
  assert.equal(comparePixels(path.join(where, 'a.png'), path.join(where, 'gone.png')).compared, false);
  assert.equal(comparePixels(path.join(where, 'a.png'), path.join(where, 'text.png')).compared, false);
});

test('a PNG this reader cannot read pixel by pixel still says whether it differs', (t) => {
  const where = folder(t);
  const sixteen = { width: 2, height: 2, depth: 16, colourType: 2, step: 6 };
  writePng(path.join(where, 'a.png'), { ...sixteen, pixels: picture(2, 2, () => [1, 2, 3, 4, 5, 6]) });
  writePng(path.join(where, 'b.png'), { ...sixteen, pixels: picture(2, 2, () => [1, 2, 3, 4, 5, 6]) });
  writePng(path.join(where, 'c.png'), { ...sixteen, pixels: picture(2, 2, () => [9, 2, 3, 4, 5, 6]) });
  assert.equal(readPng(path.join(where, 'a.png')).step, null);
  assert.deepEqual(comparePixels(path.join(where, 'a.png'), path.join(where, 'b.png')), { compared: true, differing: 0, total: 4 });
  assert.deepEqual(comparePixels(path.join(where, 'a.png'), path.join(where, 'c.png')), { compared: true, differing: null, total: 4 });
});
