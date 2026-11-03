import { firebaseApp } from './db.js?v=3';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

// Cuenta compartida fija: el "usuario" real es el PIN del equipo (la
// contraseña). No hay login por persona, solo un candado para los datos.
const PIN_EMAIL = 'equipo@balonmano-stats.app';

const auth = getAuth(firebaseApp);

export function onAuthReady(callback) {
  onAuthStateChanged(auth, (user) => callback(!!user));
}

export async function signInWithPin(pin) {
  await signInWithEmailAndPassword(auth, PIN_EMAIL, pin);
}
