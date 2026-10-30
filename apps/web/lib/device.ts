/**
 * Poste enrôlé (docs/08) : paire Ed25519 générée dans le navigateur (clé privée non extractible,
 * conservée dans IndexedDB) ; chaque requête est signée « MÉTHODE\nCHEMIN\nHORODATAGE ».
 */
const DB = 'jupiter-device';
const STORE = 'keys';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface StoredDevice { id: string; privateKey: CryptoKey }

let cache: StoredDevice | null | undefined;

export async function loadDevice(): Promise<StoredDevice | null> {
  if (cache !== undefined) return cache;
  if (typeof indexedDB === 'undefined') return (cache = null);
  try {
    cache = ((await tx('readonly', (s) => s.get('device'))) as StoredDevice | undefined) ?? null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Génère la paire de clés ; renvoie la clé publique PEM à transmettre à l'API. */
export async function createDeviceKey(): Promise<{ publicKeyPem: string; save: (id: string) => Promise<void> }> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  const b64 = btoa(String.fromCharCode(...spki)).replace(/(.{64})/g, '$1\n');
  return {
    publicKeyPem: `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`,
    save: async (id: string) => {
      await tx('readwrite', (s) => s.put({ id, privateKey: kp.privateKey }, 'device'));
      cache = { id, privateKey: kp.privateKey };
    },
  };
}

export async function forgetDevice(): Promise<void> {
  await tx('readwrite', (s) => s.delete('device'));
  cache = null;
}

/** En-têtes de signature pour une requête vers l'API (chemin sans paramètres). */
export async function deviceHeaders(method: string, path: string): Promise<Record<string, string>> {
  const d = await loadDevice();
  if (!d) return {};
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, d.privateKey, new TextEncoder().encode(`${method.toUpperCase()}\n${path.split('?')[0]}\n${ts}`)));
  return { 'X-Device-Id': d.id, 'X-Device-Timestamp': ts, 'X-Device-Signature': btoa(String.fromCharCode(...sig)) };
}
