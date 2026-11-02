import {
  getAll,
  getAllByIndex,
  getById,
  put,
  newId,
  touch,
  getDeviceId,
  softDelete,
} from './db.js';
import { buildExportPayload, importPayload } from './sync.js';

const POSICIONES = ['portero', 'extremo', 'lateral', 'central', 'pivote'];

const state = {
  campeonatoActivoId: safeLocalStorageGet('hb_campeonato_activo'),
  partidoDetailId: null,
  plantillaEquipoId: null,
  plantillaEquipoNombre: '',
};

let activeTab = 'campeonatos';

// ---------- utilidades ----------

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function saveActiveCampeonato(id) {
  state.campeonatoActivoId = id;
  try {
    if (id) localStorage.setItem('hb_campeonato_activo', id);
    else localStorage.removeItem('hb_campeonato_activo');
  } catch (e) {
    /* best effort */
  }
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function dateInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function datetimeInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function estadoLabel(estado) {
  return { programado: 'Programado', en_curso: 'En curso', finalizado: 'Finalizado' }[estado] || estado;
}

function estadoPillClass(estado) {
  return { programado: 'neutral', en_curso: 'warning', finalizado: 'success' }[estado] || 'neutral';
}

let toastEl = null;
function showToast(message) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    Object.assign(toastEl.style, {
      position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--color-text)', color: 'var(--color-bg)', padding: '10px 16px',
      borderRadius: '8px', fontSize: '0.85rem', zIndex: '1000', maxWidth: '85vw',
      textAlign: 'center', transition: 'opacity 0.3s', opacity: '0',
    });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.opacity = '1';
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.style.opacity = '0'; }, 3000);
}

// ---------- diálogos genéricos ----------

function openForm({ title, fields, initial = {}, submitLabel = 'Guardar', onSubmit }) {
  const dialog = document.getElementById('dialog-form');
  document.getElementById('dialog-form-title').textContent = title;
  const fieldsContainer = document.getElementById('dialog-form-fields');
  fieldsContainer.innerHTML = '';
  const inputs = {};

  for (const f of fields) {
    const label = document.createElement('label');
    label.textContent = f.label;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        input.appendChild(o);
      }
    } else if (f.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
    }
    input.name = f.name;
    if (f.required) input.required = true;
    const initialVal = initial[f.name];
    if (f.type === 'checkbox') input.checked = !!initialVal;
    else if (initialVal !== undefined && initialVal !== null) input.value = initialVal;
    label.appendChild(input);
    fieldsContainer.appendChild(label);
    inputs[f.name] = input;
  }

  const form = document.getElementById('dialog-form-inner');
  const cancelBtn = document.getElementById('dialog-cancel');
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.textContent = submitLabel;

  let submitted = false;
  let submittedValues = null;

  function handleSubmit(e) {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      const input = inputs[f.name];
      if (f.type === 'checkbox') values[f.name] = input.checked;
      else if (f.type === 'number') values[f.name] = input.value === '' ? null : Number(input.value);
      else values[f.name] = input.value;
    }
    submitted = true;
    submittedValues = values;
    dialog.close();
  }
  function handleCancel() { dialog.close(); }
  function handleDialogClose() {
    form.removeEventListener('submit', handleSubmit);
    cancelBtn.removeEventListener('click', handleCancel);
    dialog.removeEventListener('close', handleDialogClose);
    if (submitted) onSubmit(submittedValues);
  }

  form.addEventListener('submit', handleSubmit);
  cancelBtn.addEventListener('click', handleCancel);
  dialog.addEventListener('close', handleDialogClose);
  dialog.showModal();
}

function openPicker({ title, items, labelFn, onPick, emptyMessage }) {
  const dialog = document.getElementById('dialog-picker');
  document.getElementById('dialog-picker-title').textContent = title;
  const list = document.getElementById('dialog-picker-list');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage || 'No hay opciones disponibles.')}</div>`;
  }
  const cancelBtn = document.getElementById('dialog-picker-cancel');
  let picked = null;
  const bound = [];
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.style.textAlign = 'left';
    btn.textContent = labelFn(item);
    const handler = () => { picked = item; dialog.close(); };
    btn.addEventListener('click', handler);
    bound.push({ btn, handler });
    list.appendChild(btn);
  }
  function handleCancel() { dialog.close(); }
  function handleClose() {
    cancelBtn.removeEventListener('click', handleCancel);
    dialog.removeEventListener('close', handleClose);
    bound.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
    if (picked) onPick(picked);
  }
  cancelBtn.addEventListener('click', handleCancel);
  dialog.addEventListener('close', handleClose);
  dialog.showModal();
}

// ---------- campeonatos ----------

async function renderCampeonatos() {
  const view = document.getElementById('view-campeonatos');
  const campeonatos = (await getAll('campeonatos')).sort((a, b) => (b.fechaInicio || 0) - (a.fechaInicio || 0));
  if (!campeonatos.length) {
    view.innerHTML = '<div class="empty-state">Todavía no hay campeonatos. Usa el botón + para crear el primero.</div>';
    return;
  }
  view.innerHTML = `<div class="list">${campeonatos.map(campeonatoRowHtml).join('')}</div>`;
  view.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleCampeonatoAction(btn.dataset.action, btn.dataset.id));
  });
}

function campeonatoRowHtml(c) {
  const activo = c.id === state.campeonatoActivoId;
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${escapeHtml(c.nombre)} ${activo ? '<span class="pill success">Activo</span>' : ''}</div>
        <div class="row-sub">${escapeHtml(c.temporada)}${c.activo ? '' : ' · <span class="pill neutral">Inactivo</span>'}</div>
      </div>
      <button class="btn" data-action="seleccionar" data-id="${c.id}">Usar</button>
      <button class="btn icon" data-action="editar" data-id="${c.id}" title="Editar">✎</button>
      <button class="btn icon danger" data-action="eliminar" data-id="${c.id}" title="Eliminar">🗑</button>
    </div>`;
}

async function handleCampeonatoAction(action, id) {
  if (action === 'seleccionar') {
    saveActiveCampeonato(id);
    await render();
  } else if (action === 'editar') {
    openCampeonatoForm(await getById('campeonatos', id));
  } else if (action === 'eliminar') {
    await softDelete('campeonatos', id);
    if (state.campeonatoActivoId === id) saveActiveCampeonato(null);
    await render();
  }
}

function openCampeonatoForm(existing) {
  openForm({
    title: existing ? 'Editar campeonato' : 'Nuevo campeonato',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true },
      { name: 'temporada', label: 'Temporada', required: true },
      { name: 'fechaInicio', label: 'Fecha de inicio', type: 'date' },
      { name: 'fechaFin', label: 'Fecha de fin', type: 'date' },
      { name: 'activo', label: 'Activo', type: 'checkbox' },
    ],
    initial: existing ? {
      nombre: existing.nombre,
      temporada: existing.temporada,
      fechaInicio: existing.fechaInicio ? dateInputValue(existing.fechaInicio) : '',
      fechaFin: existing.fechaFin ? dateInputValue(existing.fechaFin) : '',
      activo: existing.activo,
    } : { activo: true },
    onSubmit: async (values) => {
      if (!values.nombre.trim() || !values.temporada.trim()) return;
      const record = existing ? { ...existing } : { id: newId('camp_'), deleted: false };
      record.nombre = values.nombre.trim();
      record.temporada = values.temporada.trim();
      record.fechaInicio = values.fechaInicio ? Date.parse(values.fechaInicio) : null;
      record.fechaFin = values.fechaFin ? Date.parse(values.fechaFin) : null;
      record.activo = values.activo;
      await put('campeonatos', touch(record));
      await render();
    },
  });
}

// ---------- equipos ----------

async function renderEquipos() {
  const view = document.getElementById('view-equipos');
  if (state.plantillaEquipoId) {
    await renderPlantilla(view, state.plantillaEquipoId);
    return;
  }
  const equipos = (await getAll('equipos')).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const campeonatoId = state.campeonatoActivoId;
  const inscritos = new Set();
  const linkByEquipo = new Map();
  if (campeonatoId) {
    const links = await getAllByIndex('campeonatoEquipos', 'campeonatoId', campeonatoId);
    for (const l of links) { inscritos.add(l.equipoId); linkByEquipo.set(l.equipoId, l); }
  }

  let html = '';
  if (!campeonatoId) {
    html += '<div class="hint">Selecciona un campeonato en la pestaña Campeonatos para inscribir equipos y ver su plantilla.</div>';
  }
  if (!equipos.length) {
    html += '<div class="empty-state">Todavía no hay equipos. Usa el botón + para crear el primero.</div>';
  } else {
    html += `<div class="list">${equipos.map((e) => equipoRowHtml(e, campeonatoId, inscritos.has(e.id))).join('')}</div>`;
  }
  view.innerHTML = html;
  view.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleEquipoAction(btn.dataset.action, btn.dataset.id, linkByEquipo.get(btn.dataset.id)));
  });
}

function equipoRowHtml(e, campeonatoId, inscrito) {
  let middleBtn = '';
  if (campeonatoId) {
    middleBtn = inscrito
      ? `<button class="btn" data-action="plantilla" data-id="${e.id}">Plantilla</button>`
      : `<button class="btn" data-action="inscribir" data-id="${e.id}">Inscribir</button>`;
  }
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${escapeHtml(e.nombre)}</div>
        ${e.ciudad ? `<div class="row-sub">${escapeHtml(e.ciudad)}</div>` : ''}
      </div>
      ${middleBtn}
      <button class="btn icon" data-action="editar" data-id="${e.id}" title="Editar">✎</button>
      <button class="btn icon danger" data-action="eliminar" data-id="${e.id}" title="Eliminar">🗑</button>
    </div>`;
}

async function handleEquipoAction(action, id, link) {
  if (action === 'editar') {
    openEquipoForm(await getById('equipos', id));
  } else if (action === 'eliminar') {
    await softDelete('equipos', id);
    await render();
  } else if (action === 'inscribir') {
    await ensureInscrito(state.campeonatoActivoId, id);
    await render();
  } else if (action === 'plantilla') {
    const ce = link || await ensureInscrito(state.campeonatoActivoId, id);
    const equipo = await getById('equipos', id);
    state.plantillaEquipoId = ce.id;
    state.plantillaEquipoNombre = equipo ? equipo.nombre : '';
    await render();
  }
}

async function ensureInscrito(campeonatoId, equipoId) {
  const links = await getAllByIndex('campeonatoEquipos', 'campeonatoId', campeonatoId);
  const existing = links.find((l) => l.equipoId === equipoId);
  if (existing) return existing;
  const record = touch({ id: newId('ce_'), campeonatoId, equipoId, grupo: null, deleted: false });
  await put('campeonatoEquipos', record);
  return record;
}

function openEquipoForm(existing) {
  openForm({
    title: existing ? 'Editar equipo' : 'Nuevo equipo',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true },
      { name: 'ciudad', label: 'Ciudad / club (opcional)' },
    ],
    initial: existing ? { nombre: existing.nombre, ciudad: existing.ciudad || '' } : {},
    onSubmit: async (values) => {
      if (!values.nombre.trim()) return;
      const record = existing ? { ...existing } : { id: newId('equ_'), deleted: false };
      record.nombre = values.nombre.trim();
      record.ciudad = values.ciudad.trim() || null;
      await put('equipos', touch(record));
      await render();
    },
  });
}

// ---------- plantillas ----------

async function renderPlantilla(view, campeonatoEquipoId) {
  const roster = await getAllByIndex('plantillas', 'campeonatoEquipoId', campeonatoEquipoId);
  const jugadoresMap = new Map((await getAll('jugadores')).map((j) => [j.id, j]));
  const rows = roster
    .map((p) => ({ plantilla: p, jugador: jugadoresMap.get(p.jugadorId) }))
    .filter((r) => r.jugador)
    .sort((a, b) => (a.plantilla.numeroCamiseta ?? 99) - (b.plantilla.numeroCamiseta ?? 99));

  let html = `
    <div class="view-header">
      <h2>Plantilla: ${escapeHtml(state.plantillaEquipoNombre)}</h2>
      <button class="btn" data-action="volver">← Volver a equipos</button>
    </div>`;
  html += rows.length
    ? `<div class="list">${rows.map(plantillaRowHtml).join('')}</div>`
    : '<div class="empty-state">Todavía no hay jugadores en esta plantilla. Usa el botón + para agregar uno.</div>';
  view.innerHTML = html;

  view.querySelector('[data-action="volver"]').addEventListener('click', () => {
    state.plantillaEquipoId = null;
    render();
  });
  view.querySelectorAll('[data-plantilla-action]').forEach((btn) => {
    btn.addEventListener('click', () => handlePlantillaAction(btn.dataset.plantillaAction, btn.dataset.id, campeonatoEquipoId));
  });
}

function plantillaRowHtml({ plantilla, jugador }) {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">#${plantilla.numeroCamiseta ?? '-'} ${escapeHtml(jugador.nombre)} ${escapeHtml(jugador.apellido)}</div>
        <div class="row-sub">${plantilla.posicion ? escapeHtml(plantilla.posicion) : 'Sin posición'}</div>
      </div>
      <button class="btn icon" data-plantilla-action="editar" data-id="${plantilla.id}" title="Editar">✎</button>
      <button class="btn icon danger" data-plantilla-action="quitar" data-id="${plantilla.id}" title="Quitar">🗑</button>
    </div>`;
}

async function handlePlantillaAction(action, plantillaId, campeonatoEquipoId) {
  if (action === 'editar') {
    openPlantillaForm(campeonatoEquipoId, await getById('plantillas', plantillaId));
  } else if (action === 'quitar') {
    await softDelete('plantillas', plantillaId);
    await render();
  }
}

async function openAddJugadorToPlantilla(campeonatoEquipoId) {
  const roster = await getAllByIndex('plantillas', 'campeonatoEquipoId', campeonatoEquipoId);
  const yaEnPlantilla = new Set(roster.map((p) => p.jugadorId));
  const jugadores = (await getAll('jugadores'))
    .filter((j) => !yaEnPlantilla.has(j.id))
    .sort((a, b) => a.apellido.localeCompare(b.apellido));
  openPicker({
    title: 'Selecciona un jugador',
    items: jugadores,
    labelFn: (j) => `${j.nombre} ${j.apellido}`,
    emptyMessage: 'No hay jugadores disponibles. Crea uno en la pestaña Jugadores.',
    onPick: (j) => openPlantillaForm(campeonatoEquipoId, null, j.id),
  });
}

function openPlantillaForm(campeonatoEquipoId, existing, jugadorId) {
  openForm({
    title: 'Número y posición',
    fields: [
      { name: 'numeroCamiseta', label: 'Número de camiseta', type: 'number' },
      {
        name: 'posicion',
        label: 'Posición',
        type: 'select',
        options: [{ value: '', label: '(sin posición)' }, ...POSICIONES.map((p) => ({ value: p, label: p }))],
      },
    ],
    initial: existing ? { numeroCamiseta: existing.numeroCamiseta, posicion: existing.posicion || '' } : {},
    onSubmit: async (values) => {
      const record = existing ? { ...existing } : { id: newId('pla_'), campeonatoEquipoId, jugadorId, deleted: false };
      record.numeroCamiseta = values.numeroCamiseta;
      record.posicion = values.posicion || null;
      await put('plantillas', touch(record));
      await render();
    },
  });
}

// ---------- jugadores ----------

async function renderJugadores() {
  const view = document.getElementById('view-jugadores');
  const jugadores = (await getAll('jugadores')).sort((a, b) => a.apellido.localeCompare(b.apellido));
  if (!jugadores.length) {
    view.innerHTML = '<div class="empty-state">Todavía no hay jugadores. Usa el botón + para crear el primero.</div>';
    return;
  }
  view.innerHTML = `<div class="list">${jugadores.map((j) => `
    <div class="row">
      <div class="row-main"><div class="row-title">${escapeHtml(j.nombre)} ${escapeHtml(j.apellido)}</div></div>
      <button class="btn icon" data-action="editar" data-id="${j.id}" title="Editar">✎</button>
      <button class="btn icon danger" data-action="eliminar" data-id="${j.id}" title="Eliminar">🗑</button>
    </div>`).join('')}</div>`;
  view.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.action === 'editar') openJugadorForm(await getById('jugadores', btn.dataset.id));
      else { await softDelete('jugadores', btn.dataset.id); await render(); }
    });
  });
}

function openJugadorForm(existing) {
  openForm({
    title: existing ? 'Editar jugador' : 'Nuevo jugador',
    fields: [
      { name: 'nombre', label: 'Nombre', required: true },
      { name: 'apellido', label: 'Apellido', required: true },
    ],
    initial: existing ? { nombre: existing.nombre, apellido: existing.apellido } : {},
    onSubmit: async (values) => {
      if (!values.nombre.trim() || !values.apellido.trim()) return;
      const record = existing ? { ...existing } : { id: newId('jug_'), deleted: false };
      record.nombre = values.nombre.trim();
      record.apellido = values.apellido.trim();
      await put('jugadores', touch(record));
      await render();
    },
  });
}

// ---------- partidos ----------

async function computeScore(partidoId, equipoLocalId, equipoVisitanteId) {
  const stats = await getAllByIndex('estadisticas', 'partidoId', partidoId);
  let local = 0;
  let visitante = 0;
  for (const s of stats) {
    if (s.equipoId === equipoLocalId) local += s.goles || 0;
    else if (s.equipoId === equipoVisitanteId) visitante += s.goles || 0;
  }
  return { local, visitante };
}

async function renderPartidos() {
  const view = document.getElementById('view-partidos');
  if (!state.campeonatoActivoId) {
    view.innerHTML = '<div class="hint">Selecciona un campeonato en la pestaña Campeonatos para ver y crear sus partidos.</div>';
    return;
  }
  if (state.partidoDetailId) {
    await renderPartidoDetalle(view, state.partidoDetailId);
    return;
  }
  const partidos = (await getAllByIndex('partidos', 'campeonatoId', state.campeonatoActivoId))
    .sort((a, b) => (a.fecha || 0) - (b.fecha || 0));
  if (!partidos.length) {
    view.innerHTML = '<div class="empty-state">Todavía no hay partidos. Usa el botón + para crear el primero.</div>';
    return;
  }
  const equipos = new Map((await getAll('equipos')).map((e) => [e.id, e]));
  const rowsHtml = await Promise.all(partidos.map(async (p) => {
    const { local, visitante } = await computeScore(p.id, p.equipoLocalId, p.equipoVisitanteId);
    const eLocal = equipos.get(p.equipoLocalId);
    const eVisitante = equipos.get(p.equipoVisitanteId);
    return `
      <div class="row" data-action="abrir" data-id="${p.id}" style="cursor:pointer">
        <div class="row-main">
          <div class="row-title tabular">${escapeHtml(eLocal ? eLocal.nombre : '?')} ${local} - ${visitante} ${escapeHtml(eVisitante ? eVisitante.nombre : '?')}</div>
          <div class="row-sub">${formatDate(p.fecha)}${p.lugar ? ' · ' + escapeHtml(p.lugar) : ''}</div>
        </div>
        <span class="pill ${estadoPillClass(p.estado)}">${estadoLabel(p.estado)}</span>
      </div>`;
  }));
  view.innerHTML = `<div class="list">${rowsHtml.join('')}</div>`;
  view.querySelectorAll('[data-action="abrir"]').forEach((row) => {
    row.addEventListener('click', () => { state.partidoDetailId = row.dataset.id; render(); });
  });
}

async function openPartidoForm() {
  const campeonatoId = state.campeonatoActivoId;
  const links = await getAllByIndex('campeonatoEquipos', 'campeonatoId', campeonatoId);
  const equiposMap = new Map((await getAll('equipos')).map((e) => [e.id, e]));
  const options = links
    .map((l) => ({ value: l.equipoId, label: equiposMap.get(l.equipoId) ? equiposMap.get(l.equipoId).nombre : null }))
    .filter((o) => o.label);

  if (options.length < 2) {
    showToast('Inscribe al menos dos equipos en este campeonato antes de crear un partido.');
    return;
  }

  openForm({
    title: 'Nuevo partido',
    fields: [
      { name: 'equipoLocalId', label: 'Equipo local', type: 'select', options, required: true },
      { name: 'equipoVisitanteId', label: 'Equipo visitante', type: 'select', options, required: true },
      { name: 'fecha', label: 'Fecha y hora', type: 'datetime-local', required: true },
      { name: 'lugar', label: 'Lugar (opcional)' },
      { name: 'jornada', label: 'Jornada (opcional)', type: 'number' },
    ],
    initial: {
      equipoLocalId: options[0].value,
      equipoVisitanteId: options[1].value,
      fecha: datetimeInputValue(Date.now()),
    },
    onSubmit: async (values) => {
      if (values.equipoLocalId === values.equipoVisitanteId) {
        showToast('El equipo local y visitante deben ser distintos.');
        return;
      }
      const record = touch({
        id: newId('par_'),
        campeonatoId,
        equipoLocalId: values.equipoLocalId,
        equipoVisitanteId: values.equipoVisitanteId,
        fecha: values.fecha ? Date.parse(values.fecha) : Date.now(),
        lugar: values.lugar.trim() || null,
        jornada: values.jornada,
        estado: 'programado',
        deleted: false,
      });
      await put('partidos', record);
      await render();
    },
  });
}

async function renderPartidoDetalle(view, partidoId) {
  const partido = await getById('partidos', partidoId);
  if (!partido) {
    view.innerHTML = '<div class="empty-state">Partido no encontrado.</div>';
    state.partidoDetailId = null;
    return;
  }
  const equipos = new Map((await getAll('equipos')).map((e) => [e.id, e]));
  const eLocal = equipos.get(partido.equipoLocalId);
  const eVisitante = equipos.get(partido.equipoVisitanteId);
  const { local, visitante } = await computeScore(partidoId, partido.equipoLocalId, partido.equipoVisitanteId);

  const [colLocalHtml, colVisitanteHtml] = await Promise.all([
    renderEquipoColumna(partido, partido.equipoLocalId),
    renderEquipoColumna(partido, partido.equipoVisitanteId),
  ]);

  view.innerHTML = `
    <div class="view-header">
      <h2>${escapeHtml(eLocal ? eLocal.nombre : '?')} vs ${escapeHtml(eVisitante ? eVisitante.nombre : '?')}</h2>
      <button class="btn" data-action="volver">← Volver a partidos</button>
    </div>
    <div class="card">
      <div class="score tabular">${local} <span style="color:var(--color-text-muted); font-size:1.2rem;">-</span> ${visitante}</div>
      <div style="display:flex; justify-content:center; gap:8px; margin-top:12px; flex-wrap:wrap;">
        ${['programado', 'en_curso', 'finalizado'].map((estado) => `
          <button class="btn ${partido.estado === estado ? 'primary' : ''}" data-action="estado" data-estado="${estado}">${estadoLabel(estado)}</button>
        `).join('')}
      </div>
      <div class="row-sub" style="text-align:center; margin-top:8px;">${formatDate(partido.fecha)}${partido.lugar ? ' · ' + escapeHtml(partido.lugar) : ''}</div>
    </div>
    <div class="teams-grid">
      <div class="card"><h3>${escapeHtml(eLocal ? eLocal.nombre : '?')}</h3>${colLocalHtml}</div>
      <div class="card"><h3>${escapeHtml(eVisitante ? eVisitante.nombre : '?')}</h3>${colVisitanteHtml}</div>
    </div>
    <button class="btn danger" data-action="eliminar">Eliminar partido</button>
  `;

  view.querySelector('[data-action="volver"]').addEventListener('click', () => {
    state.partidoDetailId = null;
    render();
  });
  view.querySelector('[data-action="eliminar"]').addEventListener('click', async () => {
    await softDelete('partidos', partidoId);
    state.partidoDetailId = null;
    await render();
  });
  view.querySelectorAll('[data-action="estado"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await put('partidos', touch({ ...partido, estado: btn.dataset.estado }));
      await render();
    });
  });
  wireStatControls(view, partidoId);
}

async function renderEquipoColumna(partido, equipoId) {
  const links = await getAllByIndex('campeonatoEquipos', 'campeonatoId', partido.campeonatoId);
  const ce = links.find((l) => l.equipoId === equipoId);
  if (!ce) return '<div class="row-sub">Equipo no inscrito en este campeonato.</div>';
  const roster = await getAllByIndex('plantillas', 'campeonatoEquipoId', ce.id);
  if (!roster.length) return '<div class="row-sub">Sin jugadores en la plantilla.</div>';
  const jugadoresMap = new Map((await getAll('jugadores')).map((j) => [j.id, j]));
  const statsRows = await getAllByIndex('estadisticas', 'partidoId', partido.id);
  const statsByJugador = new Map(statsRows.map((s) => [s.jugadorId, s]));

  const rows = roster
    .map((p) => ({ plantilla: p, jugador: jugadoresMap.get(p.jugadorId) }))
    .filter((r) => r.jugador)
    .sort((a, b) => (a.plantilla.numeroCamiseta ?? 99) - (b.plantilla.numeroCamiseta ?? 99));

  return rows.map(({ plantilla, jugador }) => {
    const stat = statsByJugador.get(jugador.id) || defaultStat(partido.id, jugador.id, equipoId);
    return playerStatRowHtml(plantilla, jugador, stat, equipoId);
  }).join('');
}

function defaultStat(partidoId, jugadorId, equipoId) {
  return {
    id: `est_${partidoId}_${jugadorId}`, partidoId, jugadorId, equipoId,
    goles: 0, asistencias: 0, tirosFallados: 0, exclusiones2min: 0,
    tarjetaAmarilla: false, tarjetaRoja: false, tarjetaAzul: false,
    paradas: 0, golesRecibidos: 0, deleted: false,
  };
}

function playerStatRowHtml(plantilla, jugador, stat, equipoId) {
  const esPortero = plantilla.posicion === 'portero';
  return `
    <div class="player-row" data-jugador-id="${jugador.id}" data-equipo-id="${equipoId}">
      <div class="tabular">#${plantilla.numeroCamiseta ?? '-'}</div>
      <div>
        <div class="player-name">${escapeHtml(jugador.nombre)} ${escapeHtml(jugador.apellido)}</div>
        <div class="stat-controls">
          ${statCounterHtml('goles', 'Goles', stat.goles)}
          ${statCounterHtml('asistencias', 'Asist.', stat.asistencias)}
          ${statCounterHtml('exclusiones2min', '2min', stat.exclusiones2min)}
          ${esPortero ? statCounterHtml('paradas', 'Paradas', stat.paradas) : ''}
          ${esPortero ? statCounterHtml('golesRecibidos', 'Gol. recib.', stat.golesRecibidos) : ''}
          ${cardToggleHtml('tarjetaAmarilla', 'amarilla', 'Am', stat.tarjetaAmarilla)}
          ${cardToggleHtml('tarjetaRoja', 'roja', 'Roj', stat.tarjetaRoja)}
          ${cardToggleHtml('tarjetaAzul', 'azul', 'Az', stat.tarjetaAzul)}
        </div>
      </div>
    </div>`;
}

function statCounterHtml(field, label, value) {
  return `
    <span class="stat-counter" data-field="${field}">
      <button type="button" data-delta="-1" aria-label="Restar ${label}">−</button>
      <span>${label}</span>
      <span class="value tabular">${value || 0}</span>
      <button type="button" data-delta="1" aria-label="Sumar ${label}">+</button>
    </span>`;
}

function cardToggleHtml(field, cls, label, on) {
  return `<button type="button" class="card-toggle ${cls} ${on ? 'on' : ''}" data-toggle="${field}">${label}</button>`;
}

function wireStatControls(view, partidoId) {
  view.querySelectorAll('.player-row').forEach((row) => {
    const jugadorId = row.dataset.jugadorId;
    const equipoId = row.dataset.equipoId;
    row.querySelectorAll('.stat-counter').forEach((counter) => {
      const field = counter.dataset.field;
      counter.querySelectorAll('button[data-delta]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await adjustStat(partidoId, jugadorId, equipoId, field, Number(btn.dataset.delta));
          await render();
        });
      });
    });
    row.querySelectorAll('button[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await toggleStat(partidoId, jugadorId, equipoId, btn.dataset.toggle);
        await render();
      });
    });
  });
}

async function getOrCreateStat(partidoId, jugadorId, equipoId) {
  const existing = await getById('estadisticas', `est_${partidoId}_${jugadorId}`);
  return existing || defaultStat(partidoId, jugadorId, equipoId);
}

async function adjustStat(partidoId, jugadorId, equipoId, field, delta) {
  const stat = await getOrCreateStat(partidoId, jugadorId, equipoId);
  stat[field] = Math.max(0, (stat[field] || 0) + delta);
  await put('estadisticas', touch(stat));
}

async function toggleStat(partidoId, jugadorId, equipoId, field) {
  const stat = await getOrCreateStat(partidoId, jugadorId, equipoId);
  stat[field] = !stat[field];
  await put('estadisticas', touch(stat));
}

// ---------- reportes ----------

async function renderReportes() {
  const view = document.getElementById('view-reportes');
  const campeonatoId = state.campeonatoActivoId;
  if (!campeonatoId) {
    view.innerHTML = '<div class="hint">Selecciona un campeonato en la pestaña Campeonatos para ver sus reportes.</div>';
    return;
  }
  const [equipos, links, partidos, jugadores] = await Promise.all([
    getAll('equipos'),
    getAllByIndex('campeonatoEquipos', 'campeonatoId', campeonatoId),
    getAllByIndex('partidos', 'campeonatoId', campeonatoId),
    getAll('jugadores'),
  ]);
  const equiposMap = new Map(equipos.map((e) => [e.id, e]));
  const jugadoresMap = new Map(jugadores.map((j) => [j.id, j]));

  const tabla = new Map();
  for (const link of links) {
    tabla.set(link.equipoId, { equipo: equiposMap.get(link.equipoId), pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
  }
  const golesPorJugador = new Map();

  for (const partido of partidos) {
    const stats = await getAllByIndex('estadisticas', 'partidoId', partido.id);
    let golesLocal = 0;
    let golesVisitante = 0;
    for (const s of stats) {
      const total = s.goles || 0;
      if (s.equipoId === partido.equipoLocalId) golesLocal += total;
      else if (s.equipoId === partido.equipoVisitanteId) golesVisitante += total;
      if (total > 0) golesPorJugador.set(s.jugadorId, (golesPorJugador.get(s.jugadorId) || 0) + total);
    }
    if (partido.estado !== 'finalizado') continue;
    const localFila = tabla.get(partido.equipoLocalId);
    const visitanteFila = tabla.get(partido.equipoVisitanteId);
    if (localFila) {
      localFila.pj++; localFila.gf += golesLocal; localFila.gc += golesVisitante;
      if (golesLocal > golesVisitante) localFila.pg++;
      else if (golesLocal === golesVisitante) localFila.pe++;
      else localFila.pp++;
    }
    if (visitanteFila) {
      visitanteFila.pj++; visitanteFila.gf += golesVisitante; visitanteFila.gc += golesLocal;
      if (golesVisitante > golesLocal) visitanteFila.pg++;
      else if (golesVisitante === golesLocal) visitanteFila.pe++;
      else visitanteFila.pp++;
    }
  }

  const filas = [...tabla.values()]
    .filter((f) => f.equipo)
    .map((f) => ({ ...f, pts: f.pg * 2 + f.pe, dif: f.gf - f.gc }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf);

  const goleadores = [...golesPorJugador.entries()]
    .map(([jugadorId, goles]) => ({ jugador: jugadoresMap.get(jugadorId), goles }))
    .filter((g) => g.jugador)
    .sort((a, b) => b.goles - a.goles)
    .slice(0, 15);

  view.innerHTML = `
    <div class="card">
      <h3>Tabla de posiciones</h3>
      <div class="table-scroll">
        <table class="tabular">
          <thead><tr><th>Equipo</th><th class="num">PJ</th><th class="num">PG</th><th class="num">PE</th><th class="num">PP</th><th class="num">GF</th><th class="num">GC</th><th class="num">DIF</th><th class="num">PTS</th></tr></thead>
          <tbody>
            ${filas.length ? filas.map((f) => `
              <tr>
                <td>${escapeHtml(f.equipo.nombre)}</td>
                <td class="num">${f.pj}</td><td class="num">${f.pg}</td><td class="num">${f.pe}</td><td class="num">${f.pp}</td>
                <td class="num">${f.gf}</td><td class="num">${f.gc}</td><td class="num">${f.dif}</td><td class="num"><strong>${f.pts}</strong></td>
              </tr>`).join('') : '<tr><td colspan="9" class="empty-state">Todavía no hay partidos finalizados.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="row-sub" style="margin-top:8px;">Puntos: victoria 2, empate 1, derrota 0. Solo se cuentan partidos marcados como "Finalizado".</div>
    </div>
    <div class="card">
      <h3>Goleadores</h3>
      <div class="table-scroll">
        <table class="tabular">
          <thead><tr><th>#</th><th>Jugador</th><th class="num">Goles</th></tr></thead>
          <tbody>
            ${goleadores.length ? goleadores.map((g, i) => `
              <tr><td>${i + 1}</td><td>${escapeHtml(g.jugador.nombre)} ${escapeHtml(g.jugador.apellido)}</td><td class="num"><strong>${g.goles}</strong></td></tr>
            `).join('') : '<tr><td colspan="3" class="empty-state">Todavía no hay goles registrados.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ---------- sincronizar ----------

function exportFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `handball_stats_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

function logSync(message) {
  const log = document.getElementById('sync-log');
  if (!log) return;
  log.hidden = false;
  log.textContent = message;
}

function formatSummary(summary) {
  let msg = `Insertados: ${summary.inserted}\nActualizados: ${summary.updated}\nSin cambios: ${summary.skipped}`;
  if (summary.conflicts.length) msg += `\nConflictos (revisar manualmente): ${summary.conflicts.join(', ')}`;
  return msg;
}

async function handleExportDownload() {
  const payload = await buildExportPayload();
  const json = JSON.stringify(payload);
  try {
    if (!window.claude || !window.claude.use) throw new Error('No disponible en esta vista');
    const downloads = await window.claude.use('downloads');
    if (!downloads) throw new Error('No disponible en esta vista');
    const result = await downloads.save({ filename: exportFilename(), data: json });
    logSync(result.status === 'saved' ? 'Archivo guardado correctamente.' : 'Archivo entregado.');
  } catch (err) {
    logSync(`No se pudo descargar el archivo directamente (${err && (err.code || err.message) || err}). Usa "Copiar al portapapeles" y pégalo en un archivo de texto .json.`);
  }
}

async function handleExportCopy() {
  const payload = await buildExportPayload();
  const json = JSON.stringify(payload);
  try {
    await navigator.clipboard.writeText(json);
    logSync('Copiado al portapapeles. Pégalo en un archivo de texto (.json) o envíalo directamente.');
  } catch (err) {
    logSync(`No se pudo copiar automáticamente. Selecciona y copia este texto:\n\n${json}`);
  }
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const summary = await importPayload(JSON.parse(text));
    logSync(formatSummary(summary));
    await render();
  } catch (err) {
    logSync(`Error al importar: ${err.message}`);
  }
  e.target.value = '';
}

async function handleImportText() {
  const textarea = document.getElementById('input-import-text');
  if (!textarea.value.trim()) return;
  try {
    const summary = await importPayload(JSON.parse(textarea.value));
    logSync(formatSummary(summary));
    textarea.value = '';
    await render();
  } catch (err) {
    logSync(`Error al importar: ${err.message}`);
  }
}

async function renderSync() {
  const view = document.getElementById('view-sync');
  const deviceId = getDeviceId();
  view.innerHTML = `
    <div class="card">
      <h3>Este dispositivo</h3>
      <div class="row-sub tabular">Id: ${escapeHtml(deviceId)}</div>
    </div>
    <div class="hint">No hay un servidor central: para combinar los datos de dos dispositivos, exporta aquí y comparte el archivo (o el texto copiado) para importarlo en el otro.</div>
    <div class="card" style="display:flex; flex-direction:column; gap:10px;">
      <h3>Exportar</h3>
      <button class="btn primary" id="btn-export-download">Descargar archivo .json</button>
      <button class="btn" id="btn-export-copy">Copiar al portapapeles</button>
    </div>
    <div class="card" style="display:flex; flex-direction:column; gap:10px;">
      <h3>Importar</h3>
      <label>Desde archivo
        <input type="file" id="input-import-file" accept=".json,application/json" />
      </label>
      <label>O pega el texto exportado
        <textarea id="input-import-text" rows="4" placeholder="Pega aquí el JSON copiado desde otro dispositivo"></textarea>
      </label>
      <button class="btn" id="btn-import-text">Importar texto pegado</button>
    </div>
    <div id="sync-log" class="sync-log" hidden></div>
  `;
  document.getElementById('btn-export-download').addEventListener('click', handleExportDownload);
  document.getElementById('btn-export-copy').addEventListener('click', handleExportCopy);
  document.getElementById('input-import-file').addEventListener('change', handleImportFile);
  document.getElementById('btn-import-text').addEventListener('click', handleImportText);
}

// ---------- shell / router ----------

async function updateTopbar() {
  const indicator = document.getElementById('campeonato-activo-indicator');
  if (!state.campeonatoActivoId) { indicator.textContent = 'Sin campeonato seleccionado'; return; }
  const c = await getById('campeonatos', state.campeonatoActivoId);
  indicator.innerHTML = c ? `Campeonato activo: <strong>${escapeHtml(c.nombre)}</strong>` : 'Sin campeonato seleccionado';
}

function fabTitleFor(tab) {
  if (tab === 'equipos' && state.plantillaEquipoId) return 'Agregar jugador a la plantilla';
  if (tab === 'partidos') return 'Nuevo partido';
  return 'Agregar';
}

async function render() {
  document.querySelectorAll('#tabs button').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === activeTab));
  document.querySelectorAll('main .view').forEach((section) => { section.hidden = section.id !== `view-${activeTab}`; });

  const fab = document.getElementById('fab');
  fab.hidden = activeTab === 'reportes' || activeTab === 'sync' || (activeTab === 'partidos' && !!state.partidoDetailId);
  fab.title = fabTitleFor(activeTab);

  await updateTopbar();

  if (activeTab === 'campeonatos') await renderCampeonatos();
  else if (activeTab === 'equipos') await renderEquipos();
  else if (activeTab === 'jugadores') await renderJugadores();
  else if (activeTab === 'partidos') await renderPartidos();
  else if (activeTab === 'reportes') await renderReportes();
  else if (activeTab === 'sync') await renderSync();
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  state.partidoDetailId = null;
  state.plantillaEquipoId = null;
  render();
});

document.getElementById('fab').addEventListener('click', () => {
  if (activeTab === 'campeonatos') openCampeonatoForm();
  else if (activeTab === 'equipos') {
    if (state.plantillaEquipoId) openAddJugadorToPlantilla(state.plantillaEquipoId);
    else openEquipoForm();
  } else if (activeTab === 'jugadores') openJugadorForm();
  else if (activeTab === 'partidos' && !state.partidoDetailId) openPartidoForm();
});

render();
