import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredFile {
  key: string;
  publicUrl: string;
  isPrivate: boolean;
}

export interface StorageProvider {
  name: string;
  savePublicImage(buffer: Buffer, mimeType: string, folder: string): Promise<StoredFile>;
  savePrivateDocument(buffer: Buffer, mimeType: string, folder: string): Promise<StoredFile>;
  getSignedPrivateUrl(key: string, ttlSeconds?: number): string;
  readPrivateFile(key: string): { buffer: Buffer; mimeType: string } | null;
  readPublicFile(key: string): { buffer: Buffer; mimeType: string } | null;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOC_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || 'dev-session-secret-change-in-production';
}

export class LocalDiskStorageProvider implements StorageProvider {
  name = 'local';
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir || process.env.UPLOAD_DIR || './uploads');
    fs.mkdirSync(path.join(this.baseDir, 'public'), { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, 'private'), { recursive: true });
  }

  async savePublicImage(buffer: Buffer, mimeType: string, folder: string): Promise<StoredFile> {
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      throw new Error('Only JPEG, PNG, and WebP images are allowed.');
    }
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Image exceeds 5 MB limit.');
    }
    const ext = MIME_TO_EXT[mimeType] || 'jpg';
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(this.baseDir, 'public', safeFolder);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const key = `${safeFolder}/${fileName}`;
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return {
      key,
      publicUrl: `/api/files/public/${key}`,
      isPrivate: false,
    };
  }

  async savePrivateDocument(buffer: Buffer, mimeType: string, folder: string): Promise<StoredFile> {
    if (!ALLOWED_DOC_MIMES.has(mimeType)) {
      throw new Error('Only PDF, JPEG, PNG, or WebP documents are allowed.');
    }
    if (buffer.length > 8 * 1024 * 1024) {
      throw new Error('Document exceeds 8 MB limit.');
    }
    const ext = MIME_TO_EXT[mimeType] || 'pdf';
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const dir = path.join(this.baseDir, 'private', safeFolder);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const key = `${safeFolder}/${fileName}`;
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return {
      key,
      publicUrl: this.getSignedPrivateUrl(key),
      isPrivate: true,
    };
  }

  getSignedPrivateUrl(key: string, ttlSeconds = 900): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signPrivateKey(key, exp);
    return `/api/files/private?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
  }

  readPrivateFile(key: string): { buffer: Buffer; mimeType: string } | null {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    const full = path.resolve(this.baseDir, 'private', normalized);
    if (!full.startsWith(path.resolve(this.baseDir, 'private'))) return null;
    if (!fs.existsSync(full)) return null;
    const ext = path.extname(full).toLowerCase();
    return {
      buffer: fs.readFileSync(full),
      mimeType: EXT_TO_MIME[ext] || 'application/octet-stream',
    };
  }

  readPublicFile(key: string): { buffer: Buffer; mimeType: string } | null {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, '');
    const full = path.resolve(this.baseDir, 'public', normalized);
    if (!full.startsWith(path.resolve(this.baseDir, 'public'))) return null;
    if (!fs.existsSync(full)) return null;
    const ext = path.extname(full).toLowerCase();
    return {
      buffer: fs.readFileSync(full),
      mimeType: EXT_TO_MIME[ext] || 'application/octet-stream',
    };
  }
}

export function signPrivateKey(key: string, exp: number): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${key}:${exp}`)
    .digest('hex');
}

export function verifyPrivateKeySignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = signPrivateKey(key, exp);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export function getStorageProvider(): StorageProvider {
  // Supabase / S3 adapter can be switched on via STORAGE_PROVIDER=supabase + credentials
  return new LocalDiskStorageProvider();
}
