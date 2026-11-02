import { firebaseConfig } from './firebase-config.js?v=2';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

export const STORE_NAMES = [
  'campeonatos',
  'equipos',
  'campeonatoEquipos',
  'jugadores',
  'plantillas',
  'partidos',
  'estadisticas',
];

const firebaseApp = initializeApp(firebaseConfig);
const firestore = getFirestore(firebaseApp);

export function openDatabase() {
  return Promise.resolve(firestore);
}

export async function getAll(storeName) {
  const snap = await getDocs(collection(firestore, storeName));
  return snap.docs.map((d) => d.data()).filter((r) => !r.deleted);
}

export async function getAllByIndex(storeName, indexName, value) {
  const q = query(collection(firestore, storeName), where(indexName, '==', value));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data()).filter((r) => !r.deleted);
}

export async function getById(storeName, id) {
  const snap = await getDoc(doc(firestore, storeName, id));
  return snap.exists() ? snap.data() : null;
}

export async function put(storeName, record) {
  await setDoc(doc(firestore, storeName, record.id), record);
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

/** Campos de metadata que debe llevar todo registro nuevo o editado. */
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
