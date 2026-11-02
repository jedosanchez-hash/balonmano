const DB_NAME = 'handball_stats';
const DB_VERSION = 1;

export const STORE_NAMES = [
  'campeonatos',
  'equipos',
  'campeonatoEquipos',
  'jugadores',
  'plantillas',
  'partidos',
  'estadisticas',
];

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('campeonatos', { keyPath: 'id' });
      db.createObjectStore('equipos', { keyPath: 'id' });
      const campeonatoEquipos = db.createObjectStore('campeonatoEquipos', { keyPath: 'id' });
      campeonatoEquipos.createIndex('campeonatoId', 'campeonatoId');
      campeonatoEquipos.createIndex('equipoId', 'equipoId');
      db.createObjectStore('jugadores', { keyPath: 'id' });
      const plantillas = db.createObjectStore('plantillas', { keyPath: 'id' });
      plantillas.createIndex('campeonatoEquipoId', 'campeonatoEquipoId');
      const partidos = db.createObjectStore('partidos', { keyPath: 'id' });
      partidos.createIndex('campeonatoId', 'campeonatoId');
      const estadisticas = db.createObjectStore('estadisticas', { keyPath: 'id' });
      estadisticas.createIndex('partidoId', 'partidoId');
      estadisticas.createIndex('jugadorId', 'jugadorId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const rows = await wrap(store.getAll());
  return rows.filter((r) => !r.deleted);
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const rows = await wrap(store.index(indexName).getAll(value));
  return rows.filter((r) => !r.deleted);
}

export async function getById(storeName, id) {
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const row = await wrap(store.get(id));
  return row || null;
}

export async function put(storeName, record) {
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
  await wrap(store.put(record));
  return record;
}

export function newId(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

export function now() {
  return Date.now();
}

export function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem('hb_device_id');
  } catch (e) {
    /* localStorage unavailable; fall back to a per-session id */
  }
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem('hb_device_id', id);
    } catch (e) {
      /* best effort only */
    }
  }
  return id;
}

/** Campos de sincronización que debe llevar todo registro nuevo o editado. */
export function touch(record) {
  record.updatedAt = now();
  record.deviceId = getDeviceId();
  return record;
}

export async function softDelete(storeName, id) {
  const existing = await getById(storeName, id);
  if (!existing) return;
  existing.deleted = true;
  await put(storeName, touch(existing));
}
