import { STORE_NAMES, openDatabase, getById, put, getDeviceId, now } from './db.js';

/**
 * Motor de integración de datos entre dispositivos sin servidor central:
 * exporta todas las tablas a un objeto plano, e importa/fusiona un export
 * generado en otro dispositivo usando "última escritura gana" por registro
 * (comparando updatedAt; en empate exacto con deviceId distinto se reporta
 * como conflicto para revisión manual en vez de decidir a ciegas).
 */
export async function buildExportPayload() {
  const payload = { exportedAt: now(), deviceId: getDeviceId(), stores: {} };
  for (const name of STORE_NAMES) {
    payload.stores[name] = await getAllIncludingDeleted(name);
  }
  return payload;
}

async function getAllIncludingDeleted(storeName) {
  // getAll() del módulo db filtra los borrados; aquí necesitamos exportar
  // también los tombstones para que un borrado se propague al importar.
  const db = await openDatabase();
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function decideAction(existing, incoming) {
  if (!existing) return 'insert';
  if (incoming.updatedAt > existing.updatedAt) return 'update';
  if (incoming.updatedAt === existing.updatedAt && existing.deviceId !== incoming.deviceId) {
    return 'conflict';
  }
  return 'skip';
}

export async function importPayload(payload) {
  const summary = { inserted: 0, updated: 0, skipped: 0, conflicts: [] };
  for (const name of STORE_NAMES) {
    const rows = payload.stores ? payload.stores[name] : null;
    if (!Array.isArray(rows)) continue;
    for (const incoming of rows) {
      if (!incoming || !incoming.id) continue;
      const existing = await getById(name, incoming.id);
      const action = decideAction(existing, incoming);
      if (action === 'insert') {
        await put(name, incoming);
        summary.inserted++;
      } else if (action === 'update') {
        await put(name, incoming);
        summary.updated++;
      } else if (action === 'conflict') {
        summary.conflicts.push(`${name}:${incoming.id}`);
      } else {
        summary.skipped++;
      }
    }
  }
  return summary;
}
