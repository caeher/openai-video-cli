import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { processMedia } from '../src/media/index.js';

const root = resolve('examples/assets');
await mkdir(root, { recursive: true });
const pixels = Buffer.alloc(640 * 360 * 3);
const mask = Buffer.alloc(640 * 360);
for (let y = 0; y < 360; y++)
  for (let x = 0; x < 640; x++) {
    const index = (y * 640 + x) * 3;
    pixels[index] = y < 180 ? 120 + Math.floor(x / 8) : 15;
    pixels[index + 1] = y < 180 ? 180 : 100 + Math.floor(x / 8);
    pixels[index + 2] = y < 180 ? 220 : 180;
    mask[y * 640 + x] = y < 180 ? 0 : 255;
  }
await sharp(pixels, { raw: { width: 640, height: 360, channels: 3 } })
  .png()
  .toFile(`${root}/landscape.png`);
await sharp(mask, { raw: { width: 640, height: 360, channels: 1 } })
  .png()
  .toFile(`${root}/water-mask.png`);
const signal = new AbortController().signal;
await processMedia(
  'animate-image',
  {
    input: `${root}/landscape.png`,
    output: `${root}/clip-a.mp4`,
    size: '640x360',
    fps: 24,
    seconds: 2,
    effect: 'zoom-in',
  },
  signal,
);
await processMedia(
  'animate-image',
  {
    input: `${root}/landscape.png`,
    output: `${root}/clip-b.mp4`,
    size: '640x360',
    fps: 24,
    seconds: 2,
    effect: 'pan-right',
  },
  signal,
);
console.log(
  JSON.stringify({
    mode: 'local',
    aiGenerated: false,
    assets: root,
    note: 'Synthetic geometric test assets; no AI request.',
  }),
);
