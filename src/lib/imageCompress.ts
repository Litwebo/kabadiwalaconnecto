export interface CompressedImage {
  blob: Blob;
  base64: string;
  previewUrl: string;
  originalKb: number;
  compressedKb: number;
}

/**
 * Compresses an uploaded image in-browser to max 1280px and 80% JPEG quality.
 * Re-encoding through HTML5 Canvas also strips EXIF metadata (including GPS).
 */
export async function compressImageForUpload(
  file: File,
  maxDimension = 1280,
  quality = 0.8
): Promise<CompressedImage> {
  const originalKb = Math.round(file.size / 1024);
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not read selected image.'));
      image.src = objectUrl;
    });

    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Image compression failed.'));
        },
        'image/jpeg',
        quality
      );
    });

    const base64 = canvas.toDataURL('image/jpeg', quality);
    return {
      blob,
      base64,
      previewUrl: base64,
      originalKb,
      compressedKb: Math.max(1, Math.round(blob.size / 1024)),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
