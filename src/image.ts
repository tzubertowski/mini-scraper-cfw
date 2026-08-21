import { mkdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { Jimp } from 'jimp';
import { decode, encode } from 'fast-png';
import createDebug from 'debug';
import { DownloadManager } from './cache.js';

const debug = createDebug('image');

export type Size = {
  width?: number;
  height?: number;
};

export type ImageOptions = Size & {
  downloadManager?: DownloadManager;
};

async function decodeImage(buffer: Uint8Array) {
  try {
    return await Jimp.read(Buffer.from(buffer));
  } catch (error_: unknown) {
    const error = error_ as Error;
    if (error.message?.includes('unrecognised content at end of stream')) {
      debug('Image contains trailing data, trying to repair the PNG...');
      const png = decode(buffer);
      const fixedPng = encode(png);
      return Jimp.read(Buffer.from(fixedPng));
    }

    throw error;
  }
}

export async function loadImage(url: string, downloadManager = new DownloadManager()) {
  url = encodeURI(url);
  const download = await downloadManager.get(url);
  try {
    return await decodeImage(download.buffer);
  } catch (error: unknown) {
    if (!download.fromCache) throw error;
    debug(`Cached image is invalid, downloading it again: "${url}"`);
    await downloadManager.invalidate(url);
    const refreshed = await downloadManager.get(url);
    return decodeImage(refreshed.buffer);
  }
}

export async function resizeImageTo(url: string, destination: string, size?: ImageOptions) {
  try {
    const width = size?.width ?? 300;
    const height = size?.height;
    const image = await loadImage(url, size?.downloadManager);
    const isLargerThanTaller = !height || image.bitmap.width >= image.bitmap.height;
    const imgWidth = isLargerThanTaller ? width : undefined;
    const imgHeight = isLargerThanTaller ? undefined : height;
    await mkdir(path.dirname(destination), { recursive: true });
    await image.resize({ w: imgWidth!, h: imgHeight }).write(destination as `${string}.${string}`);
    return true;
  } catch (error: unknown) {
    console.error(`Failed to download art from "${url}": ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function composeImageTo(
  url1: string | undefined,
  url2: string | undefined,
  destination: string,
  size?: ImageOptions
) {
  try {
    const width = size?.width ?? 300;
    const margin = Math.round((width * 5) / 100);
    const height = size?.height ?? width;
    await mkdir(path.dirname(destination), { recursive: true });
    const image1 = url1 ? await loadImage(url1, size?.downloadManager) : undefined;
    const image2 = url2 ? await loadImage(url2, size?.downloadManager) : undefined;
    const image = new Jimp({ width, height, color: 0x00_00_00_00 });

    if (image2) {
      const img2Width = image2.bitmap.width >= image2.bitmap.height ? width - margin : undefined;
      const img2Height = image2.bitmap.width < image2.bitmap.height ? height - margin : undefined;
      image2.resize({ w: img2Width!, h: img2Height });
      const image2Center = (height - image2.bitmap.height) / 2;
      image.composite(image2, 0, image2Center - margin);
    }

    if (image1) {
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const img1Width = image1.bitmap.width >= image1.bitmap.height ? halfWidth - margin : undefined;
      const img1Height = image1.bitmap.width < image1.bitmap.height ? halfHeight - margin : undefined;
      image1.resize({ w: img1Width!, h: img1Height });
      image.composite(image1, width - image1.bitmap.width, height - image1.bitmap.height);
    }

    await image.write(destination as `${string}.${string}`);
    return true;
  } catch (error: unknown) {
    console.error(
      `Failed to download art from "${url1}" or "${url2}": ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
