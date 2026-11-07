import 'server-only';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// SOS evidence lives in a private Netlify Blobs store. Nothing is public: files are
// only served by /api/evidence/[id] after the database confirms the viewer may see them.
// For local runs without Netlify, set EVIDENCE_LOCAL_DIR to keep files on disk instead.

const STORE = 'sos-evidence';

export const sha256 = (data: ArrayBuffer) => createHash('sha256').update(Buffer.from(data)).digest('hex');
const localDir = () => process.env.EVIDENCE_LOCAL_DIR;
const safe = (key: string) => key.replace(/[^a-zA-Z0-9/_.-]/g, '');

export async function putEvidence(key: string, data: ArrayBuffer, contentType: string) {
  const dir = localDir();
  if (dir) {
    const file = path.join(dir, safe(key));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data));
    await writeFile(`${file}.type`, contentType);
    return;
  }
  await getStore(STORE).set(key, data, { metadata: { contentType } });
}

export async function getEvidence(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const dir = localDir();
  if (dir) {
    try {
      const file = path.join(dir, safe(key));
      const buf = await readFile(file);
      const contentType = await readFile(`${file}.type`, 'utf8').catch(() => 'application/octet-stream');
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType };
    } catch {
      return null;
    }
  }
  const entry = await getStore({ name: STORE, consistency: 'strong' }).getWithMetadata(key, { type: 'arrayBuffer' });
  if (entry === null) return null;
  return { data: entry.data, contentType: String(entry.metadata?.contentType ?? 'application/octet-stream') };
}

/** Permanently deletes stored files (retention clean-up, account deletion). Missing files are ignored. */
export async function deleteEvidence(keys: string[]) {
  const dir = localDir();
  for (const key of keys) {
    try {
      if (dir) {
        const file = path.join(dir, safe(key));
        await rm(file, { force: true });
        await rm(`${file}.type`, { force: true });
      } else {
        await getStore(STORE).delete(key);
      }
    } catch (e) {
      console.error('Could not delete stored file', key, e);
    }
  }
}
