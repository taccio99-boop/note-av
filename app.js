/* =============================================================================
   NOTE AV - la pagina
   Un'unica pagina per l'Admin e per i Sub: cosa si vede lo decide il ruolo di
   chi entra, cosa si puo' leggere lo decide il database (Row Level Security).
   Nessun dato vive qui dentro: arriva tutto da Supabase dopo l'accesso.
   ============================================================================= */
'use strict';

const CFG = window.NOTE_AV || {};
const sb = (CFG.supabaseUrl && CFG.supabaseKey && window.supabase)
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'noteav-sessione' } })
  : null;

const app = document.getElementById('app');
const S = {
  chi: null,            // { ruolo, sub_id, nome_utente }
  io: null,             // 'admin' | 'sub'
  subs: [],
  stato: null,
  vista: null,
  subSel: '*',          // Admin: Sub scelto nelle Righe / Carico / Consegne
  righe: [],
  msgs: [],
  invii: [],            // invii non ancora letti
  evidenza: {},         // sub_id -> soglia delle Righe "nuove" al momento dell'apertura
  archivio: false,
  lunedi: null,
  splashFatto: false,
};

const NOMI_VISTA = { bacheca: 'Bacheca', righe: 'Righe', carico: 'Carico', consegne: 'Consegne', accessi: 'Accessi' };
const COLONNE = [
  ['da_controllare', 'Da controllare'],
  ['in_attesa', 'In attesa di risposta'],
  ['controllato', 'Controllato'],
];
const STATI = { lav: 'In lavorazione', attesa: 'Non ancora arrivata', fuori: 'Fuori Carico' };
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const TINTE = ['#3f6b5c', '#a8683a', '#5b6b8c', '#8a5a6b', '#6b7d3f', '#7a5c3e', '#3f6b7a', '#8c6b3f', '#5c5a8a'];

const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 23 C 10 9, 15 9, 16 16 S 22 23, 26 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3.2 3"/><circle cx="26" cy="9" r="2.2" fill="#fff"/></svg>';

/* ---------------------------------------------------------------------------
   Strumenti
   --------------------------------------------------------------------------- */

function h(tag, props, ...figli) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'value') e.value = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const f of figli.flat(Infinity)) {
    if (f == null || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

// Come replaceChildren, ma salta i pezzi vuoti (null/false) e appiattisce gli elenchi.
function riempi(el, ...figli) {
  el.replaceChildren(...figli.flat(Infinity).filter(f => f != null && f !== false));
}

function svg(stringa) {               // solo per disegni fissi scritti qui
  const t = document.createElement('template');
  t.innerHTML = stringa.trim();
  return t.content.firstChild;
}

const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daIso = s => { const [y, m, g] = s.split('-').map(Number); return new Date(y, m - 1, g); };
const oggiIso = () => iso(new Date());
const fmtData = s => { if (!s) return ''; const d = daIso(s.slice(0, 10)); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2); };
const fmtQuando = ts => ts ? new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const pz = n => (n || 0).toLocaleString('it-IT');
function lunediDi(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
function aggiungiGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function settimanaIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const g = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - g);
  const a = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - a) / 86400000 + 1) / 7);
}

let _toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('si');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('si'), 3200);
}

async function q(promessa) {
  const { data, error } = await promessa;
  if (error) throw error;
  return data;
}

function nomeSub(id) { const s = S.subs.find(x => x.id === id); return s ? s.nome : id; }
function tinta(id) { let n = 0; for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0; return TINTE[n % TINTE.length]; }

async function gestisciErrore(err, dove) {
  console.error(dove, err);
  const codice = err && (err.code || err.status);
  if (codice === '42501' || codice === 'PGRST301' || codice === 401) {
    const ok = await controllaSessione();
    if (!ok) return;
  }
  toast('Qualcosa non è andato: riprova tra poco.');
}

/* ---------------------------------------------------------------------------
   Avvio e accesso
   --------------------------------------------------------------------------- */

async function avvio() {
  if (!sb) {
    app.replaceChildren(h('div', { class: 'accesso' }, h('div', { class: 'scheda-accesso' }, marchio(),
      h('p', { class: 'errore' }, 'Configurazione mancante: avvisa l’ufficio produzione.'))));
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vistaAccesso();
  await dopoAccesso();
}

function marchio(sotto) {
  const logo = h('div', { class: 'logo' }); logo.append(svg(LOGO));
  return h('div', { class: 'marchio' }, logo,
    h('div', null, h('h1', null, 'Note Av'), h('p', null, sotto || 'Avanzamento produzione')));
}

function vistaAccesso(messaggio) {
  const utente = h('input', { name: 'utente', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const tasto = h('button', { class: 'tasto pieno', type: 'submit' }, 'Entra');
  const errore = h('p', { class: 'errore' + (messaggio ? '' : ' nascosto') }, messaggio || '');
  const form = h('form', { class: 'scheda-accesso', onsubmit: async ev => {
    ev.preventDefault();
    tasto.disabled = true; tasto.textContent = 'Un momento…'; errore.classList.add('nascosto');
    const nome = utente.value.trim().toLowerCase().replace(/\s+/g, '');
    const { error } = await sb.auth.signInWithPassword({ email: nome + '@' + CFG.dominioUtenti, password: password.value });
    if (error) {
      errore.textContent = error.status === 429
        ? 'Troppi tentativi. Aspetta qualche minuto e riprova.'
        : 'Nome utente o password non corretti.';
      errore.classList.remove('nascosto');
      tasto.disabled = false; tasto.textContent = 'Entra';
      return;
    }
    await dopoAccesso();
  } },
    marchio(),
    errore,
    h('label', { class: 'campo' }, h('span', null, 'Nome utente'), utente),
    h('label', { class: 'campo' }, h('span', null, 'Password'), password),
    tasto,
    h('p', { class: 'nota-piccola' }, 'Le credenziali te le dà l’ufficio produzione. Dopo l’accesso resti collegato per 30 giorni.'));
  app.replaceChildren(h('div', { class: 'accesso' }, form));
  utente.focus();
}

async function esci(messaggio) {
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  S.chi = null; S.io = null; S.splashFatto = false;
  vistaAccesso(messaggio);
}

async function controllaSessione() {
  const { data, error } = await sb.rpc('chi_sono');
  if (error || !data) { await esci('Accesso non più valido: rientra.'); return false; }
  if (!data.sessione_valida) { await esci('Il tuo accesso è scaduto o è stato chiuso: rientra.'); return false; }
  return true;
}

async function dopoAccesso() {
  let chi;
  try { chi = await q(sb.rpc('chi_sono')); } catch (e) { chi = null; }
  if (!chi) return esci('Questo utente non è abilitato a Note Av.');
  if (!chi.sessione_valida) return esci('Il tuo accesso è scaduto: rientra.');
  S.chi = chi; S.io = chi.ruolo;

  if (S.io === 'admin') {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') {
      return aal && aal.nextLevel === 'aal2' ? vistaVerifica() : vistaIscrizioneVerifica();
    }
  }
  registraDispositivo();
  if (S.io === 'admin' && !S.splashFatto) await splash();
  S.lunedi = lunediDi(new Date());
  S.vista = S.io === 'admin' ? 'bacheca' : 'righe';
  S.subSel = S.io === 'admin' ? '*' : S.chi.sub_id;
  try { await caricaBase(); } catch (e) { return gestisciErrore(e, 'base'); }
  disegna();
  avviaControlloPeriodico();
}

/* Doppia verifica dell'Admin: codice a 6 cifre da un'app sul telefono. */
async function vistaIscrizioneVerifica() {
  app.replaceChildren(h('div', { class: 'caricamento' }, h('span', { class: 'punto' })));
  const { data: fattori } = await sb.auth.mfa.listFactors();
  for (const f of (fattori && fattori.all) || []) {
    if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Note Av ' + new Date().toISOString().slice(0, 16) });
  if (error) return esci('Non riesco a preparare la doppia verifica: riprova.');
  const qr = h('img', { alt: 'Codice QR da inquadrare', src: data.totp.qr_code });
  vistaCodice('Attiva la doppia verifica',
    [h('p', null, 'Il tuo accesso vede tutti i Sub, quindi è protetto da un secondo codice. Apri sul telefono un’app di autenticazione (Google Authenticator, Microsoft Authenticator…), inquadra il codice e scrivi qui le 6 cifre che compaiono.'),
     h('div', { class: 'qr' }, qr),
     h('details', null, h('summary', { class: 'link' }, 'Non riesco a inquadrare'),
       h('p', { class: 'nota-piccola' }, 'Inserisci a mano questa chiave nell’app:'), h('div', { class: 'segreto' }, data.totp.secret))],
    data.id);
}

async function vistaVerifica() {
  const { data } = await sb.auth.mfa.listFactors();
  const f = data && data.totp && data.totp.find(x => x.status === 'verified');
  if (!f) return vistaIscrizioneVerifica();
  vistaCodice('Doppia verifica', [h('p', null, 'Scrivi le 6 cifre che vedi ora nell’app di autenticazione del tuo telefono.')], f.id);
}

function vistaCodice(titolo, contenuto, idFattore) {
  const codice = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]{6}', required: true, style: 'letter-spacing:6px;text-align:center;font-size:24px' });
  const errore = h('p', { class: 'errore nascosto' });
  const tasto = h('button', { class: 'tasto pieno', type: 'submit' }, 'Conferma');
  const form = h('form', { class: 'scheda-accesso', onsubmit: async ev => {
    ev.preventDefault();
    tasto.disabled = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: idFattore, code: codice.value.trim() });
    if (error) {
      errore.textContent = 'Codice non corretto o scaduto: riprova con quello nuovo.';
      errore.classList.remove('nascosto'); tasto.disabled = false; codice.select();
      return;
    }
    await dopoAccesso();
  } },
    marchio(titolo), errore, contenuto,
    h('label', { class: 'campo' }, h('span', null, 'Codice'), codice),
    tasto,
    h('p', { class: 'nota-piccola' }, h('button', { class: 'link', type: 'button', onclick: () => esci() }, 'Esci')));
  app.replaceChildren(h('div', { class: 'accesso' }, form));
  codice.focus();
}

/* Registro degli accessi: un identificativo casuale per dispositivo. */
function registraDispositivo() {
  let id;
  try {
    id = localStorage.getItem('noteav-dispositivo');
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); localStorage.setItem('noteav-dispositivo', id); }
  } catch (e) { id = 'senza-memoria'; }
  const ua = navigator.userAgent;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'altro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  const app = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 'app' : browser;
  sb.rpc('registra_dispositivo', { p_dispositivo: id, p_descrizione: sistema + ' · ' + app }).then(() => {}, () => {});
}

/* Animazione d'ingresso: una cucitura che corre e il nome che compare. */
function splash() {
  S.splashFatto = true;
  return new Promise(fatto => {
    const disegno = svg(
      '<svg viewBox="0 0 420 220" aria-hidden="true">' +
      '<text class="nome" x="210" y="88" text-anchor="middle">Note Av</text>' +
      '<text class="motto" x="210" y="120" text-anchor="middle">UN PUNTO ALLA VOLTA</text>' +
      '<path class="cucitura" d="M16 182 C 100 142, 160 142, 210 168 S 320 200, 404 152"/>' +
      '<path class="filo" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" d="M16 182 C 100 142, 160 142, 210 168 S 320 200, 404 152"/></svg>');
    // Il "filo", del colore dello sfondo, copre la cucitura e scorre via da
    // sinistra a destra: sembra che venga cucita mentre la guardi.
    const filo = disegno.querySelector('.filo');
    const el = h('div', { class: 'splash', onclick: () => chiudi() }, disegno);
    document.body.append(el);
    let chiuso = false;
    const chiudi = () => { if (chiuso) return; chiuso = true; el.classList.add('via'); setTimeout(() => el.remove(), 700); fatto(); };
    const lento = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      filo.style.transition = lento ? 'stroke-dashoffset 1.9s cubic-bezier(.45,.05,.35,1)' : 'none';
      filo.style.strokeDashoffset = '-1';
      el.classList.add('vai');
    }));
    setTimeout(chiudi, lento ? 2900 : 600);
  });
}

/* ---------------------------------------------------------------------------
   Dati
   --------------------------------------------------------------------------- */

async function caricaBase() {
  S.subs = await q(sb.from('sub').select('*').order('ordine').order('nome'));
  const st = await q(sb.from('stato_dati').select('*'));
  S.stato = st[0] || null;
}

function subVisibili() {
  if (S.io === 'sub') return [S.chi.sub_id];
  return S.subSel === '*' ? S.subs.map(s => s.id) : [S.subSel];
}

async function caricaRighe() {
  const ids = subVisibili();
  if (!ids.length) { S.righe = []; S.msgs = []; S.invii = []; return; }
  const [righe, msgs, invii] = await Promise.all([
    q(sb.from('riga').select('*').in('sub_id', ids)),
    q(sb.from('messaggio').select('*').in('sub_id', ids).order('id')),
    q(sb.from('invio').select('*').in('sub_id', ids).is('letto_il', null)),
  ]);
  S.righe = righe; S.msgs = msgs; S.invii = invii;
}

async function caricaMessaggi(subId) {
  const nuovi = await q(sb.from('messaggio').select('*').eq('sub_id', subId).order('id'));
  S.msgs = S.msgs.filter(m => m.sub_id !== subId).concat(nuovi);
}

function chiave(subId, com) { return subId + '|' + com; }

function indiceMessaggi() {
  const idx = new Map();
  for (const m of S.msgs) {
    const k = chiave(m.sub_id, m.commessa);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(m);
  }
  return idx;
}

function statoRiga(r, idx) {
  const ms = idx.get(chiave(r.sub_id, r.commessa)) || [];
  const inviati = ms.filter(m => m.inviata_il).sort((a, b) => (a.inviata_il < b.inviata_il ? -1 : a.inviata_il > b.inviata_il ? 1 : a.id - b.id));
  const ultimo = tipo => inviati.filter(m => m.tipo === tipo).pop() || null;
  const bozza = tipo => ms.find(m => m.tipo === tipo && m.autore === S.io && !m.inviata_il) || null;
  const s = {
    ms, nota: ultimo('nota'), risposta: ultimo('risposta'), data: ultimo('data'),
    bNota: bozza('nota'), bRisposta: bozza('risposta'), bData: bozza('data'),
  };
  s.dataEff = s.bData ? s.bData.data : s.data ? s.data.data : null;
  const soglia = S.evidenza[r.sub_id];
  s.nuovo = !!soglia && inviati.some(m => m.autore !== S.io && m.inviata_il >= soglia);
  s.ritardo = !!s.dataEff && s.dataEff < oggiIso() && r.aperte > 0;
  return s;
}

function bozzePerSub() {
  const n = {};
  const visti = new Set();
  for (const m of S.msgs) {
    if (m.inviata_il || m.autore !== S.io) continue;
    const k = chiave(m.sub_id, m.commessa);
    if (visti.has(k)) continue;
    visti.add(k);
    n[m.sub_id] = (n[m.sub_id] || 0) + 1;
  }
  return n;
}

/* ---------------------------------------------------------------------------
   Guscio
   --------------------------------------------------------------------------- */

function disegna() {
  const viste = S.io === 'admin' ? ['bacheca', 'righe', 'carico', 'consegne', 'accessi'] : ['righe', 'carico', 'consegne'];
  const logo = h('div', { class: 'logo' }); logo.append(svg(LOGO));
  const sotto = S.stato && S.stato.aggiornato ? 'Numeri aggiornati il ' + fmtQuando(S.stato.aggiornato) : 'Numeri non ancora caricati';
  const titolo = S.io === 'admin' ? 'Note Av' : nomeSub(S.chi.sub_id);
  const testata = h('header', { class: 'testata' },
    h('div', { class: 'riga1' }, logo,
      h('div', { class: 'titolo' }, h('b', null, titolo), h('small', null, sotto)),
      h('button', { class: 'esci', onclick: () => esci() }, 'Esci')),
    h('nav', { class: 'schede', role: 'tablist' },
      viste.map(v => h('button', { role: 'tab', 'aria-selected': String(S.vista === v), onclick: () => vai(v) }, NOMI_VISTA[v]))));
  const corpo = h('main', { id: 'corpo' }, h('div', { class: 'caricamento' }, h('span', { class: 'punto' })));
  app.replaceChildren(testata, corpo, h('div', { id: 'barra' }));
  ({ bacheca: vistaBacheca, righe: vistaRighe, carico: vistaCarico, consegne: vistaConsegne, accessi: vistaAccessi })[S.vista]()
    .catch(e => gestisciErrore(e, S.vista));
}

function vai(vista, subSel) {
  S.vista = vista;
  if (subSel !== undefined) S.subSel = subSel;
  S.archivio = false;
  disegna();
  window.scrollTo(0, 0);
}

function corpo() { return document.getElementById('corpo'); }

function filtroSub(onCambio, conTutti = true) {
  if (S.io !== 'admin') return null;
  const nonLetti = new Set(S.invii.filter(i => i.da === 'sub').map(i => i.sub_id));
  const voci = (conTutti ? [['*', 'Tutti']] : []).concat(S.subs.map(s => [s.id, s.nome]));
  return h('div', { class: 'filtri' }, voci.map(([id, nome]) =>
    h('button', { class: 'chip', 'aria-pressed': String(S.subSel === id), onclick: () => { S.subSel = id; onCambio(); } },
      nonLetti.has(id) ? h('span', { class: 'pallino' }) : null, nome)));
}

/* ---------------------------------------------------------------------------
   Righe: Note, Risposte, Data Prevista
   --------------------------------------------------------------------------- */

async function vistaRighe() {
  await caricaRighe();
  // Righe "nuove": arrivate dall'altra parte e non ancora lette. La soglia si
  // fissa all'apertura, cosi' l'evidenza resta finche' non si cambia pagina.
  S.evidenza = {};
  for (const i of S.invii) {
    if (i.da === S.io) continue;
    if (!S.evidenza[i.sub_id] || i.creato_il < S.evidenza[i.sub_id]) S.evidenza[i.sub_id] = new Date(new Date(i.creato_il).getTime() - 3000).toISOString();
  }
  const daSegnare = [...new Set(S.invii.filter(i => i.da !== S.io).map(i => i.sub_id))];
  disegnaRighe();
  for (const id of daSegnare) sb.rpc('segna_letto', { p_sub: id }).then(() => {}, () => {});
}

function disegnaRighe() {
  const idx = indiceMessaggi();
  const tutte = S.righe.map(r => ({ r, s: statoRiga(r, idx) }));
  const elenco = S.archivio
    ? tutte.filter(x => x.r.aperte === 0 && x.s.ms.some(m => m.inviata_il))
    : tutte.filter(x => x.r.aperte > 0);
  elenco.sort((a, b) => (b.s.nuovo - a.s.nuovo) || (b.s.ritardo - a.s.ritardo)
    || String(a.r.scadenza || '9999').localeCompare(String(b.r.scadenza || '9999'))
    || a.r.commessa.localeCompare(b.r.commessa));

  const c = corpo();
  const conSub = S.io === 'admin' && S.subSel === '*';
  const totAperte = elenco.reduce((t, x) => t + x.r.aperte, 0);
  const nNuove = elenco.filter(x => x.s.nuovo).length;
  const nRitardo = elenco.filter(x => x.s.ritardo).length;
  const intest = h('div', { class: 'intestazione' },
    h('h2', null, S.archivio ? 'Archivio' : 'Righe'),
    h('p', null, S.archivio
      ? elenco.length + ' commesse chiuse con note'
      : elenco.length + ' commesse in casa · ' + pz(totAperte) + ' pezzi aperti'
        + (nNuove ? ' · ' + nNuove + (S.io === 'admin' ? (nNuove === 1 ? ' risposta nuova' : ' risposte nuove') : (nNuove === 1 ? ' nota nuova' : ' note nuove')) : '')
        + (nRitardo ? ' · ' + nRitardo + ' in ritardo' : '')));

  const testa = ['Commessa', conSub ? 'Sub' : null, 'Modello', 'Parte', 'Descrizione', 'Stagione', 'Lanciata', 'Scadenza', 'Aperte', 'Nota', 'Risposta', 'Data prevista']
    .filter(Boolean);
  const numeriche = new Set(['Lanciata', 'Aperte']);
  const tab = h('table', { class: 't' },
    h('thead', null, h('tr', null, testa.map(t => h('th', { class: numeriche.has(t) ? 'num' : null }, t)))),
    h('tbody', null, elenco.map(x => rigaRighe(x.r, x.s, conSub))));

  riempi(c,
    filtroSub(() => vistaRighe().catch(e => gestisciErrore(e, 'righe'))),
    intest,
    elenco.length ? h('div', { class: 'tabella-box' }, tab)
      : h('div', { class: 'vuoto' }, S.archivio ? 'Nessuna commessa in archivio.' : 'Nessuna commessa in casa in questo momento.'),
    h('p', { class: 'piede' }, h('button', { class: 'link', onclick: () => { S.archivio = !S.archivio; disegnaRighe(); } },
      S.archivio ? '← Torna alle Righe' : 'Apri l’archivio delle commesse chiuse')));
  disegnaBarra();
}

function rigaRighe(r, s, conSub) {
  const admin = S.io === 'admin';
  const sola = S.archivio;
  const etichette = [];
  if (s.nuovo) etichette.push(h('span', { class: 'etichetta nuova' }, admin ? 'Risposta nuova' : 'Nota nuova'));
  if (s.ritardo) etichette.push(h('span', { class: 'etichetta rossa' }, 'In ritardo'));
  if (r.stato === 'fuori') etichette.push(h('span', { class: 'etichetta' }, 'Fuori Carico'));

  const cellaComm = h('td', { class: 'testa', 'data-l': 'Commessa' },
    h('div', null, h('span', { class: 'cod' }, r.commessa), ' ',
      r.diba ? h('button', { class: 'diba', onclick: () => apriDiba(r) }, 'Distinta') : null),
    etichette.length ? h('div', { style: 'margin-top:4px;display:flex;gap:6px;flex-wrap:wrap' }, etichette) : null,
    h('button', { class: 'link', style: 'font-size:13px', onclick: () => apriStorico(r) }, 'Storico'));

  // Nota (scrive l'Admin)
  let cellaNota;
  if (admin && !sola) {
    cellaNota = h('td', { class: 'blocco', 'data-l': 'Nota' },
      campoTesto(r, 'nota', s.bNota ? s.bNota.testo : (s.nota ? s.nota.testo : ''), !!s.bNota),
      s.nota ? h('span', { class: 'chi-quando' }, 'Inviata ' + fmtQuando(s.nota.inviata_il)) : null);
  } else {
    cellaNota = h('td', { class: 'blocco', 'data-l': 'Nota' },
      h('div', { class: 'testo-nota' + (s.nota && s.nota.testo ? '' : ' vuota') }, s.nota && s.nota.testo ? s.nota.testo : 'Nessuna nota'),
      s.nota ? h('span', { class: 'chi-quando' }, fmtQuando(s.nota.inviata_il)) : null);
  }
  // Risposta (scrive il Sub)
  let cellaRisp;
  if (!admin && !sola) {
    cellaRisp = h('td', { class: 'blocco', 'data-l': 'Risposta' },
      campoTesto(r, 'risposta', s.bRisposta ? s.bRisposta.testo : (s.risposta ? s.risposta.testo : ''), !!s.bRisposta),
      s.risposta ? h('span', { class: 'chi-quando' }, 'Inviata ' + fmtQuando(s.risposta.inviata_il)) : null);
  } else {
    cellaRisp = h('td', { class: 'blocco', 'data-l': 'Risposta' },
      h('div', { class: 'testo-nota' + (s.risposta && s.risposta.testo ? '' : ' vuota') }, s.risposta && s.risposta.testo ? s.risposta.testo : 'Nessuna risposta'),
      s.risposta ? h('span', { class: 'chi-quando' }, fmtQuando(s.risposta.inviata_il)) : null);
  }
  // Data Prevista (la possono mettere entrambi)
  const chiData = s.bData ? 'Da inviare' : s.data ? (s.data.autore === 'admin' ? 'Messa dall’ufficio ' : 'Messa dal Sub ') + fmtQuando(s.data.inviata_il) : null;
  const cellaData = h('td', { 'data-l': 'Data prevista' },
    h('div', null,
      sola ? h('span', null, s.dataEff ? fmtData(s.dataEff) : '—')
        : campoData(r, s.dataEff),
      chiData ? h('span', { class: 'chi-quando' }, chiData) : null));

  return h('tr', { class: (s.ritardo ? 'ritardo ' : '') + (s.nuovo ? 'nuovo' : '') },
    cellaComm,
    conSub ? h('td', { 'data-l': 'Sub' }, nomeSub(r.sub_id)) : null,
    h('td', { 'data-l': 'Modello' }, r.modello || ''),
    h('td', { 'data-l': 'Parte', class: r.parte ? null : 'vuota-m' }, r.parte || ''),
    h('td', { 'data-l': 'Descrizione' }, r.descrizione || ''),
    h('td', { 'data-l': 'Stagione', class: r.stagione ? null : 'vuota-m' }, r.stagione || ''),
    h('td', { class: 'num', 'data-l': 'Lanciata' }, pz(r.lanciata)),
    h('td', { 'data-l': 'Scadenza' }, fmtData(r.scadenza)),
    h('td', { class: 'num', 'data-l': 'Aperte' }, h('span', { class: 'grande' }, pz(r.aperte))),
    cellaNota, cellaRisp, cellaData);
}

const _attese = new Map();
function salvaPresto(r, tipo, valori, segno) {
  const k = chiave(r.sub_id, r.commessa) + '|' + tipo;
  clearTimeout(_attese.get(k));
  segno.textContent = 'Salvataggio…';
  _attese.set(k, setTimeout(async () => {
    _attese.delete(k);
    try {
      await q(sb.rpc('salva_bozza', Object.assign({ p_sub: r.sub_id, p_commessa: r.commessa, p_tipo: tipo }, valori)));
      await caricaMessaggi(r.sub_id);
      const s = statoRiga(r, indiceMessaggi());
      const bozza = tipo === 'nota' ? s.bNota : tipo === 'risposta' ? s.bRisposta : s.bData;
      segno.textContent = bozza ? 'Salvata · da inviare' : '';
      disegnaBarra();
    } catch (e) {
      segno.textContent = 'Non salvata: riprova';
      gestisciErrore(e, 'salva');
    }
  }, 700));
}

function campoTesto(r, tipo, valore, inBozza) {
  const segno = h('span', { class: 'chi-quando' }, inBozza ? 'Salvata · da inviare' : '');
  const area = h('textarea', { class: 'nota', rows: '2', maxlength: '2000', value: valore || '',
    placeholder: tipo === 'nota' ? 'Scrivi una nota per il Sub…' : 'Scrivi la tua risposta…',
    oninput: () => salvaPresto(r, tipo, { p_testo: area.value }, segno) });
  return h('div', null, area, segno);
}

function campoData(r, valore) {
  const segno = h('span', { class: 'chi-quando' });
  const input = h('input', { class: 'data', type: 'date', value: valore || '',
    onchange: () => salvaPresto(r, 'data', { p_data: input.value || null }, segno) });
  return h('div', null, input, segno);
}

function disegnaBarra() {
  const barra = document.getElementById('barra');
  if (!barra) return;
  if (S.vista !== 'righe' || S.archivio) { barra.replaceChildren(); return; }
  const bozze = bozzePerSub();
  const ids = Object.keys(bozze);
  if (S.io === 'sub') {
    const n = bozze[S.chi.sub_id] || 0;
    barra.replaceChildren(h('div', { class: 'barra-invio' },
      h('button', { class: 'tasto', disabled: !n, onclick: ev => invia(S.chi.sub_id, ev.currentTarget) },
        n ? 'Invia risposte (' + n + ')' : 'Nessuna risposta da inviare')));
    return;
  }
  if (!ids.length) { barra.replaceChildren(); return; }
  barra.replaceChildren(h('div', { class: 'barra-invio' }, ids.map(id =>
    h('button', { class: 'tasto', onclick: ev => invia(id, ev.currentTarget) }, 'Invia a ' + nomeSub(id) + ' (' + bozze[id] + ')'))));
}

async function invia(subId, tasto) {
  // aspetta i salvataggi ancora in corso
  if (_attese.size) { toast('Un attimo, sto salvando…'); setTimeout(() => invia(subId, tasto), 900); return; }
  tasto.disabled = true;
  try {
    const n = await q(sb.rpc('invia', { p_sub: subId }));
    toast(S.io === 'admin' ? (n === 1 ? 'Inviata 1 nota a ' : 'Inviate ' + n + ' note a ') + nomeSub(subId) : 'Risposte inviate all’ufficio: grazie!');
    await caricaMessaggi(subId);
    disegnaRighe();
  } catch (e) { tasto.disabled = false; gestisciErrore(e, 'invia'); }
}

async function apriDiba(r) {
  const { data, error } = await sb.storage.from('diba').createSignedUrl(r.sub_id + '/' + r.commessa + '.pdf', 120);
  if (error || !data) return toast('Distinta non disponibile.');
  window.open(data.signedUrl, '_blank', 'noopener');
}

function apriStorico(r) {
  const voci = S.msgs.filter(m => m.sub_id === r.sub_id && m.commessa === r.commessa && m.inviata_il)
    .sort((a, b) => (a.inviata_il < b.inviata_il ? 1 : -1));
  const chi = m => m.autore === 'admin' ? 'Ufficio produzione' : nomeSub(m.sub_id);
  const cosa = m => m.tipo === 'data' ? 'Data prevista: ' + (m.data ? fmtData(m.data) : 'tolta') : (m.testo || '(testo cancellato)');
  const velo = h('div', { class: 'velo', onclick: ev => { if (ev.target === velo) velo.remove(); } },
    h('div', { class: 'finestra', role: 'dialog', 'aria-modal': 'true' },
      h('h3', null, 'Storico ' + r.commessa),
      h('p', { class: 'tenue', style: 'margin:0' }, [r.modello, r.descrizione].filter(Boolean).join(' · ')),
      voci.length
        ? h('ul', { class: 'storico' }, voci.map(m => h('li', { class: m.autore },
            h('div', { class: 'quando' }, chi(m) + ' · ' + fmtQuando(m.inviata_il)),
            h('div', { class: 'testo-nota' }, cosa(m)))))
        : h('p', { class: 'vuoto', style: 'margin:14px 0' }, 'Ancora nessun messaggio.'),
      h('button', { class: 'tasto pieno chiaro', onclick: () => velo.remove() }, 'Chiudi')));
  document.body.append(velo);
}

/* ---------------------------------------------------------------------------
   Carico del Sub
   --------------------------------------------------------------------------- */

async function vistaCarico() {
  const ids = subVisibili();
  S.righe = ids.length ? await q(sb.from('riga').select('*').in('sub_id', ids).eq('nel_carico', true)) : [];
  const elenco = S.righe.slice().sort((a, b) =>
    String(a.scadenza || '9999').localeCompare(String(b.scadenza || '9999')) || a.commessa.localeCompare(b.commessa));
  const conSub = S.io === 'admin' && S.subSel === '*';
  const tot = k => elenco.reduce((t, r) => t + (r[k] || 0), 0);
  const testa = ['Commessa', conSub ? 'Sub' : null, 'Modello', 'Descrizione', 'Scadenza', 'Lanciata', 'Aperte', 'In arrivo', 'Chiuse', 'Rimaste', 'Stato'].filter(Boolean);
  const num = new Set(['Lanciata', 'Aperte', 'In arrivo', 'Chiuse', 'Rimaste']);
  const tab = h('table', { class: 't' },
    h('thead', null, h('tr', null, testa.map(t => h('th', { class: num.has(t) ? 'num' : null }, t)))),
    h('tbody', null, elenco.map(r => h('tr', null,
      h('td', { class: 'testa', 'data-l': 'Commessa' },
        h('span', { class: 'cod' }, r.commessa), ' ',
        r.diba ? h('button', { class: 'diba', onclick: () => apriDiba(r) }, 'Distinta') : null,
        dettaglioCarico(r)),
      conSub ? h('td', { 'data-l': 'Sub' }, nomeSub(r.sub_id)) : null,
      h('td', { 'data-l': 'Modello' }, [r.modello, r.parte].filter(Boolean).join(' ')),
      h('td', { 'data-l': 'Descrizione' }, r.descrizione || ''),
      h('td', { 'data-l': 'Scadenza' }, fmtData(r.scadenza)),
      h('td', { class: 'num', 'data-l': 'Lanciata' }, pz(r.lanciata)),
      h('td', { class: 'num', 'data-l': 'Aperte' }, h('b', null, pz(r.aperte))),
      h('td', { class: 'num', 'data-l': 'In arrivo' }, pz(r.in_arrivo)),
      h('td', { class: 'num', 'data-l': 'Chiuse' }, pz(r.chiuse)),
      h('td', { class: 'num', 'data-l': 'Rimaste' }, pz(r.rimaste)),
      h('td', { 'data-l': 'Stato' }, STATI[r.stato] || '')))));
  riempi(corpo(),
    filtroSub(() => vistaCarico().catch(e => gestisciErrore(e, 'carico'))),
    h('div', { class: 'intestazione' }, h('h2', null, 'Carico'),
      h('p', null, elenco.length + ' commesse · in casa ' + pz(tot('aperte')) + ' pz · in arrivo ' + pz(tot('in_arrivo')) + ' pz · rimaste ' + pz(tot('rimaste')) + ' pz')),
    elenco.length ? h('div', { class: 'tabella-box' }, tab) : h('div', { class: 'vuoto' }, 'Nessuna commessa assegnata.'));
  disegnaBarra();
}

function dettaglioCarico(r) {
  const bolle = r.bolle || [], monte = r.monte || [];
  if (!bolle.length && !monte.length) return null;
  return h('details', { class: 'dettaglio' }, h('summary', null, 'Dettaglio'),
    bolle.length ? h('div', null, 'Bollette in casa:', h('ul', null, bolle.map(b =>
      h('li', null, 'n. ' + b.b + ': ' + pz(b.q) + ' pz' + (b.dal ? ' dal ' + fmtData(b.dal) : ''))))) : null,
    monte.length ? h('div', null, 'Pezzi in arrivo, ora in:', h('ul', null, monte.map(m =>
      h('li', null, (m.d || '').toLowerCase() + ': ' + pz(m.pz) + ' pz')))) : null);
}

/* ---------------------------------------------------------------------------
   Consegne: Riconsegnato e Target Settimanale
   --------------------------------------------------------------------------- */

async function vistaConsegne() {
  const ids = subVisibili();
  const lun = S.lunedi;
  const dom = aggiungiGiorni(lun, 6);
  const [ric, target] = ids.length ? await Promise.all([
    q(sb.from('riconsegnato').select('*').in('sub_id', ids).gte('giorno', iso(lun)).lte('giorno', iso(dom))),
    q(sb.from('target').select('*').in('sub_id', ids).order('dal_lunedi')),
  ]) : [[], []];

  const giorni = [0, 1, 2, 3, 4, 5, 6].map(i => iso(aggiungiGiorni(lun, i)));
  const conPezzi = new Set(ric.map(x => x.giorno));
  const colonne = giorni.filter((g, i) => i < 5 || conPezzi.has(g));
  const stima = ric.some(x => x.fonte === 'stima');
  const corrente = iso(lun) === iso(lunediDi(new Date()));

  const blocchi = [];
  for (const id of ids) {
    const mie = ric.filter(x => x.sub_id === id);
    const tg = target.filter(t => t.sub_id === id && t.dal_lunedi <= iso(lun)).pop();
    if (S.io === 'admin' && S.subSel === '*' && !mie.length && !tg) continue;
    const perComm = new Map();
    for (const x of mie) {
      if (!perComm.has(x.commessa)) perComm.set(x.commessa, { x, g: {} });
      const c = perComm.get(x.commessa);
      c.g[x.giorno] = (c.g[x.giorno] || 0) + x.pezzi;
    }
    const totG = {};
    for (const c of perComm.values()) for (const [g, n] of Object.entries(c.g)) totG[g] = (totG[g] || 0) + n;
    const totale = Object.values(totG).reduce((a, b) => a + b, 0);
    const testa = ['Commessa', 'Modello', 'Parte', 'Descrizione'].concat(colonne.map(g => GIORNI[(daIso(g).getDay() + 6) % 7] + ' ' + fmtData(g).slice(0, 5)), ['Totale']);
    const righe = [...perComm.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([com, c]) => h('tr', null,
      h('td', { class: 'testa', 'data-l': 'Commessa' }, h('span', { class: 'cod' }, com)),
      h('td', { 'data-l': 'Modello' }, c.x.modello || ''),
      h('td', { 'data-l': 'Parte', class: c.x.parte ? null : 'vuota-m' }, c.x.parte || ''),
      h('td', { 'data-l': 'Descrizione' }, c.x.descrizione || ''),
      colonne.map(g => h('td', { class: 'num' + (c.g[g] ? '' : ' vuota-m'), 'data-l': GIORNI[(daIso(g).getDay() + 6) % 7] + ' ' + fmtData(g).slice(0, 5) }, c.g[g] ? pz(c.g[g]) : '')),
      h('td', { class: 'num', 'data-l': 'Totale' }, h('b', null, pz(Object.values(c.g).reduce((a, b) => a + b, 0))))));
    const diff = tg ? totale - tg.pezzi : null;
    const cellaTarget = (S.io === 'admin' && corrente) ? campoTarget(id, tg) : h('span', null, tg ? pz(tg.pezzi) + ' pz' : 'non impostato');
    const riepilogo = h('tr', { class: 'totale' },
      h('td', { class: 'testa', 'data-l': '' }, 'Totale settimana: ' + pz(totale) + ' pz'),
      h('td', { 'data-l': 'Target', colspan: '3' }, h('span', { class: 'tenue' }, 'Target: '), cellaTarget,
        diff !== null ? h('span', { class: diff >= 0 ? 'diff-pos' : 'diff-neg', style: 'margin-left:10px;font-weight:600' }, (diff >= 0 ? '+' : '') + pz(diff) + ' pz') : null),
      colonne.map(g => h('td', { class: 'num', 'data-l': GIORNI[(daIso(g).getDay() + 6) % 7] }, totG[g] ? pz(totG[g]) : '')),
      h('td', { class: 'num', 'data-l': 'Totale' }, pz(totale)));
    blocchi.push(
      (S.io === 'admin' && ids.length > 1) ? h('h3', { class: 'gruppo-sub' }, nomeSub(id)) : null,
      h('div', { class: 'tabella-box' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, testa.map((t, i) => h('th', { class: i >= 4 ? 'num' : null }, t)))),
        h('tbody', null, righe, riepilogo))));
  }

  const nav = h('div', { class: 'settimana' },
    h('button', { class: 'freccia', 'aria-label': 'Settimana prima', onclick: () => { S.lunedi = aggiungiGiorni(S.lunedi, -7); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, '‹'),
    h('b', null, 'Settimana ' + settimanaIso(lun) + ' · ' + fmtData(iso(lun)).slice(0, 5) + '–' + fmtData(iso(aggiungiGiorni(lun, 4))).slice(0, 5)),
    h('button', { class: 'freccia', 'aria-label': 'Settimana dopo', disabled: corrente, onclick: () => { S.lunedi = aggiungiGiorni(S.lunedi, 7); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, '›'),
    corrente ? null : h('button', { class: 'tasto piccolo chiaro', onclick: () => { S.lunedi = lunediDi(new Date()); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, 'Questa settimana'));

  riempi(corpo(),
    filtroSub(() => vistaConsegne().catch(e => gestisciErrore(e, 'consegne'))),
    h('div', { class: 'intestazione' }, h('h2', null, 'Consegne'),
      h('p', null, 'Pezzi riconsegnati giorno per giorno' + (stima ? ' · ≈ alcuni giorni sono stimati (data dell’ultima chiusura della bolletta)' : ''))),
    nav,
    blocchi.length ? blocchi : h('div', { class: 'vuoto' }, 'Nessuna consegna in questa settimana.'));
  disegnaBarra();
}

function campoTarget(subId, tg) {
  const input = h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: tg ? String(tg.pezzi) : '', placeholder: 'pezzi' });
  const salva = h('button', { class: 'tasto piccolo', onclick: async () => {
    const n = parseInt(input.value, 10);
    if (!(n >= 0)) return toast('Scrivi un numero di pezzi.');
    try { await q(sb.rpc('imposta_target', { p_sub: subId, p_pezzi: n })); toast('Target salvato: vale da questa settimana in poi.'); vistaConsegne(); }
    catch (e) { gestisciErrore(e, 'target'); }
  } }, 'Salva');
  return h('span', { class: 'target-box' }, input, salva);
}

/* ---------------------------------------------------------------------------
   Bacheca (solo Admin)
   --------------------------------------------------------------------------- */

async function vistaBacheca() {
  const giorno = await q(sb.rpc('giorno_bacheca'));
  const [pos, invii, eventi] = await Promise.all([
    q(sb.from('bacheca').select('*').eq('giorno', giorno)),
    q(sb.from('invio').select('*').eq('da', 'sub').is('letto_il', null)),
    q(sb.from('evento').select('*').is('letto_il', null).order('id', { ascending: false })),
  ]);
  S.invii = invii;
  const posizione = new Map(pos.map(p => [p.sub_id, p]));
  const nonLetti = new Set(invii.map(i => i.sub_id));
  const attivi = S.subs.filter(s => !s.senza_lavoro_dal);
  const fermi = S.subs.filter(s => s.senza_lavoro_dal);

  const cartellino = s => {
    const menu = h('div', { class: 'menu-cartellino nascosto' },
      h('button', { class: 'tasto piccolo', onclick: () => vai('righe', s.id) }, 'Apri le Righe'),
      COLONNE.filter(([k]) => k !== ((posizione.get(s.id) || {}).colonna || 'da_controllare'))
        .map(([k, nome]) => h('button', { class: 'tasto piccolo chiaro', onclick: () => sposta(s.id, k) }, '→ ' + nome)));
    const iniziale = h('div', { class: 'iniziale', style: 'background:' + tinta(s.id) }, s.nome.slice(0, 1).toUpperCase());
    const c = h('div', { class: 'cartellino', draggable: 'true', 'data-sub': s.id,
      ondragstart: ev => { ev.dataTransfer.setData('text/plain', s.id); c.classList.add('trascina'); },
      ondragend: () => c.classList.remove('trascina'),
      onclick: () => menu.classList.toggle('nascosto') },
      iniziale, h('div', { class: 'nome' }, s.nome),
      nonLetti.has(s.id) ? h('span', { class: 'pallino', title: 'Risposte nuove' }) : null);
    return [c, menu];
  };

  const colonne = COLONNE.map(([k, nome]) => {
    const dentro = attivi.filter(s => ((posizione.get(s.id) || {}).colonna || 'da_controllare') === k)
      .sort((a, b) => ((posizione.get(a.id) || {}).ordine || 0) - ((posizione.get(b.id) || {}).ordine || 0) || a.ordine - b.ordine);
    const col = h('section', { class: 'colonna', 'data-col': k,
      ondragover: ev => { ev.preventDefault(); col.classList.add('sopra'); },
      ondragleave: () => col.classList.remove('sopra'),
      ondrop: ev => { ev.preventDefault(); col.classList.remove('sopra'); const id = ev.dataTransfer.getData('text/plain'); if (id) sposta(id, k); } },
      h('h3', null, h('span', null, nome), h('span', null, String(dentro.length))),
      dentro.map(cartellino));
    return col;
  });

  const avvisi = eventi.length ? h('div', { class: 'avvisi' }, eventi.slice(0, 8).map(e => h('div', { class: 'avviso' },
    h('span', null, e.testo, h('small', { class: 'tenue' }, ' · ' + fmtQuando(e.creato_il))),
    h('button', { class: 'tasto piccolo chiaro', onclick: async () => { await sb.rpc('segna_evento_letto', { p_id: e.id }); vistaBacheca(); } }, 'Ok')))) : null;

  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  riempi(corpo(),
    h('div', { class: 'intestazione' }, h('h2', null, 'Il giro di oggi'), h('p', null, oggi.charAt(0).toUpperCase() + oggi.slice(1) + ' · si riparte da capo ogni mattina alle 8')),
    avvisi,
    h('div', { class: 'bacheca' }, colonne),
    fermi.length ? h('div', { class: 'senza-lavoro' }, h('h3', null, 'Sub senza lavoro'),
      h('div', { class: 'bacheca' }, h('div', null, fermi.map(cartellino)))) : null);
  disegnaBarra();
}

async function sposta(subId, colonna) {
  try { await q(sb.rpc('sposta_cartellino', { p_sub: subId, p_colonna: colonna, p_ordine: Date.now() % 1000000 })); }
  catch (e) { return gestisciErrore(e, 'bacheca'); }
  vistaBacheca();
}

/* ---------------------------------------------------------------------------
   Accessi (solo Admin)
   --------------------------------------------------------------------------- */

async function vistaAccessi() {
  const [profili, dispositivi] = await Promise.all([
    q(sb.from('profilo').select('*')),
    q(sb.from('dispositivo').select('*').order('ultimo_accesso', { ascending: false })),
  ]);
  const schede = S.subs.map(s => {
    const p = profili.find(x => x.sub_id === s.id);
    const disp = p ? dispositivi.filter(d => d.user_id === p.user_id) : [];
    return h('tr', null,
      h('td', { class: 'testa', 'data-l': 'Sub' }, h('b', null, s.nome), s.tipo === 'reparto' ? h('span', { class: 'etichetta', style: 'margin-left:6px' }, 'Reparto') : null),
      h('td', { 'data-l': 'Accesso' }, p ? h('span', null, 'Attivo · utente ', h('span', { class: 'cod' }, p.nome_utente)) : h('span', { class: 'tenue' }, 'Non ancora attivato')),
      h('td', { class: 'blocco', 'data-l': 'Dispositivi' }, disp.length
        ? h('ul', { style: 'margin:0;padding-left:18px' }, disp.map(d => h('li', null, (d.descrizione || '?') + ' · ultimo accesso ' + fmtQuando(d.ultimo_accesso))))
        : h('span', { class: 'tenue' }, 'Nessuno')),
      h('td', { 'data-l': '' },
        p ? h('button', { class: 'tasto piccolo chiaro', onclick: async () => {
          if (!confirm('Scollegare tutti i dispositivi di ' + s.nome + '? Dovrà rientrare con nome utente e password.')) return;
          try { const n = await q(sb.rpc('scollega_dispositivi', { p_sub: s.id })); toast('Scollegate ' + n + ' sessioni di ' + s.nome); }
          catch (e) { gestisciErrore(e, 'scollega'); }
        } }, 'Scollega dispositivi') : null,
        s.eliminazione_prevista ? h('div', { style: 'margin-top:6px' }, h('span', { class: 'etichetta rossa' }, 'Accesso eliminato il ' + fmtData(s.eliminazione_prevista)), ' ',
          h('button', { class: 'tasto piccolo', onclick: async () => { await sb.rpc('mantieni_accesso', { p_sub: s.id }); toast('Accesso mantenuto.'); vistaAccessi(); } }, 'Mantieni')) : null));
  });
  riempi(corpo(),
    h('div', { class: 'intestazione' }, h('h2', null, 'Accessi'), h('p', null, 'Chi può entrare e da quali dispositivi')),
    h('div', { class: 'tabella-box' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Sub', 'Accesso', 'Dispositivi', ''].map(t => h('th', null, t)))),
      h('tbody', null, schede))));
  disegnaBarra();
}

/* ---------------------------------------------------------------------------
   Controllo periodico: sessione ancora valida, novita' dall'altra parte
   --------------------------------------------------------------------------- */

let _timer;
function avviaControlloPeriodico() {
  clearInterval(_timer);
  _timer = setInterval(controlloPeriodico, 90 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controlloPeriodico(); });
}

async function controlloPeriodico() {
  if (!S.chi || document.hidden) return;
  if (!(await controllaSessione())) return;
  const scrivendo = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
  if (scrivendo || _attese.size || document.querySelector('.velo')) return;
  try {
    const st = await q(sb.from('stato_dati').select('*'));
    const cambiati = st[0] && (!S.stato || st[0].aggiornato !== S.stato.aggiornato);
    S.stato = st[0] || S.stato;
    if (S.vista === 'bacheca') return vistaBacheca();
    if (S.vista === 'righe' && !S.archivio) {
      const ids = subVisibili();
      const invii = await q(sb.from('invio').select('id').in('sub_id', ids).neq('da', S.io).is('letto_il', null));
      if (invii.length || cambiati) return vistaRighe();
    }
  } catch (e) { /* riprova al giro dopo */ }
}

avvio().catch(e => { console.error(e); vistaAccesso('Qualcosa non è andato: riprova.'); });
