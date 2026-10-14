import { mkdtemp, rm, link } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { fileHash, inputPath, outputPath } from '../utils/files.js';
import { AppError } from '../errors/index.js';
import { runProcess } from './process.js';

const probeSchema = z.object({
  format: z.object({
    format_name: z.string(),
    duration: z.string().optional(),
    size: z.string().optional(),
  }),
  streams: z.array(
    z.object({
      index: z.number(),
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      r_frame_rate: z.string().optional(),
      duration: z.string().optional(),
    }),
  ),
});
export type MediaInfo = z.infer<typeof probeSchema>;
export async function inspectMedia(input: string, signal?: AbortSignal): Promise<MediaInfo> {
  const file = await inputPath(input);
  const result = await runProcess(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      file,
    ],
    { signal, timeoutMs: 30000 },
  );
  const info = probeSchema.parse(JSON.parse(result.stdout));
  if (!info.streams.some((s) => ['video', 'audio'].includes(s.codec_type)))
    throw new AppError('INVALID_MEDIA', 'File has no recognized audio or video stream.');
  return info;
}
export async function inspectImage(input: string) {
  const file = await inputPath(input, 50 * 1024 * 1024);
  const meta = await sharp(file, { limitInputPixels: 40000000, failOn: 'warning' }).metadata();
  if (
    !meta.format ||
    !['png', 'jpeg', 'webp'].includes(meta.format) ||
    !meta.width ||
    !meta.height ||
    (meta.pages ?? 1) > 1
  )
    throw new AppError(
      'IMAGE_FORMAT',
      'Use a single-frame PNG, JPEG or WebP image up to 50 MiB and 40 megapixels.',
    );
  return {
    path: file,
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: meta.hasAlpha,
    bytes: meta.size,
  };
}
export function dimensions(value: string) {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(value);
  if (!match) throw new AppError('INVALID_SIZE', 'Resolution must be WIDTHxHEIGHT.');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 16 || height < 16 || width > 7680 || height > 7680 || width % 2 || height % 2)
    throw new AppError('INVALID_SIZE', 'Dimensions must be even numbers from 16 to 7680.');
  return { width, height };
}
export type MediaOperation =
  | 'resize'
  | 'trim'
  | 'concat'
  | 'extract-frame'
  | 'thumbnail'
  | 'transcode'
  | 'audio'
  | 'animate-image';
export const mediaOptionsSchema = z.strictObject({
  input: z.string().optional(),
  inputs: z.array(z.string()).optional(),
  output: z.string().min(1),
  size: z.string().default('1280x720'),
  fps: z.number().int().min(1).max(120).default(30),
  start: z.number().min(0).default(0),
  seconds: z.number().positive().max(86400).default(8),
  at: z.number().min(0).default(0),
  codec: z.enum(['h264', 'h265', 'vp9']).default('h264'),
  audioMode: z.enum(['extract', 'remove', 'replace']).default('extract'),
  audioInput: z.string().optional(),
  effect: z
    .enum(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'ken-burns'])
    .default('ken-burns'),
  transition: z.enum(['cut', 'fade', 'wipeleft', 'slideright']).default('cut'),
  transitionSeconds: z.number().positive().max(10).default(0.5),
  maxFileBytes: z.number().int().min(1024).max(2147483648).default(536870912),
});
export type MediaOptions = z.input<typeof mediaOptionsSchema>;
const inputArgs = (path: string) => ['-protocol_whitelist', 'file,pipe', '-i', path];
const videoCodec = (name: 'h264' | 'h265' | 'vp9') =>
  name === 'h264'
    ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20']
    : name === 'h265'
      ? ['-c:v', 'libx265', '-crf', '24']
      : ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0'];
const normalizeFilter = (width: number, height: number, fps: number) =>
  `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS`;

/** Every output is rendered to a private temporary path and published only after inspection. */
export async function processMedia(
  operation: MediaOperation,
  raw: MediaOptions,
  signal: AbortSignal,
  onProgress?: (percent: number) => void,
) {
  const options = mediaOptionsSchema.parse(raw);
  const { width, height } = dimensions(options.size);
  if (operation === 'concat' && options.input)
    throw new AppError('OPTION_CONFLICT', 'Concat accepts --inputs, not --input.');
  if (operation !== 'concat' && options.inputs)
    throw new AppError('OPTION_CONFLICT', '--inputs is only supported by concat.');
  if (operation !== 'audio' && options.audioInput)
    throw new AppError('OPTION_CONFLICT', '--audio-input is only supported by audio replace.');
  const output = await outputPath(options.output);
  const extension = extname(output).toLowerCase();
  if (['extract-frame', 'thumbnail'].includes(operation)) {
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
      throw new AppError('OUTPUT_FORMAT', 'Frame output must be PNG, JPEG or WebP.');
  } else if (operation === 'audio' && options.audioMode === 'extract') {
    if (!['.wav', '.mp3', '.m4a', '.flac'].includes(extension))
      throw new AppError('OUTPUT_FORMAT', 'Audio output must be WAV, MP3, M4A or FLAC.');
  } else if (!['.mp4', '.mov', '.mkv', '.webm'].includes(extension))
    throw new AppError('OUTPUT_FORMAT', 'Video output must be MP4, MOV, MKV or WebM.');
  if (extension === '.webm' && options.codec !== 'vp9')
    throw new AppError('CODEC_CONTAINER', 'WebM requires --codec vp9.');
  const tempDir = await mkdtemp(join(dirname(output), '.oaivideo-'));
  const temp = join(tempDir, `result${extension}`);
  try {
    const args: string[] = [];
    let duration = options.seconds;
    if (operation === 'concat') {
      if (!options.inputs || options.inputs.length < 2 || options.inputs.length > 64)
        throw new AppError('CONCAT_INPUTS', 'Concat requires 2–64 input clips.');
      const files: string[] = [];
      const infos: MediaInfo[] = [];
      for (const input of options.inputs) {
        const file = await inputPath(input, options.maxFileBytes);
        files.push(file);
        infos.push(await inspectMedia(file, signal));
      }
      const lengths = infos.map((info) => Number(info.format.duration));
      if (lengths.some((d) => !Number.isFinite(d) || d <= options.transitionSeconds))
        throw new AppError(
          'INVALID_DURATION',
          'Every clip must have a known duration longer than the transition.',
        );
      for (const file of files) args.push(...inputArgs(file));
      const filters: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (!infos[i]!.streams.some((s) => s.codec_type === 'video'))
          throw new AppError('INVALID_MEDIA', 'Concat needs a video stream in every clip.');
        filters.push(`[${i}:v:0]${normalizeFilter(width, height, options.fps)}[v${i}]`);
        const audio = infos[i]!.streams.some((s) => s.codec_type === 'audio');
        filters.push(
          audio
            ? `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${lengths[i]},asetpts=PTS-STARTPTS[a${i}]`
            : `anullsrc=r=48000:cl=stereo,atrim=duration=${lengths[i]},asetpts=PTS-STARTPTS[a${i}]`,
        );
      }
      duration = lengths.reduce((a, b) => a + b, 0);
      if (options.transition === 'cut')
        filters.push(
          `${files.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${files.length}:v=1:a=1[vout][aout]`,
        );
      else {
        let elapsed = lengths[0]!;
        for (let i = 1; i < files.length; i++) {
          const previousV = i === 1 ? 'v0' : `vx${i - 1}`;
          const previousA = i === 1 ? 'a0' : `ax${i - 1}`;
          const outV = i === files.length - 1 ? 'vout' : `vx${i}`;
          const outA = i === files.length - 1 ? 'aout' : `ax${i}`;
          filters.push(
            `[${previousV}][v${i}]xfade=transition=${options.transition}:duration=${options.transitionSeconds}:offset=${elapsed - options.transitionSeconds}[${outV}]`,
          );
          filters.push(`[${previousA}][a${i}]acrossfade=d=${options.transitionSeconds}[${outA}]`);
          elapsed += lengths[i]! - options.transitionSeconds;
        }
        duration = elapsed;
      }
      args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]');
    } else if (operation === 'animate-image') {
      if (!options.input) throw new AppError('INPUT_REQUIRED', 'An image input is required.');
      await inputPath(options.input, options.maxFileBytes);
      const image = await inspectImage(options.input);
      const frames = Math.ceil(options.seconds * options.fps);
      const step = 0.15 / Math.max(1, frames - 1);
      const zoom =
        options.effect === 'zoom-out'
          ? `max(1.15-on*${step},1)`
          : options.effect.startsWith('pan-')
            ? '1.15'
            : `min(1+on*${step},1.15)`;
      const x =
        options.effect === 'pan-left'
          ? `(iw-iw/zoom)*(1-on/${frames})`
          : options.effect === 'pan-right' || options.effect === 'ken-burns'
            ? `(iw-iw/zoom)*on/${frames}`
            : 'iw/2-iw/zoom/2';
      args.push(
        ...inputArgs(image.path),
        '-vf',
        `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},zoompan=z='${zoom}':x='${x}':y='ih/2-ih/zoom/2':d=${frames}:s=${width}x${height}:fps=${options.fps}`,
        '-t',
        String(options.seconds),
        '-an',
      );
    } else {
      if (!options.input) throw new AppError('INPUT_REQUIRED', 'An input file is required.');
      const input = await inputPath(options.input, options.maxFileBytes);
      const info = await inspectMedia(input, signal);
      duration = Number(info.format.duration) || options.seconds;
      args.push(...inputArgs(input));
      if (operation === 'resize') args.push('-vf', normalizeFilter(width, height, options.fps));
      if (operation === 'trim') {
        if (options.start + options.seconds > duration + 0.05)
          throw new AppError('TRIM_RANGE', 'Trim range exceeds the input duration.');
        args.push('-ss', String(options.start), '-t', String(options.seconds));
        duration = options.seconds;
      }
      if (operation === 'extract-frame' || operation === 'thumbnail') {
        if (options.at >= duration)
          throw new AppError('FRAME_RANGE', 'Frame time must be within the input duration.');
        args.push('-ss', String(options.at), '-frames:v', '1', '-an');
        if (operation === 'thumbnail')
          args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease`);
      }
      if (operation === 'transcode') args.push('-vf', `fps=${options.fps},format=yuv420p`);
      if (operation === 'audio') {
        if (options.audioMode === 'extract') {
          if (!info.streams.some((s) => s.codec_type === 'audio'))
            throw new AppError('NO_AUDIO', 'Input has no audio stream.');
          args.push('-vn');
        }
        if (options.audioMode === 'remove') args.push('-map', '0:v:0', '-an');
        if (options.audioMode === 'replace') {
          if (!options.audioInput)
            throw new AppError('AUDIO_INPUT_REQUIRED', 'Use --audio-input for replacement.');
          const audio = await inputPath(options.audioInput, options.maxFileBytes);
          const audioInfo = await inspectMedia(audio, signal);
          if (!audioInfo.streams.some((s) => s.codec_type === 'audio'))
            throw new AppError('NO_AUDIO', 'Replacement has no audio stream.');
          args.push(
            ...inputArgs(audio),
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-af',
            'apad',
            '-t',
            String(duration),
          );
        }
      }
    }
    const frame = ['extract-frame', 'thumbnail'].includes(operation);
    const audioOnly = operation === 'audio' && options.audioMode === 'extract';
    if (!frame && !audioOnly)
      args.push(
        ...videoCodec(options.codec),
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '2',
        ...(extension === '.webm' ? ['-c:a', 'libopus'] : ['-c:a', 'aac']),
        ...(extension === '.mp4' ? ['-movflags', '+faststart'] : []),
      );
    await runProcess(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-v',
        'error',
        '-filter_threads',
        '1',
        '-filter_complex_threads',
        '1',
        ...args,
        '-progress',
        'pipe:1',
        '-n',
        temp,
      ],
      {
        signal,
        timeoutMs: Math.max(300000, duration * 30000),
        onLine: (line) => {
          if (line.startsWith('out_time_us='))
            onProgress?.(Math.min(99, (Number(line.slice(12)) / 1000000 / duration) * 100));
        },
      },
    );
    await inputPath(temp, options.maxFileBytes);
    const info = frame ? await inspectImage(temp) : await inspectMedia(temp, signal);
    signal.throwIfAborted();
    await link(temp, output);
    onProgress?.(100);
    return {
      mode: 'local',
      aiGenerated: false,
      operation,
      output,
      sha256: await fileHash(output),
      duration: frame ? null : duration,
      info,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
