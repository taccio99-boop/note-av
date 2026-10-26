/* =============================================================================
   NOTE AV - la pagina
   Un'unica pagina per l'Admin e per i Sub: cosa si vede lo decide il ruolo di
   chi entra, cosa si puo' leggere lo decide il database (Row Level Security).
   Nessun dato vive qui dentro: arriva tutto da Supabase dopo l'accesso.
   Il lato Sub e' pensato per chi usa poco la tecnologia: schede grandi, parole
   semplici, una guida passo passo e un solo tasto per mandare le risposte.
   ============================================================================= */
'use strict';

// INTERRUTTORE Distinte Base: true = tasto "Distinta" per Admin e Sub; false = spente per tutti.
// Spente il 23/10/2026 per la verifica del tecnico informatico, riaccese il 26/10/2026. Per spegnerle: false qui e in script\note_av_dati.py.
const MOSTRA_DIBA = true;

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
  daLeggere: 0,         // commesse con novita' dall'altra parte (pallino sulla scheda)
  cerca: '',            // testo della ricerca nelle Righe
  capito: new Map(),    // messaggio_id -> "Abbiamo capito: ..." di READLY
  archivio: false,
  lunedi: null,
  splashFatto: false,
  promptInstalla: null, // Android/PC: la richiesta d'installazione del browser
};

const NOMI_VISTA = {
  admin: { bacheca: 'Bacheca', righe: 'Righe', carico: 'Carico', consegne: 'Consegne', rientri: 'Rientri', accessi: 'Accessi' },
  sub: { righe: 'Note', carico: 'Lavoro', consegne: 'Consegne' },
};
const ICONE_VISTA = { bacheca: 'bacheca', righe: 'note', carico: 'pacco', consegne: 'furgone', rientri: 'robot', accessi: 'chiave' };
const COLONNE = [
  ['da_controllare', 'Da controllare'],
  ['in_attesa', 'In attesa di risposta'],
  ['controllato', 'Controllato'],
];
const STATI = { lav: 'In lavorazione', attesa: 'Non ancora arrivata', fuori: 'Fuori Carico' };

// Avviso sulle assegnazioni: il Sub lo legge per intero la prima volta (tasto
// "Ho capito", la data resta nel database), poi resta fisso nella pagina Lavoro.
// Se si cambia il testo, spostare AVVISO_DEL: tutti i Sub lo rivedranno.
const AVVISO_DEL = '2026-10-05';
const AVVISO_BREVE = 'Le commesse che vedi sono quelle assegnate a te in questo momento. Firenze Moda può cambiare l’assegnazione della merce quando serve alla produzione.';
const AVVISO_TESTO = [
  ['p', 'In questa app vedi le commesse e le quantità che ti sono assegnate ', ['b', 'in questo momento'], '.'],
  ['p', 'Firenze Moda si riserva di ', ['b', 'cambiare in qualsiasi momento l’assegnazione della merce'], ', e quindi delle commesse, in base alle esigenze della produzione e dei clienti. Per esempio può:'],
  ['ul', ['li', 'spostare una commessa, tutta o in parte, a un altro laboratorio;'], ['li', 'cambiare le quantità;'], ['li', 'anticipare o rimandare un lavoro.']],
  ['p', 'Quello che vedi qui serve a organizzarci meglio e ', ['b', 'non è un impegno'], ' su lavori o quantità futuri. Valgono le bollette e gli accordi presi con l’Ufficio Avanzamento Produzione.'],
  ['p', 'Se una commessa cambia o sparisce dalla tua lista e hai un dubbio, chiama l’Ufficio Avanzamento Produzione.'],
];
const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const TINTE = ['#c2541a', '#d4880f', '#2f855a', '#b0476b', '#3d7ea6', '#8a6a1f', '#6b5bb0', '#a0522d', '#2f7f7a'];

// L'icona dell'app (Alba: il sole che sorge su una cucitura), anche come logo.
const ICONA = '<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#F79A3E"/>' +
  '<g stroke="#fff" stroke-width="24" stroke-linecap="round"><line x1="256" y1="196" x2="256" y2="150"/><line x1="177" y1="221" x2="150" y2="184"/>' +
  '<line x1="335" y1="221" x2="362" y2="184"/><line x1="128" y1="292" x2="84" y2="278"/><line x1="384" y1="292" x2="428" y2="278"/></g>' +
  '<path d="M152 336 A104 104 0 0 1 360 336 Z" fill="#fff"/>' +
  '<line x1="76" y1="376" x2="436" y2="376" stroke="#fff" stroke-width="20" stroke-linecap="round" stroke-dasharray="34 26"/></svg>';

const SOLE = '<svg viewBox="0 0 64 64" aria-hidden="true"><g style="stroke:var(--sole)" stroke-width="4.5" stroke-linecap="round">' +
  '<line x1="32" y1="5" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="59"/><line x1="5" y1="32" x2="12" y2="32"/><line x1="52" y1="32" x2="59" y2="32"/>' +
  '<line x1="13" y1="13" x2="18" y2="18"/><line x1="46" y1="46" x2="51" y2="51"/><line x1="13" y1="51" x2="18" y2="46"/><line x1="46" y1="18" x2="51" y2="13"/></g>' +
  '<circle cx="32" cy="32" r="13" style="fill:var(--sole)"/></svg>';

// READLY, la micro AI che compila i Rientri: robottino stile EVE (scelto il
// 09/10). Colori pieni, niente sfumature: si ripete piu' volte nella pagina.
// Solo nelle parti dell'Admin: il Sub legge «Abbiamo capito», senza READLY.
const READLY_ICONA = '<svg class="readly-ico" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="58" fill="#F79A3E"/>' +
  '<ellipse cx="60" cy="42" rx="25" ry="21" fill="#f4f7fa"/><ellipse cx="60" cy="44" rx="19" ry="11" fill="#101820"/>' +
  '<ellipse cx="52.5" cy="44" rx="4.6" ry="2.8" fill="#5cc8ff" transform="rotate(-14 52.5 44)"/>' +
  '<ellipse cx="67.5" cy="44" rx="4.6" ry="2.8" fill="#5cc8ff" transform="rotate(14 67.5 44)"/>' +
  '<path d="M38 70C38 62 82 62 82 70C82 92 70 104 60 104C50 104 38 92 38 70Z" fill="#f4f7fa"/>' +
  '<path d="M36 70C30 76 30 86 34 92M84 70C90 76 90 86 86 92" stroke="#e2e8ee" stroke-width="7" fill="none" stroke-linecap="round"/></svg>';

// Icone a tratto (24x24), del colore del testo.
const ICONE = {
  note: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M7 9.5h10M7 13h6"/>',
  pacco: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  furgone: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  bacheca: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="16" y="4" width="5" height="7" rx="1.5"/>',
  chiave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  aiuto: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  invia: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  condividi: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1"/>',
  aggiungi: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  puntini: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  campanella: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  telefono: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  documento: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',
  fatto: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  matita: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  esci: '<path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10"/>',
  installa: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  schermo: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  storico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  attenzione: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  lente: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  excel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  robot: '<ellipse cx="12" cy="7.5" rx="6" ry="4.5"/><path d="M9.5 7.5h.01M14.5 7.5h.01"/><path d="M7.5 14c0-1.5 9-1.5 9 0 0 4-2 6.5-4.5 6.5S7.5 18 7.5 14z"/>',
  grafico: '<path d="M3 20h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="16" y="9" width="3" height="9" rx="1"/>',
  barcode: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13.5 8v8M17 8v8"/>',
};

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

function ico(nome) {
  return svg('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONE[nome] + '</svg>');
}

function logo() { const l = h('div', { class: 'logo' }); l.append(svg(ICONA)); return l; }
function readly() { return svg(READLY_ICONA); }

const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const daIso = s => { const [y, m, g] = s.split('-').map(Number); return new Date(y, m - 1, g); };
const oggiIso = () => iso(new Date());
const fmtData = s => { if (!s) return ''; const d = daIso(s.slice(0, 10)); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2); };
const fmtQuando = ts => ts ? new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const fmtOra = ts => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const pz = n => (n || 0).toLocaleString('it-IT');
function lunediDi(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
function aggiungiGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function settimanaIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const g = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - g);
  const a = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - a) / 86400000 + 1) / 7);
}

// "alle 12:36" se e' oggi, "ieri alle 18:02", altrimenti "il 30/09 alle 18:02"
function quandoParlato(ts) {
  const d = new Date(ts);
  const giorno = iso(d);
  if (giorno === oggiIso()) return 'alle ' + fmtOra(ts);
  if (giorno === iso(aggiungiGiorni(new Date(), -1))) return 'ieri alle ' + fmtOra(ts);
  return 'il ' + fmtData(giorno).slice(0, 5) + ' alle ' + fmtOra(ts);
}

function saluto() {
  const ora = new Date().getHours();
  return ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

// Piccola memoria del dispositivo (guida gia' vista, inviti chiusi...): se il
// browser non la concede, si ricorda solo finche' la pagina resta aperta.
const _memoria = {};
function ricorda(k, v) { _memoria[k] = v; try { localStorage.setItem('noteav-' + k, v); } catch (e) { /* niente */ } }
function ricordato(k) { if (k in _memoria) return _memoria[k]; try { return localStorage.getItem('noteav-' + k); } catch (e) { return null; } }

let _toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('si');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('si'), 3600);
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
  if (codice === '42501' || codice === 'PGRST301' || codice === 'PGRST303' || codice === 401) {
    const esito = await controllaSessione();
    if (esito !== 'ok' && esito !== 'rete') return;      // e' uscito: c'e' gia' la pagina d'accesso
  }
  toast(navigator.onLine === false || erroreDiRete(err) ? 'Manca la connessione a internet: riprova tra poco.' : 'Qualcosa non è andato: riprova tra poco.');
}

// Errore "non si sa": rete assente, server lento o in manutenzione. In questi
// casi NON si fa uscire nessuno: si riprova piu' tardi.
function erroreDiRete(err) {
  if (!err) return false;
  if (navigator.onLine === false) return true;
  if (window.supabase && typeof window.supabase.isAuthRetryableFetchError === 'function' && window.supabase.isAuthRetryableFetchError(err)) return true;
  if (err.name === 'AuthRetryableFetchError') return true;
  const st = Number(err.status);
  if (st === 0 || st >= 500) return true;
  return /fetch|network|load failed|timed? ?out|abort|connessione/i.test(String(err.message || '') + ' ' + String(err.details || ''));
}

/* ---------------------------------------------------------------------------
   Dispositivo: telefono o computer, app installata o no
   --------------------------------------------------------------------------- */

const UA = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/.test(UA);
const TELEFONO = IOS || ANDROID;

function standalone() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); S.promptInstalla = ev; aggiornaInviti(); });
window.addEventListener('appinstalled', () => { S.promptInstalla = null; toast('Fatto! Trovi Note Av tra le tue app.'); aggiornaInviti(); });

/* ---------------------------------------------------------------------------
   Avvio e accesso
   --------------------------------------------------------------------------- */

async function avvio() {
  if (!sb) {
    app.replaceChildren(h('div', { class: 'accesso' }, h('div', { class: 'scheda-accesso' }, marchio(),
      h('p', { class: 'errore' }, 'Configurazione mancante: avvisa l’Ufficio Avanzamento Produzione.'))));
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Il link nei messaggi porta il nome utente (?u=agena): lo si scrive nel
  // modulo d'accesso e si ripulisce l'indirizzo.
  const u = new URLSearchParams(location.search).get('u');
  if (u) { S.utenteSuggerito = u.slice(0, 40); ricorda('utente', S.utenteSuggerito); history.replaceState(null, '', location.pathname); }
  // Se supabase-js butta via la sessione (password cambiata, dispositivi
  // scollegati) mentre la pagina e' aperta, si torna alla pagina d'accesso.
  sb.auth.onAuthStateChange(evento => {
    if (evento === 'SIGNED_OUT' && S.chi && !S.uscendo) { S.chi = null; S.io = null; clearInterval(_timer); vistaAccesso('Accesso non più valido: rientra.'); }
  });
  await entra();
}

/* Lo stato dell'accesso, senza mai far uscire qualcuno per sbaglio:
     ok            -> dentro (con i dati di chi_sono)
     fuori         -> non c'e' una sessione salvata, o Supabase dice che e' finita
     scaduta       -> sono passati i 30 giorni, o l'Admin ha scollegato i dispositivi
     non-abilitato -> l'utente non ha un profilo Note Av
     rete          -> non si riesce a saperlo adesso (niente internet): si riprova */
async function statoSessione() {
  let sess;
  try { sess = await sb.auth.getSession(); } catch (e) { return { esito: 'rete' }; }
  if (sess.error) return { esito: erroreDiRete(sess.error) ? 'rete' : 'fuori' };
  if (!sess.data || !sess.data.session) return { esito: 'fuori' };
  let r;
  try { r = await sb.rpc('chi_sono'); } catch (e) { return { esito: 'rete' }; }
  if (r.error) {
    if (erroreDiRete(r.error) || r.status === 0 || r.status >= 500) return { esito: 'rete' };
    // gettone d'accesso rifiutato: si prova a rinnovarlo una volta
    const rin = await sb.auth.refreshSession().catch(e => ({ error: e }));
    if (rin.error) return { esito: erroreDiRete(rin.error) ? 'rete' : 'fuori' };
    try { r = await sb.rpc('chi_sono'); } catch (e) { return { esito: 'rete' }; }
    if (r.error) return { esito: 'rete' };
  }
  if (!r.data) return { esito: 'non-abilitato' };
  if (!r.data.sessione_valida) return { esito: 'scaduta' };
  return { esito: 'ok', chi: r.data };
}

async function entra() {
  const st = await statoSessione();
  if (st.esito === 'fuori') return vistaAccesso();
  if (st.esito === 'rete') return vistaSenzaRete();
  if (st.esito === 'non-abilitato') return esci('Questo utente non è abilitato a Note Av.');
  if (st.esito === 'scaduta') return esci('Sono passati 30 giorni (o l’accesso è stato chiuso): rientra con nome utente e password.');
  fermaRiprova();
  return dopoAccesso(st.chi);
}

/* Niente internet all'apertura: la sessione resta salvata, si aspetta e si
   riprova da soli. Nessuna password da riscrivere. */
let _riprova;
function fermaRiprova() { clearTimeout(_riprova); window.removeEventListener('online', entra); }
function vistaSenzaRete() {
  fermaRiprova();
  _riprova = setTimeout(entra, 15000);
  window.addEventListener('online', entra, { once: true });
  const tasto = h('button', { class: 'tasto pieno', onclick: () => { tasto.disabled = true; tasto.textContent = 'Un momento…'; entra(); } }, 'Riprova');
  // Chi ha lo Sparo spara anche senza rete: gli Spari partono quando torna.
  const sparo = ricordato('sparo-sub') ? (caricaSpariLocali(), tastoSparo(SP.modo)) : null;
  app.replaceChildren(h('div', { class: 'accesso' }, h('div', { class: 'colonna-accesso' }, h('div', { class: 'scheda-accesso' },
    marchio(),
    h('h2', null, 'Non riesco a collegarmi'),
    h('p', null, 'Controlla che il telefono o il computer sia collegato a internet (Wi-Fi o dati). Riprovo da solo tra pochi secondi.'),
    h('p', { class: 'nota-piccola', style: 'margin:0 0 16px' }, 'Non serve riscrivere la password: il tuo accesso è sempre valido.'),
    tasto,
    sparo ? h('div', { class: 'sparo-senza-rete' },
      h('p', { class: 'nota-piccola' }, 'Puoi sparare le bollette lo stesso: restano nel telefono e partono da sole quando torna internet.'),
      sparo) : null))));
}

function marchio(sotto) {
  return h('div', { class: 'marchio' }, logo(),
    h('div', null, h('h1', null, 'Note Av'), h('p', null, sotto || 'Il filo diretto con l’Ufficio Avanzamento Produzione')));
}

// Le password di Note Av sono 4 gruppi da 4 lettere maiuscole o cifre: chi
// scrive in minuscolo, con gli spazi o senza trattini entra lo stesso.
function normalizzaPassword(p) {
  const pulita = p.replace(/[\s\-–—_.]/g, '').toUpperCase();
  return /^[A-Z0-9]{16}$/.test(pulita) ? pulita.match(/.{4}/g).join('-') : p;
}

function vistaAccesso(messaggio) {
  const utente = h('input', { name: 'utente', type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true, value: S.utenteSuggerito || ricordato('utente') || '' });
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', required: true });
  const occhio = h('button', { class: 'occhio', type: 'button', onclick: () => {
    const vedi = password.type === 'password';
    password.type = vedi ? 'text' : 'password'; occhio.textContent = vedi ? 'Nascondi' : 'Mostra';
  } }, 'Mostra');
  const tasto = h('button', { class: 'tasto pieno', type: 'submit' }, 'Entra');
  const errore = h('p', { class: 'errore' + (messaggio ? '' : ' nascosto') }, messaggio || '');
  const conInstalla = TELEFONO && !standalone();
  const form = h('form', { class: 'scheda-accesso', onsubmit: async ev => {
    ev.preventDefault();
    tasto.disabled = true; tasto.textContent = 'Un momento…'; errore.classList.add('nascosto');
    const nome = utente.value.trim().toLowerCase().replace(/\s+/g, '');
    const { error } = await sb.auth.signInWithPassword({ email: nome + '@' + CFG.dominioUtenti, password: normalizzaPassword(password.value) });
    if (error) {
      errore.textContent = error.status === 429
        ? 'Troppi tentativi. Aspetta qualche minuto e riprova.'
        : navigator.onLine === false ? 'Manca la connessione a internet.'
        : 'Nome utente o password non corretti. Controlla il messaggio dell’ufficio e riprova.';
      errore.classList.remove('nascosto');
      tasto.disabled = false; tasto.textContent = 'Entra';
      return;
    }
    ricorda('utente', nome);      // la prossima volta il nome utente e' gia' scritto
    await entra();
  } },
    marchio(),
    conInstalla ? h('h2', null, h('span', { class: 'passo-n' }, '2'), 'Entra') : null,
    errore,
    h('label', { class: 'campo' }, h('span', null, 'Nome utente'), utente),
    h('label', { class: 'campo' }, h('span', null, 'Password'), h('div', { class: 'con-occhio' }, password, occhio)),
    tasto,
    h('p', { class: 'nota-piccola' }, 'Nome utente e password sono nel messaggio che ti ha mandato l’Ufficio Avanzamento Produzione. Dopo l’accesso resti collegato per 30 giorni.'));
  const invito = conInstalla ? h('div', { class: 'installa' },
    h('h2', null, h('span', { class: 'passo-n' }, '1'), 'Metti Note Av sul telefono'),
    h('p', null, IOS
      ? 'Così la trovi tra le tue app e il telefono ti avvisa quando l’ufficio ti scrive. Su iPhone fallo prima di entrare, poi apri Note Av dall’icona.'
      : 'Così la trovi tra le tue app e il telefono ti avvisa quando l’ufficio ti scrive.'),
    h('button', { class: 'tasto pieno', type: 'button', onclick: installa }, ico('telefono'), 'Metti sul telefono')) : null;
  app.replaceChildren(h('div', { class: 'accesso' }, h('div', { class: 'colonna-accesso' }, invito, form)));
  if (!TELEFONO) (utente.value ? password : utente).focus();
}

async function esci(messaggio) {
  S.uscendo = true;
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  S.uscendo = false;
  ricorda('sparo-sub', '');     // fuori da Note Av niente tasto «Spara bolletta» (gli Spari in coda restano)
  S.chi = null; S.io = null; S.splashFatto = false;
  clearInterval(_timer);
  fermaRiprova();
  vistaAccesso(messaggio);
}

// Ritorna l'esito (vedi statoSessione); fa uscire SOLO se l'accesso e' davvero finito.
async function controllaSessione() {
  const st = await statoSessione();
  if (st.esito === 'fuori') await esci('Accesso non più valido: rientra.');
  else if (st.esito === 'scaduta') await esci('Sono passati 30 giorni (o l’accesso è stato chiuso): rientra con nome utente e password.');
  else if (st.esito === 'non-abilitato') await esci('Questo utente non è abilitato a Note Av.');
  return st.esito;
}

async function dopoAccesso(chi) {
  S.chi = chi; S.io = chi.ruolo;
  // chiede al browser di non cancellare i dati salvati (sessione compresa) quando manca spazio
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  if (S.io === 'admin' && !chi.senza_verifica) {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') {
      return aal && aal.nextLevel === 'aal2' ? vistaVerifica() : vistaIscrizioneVerifica();
    }
  }
  registraDispositivo();
  // Animazione d'ingresso: l'Admin la vede a ogni apertura, i Sub una volta al giorno.
  if (S.io === 'admin' ? !S.splashFatto : ricordato('splash') !== oggiIso()) { ricorda('splash', oggiIso()); await splash(); }
  S.lunedi = lunediDi(new Date());
  S.vista = S.io === 'admin' ? 'bacheca' : 'righe';
  S.subSel = S.io === 'admin' ? '*' : S.chi.sub_id;
  try { await caricaBase(); } catch (e) { return gestisciErrore(e, 'base'); }
  disegna();
  avviaControlloPeriodico();
  if (S.io === 'sub') preparaSparo().catch(e => console.warn('sparo', e));
  if (S.io === 'sub') setTimeout(async () => {
    if (!avvisoLetto()) await apriAvviso(true);
    if (!ricordato('guida')) apriGuida(0);
  }, 400);
}

function avvisoLetto() {
  const il = S.chi && S.chi.avviso_letto_il;
  return !!il && il.slice(0, 10) >= AVVISO_DEL;
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
    await entra();
  } },
    marchio(titolo), errore, contenuto,
    h('label', { class: 'campo' }, h('span', null, 'Codice'), codice),
    tasto,
    h('p', { class: 'nota-piccola' }, h('button', { class: 'link', type: 'button', onclick: () => esci() }, 'Esci')));
  app.replaceChildren(h('div', { class: 'accesso' }, h('div', { class: 'colonna-accesso' }, form)));
  codice.focus();
}

/* Registro degli accessi: un identificativo casuale per dispositivo. */
function idDispositivo() {
  let id = ricordato('dispositivo');
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); ricorda('dispositivo', id); }
  return id;
}

function registraDispositivo() {
  const id = idDispositivo();
  const sistema = /iPhone/.test(UA) ? 'iPhone' : /iPad/.test(UA) || IOS ? 'iPad' : ANDROID ? 'Android'
    : /Windows/.test(UA) ? 'Windows' : /Mac OS/.test(UA) ? 'Mac' : 'altro';
  const browser = /Edg\//.test(UA) ? 'Edge' : /Chrome\//.test(UA) ? 'Chrome' : /Firefox\//.test(UA) ? 'Firefox' : /Safari\//.test(UA) ? 'Safari' : 'browser';
  sb.rpc('registra_dispositivo', { p_dispositivo: id, p_descrizione: sistema + ' · ' + (standalone() ? 'app' : browser) }).then(() => {}, () => {});
}

/* Animazione d'ingresso: il sole sorge, la cucitura corre, compare il nome. */
function splash() {
  S.splashFatto = true;
  return new Promise(fatto => {
    const angoli = [-162, -126, -90, -54, -18];
    const raggi = angoli.map((a, i) => {
      const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return '<line style="animation-delay:' + (1.25 + i * 0.08).toFixed(2) + 's" x1="' + (210 + c * 72).toFixed(1) + '" y1="' + (150 + s * 72).toFixed(1) +
        '" x2="' + (210 + c * 96).toFixed(1) + '" y2="' + (150 + s * 96).toFixed(1) + '"/>';
    }).join('');
    const disegno = svg(
      '<svg viewBox="0 0 420 290" aria-hidden="true">' +
      '<defs><clipPath id="splash-cielo"><rect x="0" y="0" width="420" height="150"/></clipPath>' +
      '<mask id="splash-filo"><path class="maschera" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" d="M24 166 L396 166"/></mask></defs>' +
      '<g clip-path="url(#splash-cielo)"><circle class="sole" cx="210" cy="150" r="54"/></g>' +
      '<g class="raggi">' + raggi + '</g>' +
      '<path class="cucitura" mask="url(#splash-filo)" d="M24 166 L396 166"/>' +
      '<text class="nome" x="210" y="230" text-anchor="middle">Note Av</text>' +
      '<text class="motto" x="210" y="262" text-anchor="middle">UN PUNTO ALLA VOLTA</text></svg>');
    const filo = disegno.querySelector('.maschera');
    const el = h('div', { class: 'splash', onclick: () => chiudi() }, disegno);
    document.body.append(el);
    let chiuso = false;
    const chiudi = () => { if (chiuso) return; chiuso = true; el.classList.add('via'); setTimeout(() => el.remove(), 700); fatto(); };
    const lento = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      filo.style.transition = lento ? 'stroke-dashoffset 1.5s .35s cubic-bezier(.45,.05,.35,1)' : 'none';
      filo.style.strokeDashoffset = '0';
      el.classList.add('vai');
    }));
    setTimeout(chiudi, lento ? 3000 : 600);
  });
}

/* ---------------------------------------------------------------------------
   Dati
   --------------------------------------------------------------------------- */

async function caricaBase() {
  S.subs = await q(sb.from('sub').select('*').order('ordine').order('nome'));
  const st = await q(sb.from('stato_dati').select('*'));
  S.stato = st[0] || null;
  await contaDaLeggere();
}

async function contaDaLeggere() {
  const inv = await q(sb.from('invio').select('quante').neq('da', S.io).is('letto_il', null));
  S.daLeggere = inv.reduce((t, i) => t + (i.quante || 1), 0);
}

function subVisibili() {
  if (S.io === 'sub') return [S.chi.sub_id];
  return S.subSel === '*' ? S.subs.map(s => s.id) : [S.subSel];
}

async function caricaRighe() {
  const ids = subVisibili();
  if (!ids.length) { S.righe = []; S.msgs = []; S.invii = []; return; }
  const [righe, msgs, invii, capito] = await Promise.all([
    q(sb.from('riga').select('*').in('sub_id', ids)),
    q(sb.from('messaggio').select('*').in('sub_id', ids).order('id')),
    q(sb.from('invio').select('*').in('sub_id', ids).is('letto_il', null)),
    facoltativo(sb.from('capito').select('messaggio_id,testo').in('sub_id', ids)),
  ]);
  S.righe = righe; S.msgs = msgs; S.invii = invii;
  S.capito = new Map(capito.map(c => [c.messaggio_id, c.testo]));
}

// Dati di READLY: se non ci sono (ancora), la pagina va avanti senza.
async function facoltativo(promessa) {
  try { const { data, error } = await promessa; return error ? [] : (data || []); } catch (e) { return []; }
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

function testoAggiornato() {
  return S.stato && S.stato.aggiornato ? 'Numeri aggiornati ' + quandoParlato(S.stato.aggiornato) : 'Numeri non ancora caricati';
}

function disegna() {
  const sub = S.io === 'sub';
  const viste = sub ? ['righe', 'carico', 'consegne'] : ['bacheca', 'righe', 'carico', 'consegne', 'rientri', 'accessi'];
  const titolo = sub ? nomeSub(S.chi.sub_id) : 'Note Av';
  const testata = h('header', { class: 'testata' },
    h('div', { class: 'riga1' }, logo(),
      h('div', { class: 'titolo' }, h('b', null, titolo), h('small', { id: 'aggiornato' }, testoAggiornato())),
      !sub && !TELEFONO ? h('button', { class: 'aiuto vai-avanzamento', title: 'Apri l’Avanzamento produzione',
        onclick: () => window.open(CFG.avanzamentoUrl || 'http://PRODUZIONE-DESK:8090/', 'avanzamento-produzione') },
        ico('grafico'), h('span', null, 'Avanzamento')) : null,
      h('button', { class: 'aiuto', onclick: apriMenu, 'aria-label': sub ? 'Aiuto' : 'Menu' }, ico(sub ? 'aiuto' : 'menu'), sub ? 'Aiuto' : 'Menu')),
    h('nav', { class: 'schede' + (sub ? ' larghe' : ''), role: 'tablist' },
      viste.map(v => h('button', { role: 'tab', 'aria-selected': String(S.vista === v), 'data-vista': v,
          onclick: () => v === 'rientri' ? apriRientri() : vai(v) },
        v === 'rientri' ? readly() : ico(ICONE_VISTA[v]), h('span', null, NOMI_VISTA[S.io][v]),
        v === 'righe' ? h('span', { class: 'conta nascosto' }) : null))));
  const corpo = h('main', { id: 'corpo' }, h('div', { class: 'caricamento' }, h('span', { class: 'punto' })));
  app.replaceChildren(testata, h('div', { id: 'inviti' }), corpo, h('div', { id: 'barra' }));
  document.body.classList.toggle('con-sparo', !!modoSparo());     // piu' spazio in fondo per il tasto
  aggiornaConta();
  aggiornaInviti();
  ({ bacheca: vistaBacheca, righe: vistaRighe, carico: vistaCarico, consegne: vistaConsegne, accessi: vistaAccessi, sparo: vistaSparo })[S.vista]()
    .catch(e => gestisciErrore(e, S.vista));
}

/* Il Tabellone dei Rientri sta nell'Avanzamento Produzione (rete dell'ufficio):
   dal PC si apre li', sulla sua pagina; dal telefono si spiega dove trovarlo. */
function apriRientri() {
  if (!TELEFONO) { window.open((CFG.avanzamentoUrl || 'http://PRODUZIONE-DESK:8090/') + '#rientri', 'avanzamento-produzione'); return; }
  const f = finestra(h('h3', null, 'Rientri'),
    h('p', null, 'Il Tabellone dei Rientri, compilato da READLY con le risposte dei Sub, si vede dal PC in ufficio: apri l’Avanzamento Produzione e scegli la pagina «Rientri».'),
    h('button', { class: 'tasto pieno chiaro', onclick: () => f.chiudi() }, 'Ho capito'));
}

function aggiornaConta() {
  const c = document.querySelector('.schede .conta');
  if (!c) return;
  c.textContent = S.daLeggere > 99 ? '99+' : String(S.daLeggere);
  c.classList.toggle('nascosto', !S.daLeggere);
  c.setAttribute('aria-label', S.daLeggere + (S.io === 'sub' ? ' note nuove' : ' risposte nuove'));
}

function vai(vista, subSel) {
  if (vista !== S.vista) S.cerca = '';      // cambiando pagina la ricerca riparte vuota
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

/* Riquadro giallo "come funziona" in cima alle pagine del Sub: si chiude con
   "Ho capito" e si riapre dal tasto Aiuto. */
function suggerimento(chiave, contenuto) {
  if (S.io !== 'sub' || ricordato('sugg-' + chiave)) return null;
  const box = h('div', { class: 'suggerimento' }, contenuto,
    h('div', { class: 'azioni' },
      h('button', { class: 'tasto piccolo', onclick: () => { ricorda('sugg-' + chiave, '1'); box.remove(); } }, 'Ho capito'),
      chiave === 'note' ? h('button', { class: 'link', onclick: () => apriGuida(0) }, 'Guarda come funziona') : null));
  return box;
}

function numero(etichetta, valore, forte) {
  return h('div', { class: 'numero' + (forte ? ' forte' : '') }, h('span', null, etichetta), h('b', null, valore));
}

/* ---------------------------------------------------------------------------
   Ricerca nelle Righe: piu' parole = devono esserci tutte; non contano
   maiuscole e accenti; nei codici si possono saltare trattini e spazi
   ("250412" trova "25-0412"). Le righe non si ridisegnano: si nascondono,
   cosi' quello che si sta scrivendo nelle note non si perde.
   --------------------------------------------------------------------------- */

const normalizza = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compatta = t => t.replace(/[^a-z0-9]/g, '');

function corrisponde(testi, cerca) {
  const parole = normalizza(cerca).split(/\s+/).filter(Boolean);
  if (!parole.length) return true;
  const tutto = normalizza(testi.filter(Boolean).join(' · '));
  const corto = compatta(tutto);
  return parole.every(p => tutto.includes(p) || (compatta(p) !== '' && corto.includes(compatta(p))));
}

function testiRiga(r, s) {
  return [r.commessa, r.modello, r.parte, r.descrizione, r.stagione, S.io === 'admin' ? nomeSub(r.sub_id) : null,
    s.nota && s.nota.testo, s.risposta && s.risposta.testo, s.bNota && s.bNota.testo, s.bRisposta && s.bRisposta.testo,
    s.dataEff ? fmtData(s.dataEff) : null, numeriBolle(r)];
}

function testiCarico(r) {
  return [r.commessa, r.modello, r.parte, r.descrizione, r.stagione, STATI[r.stato],
    S.io === 'admin' ? nomeSub(r.sub_id) : null, numeriBolle(r)];
}

const numeriBolle = r => (r.bolle || []).concat(r.riconsegnate || []).map(b => b.b).join(' ');

function boxCerca(aggiorna) {
  const x = h('button', { class: 'cerca-x' + (S.cerca ? '' : ' nascosto'), type: 'button', 'aria-label': 'Cancella la ricerca' }, '×');
  const input = h('input', { type: 'search', value: S.cerca || '', 'aria-label': 'Cerca una commessa',
    placeholder: S.io === 'sub' ? 'Cerca: numero commessa, modello…' : 'Cerca: commessa, modello, Sub, nota…',
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false', enterkeyhint: 'search',
    oninput: () => { S.cerca = input.value; x.classList.toggle('nascosto', !input.value); aggiorna(); },
    onkeydown: ev => { if (ev.key === 'Enter') input.blur(); else if (ev.key === 'Escape') svuota(); } });
  const svuota = () => { input.value = ''; S.cerca = ''; x.classList.add('nascosto'); aggiorna(); input.focus(); };
  x.addEventListener('click', svuota);
  return h('div', { class: 'cerca', role: 'search' }, ico('lente'), input, x);
}

/* Collega la casella di ricerca a un elenco di elementi gia' disegnati.
   voci: [{ el, testi }]; contenitore: cosa nascondere se non si trova niente. */
function ricercaSu(voci, contenitore) {
  const trovate = h('p', { class: 'trovate', 'aria-live': 'polite' });
  const cosa = h('span');
  const niente = h('div', { class: 'vuoto nascosto' }, h('b', null, 'Nessuna commessa trovata'), cosa, ' ',
    h('button', { class: 'link', onclick: () => { const x = document.querySelector('.cerca-x'); if (x) x.click(); } }, 'Cancella la ricerca'));
  const aggiorna = () => {
    let n = 0;
    for (const v of voci) { const si = corrisponde(v.testi, S.cerca); v.el.classList.toggle('nascosto', !si); if (si) n++; }
    const attiva = !!normalizza(S.cerca).trim();
    trovate.textContent = attiva ? (n === 1 ? '1 commessa trovata' : n + ' commesse trovate') : '';
    cosa.textContent = 'Nessuna commessa corrisponde a «' + (S.cerca || '').trim() + '». Controlla di averlo scritto bene.';
    contenitore.classList.toggle('nascosto', attiva && !n);
    niente.classList.toggle('nascosto', !(attiva && !n));
  };
  return { casella: boxCerca(aggiorna), trovate, niente, aggiorna };
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
  if (daSegnare.length && (S.io === 'sub' || S.subSel === '*')) { S.daLeggere = 0; aggiornaConta(); }
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
  if (S.io === 'sub') return disegnaRigheSub(elenco);

  const c = corpo();
  const conSub = S.subSel === '*';
  const totAperte = elenco.reduce((t, x) => t + x.r.aperte, 0);
  const nNuove = elenco.filter(x => x.s.nuovo).length;
  const nRitardo = elenco.filter(x => x.s.ritardo).length;
  const excelRighe = () => scaricaExcel(nomeExcel(S.archivio ? 'Archivio' : 'Righe'), [{
    nome: S.archivio ? 'Archivio' : 'Righe',
    colonne: ['Sub', 'Commessa', 'Modello', 'Parte', 'Descrizione', 'Stagione', 'Lanciata', 'Scadenza', 'Aperte',
      'Nota', 'Nota inviata', 'Risposta', 'Risposta inviata', 'Data prevista', 'In ritardo', 'Bollette in casa', 'Bollette riconsegnate'],
    righe: voci.filter(visibile).map(({ x: { r, s } }) => [nomeSub(r.sub_id), r.commessa, r.modello, r.parte, r.descrizione, r.stagione,
      r.lanciata, dataX(r.scadenza), r.aperte, s.nota && s.nota.testo, s.nota && fmtQuando(s.nota.inviata_il),
      s.risposta && s.risposta.testo, s.risposta && fmtQuando(s.risposta.inviata_il), dataX(s.dataEff), s.ritardo ? 'Sì' : '',
      testoBolle(r.bolle, 'dal', 'dal'), testoBolle(r.riconsegnate, 'il', 'il')]) }]);
  const intest = h('div', { class: 'intestazione' },
    h('h2', null, S.archivio ? 'Archivio' : 'Righe'), elenco.length ? tastoExcel(excelRighe) : null,
    S.archivio ? null : h('button', { class: 'tasto piccolo chiaro', type: 'button', onclick: apriCaricaPrevisionale },
      readly(), 'Carica previsionale'),
    h('p', null, S.archivio
      ? elenco.length + ' commesse chiuse con note'
      : elenco.length + ' commesse in casa · ' + pz(totAperte) + ' pezzi aperti'
        + (nNuove ? ' · ' + nNuove + (nNuove === 1 ? ' risposta nuova' : ' risposte nuove') : '')
        + (nRitardo ? ' · ' + nRitardo + ' in ritardo' : '')));

  const testa = ['Commessa', conSub ? 'Sub' : null, 'Modello', 'Parte', 'Descrizione', 'Stagione', 'Lanciata', 'Scadenza', 'Aperte', 'Nota', 'Risposta', 'Data prevista']
    .filter(Boolean);
  const numeriche = new Set(['Lanciata', 'Aperte']);
  const voci = elenco.map(x => ({ el: rigaRighe(x.r, x.s, conSub), testi: testiRiga(x.r, x.s), x }));
  const tabella = h('div', { class: 'tabella-box' }, h('table', { class: 't' },
    h('thead', null, h('tr', null, testa.map(t => h('th', { class: numeriche.has(t) ? 'num' : null }, t)))),
    h('tbody', null, voci.map(v => v.el))));
  const ricerca = ricercaSu(voci, tabella);

  riempi(c,
    filtroSub(() => vistaRighe().catch(e => gestisciErrore(e, 'righe'))),
    intest,
    elenco.length ? [ricerca.casella, ricerca.trovate, tabella, ricerca.niente]
      : h('div', { class: 'vuoto' }, S.archivio ? 'Nessuna commessa in archivio.' : 'Nessuna commessa in casa in questo momento.'),
    h('p', { class: 'piede' }, h('button', { class: 'link', onclick: () => { S.archivio = !S.archivio; disegnaRighe(); } },
      S.archivio ? '← Torna alle Righe' : 'Apri l’archivio delle commesse chiuse')));
  ricerca.aggiorna();
  disegnaBarra();
}

/* Lato Sub: una scheda per commessa, dall'alto in basso come si legge. */
function disegnaRigheSub(elenco) {
  const nNuove = elenco.filter(x => x.s.nuovo).length;
  const nRitardo = elenco.filter(x => x.s.ritardo).length;
  const sole = svg(SOLE);
  const voci = elenco.map(x => ({ el: schedaRiga(x.r, x.s), testi: testiRiga(x.r, x.s) }));
  const schede = h('div', { class: 'elenco-schede' }, voci.map(v => v.el));
  const ricerca = ricercaSu(voci, schede);
  const frase = S.archivio ? 'Le commesse già chiuse su cui vi siete scritti.'
    : nNuove ? (nNuove === 1 ? 'L’ufficio ti ha scritto su 1 commessa: la trovi qui sotto, in giallo.' : 'L’ufficio ti ha scritto su ' + nNuove + ' commesse: le trovi qui sotto, in giallo.')
    : elenco.length ? 'Nessuna nota nuova. Hai ' + elenco.length + (elenco.length === 1 ? ' commessa' : ' commesse') + ' in casa.'
    : '';
  riempi(corpo(),
    h('div', { class: 'saluto' }, sole, h('div', null,
      h('h2', null, S.archivio ? 'Commesse chiuse' : saluto() + '!'),
      frase ? h('p', null, frase) : null,
      nRitardo && !S.archivio ? h('p', { style: 'color:var(--danger);font-weight:600' }, nRitardo === 1 ? '1 commessa ha la data di consegna già passata.' : nRitardo + ' commesse hanno la data di consegna già passata.') : null)),
    S.archivio ? null : suggerimento('note', h('ol', null,
      h('li', null, h('span', { class: 'passo-n' }, '1'), 'Leggi la nota dell’ufficio (riquadro giallo).'),
      h('li', null, h('span', { class: 'passo-n' }, '2'), 'Scrivi la risposta e, se la sai, la data di consegna.'),
      h('li', null, h('span', { class: 'passo-n' }, '3'), 'Premi il tasto verde INVIA in fondo.'))),
    elenco.length ? [ricerca.casella, ricerca.trovate, schede, ricerca.niente]
      : vuoto(S.archivio ? 'Archivio vuoto' : 'Tutto tranquillo', S.archivio ? 'Qui finiscono le commesse chiuse su cui vi siete scritti.' : 'Al momento non hai commesse in casa.'),
    h('p', { class: 'piede' }, h('button', { class: 'link', onclick: () => { S.archivio = !S.archivio; disegnaRighe(); window.scrollTo(0, 0); } },
      S.archivio ? '← Torna alle commesse in casa' : 'Vedi le commesse già chiuse')));
  ricerca.aggiorna();
  disegnaBarra();
}

function vuoto(titolo, testo) {
  return h('div', { class: 'vuoto' }, svg(SOLE), h('b', null, titolo), testo);
}

function schedaRiga(r, s) {
  const sola = S.archivio;
  const etichette = [];
  if (s.nuovo) etichette.push(h('span', { class: 'etichetta nuova' }, 'Nota nuova'));
  if (s.ritardo) etichette.push(h('span', { class: 'etichetta rossa' }, 'In ritardo'));

  const stato = h('div', { class: 'stato-invio' });
  const mostra = (fase, st) => {
    st = st || s;
    if (fase === 'salvo') return riempi(stato, 'Salvataggio…');
    if (fase === 'errore') return riempi(stato, 'Non salvata: controlla la connessione e riprova');
    stato.className = 'stato-invio';
    if (st.bRisposta || st.bData) { stato.classList.add('da-inviare'); riempi(stato, ico('matita'), 'Scritta: ricordati di premere INVIA'); }
    else {
      // l'ultima cosa mandata dal Sub (la data puo' averla messa anche l'ufficio)
      const mie = [st.risposta, st.data && st.data.autore === 'sub' ? st.data : null].filter(Boolean)
        .sort((a, b) => (a.inviata_il < b.inviata_il ? 1 : -1));
      if (mie.length) { stato.classList.add('inviata'); riempi(stato, ico('fatto'), 'Inviata ' + quandoParlato(mie[0].inviata_il)); }
      else riempi(stato);
    }
  };
  mostra('fatto');

  const testoRisp = s.bRisposta ? s.bRisposta.testo : (s.risposta ? s.risposta.testo : '');
  const idCampo = 'r-' + r.commessa.replace(/[^\w-]/g, '');
  return h('article', { class: 'scheda' + (s.nuovo ? ' nuova' : '') + (s.ritardo ? ' ritardo' : '') },
    h('div', { class: 'capo' },
      h('div', null, h('span', { class: 'cod' }, r.commessa),
        h('p', { class: 'cosa' }, [[r.modello, r.parte].filter(Boolean).join(' '), r.descrizione].filter(Boolean).join(' · '))),
      etichette.length ? h('div', { class: 'etichette' }, etichette) : null),
    h('div', { class: 'numeri' },
      numero('In casa', pz(r.aperte) + ' pz', true),
      numero('Commessa', pz(r.lanciata) + ' pz'),
      numero('Scadenza', fmtData(r.scadenza) || '—')),
    bolletteInCasa(r),
    bolletteRiconsegnate(r),
    s.nota && s.nota.testo
      ? h('div', { class: 'bolla' }, h('div', { class: 'chi' }, ico('note'), 'L’ufficio ti scrive · ' + fmtQuando(s.nota.inviata_il)), h('div', { class: 'testo-nota' }, s.nota.testo))
      : h('div', { class: 'bolla vuota' }, 'Nessuna nota dall’ufficio su questa commessa.'),
    sola
      ? (s.risposta && s.risposta.testo ? h('div', null, h('b', null, 'La tua risposta: '), h('span', { class: 'testo-nota' }, s.risposta.testo)) : null)
      : h('div', { class: 'risposta-box' }, h('label', { for: idCampo }, 'La tua risposta'),
          areaTesto(r, 'risposta', testoRisp, mostra, idCampo),
          !s.bRisposta && s.risposta && s.risposta.al_telefono
            ? h('p', { class: 'al-telefono' }, ico('telefono'), 'Risposta presa al telefono dall’Ufficio Avanzamento Produzione · ' + fmtQuando(s.risposta.inviata_il)) : null,
          !s.bRisposta ? capitoDi(s.risposta, true) : null),
    h('div', { class: 'data-box' }, h('label', null, ico('storico'), ' Quando consegni?'),
      sola ? h('b', null, s.dataEff ? fmtData(s.dataEff) : '—')
        : [inputData(r, s.dataEff, mostra), h('span', { class: 'tenue' }, 'se lo sai')]),
    sola ? null : stato,
    h('div', { class: 'piedino' },
      MOSTRA_DIBA && r.diba ? h('button', { class: 'diba', onclick: () => apriDiba(r) }, ico('documento'), 'Distinta base') : null,
      h('button', { class: 'link', onclick: () => apriStorico(r) }, 'Messaggi precedenti')));
}

// "Abbiamo capito: ..." di READLY sotto una Risposta (al Sub senza nominare READLY).
function capitoDi(risposta, perSub) {
  const t = risposta && S.capito.get(risposta.id);
  if (!t) return null;
  return h('p', { class: 'capito' }, perSub ? ico('fatto') : readly(),
    h('span', null, h('b', null, perSub ? 'Abbiamo capito: ' : 'READLY: '), t,
      perSub ? h('span', { class: 'tenue' }, ' Se non è giusto, riscrivi la risposta.') : null));
}

/* L'Admin scrive la Risposta che il Sub gli ha dato al telefono: vale subito,
   il Sub la vede nella sua scheda, READLY la legge come le altre. */
function apriTelefono(r) {
  const area = h('textarea', { class: 'nota', rows: '3', maxlength: '2000',
    placeholder: 'Es.: 30 pz giovedì, il resto lunedì. Mancano le fodere.' });
  const tasto = h('button', { class: 'tasto pieno', onclick: async () => {
    if (!area.value.trim()) { area.focus(); return; }
    tasto.disabled = true;
    try {
      await q(sb.rpc('risposta_al_telefono', { p_sub: r.sub_id, p_commessa: r.commessa, p_testo: area.value }));
      f.chiudi();
      toast('Risposta salvata: READLY la legge entro un minuto.');
      await caricaMessaggi(r.sub_id);
      disegnaRighe();
    } catch (e) { tasto.disabled = false; gestisciErrore(e, 'telefono'); }
  } }, ico('fatto'), 'Salva la risposta');
  const f = finestra(
    h('h3', null, 'Ha risposto al telefono'),
    h('p', { class: 'tenue', style: 'margin:0 0 10px' }, nomeSub(r.sub_id) + ' · ' + r.commessa + ' · in casa ' + pz(r.aperte) + ' pz'),
    h('p', { style: 'margin:0 0 8px' }, 'Scrivi quello che ti ha detto. Vale subito, senza INVIA: ' + nomeSub(r.sub_id) + ' la vede nella sua scheda e READLY compila i Rientri.'),
    area, h('div', { style: 'margin-top:12px' }, tasto));
  area.focus();
}

/* Carica previsionale: la riserva della posta. Un previsionale arrivato su
   WhatsApp, o che READLY non ha letto da solo: l'Admin carica l'Excel, READLY
   (sul PC dell'ufficio) lo legge al giro dopo come quelli della posta e qui
   si vede cosa ha messo nei Rientri, con «Annulla». */
function apriCaricaPrevisionale() {
  const scelta = h('select', null, h('option', { value: '' }, 'Lo dice il file (colonna SUB)'),
    S.subs.map(s => h('option', { value: s.id }, s.nome)));
  const file = h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const esito = h('div', { class: 'carica-esito' });
  const tasto = h('button', { class: 'tasto pieno', type: 'button', onclick: () => carica() }, readly(), 'Carica e fai leggere a READLY');
  finestra(h('h3', null, 'Carica previsionale'),
    h('p', { style: 'margin:0 0 12px' }, 'Per un previsionale arrivato fuori dalla posta (WhatsApp, chiavetta) o che READLY non ha letto da solo. '
      + 'Serve il file «In Casa Fornitore» compilato dal Sub.'),
    h('label', { class: 'campo' }, h('span', null, 'Il file Excel'), file),
    h('label', { class: 'campo' }, h('span', null, 'Di quale Sub'), scelta),
    tasto, esito);

  async function carica() {
    const x = file.files && file.files[0];
    if (!x) { toast('Scegli il file Excel.'); return; }
    if (!/\.xlsx$/i.test(x.name)) { toast('Serve un file Excel (.xlsx).'); return; }
    if (x.size > 3 * 1024 * 1024) { toast('Il file è troppo grande.'); return; }
    tasto.disabled = true;
    try {
      const dati = await new Promise((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1] || '');
        r.onerror = () => ko(r.error);
        r.readAsDataURL(x);
      });
      const id = await q(sb.rpc('carica_previsionale', { p_sub: scelta.value || null, p_nome: x.name, p_dati: dati }));
      attendi(id, false);
    } catch (e) { tasto.disabled = false; gestisciErrore(e, 'previsionale'); }
  }

  // READLY gira sul PC dell'ufficio e guarda ogni mezzo minuto: si aspetta fino a 2 minuti
  async function attendi(id, annullando) {
    riempi(esito, h('p', { class: 'attesa' }, h('span', { class: 'punto' }),
      annullando ? 'READLY sta rimettendo i Rientri com’erano…' : 'File caricato. READLY lo sta leggendo…'));
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (!esito.isConnected) return;
      let p;
      try { p = await q(sb.from('previsionale_caricato').select('stato,esito').eq('id', id).single()); } catch (e) { continue; }
      if (annullando ? p.stato === 'annullato' : !['da_leggere', 'annullare'].includes(p.stato)) { mostra(id, p); return; }
    }
    riempi(esito, h('p', null, annullando
      ? 'La richiesta è salvata: READLY rimette i Rientri appena il PC dell’ufficio è acceso.'
      : 'Il file è salvato: READLY lo legge appena il PC dell’ufficio è acceso, e lo vedrai nei Rientri.'));
  }

  function mostra(id, p) {
    const e = p.esito || {};
    if (p.stato === 'annullato') { riempi(esito, h('p', { class: 'capito' }, ico('fatto'), h('span', null, 'Annullato: i Rientri sono tornati com’erano.'))); return; }
    if (p.stato === 'scartato') { riempi(esito, h('p', { class: 'errore' }, e.motivo || 'READLY non è riuscito a leggere il file.')); return; }
    const plur = (n, uno, tanti) => n + ' ' + (n === 1 ? uno : tanti);
    riempi(esito,
      (e.sub || []).map(s => h('p', { class: 'capito' }, readly(), h('span', null,
        h('b', null, s.nome + ': '), plur(s.commesse, 'commessa', 'commesse') + ' e ' + pz(s.pz) + ' pz messi nei Rientri.',
        s.contestate.length ? h('span', { class: 'tenue' }, ' Quantità diverse dalle nostre su ' + plur(s.contestate.length, 'commessa.', 'commesse.')) : null,
        s.scartate.length ? h('span', { class: 'tenue' }, ' Non sono sue: ' + s.scartate.join(', ') + '.') : null,
        s.piu_nuove.length ? h('span', { class: 'tenue' }, ' Lasciate com’erano perché il Sub ha risposto dopo: ' + s.piu_nuove.join(', ') + '.') : null))),
      (e.sub || []).some(s => s.annulla) ? h('button', { class: 'tasto piccolo chiaro', type: 'button', style: 'margin-top:10px', onclick: async ev => {
        ev.currentTarget.disabled = true;
        try { await q(sb.rpc('annulla_previsionale_caricato', { p_id: id })); attendi(id, true); }
        catch (err) { gestisciErrore(err, 'previsionale'); }
      } }, 'Annulla') : null);
  }
}

function rigaRighe(r, s, conSub) {
  const sola = S.archivio;
  const etichette = [];
  if (s.nuovo) etichette.push(h('span', { class: 'etichetta nuova' }, 'Risposta nuova'));
  if (s.ritardo) etichette.push(h('span', { class: 'etichetta rossa' }, 'In ritardo'));
  if (r.stato === 'fuori') etichette.push(h('span', { class: 'etichetta' }, 'Fuori Carico'));

  const cellaComm = h('td', { class: 'testa', 'data-l': 'Commessa' },
    h('div', null, h('span', { class: 'cod' }, r.commessa), ' ',
      MOSTRA_DIBA && r.diba ? h('button', { class: 'diba', onclick: () => apriDiba(r) }, 'Distinta') : null),
    etichette.length ? h('div', { style: 'margin-top:4px;display:flex;gap:6px;flex-wrap:wrap' }, etichette) : null,
    bolletteInCasa(r, true), bolletteRiconsegnate(r, true),
    h('button', { class: 'link', style: 'font-size:13px', onclick: () => apriStorico(r) }, 'Storico'));

  // Nota (scrive l'Admin)
  let cellaNota;
  if (!sola) {
    const segno = h('span', { class: 'chi-quando' + (s.bNota ? ' da-inviare' : '') }, s.bNota ? 'Salvata · da inviare' : '');
    cellaNota = h('td', { class: 'blocco', 'data-l': 'Nota' },
      areaTesto(r, 'nota', s.bNota ? s.bNota.testo : (s.nota ? s.nota.testo : ''), segnoCampo(segno, 'bNota')), segno,
      s.nota ? h('span', { class: 'chi-quando' }, 'Inviata ' + fmtQuando(s.nota.inviata_il)) : null);
  } else {
    cellaNota = h('td', { class: 'blocco', 'data-l': 'Nota' },
      h('div', { class: 'testo-nota' + (s.nota && s.nota.testo ? '' : ' vuota') }, s.nota && s.nota.testo ? s.nota.testo : 'Nessuna nota'),
      s.nota ? h('span', { class: 'chi-quando' }, fmtQuando(s.nota.inviata_il)) : null);
  }
  // Risposta (scrive il Sub)
  const cellaRisp = h('td', { class: 'blocco', 'data-l': 'Risposta' },
    h('div', { class: 'testo-nota' + (s.risposta && s.risposta.testo ? '' : ' vuota') }, s.risposta && s.risposta.testo ? s.risposta.testo : 'Nessuna risposta'),
    s.risposta ? h('span', { class: 'chi-quando' }, (s.risposta.al_telefono ? '📞 Presa al telefono · ' : '') + fmtQuando(s.risposta.inviata_il)) : null,
    capitoDi(s.risposta, false),
    sola ? null : h('button', { class: 'link', style: 'font-size:13px', onclick: () => apriTelefono(r) }, '📞 Ha risposto al telefono'));
  // Data Prevista (la possono mettere entrambi)
  const chiData = s.bData ? 'Da inviare' : s.data ? (s.data.autore === 'admin' ? 'Messa dall’ufficio ' : 'Messa dal Sub ') + fmtQuando(s.data.inviata_il) : null;
  const segnoData = h('span', { class: 'chi-quando' + (s.bData ? ' da-inviare' : '') }, chiData || '');
  const cellaData = h('td', { 'data-l': 'Data prevista' },
    h('div', null,
      sola ? h('span', null, s.dataEff ? fmtData(s.dataEff) : '—') : inputData(r, s.dataEff, segnoCampo(segnoData, 'bData')),
      segnoData));

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

// Per le celle della tabella dell'Admin: la scritta sotto il campo.
function segnoCampo(segno, campoBozza) {
  return (fase, st) => {
    segno.classList.remove('da-inviare');
    if (fase === 'salvo') segno.textContent = 'Salvataggio…';
    else if (fase === 'errore') segno.textContent = 'Non salvata: riprova';
    else if (st && st[campoBozza]) { segno.textContent = 'Salvata · da inviare'; segno.classList.add('da-inviare'); }
    else segno.textContent = '';
  };
}

const _attese = new Map();
function salvaPresto(r, tipo, valori, mostra) {
  const k = chiave(r.sub_id, r.commessa) + '|' + tipo;
  clearTimeout(_attese.get(k));
  mostra('salvo');
  _attese.set(k, setTimeout(async () => {
    try {
      await q(sb.rpc('salva_bozza', Object.assign({ p_sub: r.sub_id, p_commessa: r.commessa, p_tipo: tipo }, valori)));
      await caricaMessaggi(r.sub_id);
      _attese.delete(k);
      mostra('fatto', statoRiga(r, indiceMessaggi()));
      disegnaBarra();
    } catch (e) {
      _attese.delete(k);
      mostra('errore');
      gestisciErrore(e, 'salva');
    }
  }, 700));
}

function areaTesto(r, tipo, valore, mostra, id) {
  const area = h('textarea', { class: 'nota', rows: '2', maxlength: '2000', value: valore || '', id,
    placeholder: tipo === 'nota' ? 'Scrivi una nota per il Sub…' : 'Es.: 35 pz domani, il resto venerdì. Mancano le fodere.',
    oninput: () => salvaPresto(r, tipo, { p_testo: area.value }, mostra) });
  return area;
}

function inputData(r, valore, mostra) {
  const input = h('input', { class: 'data', type: 'date', value: valore || '', 'aria-label': 'Data prevista di consegna',
    onchange: () => salvaPresto(r, 'data', { p_data: input.value || null }, mostra) });
  return input;
}

// La barra in basso: INVIA (nelle Righe, se c'e' qualcosa da mandare) e, per
// il Sub con lo Sparo, il tasto «Spara bolletta» in tutte le schede.
function disegnaBarra() {
  const barra = document.getElementById('barra');
  if (!barra) return;
  const sparo = tastoSparo(modoSparo());
  const metti = (...pezzi) => {
    const pieni = pezzi.flat().filter(Boolean);
    if (!pieni.length) { barra.replaceChildren(); return; }
    const box = h('div', { class: 'barra-invio' }, pieni);
    if (barra.querySelector('.barra-invio')) box.style.animation = 'none';   // gia' visibile: niente salto
    barra.replaceChildren(box);
  };
  if (S.vista !== 'righe' || S.archivio) return metti(sparo);
  const bozze = bozzePerSub();
  const ids = Object.keys(bozze);
  if (S.io === 'sub') {
    const n = bozze[S.chi.sub_id] || 0;
    if (!n) return metti(sparo);
    return metti(h('button', { class: 'tasto verde', onclick: ev => invia(S.chi.sub_id, ev.currentTarget) }, ico('invia'), 'INVIA ALL’UFFICIO (' + n + ')'),
      h('p', { class: 'spiega' }, n === 1 ? 'Hai scritto su 1 commessa: l’ufficio la vede quando premi INVIA.' : 'Hai scritto su ' + n + ' commesse: l’ufficio le vede quando premi INVIA.'),
      sparo);
  }
  metti(ids.map(id =>
    h('button', { class: 'tasto', onclick: ev => invia(id, ev.currentTarget) }, ico('invia'), 'Invia a ' + nomeSub(id) + ' (' + bozze[id] + ')')));
}

async function invia(subId, tasto) {
  // aspetta i salvataggi ancora in corso
  if (_attese.size) { toast('Un attimo, sto salvando…'); setTimeout(() => invia(subId, tasto), 900); return; }
  tasto.disabled = true;
  try {
    const n = await q(sb.rpc('invia', { p_sub: subId }));
    if (S.io === 'admin') toast((n === 1 ? 'Inviata 1 nota a ' : 'Inviate ' + n + ' note a ') + nomeSub(subId));
    else { festa(); toast('Inviato! L’ufficio ha ricevuto le tue risposte. Grazie!'); }
    await caricaMessaggi(subId);
    disegnaRighe();
  } catch (e) { tasto.disabled = false; gestisciErrore(e, 'invia'); }
}

function festa() {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const f = svg('<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONE.fatto + '</svg>');
  const el = h('div', { class: 'festa' }, h('div', { class: 'cerchio' }, f));
  document.body.append(el);
  setTimeout(() => el.remove(), 1700);
}

async function apriDiba(r) {
  if (!MOSTRA_DIBA) return;
  const { data, error } = await sb.storage.from('diba').createSignedUrl(r.sub_id + '/' + r.commessa + '.pdf', 120);
  if (error || !data) return toast('Distinta non disponibile.');
  window.open(data.signedUrl, '_blank', 'noopener');
}

function finestra(...contenuto) {
  const chiudi = () => { velo.remove(); document.removeEventListener('keydown', esc); };
  const esc = ev => { if (ev.key === 'Escape') chiudi(); };
  const velo = h('div', { class: 'velo', onclick: ev => { if (ev.target === velo) chiudi(); } },
    h('div', { class: 'finestra', role: 'dialog', 'aria-modal': 'true' },
      h('button', { class: 'chiudi-x', 'aria-label': 'Chiudi', onclick: () => chiudi() }, '×'),
      contenuto));
  document.addEventListener('keydown', esc);
  document.body.append(velo);
  return { velo, chiudi, box: velo.firstChild };
}

function finestraObbligata(...contenuto) {
  const velo = h('div', { class: 'velo' }, h('div', { class: 'finestra', role: 'alertdialog', 'aria-modal': 'true' }, contenuto));
  document.body.append(velo);
  return { velo, chiudi: () => velo.remove(), box: velo.firstChild };
}

const daSchema = n => typeof n === 'string' ? n : h(n[0], null, n.slice(1).map(daSchema));

/* Avviso sulle assegnazioni. obbligatorio: la prima volta, si chiude solo con
   "Ho capito" (che resta registrato); altrimenti e' solo da rileggere. */
function apriAvviso(obbligatorio) {
  return new Promise(fatto => {
    const testo = [h('h3', null, 'Avviso sulle assegnazioni'), h('div', { class: 'avviso-testo' }, AVVISO_TESTO.map(daSchema))];
    if (!obbligatorio) {
      const il = avvisoLetto() ? S.chi.avviso_letto_il : null;
      const f = finestra(testo, il ? h('p', { class: 'nota-piccola' }, 'Hai confermato di averlo letto il ' + fmtQuando(il) + '.') : null,
        h('button', { class: 'tasto pieno chiaro', onclick: () => f.chiudi() }, 'Chiudi'));
      return fatto();
    }
    const tasto = h('button', { class: 'tasto pieno', onclick: async () => {
      tasto.disabled = true;
      const { data, error } = await sb.rpc('segna_avviso_letto');
      if (error && !erroreDiRete(error)) { f.chiudi(); fatto(); return gestisciErrore(error, 'avviso'); }
      // senza internet si chiude lo stesso: alla prossima apertura lo richiede
      if (!error) S.chi.avviso_letto_il = data || new Date().toISOString();
      f.chiudi(); fatto();
    } }, ico('fatto'), 'Ho capito');
    const f = finestraObbligata(testo, tasto,
      h('p', { class: 'nota-piccola', style: 'text-align:center' }, 'Toccando «Ho capito» confermi di aver letto questo avviso.'));
    tasto.focus();
  });
}

/* Riquadro fisso in cima alla pagina Lavoro del Sub: non si chiude. */
function avvisoFisso() {
  return h('div', { class: 'avviso-fisso', role: 'note' }, ico('attenzione'),
    h('div', null, h('b', null, 'Avviso: '), AVVISO_BREVE, ' ',
      h('button', { class: 'link', onclick: () => apriAvviso(false) }, 'Leggi l’avviso completo')));
}

function apriStorico(r) {
  const voci = S.msgs.filter(m => m.sub_id === r.sub_id && m.commessa === r.commessa && m.inviata_il)
    .sort((a, b) => (a.inviata_il < b.inviata_il ? 1 : -1));
  const chi = m => m.autore === 'admin' ? 'Ufficio Avanzamento Produzione' : nomeSub(m.sub_id);
  const cosa = m => m.tipo === 'data' ? 'Data prevista: ' + (m.data ? fmtData(m.data) : 'tolta') : (m.testo || '(testo cancellato)');
  const f = finestra(
    h('h3', null, (S.io === 'sub' ? 'Messaggi ' : 'Storico ') + r.commessa),
    h('p', { class: 'tenue', style: 'margin:0' }, [r.modello, r.descrizione].filter(Boolean).join(' · ')),
    voci.length
      ? h('ul', { class: 'storico' }, voci.map(m => h('li', { class: m.autore },
          h('div', { class: 'quando' }, chi(m) + ' · ' + fmtQuando(m.inviata_il)),
          h('div', { class: 'testo-nota' }, cosa(m)))))
      : h('p', { class: 'vuoto', style: 'margin:14px 0' }, 'Ancora nessun messaggio.'),
    h('button', { class: 'tasto pieno chiaro', onclick: () => f.chiudi() }, 'Chiudi'));
}

/* ---------------------------------------------------------------------------
   Carico del Sub
   --------------------------------------------------------------------------- */

async function vistaCarico() {
  const ids = subVisibili();
  S.righe = ids.length ? await q(sb.from('riga').select('*').in('sub_id', ids).eq('nel_carico', true)) : [];
  const elenco = S.righe.slice().sort((a, b) =>
    String(a.scadenza || '9999').localeCompare(String(b.scadenza || '9999')) || a.commessa.localeCompare(b.commessa));
  const tot = k => elenco.reduce((t, r) => t + (r[k] || 0), 0);
  if (S.io === 'sub') return disegnaCaricoSub(elenco, tot);
  const conSub = S.subSel === '*';
  const testa = ['Commessa', conSub ? 'Sub' : null, 'Modello', 'Descrizione', 'Scadenza', 'Lanciata', 'Aperte', 'In arrivo', 'Chiuse', 'Rimaste', 'Stato'].filter(Boolean);
  const num = new Set(['Lanciata', 'Aperte', 'In arrivo', 'Chiuse', 'Rimaste']);
  const voci = elenco.map(r => ({ r, testi: testiCarico(r), el: h('tr', null,
      h('td', { class: 'testa', 'data-l': 'Commessa' },
        h('span', { class: 'cod' }, r.commessa), ' ',
        MOSTRA_DIBA && r.diba ? h('button', { class: 'diba', onclick: () => apriDiba(r) }, 'Distinta') : null,
        bolletteInCasa(r, true), bolletteRiconsegnate(r, true),
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
      h('td', { 'data-l': 'Stato' }, STATI[r.stato] || '')) }));
  const tabella = h('div', { class: 'tabella-box' }, h('table', { class: 't' },
    h('thead', null, h('tr', null, testa.map(t => h('th', { class: num.has(t) ? 'num' : null }, t)))),
    h('tbody', null, voci.map(v => v.el))));
  const ricerca = ricercaSu(voci, tabella);
  riempi(corpo(),
    filtroSub(() => vistaCarico().catch(e => gestisciErrore(e, 'carico'))),
    h('div', { class: 'intestazione' }, h('h2', null, 'Carico'), elenco.length ? tastoExcel(() => scaricaExcel(nomeExcel('Carico'), [{
      nome: 'Carico',
      colonne: ['Sub', 'Commessa', 'Modello', 'Parte', 'Descrizione', 'Stagione', 'Scadenza', 'Lanciata', 'Aperte', 'In arrivo',
        'Chiuse', 'Rimaste', 'Stato', 'Bollette in casa', 'Bollette riconsegnate', 'Pezzi in arrivo, ora in'],
      righe: voci.filter(visibile).map(({ r }) => [nomeSub(r.sub_id), r.commessa, r.modello, r.parte, r.descrizione, r.stagione,
        dataX(r.scadenza), r.lanciata, r.aperte, r.in_arrivo, r.chiuse, r.rimaste, STATI[r.stato] || '',
        testoBolle(r.bolle, 'dal', 'dal'), testoBolle(r.riconsegnate, 'il', 'il'),
        (r.monte || []).map(m => (m.d || '').toLowerCase() + ' ' + m.pz + ' pz').join('; ')]) }])) : null,
      h('p', null, elenco.length + ' commesse · in casa ' + pz(tot('aperte')) + ' pz · in arrivo ' + pz(tot('in_arrivo')) + ' pz · rimaste ' + pz(tot('rimaste')) + ' pz')),
    elenco.length ? [ricerca.casella, ricerca.trovate, tabella, ricerca.niente] : h('div', { class: 'vuoto' }, 'Nessuna commessa assegnata.'));
  ricerca.aggiorna();
  disegnaBarra();
}

function disegnaCaricoSub(elenco, tot) {
  const voci = elenco.map(r => ({ testi: testiCarico(r), el: h('article', { class: 'scheda' },
    h('div', { class: 'capo' },
      h('div', null, h('span', { class: 'cod' }, r.commessa),
        h('p', { class: 'cosa' }, [[r.modello, r.parte].filter(Boolean).join(' '), r.descrizione].filter(Boolean).join(' · '))),
      h('div', { class: 'etichette' }, h('span', { class: 'etichetta' + (r.stato === 'lav' ? ' verde' : '') }, STATI[r.stato] || ''))),
    h('div', { class: 'numeri' },
      numero('In casa', pz(r.aperte) + ' pz', true),
      numero('In arrivo', pz(r.in_arrivo) + ' pz'),
      numero('Già consegnati', pz(r.chiuse) + ' pz'),
      numero('Scadenza', fmtData(r.scadenza) || '—')),
    bolletteInCasa(r),
    bolletteRiconsegnate(r),
    dettaglioCarico(r),
    MOSTRA_DIBA && r.diba ? h('div', { class: 'piedino' }, h('button', { class: 'diba', onclick: () => apriDiba(r) }, ico('documento'), 'Distinta base')) : null) }));
  const schede = h('div', { class: 'elenco-schede' }, voci.map(v => v.el));
  const ricerca = ricercaSu(voci, schede);
  riempi(corpo(),
    h('div', { class: 'intestazione' }, h('h2', null, 'Il tuo lavoro'),
      h('p', null, elenco.length + (elenco.length === 1 ? ' commessa' : ' commesse') + ' · in casa ' + pz(tot('aperte')) + ' pz · in arrivo ' + pz(tot('in_arrivo')) + ' pz')),
    avvisoFisso(),
    suggerimento('lavoro', h('div', null, 'Qui vedi tutte le commesse che ti abbiamo assegnato: i pezzi che hai già in casa, quelli che devono ancora arrivarti e quelli che ci hai già riconsegnato.')),
    elenco.length ? [ricerca.casella, ricerca.trovate, schede, ricerca.niente]
      : vuoto('Nessuna commessa', 'Al momento non ti abbiamo assegnato commesse.'));
  ricerca.aggiorna();
  disegnaBarra();
}

function dettaglioCarico(r) {
  const monte = r.monte || [];
  if (!monte.length) return null;
  return h('details', { class: 'dettaglio' }, h('summary', null, 'Dove sono i pezzi in arrivo'),
    h('ul', null, monte.map(m => h('li', null, (m.d || '').toLowerCase() + ': ' + pz(m.pz) + ' pz'))));
}

/* Bollette di una commessa: quelle che il Sub ha in casa (numero, pezzi, da
   quando) e quelle gia' riconsegnate (numero, pezzi, quando). compatte: per le
   tabelle dell'Admin. Le altre (oltre 6, o 3 su telefono e tabelle) si aprono
   a richiesta. */
function elencoBollette(lista, compatte, o) {
  if (!lista || !lista.length) return null;
  const voce = b => h('span', { class: 'bolletta' + (o.classe ? ' ' + o.classe : ''), title: o.dettaglio(b) || null },
    h('b', null, (compatte ? '' : 'n. ') + b.b), ' · ' + pz(b.q) + ' pz' + (!compatte && o.quando(b) ? ' · ' + o.quando(b) : ''));
  const MAX = TELEFONO || compatte ? 3 : 6;       // sul telefono e nelle tabelle ogni bolletta prende una riga
  const elenco = h('div', { class: 'bollette-el' }, lista.slice(0, MAX).map(voce));
  if (lista.length > MAX) {
    const altre = h('button', { class: 'link', type: 'button', onclick: () => { altre.replaceWith(...lista.slice(MAX).map(voce)); } },
      '+ altre ' + (lista.length - MAX));
    elenco.append(altre);
  }
  return h('div', { class: 'bollette' + (compatte ? ' compatte' : '') + (o.classe ? ' ' + o.classe : '') },
    h('span', { class: 'bollette-tit' }, ico(o.icona), o.titolo(lista.length, compatte)), elenco);
}

function bolletteInCasa(r, compatte) {
  return elencoBollette(r.bolle, compatte, { icona: 'documento',
    titolo: (n, c) => c ? (n === 1 ? 'Bolletta' : 'Bollette') : (n === 1 ? 'Bolletta in casa' : n + ' bollette in casa'),
    quando: b => b.dal ? 'dal ' + fmtData(b.dal).slice(0, 5) : '',
    dettaglio: b => [b.dal ? 'In casa dal ' + fmtData(b.dal) : null, (b.fasi || []).map(f => f.d).filter(Boolean).join(', ')].filter(Boolean).join(' · ') });
}

function bolletteRiconsegnate(r, compatte) {
  return elencoBollette(r.riconsegnate, compatte, { classe: 'riconsegnata', icona: 'fatto',
    titolo: (n, c) => c ? 'Riconsegnate' : (n === 1 ? 'Bolletta già riconsegnata' : n + ' bollette già riconsegnate'),
    quando: b => b.il ? 'il ' + fmtData(b.il).slice(0, 5) : '',
    dettaglio: b => b.il ? 'Riconsegnata il ' + fmtData(b.il) : '' });
}

const testoBolle = (lista, parola, campo) => (lista || []).map(b =>
  b.b + ' (' + b.q + ' pz' + (b[campo] ? ' ' + parola + ' ' + fmtData(b[campo]) : '') + ')').join('; ');

/* ---------------------------------------------------------------------------
   Excel: un vero file .xlsx fatto qui dentro, senza librerie (e' uno zip di
   file XML). fogli: [{ nome, colonne: [titoli], righe: [[valori]] }]; i valori
   possono essere numeri, testi, date (oggetti Date) o vuoti.
   --------------------------------------------------------------------------- */

const _crc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = _crc[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(file) {          // file: [{ nome, dati: Uint8Array }] -> Blob, senza compressione
  const enc = new TextEncoder(), parti = [], centrale = [];
  let pos = 0;
  for (const f of file) {
    const nome = enc.encode(f.nome), crc = crc32(f.dati), n = f.dati.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint16(12, 0x21, true); loc.setUint32(14, crc, true); loc.setUint32(18, n, true); loc.setUint32(22, n, true);
    loc.setUint16(26, nome.length, true);
    parti.push(loc, nome, f.dati);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true); cen.setUint32(20, n, true); cen.setUint32(24, n, true);
    cen.setUint16(28, nome.length, true); cen.setUint32(42, pos, true);
    centrale.push(cen, nome);
    pos += 30 + nome.length + n;
  }
  const dimC = centrale.reduce((t, x) => t + x.byteLength, 0);
  const fine = new DataView(new ArrayBuffer(22));
  fine.setUint32(0, 0x06054b50, true); fine.setUint16(8, file.length, true); fine.setUint16(10, file.length, true);
  fine.setUint32(12, dimC, true); fine.setUint32(16, pos, true);
  return new Blob([...parti, ...centrale, fine], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xmlEsc = t => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function lettereColonna(i) { let t = ''; i++; while (i) { const m = (i - 1) % 26; t = String.fromCharCode(65 + m) + t; i = Math.floor((i - 1) / 26); } return t; }
const serialeExcel = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
const dataX = t => t ? daIso(String(t).slice(0, 10)) : null;

function foglioXml(f) {
  const tutte = [f.colonne].concat(f.righe);
  const largh = f.colonne.map((c, i) => Math.min(60, Math.max(8, ...tutte.map(r => r[i] == null ? 0 : r[i] instanceof Date ? 11 : String(r[i]).length + 2))));
  const cella = (v, ri, ci) => {
    const ref = lettereColonna(ci) + (ri + 1);
    if (v == null || v === '') return '';
    if (ri === 0) return '<c r="' + ref + '" t="inlineStr" s="1"><is><t>' + xmlEsc(v) + '</t></is></c>';
    if (v instanceof Date) return '<c r="' + ref + '" s="2"><v>' + serialeExcel(v) + '</v></c>';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
    return '<c r="' + ref + '" t="inlineStr" s="3"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>';
  };
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' + largh.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
    '<sheetData>' + tutte.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((v, ci) => cella(v, ri, ci)).join('') + '</row>').join('') + '</sheetData>' +
    '<autoFilter ref="A1:' + lettereColonna(f.colonne.length - 1) + tutte.length + '"/></worksheet>';
}

function scaricaExcel(nomeFile, fogli) {
  const enc = new TextEncoder();
  const usati = new Set();
  const nomi = fogli.map(f => { let n = String(f.nome).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Foglio'; while (usati.has(n)) n = n.slice(0, 29) + '_' + usati.size; usati.add(n); return n; });
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const testa = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const file = [
    { nome: '[Content_Types].xml', testo: testa + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      fogli.map((f, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>' },
    { nome: '_rels/.rels', testo: testa + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nome: 'xl/workbook.xml', testo: testa + '<workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      nomi.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><definedNames>' +
      fogli.map((f, i) => '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xmlEsc(nomi[i]).replace(/'/g, "''") + '\'!$A$1:$' +
        lettereColonna(f.colonne.length - 1) + '$' + (f.righe.length + 1) + '</definedName>').join('') + '</definedNames></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', testo: testa + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      fogli.map((f, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (fogli.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nome: 'xl/styles.xml', testo: testa + '<styleSheet ' + ns + '>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFDF1DC"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
  ].concat(fogli.map((f, i) => ({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', testo: foglioXml(f) })));
  const blob = zip(file.map(f => ({ nome: f.nome, dati: enc.encode(f.testo) })));
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nomeFile, style: 'display:none' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  toast('Excel pronto: ' + nomeFile);
  return blob;
}

// Tasto "Scarica Excel" (solo Admin): esporta le righe che si vedono (Sub scelto e ricerca).
function tastoExcel(fai) {
  if (S.io !== 'admin') return null;
  return h('button', { class: 'tasto piccolo chiaro excel', type: 'button', onclick: () => {
    try { fai(); } catch (e) { console.error(e); toast('Non sono riuscito a preparare l’Excel.'); }
  } }, ico('excel'), 'Scarica Excel');
}

const visibile = v => !v.el.classList.contains('nascosto');
function nomeExcel(pagina) {
  const chi = S.subSel === '*' ? 'tutti i Sub' : nomeSub(S.subSel);
  return ('Note Av - ' + pagina + ' - ' + chi + ' - ' + oggiIso() + '.xlsx').replace(/[\\/:*?"<>|]/g, ' ');
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
  const voci = [];
  const sintesi = [];          // per il foglio Riepilogo dell'Excel
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
    [...perComm.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([com, c], i) => voci.push({
      el: righe[i], testi: [com, c.x.modello, c.x.parte, c.x.descrizione, S.io === 'admin' ? nomeSub(id) : null],
      riga: [nomeSub(id), com, c.x.modello, c.x.parte, c.x.descrizione].concat(colonne.map(g => c.g[g] || null),
        [Object.values(c.g).reduce((a, b) => a + b, 0)]) }));
    sintesi.push([nomeSub(id), totale, tg ? tg.pezzi : null, tg ? totale - tg.pezzi : null]);
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
      obiettivo(totale, tg, corrente),
      perComm.size ? h('div', { class: 'tabella-box' }, h('table', { class: 't' },
        h('thead', null, h('tr', null, testa.map((t, i) => h('th', { class: i >= 4 ? 'num' : null }, t)))),
        h('tbody', null, righe, riepilogo))) : (S.io === 'admin' && corrente ? h('p', null, h('span', { class: 'tenue' }, 'Target: '), cellaTarget) : null));
  }

  const nav = h('div', { class: 'settimana' },
    h('button', { class: 'freccia', 'aria-label': 'Settimana prima', onclick: () => { S.lunedi = aggiungiGiorni(S.lunedi, -7); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, '‹'),
    h('b', null, 'Settimana ' + settimanaIso(lun) + ' · ' + fmtData(iso(lun)).slice(0, 5) + '–' + fmtData(iso(aggiungiGiorni(lun, 4))).slice(0, 5)),
    h('button', { class: 'freccia', 'aria-label': 'Settimana dopo', disabled: corrente, onclick: () => { S.lunedi = aggiungiGiorni(S.lunedi, 7); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, '›'),
    corrente ? null : h('button', { class: 'tasto piccolo chiaro', onclick: () => { S.lunedi = lunediDi(new Date()); vistaConsegne().catch(e => gestisciErrore(e, 'consegne')); } }, 'Questa settimana'));

  const contenitore = h('div', null, blocchi);
  const ricerca = ricercaSu(voci, contenitore);
  riempi(corpo(),
    filtroSub(() => vistaConsegne().catch(e => gestisciErrore(e, 'consegne'))),
    h('div', { class: 'intestazione' }, h('h2', null, 'Consegne'), sintesi.length ? tastoExcel(() => scaricaExcel(
      nomeExcel('Consegne settimana ' + settimanaIso(lun)), [
        { nome: 'Consegne', colonne: ['Sub', 'Commessa', 'Modello', 'Parte', 'Descrizione'].concat(
            colonne.map(g => GIORNI[(daIso(g).getDay() + 6) % 7] + ' ' + fmtData(g).slice(0, 5)), ['Totale']),
          righe: voci.filter(visibile).map(v => v.riga) },
        { nome: 'Riepilogo', colonne: ['Sub', 'Totale settimana', 'Target', 'Differenza'], righe: sintesi }])) : null,
      h('p', null, (S.io === 'sub' ? 'I pezzi che ci hai riconsegnato, giorno per giorno' : 'Pezzi riconsegnati giorno per giorno')
        + (stima ? ' · ≈ alcuni giorni sono stimati (data dell’ultima chiusura della bolletta)' : ''))),
    nav,
    voci.length ? [ricerca.casella, ricerca.trovate] : null,
    blocchi.length ? contenitore : vuoto('Nessuna consegna', 'In questa settimana non risultano pezzi riconsegnati.'),
    voci.length ? ricerca.niente : null);
  ricerca.aggiorna();
  disegnaBarra();
}

/* La barra che si riempie verso il Target Settimanale. */
function obiettivo(totale, tg, corrente) {
  const quota = tg && tg.pezzi > 0 ? Math.min(100, Math.round(totale / tg.pezzi * 100)) : null;
  const raggiunto = tg && totale >= tg.pezzi;
  const barra = h('div', null);
  if (quota !== null) setTimeout(() => { barra.style.width = quota + '%'; }, 60);
  return h('div', { class: 'obiettivo' },
    h('div', { class: 'riga' }, h('span', null, corrente ? 'Consegnati questa settimana' : 'Consegnati in questa settimana'), h('b', { class: 'tanti' }, pz(totale) + ' pz')),
    tg ? [h('div', { class: 'progresso' + (raggiunto ? ' fatto' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(quota || 0) }, barra),
          h('div', { class: 'riga tenue' }, h('span', null, 'Obiettivo della settimana: ' + pz(tg.pezzi) + ' pz'),
            h('b', { style: 'color:' + (raggiunto ? 'var(--verde)' : 'var(--ink-2)') }, raggiunto ? 'Obiettivo raggiunto!' : 'Mancano ' + pz(tg.pezzi - totale) + ' pz'))]
       : null);
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
  const [pos, invii, eventi, contatori, provaSparo] = await Promise.all([
    q(sb.from('bacheca').select('*').eq('giorno', giorno)),
    q(sb.from('invio').select('*').eq('da', 'sub').is('letto_il', null)),
    q(sb.from('evento').select('*').is('letto_il', null).order('id', { ascending: false })),
    facoltativo(sb.from('contatori').select('*')),
    riquadriProvaSparo(),
  ]);
  const conta = new Map(contatori.map(c => [c.sub_id, c]));
  S.invii = invii;
  S.daLeggere = invii.reduce((t, i) => t + (i.quante || 1), 0);
  aggiornaConta();
  const posizione = new Map(pos.map(p => [p.sub_id, p]));
  const nonLetti = new Set(invii.map(i => i.sub_id));
  const attivi = S.subs.filter(s => !s.senza_lavoro_dal);
  const fermi = S.subs.filter(s => s.senza_lavoro_dal);
  const colonnaDi = id => (posizione.get(id) || {}).colonna || 'da_controllare';

  const cartellino = s => {
    const menu = h('div', { class: 'menu-cartellino nascosto' },
      h('button', { class: 'tasto piccolo', onclick: () => vai('righe', s.id) }, 'Apri le Righe'),
      COLONNE.filter(([k]) => k !== colonnaDi(s.id))
        .map(([k, nome]) => h('button', { class: 'tasto piccolo chiaro', onclick: () => sposta(s.id, k) }, '→ ' + nome)));
    const iniziale = h('div', { class: 'iniziale', style: 'background:' + tinta(s.id) }, s.nome.slice(0, 1).toUpperCase());
    const c = h('div', { class: 'cartellino', draggable: 'true', 'data-sub': s.id,
      ondragstart: ev => { ev.dataTransfer.setData('text/plain', s.id); c.classList.add('trascina'); },
      ondragend: () => c.classList.remove('trascina'),
      onclick: () => menu.classList.toggle('nascosto') },
      iniziale, h('div', { class: 'nome' }, s.nome, contaCartellino(conta.get(s.id))),
      nonLetti.has(s.id) ? h('span', { class: 'pallino', title: 'Risposte nuove' }) : null);
    return [c, menu];
  };

  const colonne = COLONNE.map(([k, nome]) => {
    const dentro = attivi.filter(s => colonnaDi(s.id) === k)
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

  // Il giro di oggi: quanti Cartellini sono gia' in "Controllato".
  const fatti = attivi.filter(s => colonnaDi(s.id) === 'controllato').length;
  const quota = attivi.length ? Math.round(fatti / attivi.length * 100) : 0;
  const barra = h('div', null);
  setTimeout(() => { barra.style.width = quota + '%'; }, 60);
  const giro = attivi.length ? h('div', { class: 'giro' },
    h('div', { class: 'riga' }, h('span', null, fatti === attivi.length ? 'Giro completato: bel lavoro!' : 'Controllati oggi'), h('b', null, fatti + ' su ' + attivi.length)),
    h('div', { class: 'progresso' + (fatti === attivi.length ? ' fatto' : '') }, barra)) : null;

  const oggi = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  riempi(corpo(),
    h('div', { class: 'saluto' }, svg(SOLE), h('div', null,
      h('h2', null, saluto() + '! Ecco il giro di oggi'),
      h('p', null, oggi.charAt(0).toUpperCase() + oggi.slice(1) + ' · si riparte da capo ogni mattina alle 8'))),
    giro,
    provaSparo.length ? h('div', { class: 'avvisi' }, provaSparo) : null,
    avvisi,
    h('div', { class: 'bacheca' }, colonne),
    fermi.length ? h('div', { class: 'senza-lavoro' }, h('h3', null, 'Sub senza lavoro'),
      h('div', { class: 'bacheca' }, h('div', null, fermi.map(cartellino)))) : null);
  disegnaBarra();
}

// I numeri di READLY sul Cartellino: da chiamare, mancanze, quantita' contestate.
function contaCartellino(c) {
  if (!c) return null;
  const voci = [
    [c.da_chiamare, '📞', 'Righe da chiamare: READLY non sa quando rientrano'],
    [c.mancanze, '⚠', 'Righe con Mancanze Segnalate'],
    [c.contestate, '≠', 'Quantità contestate: il Sub dichiara numeri diversi dai nostri'],
    [c.previsionale_mancante ? 1 : 0, '📄', 'Previsionale della settimana non ancora arrivato'],
  ].filter(v => v[0] > 0);
  if (!voci.length) return null;
  return h('div', { class: 'conta-readly' }, voci.map(([n, segno, titolo]) =>
    h('span', { title: titolo }, segno + (segno === '📄' ? '' : ' ' + n))));
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
      h('td', { 'data-l': 'Avviso assegnazioni' }, !p ? null
        : p.avviso_letto_il && p.avviso_letto_il.slice(0, 10) >= AVVISO_DEL
          ? h('span', { class: 'etichetta verde' }, 'Letto il ' + fmtQuando(p.avviso_letto_il))
          : h('span', { class: 'etichetta' }, 'Non ancora letto')),
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
      h('thead', null, h('tr', null, ['Sub', 'Accesso', 'Avviso assegnazioni', 'Dispositivi', ''].map(t => h('th', null, t)))),
      h('tbody', null, schede))));
  disegnaBarra();
}

/* ---------------------------------------------------------------------------
   Sparo delle Bollette (vedi pistola_barcode\decisioni.md)
   Il Sub con sub.sparo (oggi solo Zeta Due) ha il tasto «Spara bolletta» in
   tutte le schede e legge il barcode della bolletta con la fotocamera
   (lettore_gea.js): il 1° Sparo vuol dire iniziata, il 2° Pronta.
   FASE DI PROVA (sub.sparo = 'prova'): il tasto legge e mostra i popup, ma
   registra soltanto ogni tentativo (tabella sparo_prova). In Note Av non
   cambia niente e non partono notifiche; per scegliere il popup (1°, 2° o 3°
   Sparo) contano gli Spari della prova stessa.
   Senza internet lo Sparo resta nel telefono e parte quando torna la rete.
   --------------------------------------------------------------------------- */

const SPARO_ANNULLA_S = 10;      // secondi in cui Martina puo' annullare
const SPARO_DOPPIO_S = 60;       // 2° Sparo cosi' vicino al 1°: si chiede se e' gia' finita
const SP = { modo: null, coda: [], storia: [], bolle: null, inviando: false, aperto: false, modello: null };

function leggiJson(k, d) { try { const v = localStorage.getItem('noteav-' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function scriviJson(k, v) { try { localStorage.setItem('noteav-' + k, JSON.stringify(v)); } catch (e) { /* niente */ } }

// 'prova' | 'attivo' | null: il tasto c'e' solo per il Sub che ha lo Sparo.
function modoSparo() {
  if (S.io !== 'sub' || !S.chi) return null;
  const s = S.subs.find(x => x.id === S.chi.sub_id);
  return (s && s.sparo) || null;
}

// Gli Spari salvati nel telefono (servono anche senza rete, prima dell'accesso).
function caricaSpariLocali() {
  SP.coda = leggiJson('spari-coda', []);
  SP.storia = leggiJson('spari-storia', []);
  SP.bolle = leggiJson('spari-bolle', null);
  SP.modo = SP.modo || ricordato('sparo-modo') || null;
}

async function preparaSparo() {
  SP.modo = modoSparo();
  ricorda('sparo-sub', SP.modo ? S.chi.sub_id : '');
  ricorda('sparo-modo', SP.modo || '');
  if (!SP.modo) return;
  caricaSpariLocali();
  if (!SP.ascolta) { SP.ascolta = true; window.addEventListener('online', () => inviaSpari()); }
  // il modello del telefono (Chrome su Android lo dice solo se lo si chiede)
  if (!SP.modello && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(['model', 'platformVersion']).then(d => {
      SP.modello = [navigator.userAgentData.platform, d.platformVersion, d.model].filter(Boolean).join(' ') || null;
    }, () => {});
  }
  await inviaSpari();
  await Promise.all([aggiornaStoriaSpari(), aggiornaBolleSparo()]);
}

const voceStoria = v => ({ uid: v.uid, bolla: v.bolla || null, esito: v.esito, quando: v.quando, annullato_il: v.annullato_il || null });

// Gli Spari gia' arrivati all'ufficio (anche da un altro telefono, o annullati
// dall'Admin), piu' quelli ancora in coda qui.
async function aggiornaStoriaSpari() {
  const dal = new Date(Date.now() - 90 * 86400e3).toISOString();
  const arrivati = await q(sb.from('sparo_prova').select('uid,bolla,esito,quando,annullato_il')
    .eq('sub_id', S.chi.sub_id).gte('quando', dal).order('quando'));
  const inCoda = new Set(SP.coda.map(v => v.uid));
  SP.storia = arrivati.filter(r => !inCoda.has(r.uid)).concat(SP.coda.map(voceStoria));
  scriviJson('spari-storia', SP.storia);
}

// Le bollette del Sub, per capire il caso: in casa (con commessa e pezzi) o
// gia' riconsegnate. Copia nel telefono per quando manca la rete.
async function aggiornaBolleSparo() {
  const righe = await q(sb.from('riga').select('commessa,bolle,riconsegnate').eq('sub_id', S.chi.sub_id));
  const aperte = {}, rientrate = {};
  for (const r of righe) {
    for (const b of r.bolle || []) aperte[b.b] = { c: r.commessa, q: b.q };
    for (const b of r.riconsegnate || []) rientrate[b.b] = { c: r.commessa, q: b.q };
  }
  SP.bolle = { aperte, rientrate, il: new Date().toISOString() };
  scriviJson('spari-bolle', SP.bolle);
}

function casoBolletta(bolla) {
  const b = SP.bolle || { aperte: {}, rientrate: {} };
  if (b.aperte[bolla]) return { in_dati: 'aperta', commessa: b.aperte[bolla].c, pezzi: b.aperte[bolla].q };
  if (/^9\d{5}$/.test(bolla)) return { in_dati: 'riparazione' };      // registrata, ma fuori dai conteggi
  if (b.rientrate[bolla]) return { in_dati: 'rientrata', commessa: b.rientrate[bolla].c, pezzi: b.rientrate[bolla].q };
  return { in_dati: 'attesa' };                                        // Sparo in Attesa: lo Scarico non l'ha ancora portata
}

// Gli Spari che contano per lo stato di una bolletta (1° = iniziata, 2° = Pronta).
function spariValidi(bolla) {
  return SP.storia.filter(v => v.bolla === bolla && !v.annullato_il && (v.esito === 'iniziata' || v.esito === 'pronta'))
    .sort((a, b) => (a.quando < b.quando ? -1 : 1));
}

function tastoSparo(modo) {
  if (!modo || !window.LettoreBarcodeGea) return null;
  return h('button', { class: 'tasto spara', type: 'button', onclick: () => sparaBolletta() }, ico('barcode'), 'Spara bolletta',
    modo === 'prova' ? h('span', { class: 'prova' }, 'prova') : null);
}

async function sparaBolletta() {
  if (SP.aperto) return;
  SP.aperto = true;
  try {
    if (S.chi && navigator.onLine !== false) aggiornaBolleSparo().catch(() => {});   // intanto che si inquadra
    const r = await LettoreBarcodeGea.apri({ titolo: 'Spara bolletta' });
    if (r.esito === 'letto') await esitoSparo(r);
    else registraSparo({ esito: r.esito === 'errore' ? 'errore_fotocamera' : 'non_letto', durata_ms: r.durata_ms, video: r.video, nota: r.errore || null });
  } catch (e) {
    console.error('sparo', e);
    toast('Qualcosa non è andato: riprova.');
  } finally { SP.aperto = false; }
}

// Lo Sparo e' automatico: letto il codice, si registra subito e il popup
// lascia 10 secondi per «Annulla». I testi sono quelli approvati.
async function esitoSparo(r) {
  const caso = casoBolletta(r.bolla);
  const dati = Object.assign({ codice: r.codice, bolla: r.bolla, durata_ms: r.durata_ms, fonte: r.fonte,
    fotogrammi: r.fotogrammi, video: r.video }, caso);
  const n = 'Bolletta ' + r.bolla;
  const dettaglio = caso.commessa ? caso.commessa + ' · ' + pz(caso.pezzi) + ' pz' : caso.in_dati === 'riparazione' ? 'Bolletta di riparazione' : null;
  if (caso.in_dati === 'rientrata') {
    registraSparo(Object.assign(dati, { esito: 'rientrata' }));
    return popupSparo('rifiutato', n + ': risulta già rientrata', dettaglio, null);
  }
  const prima = spariValidi(r.bolla);
  if (prima.length >= 2) {
    registraSparo(Object.assign(dati, { esito: 'gia_pronta' }));
    return popupSparo('pronta', n + ': è già pronta', dettaglio, null);
  }
  if (prima.length === 1) {
    if (Date.now() - new Date(prima[0].quando).getTime() < SPARO_DOPPIO_S * 1000
        && !(await domandaSparo('Hai appena iniziato la bolletta ' + r.bolla + '. È già finita?'))) {
      registraSparo(Object.assign(dati, { esito: 'per_sbaglio' }));
      return toast('Va bene: la bolletta ' + r.bolla + ' resta iniziata.');
    }
    return popupSparo('pronta', n + ' pronta', dettaglio, registraSparo(Object.assign(dati, { esito: 'pronta' })));
  }
  return popupSparo('iniziata', n + ' iniziata', dettaglio, registraSparo(Object.assign(dati, { esito: 'iniziata' })));
}

// Il popup dopo lo Sparo: resta 10 secondi, con «Annulla» se c'e' qualcosa da annullare.
function popupSparo(tipo, titolo, dettaglio, voce) {
  let resta = SPARO_ANNULLA_S;
  const conta = h('b', null, String(resta));
  const chiudi = () => { clearInterval(timer); f.chiudi(); };
  const f = finestraObbligata(
    h('div', { class: 'esito-sparo ' + tipo },
      h('span', { class: 'segno' }, ico(tipo === 'rifiutato' ? 'attenzione' : tipo === 'pronta' ? 'fatto' : 'barcode')),
      h('h3', null, titolo), dettaglio ? h('p', null, dettaglio) : null),
    h('div', { class: 'tasti-sparo' },
      voce ? h('button', { class: 'tasto chiaro', type: 'button', onclick: () => { chiudi(); annullaSparo(voce); } }, h('span', null, 'Annulla (', conta, ')')) : null,
      h('button', { class: 'tasto', type: 'button', onclick: chiudi }, 'Ok')),
    SP.modo === 'prova' ? h('p', { class: 'nota-piccola prova-sparo' }, 'Fase di prova: lo Sparo viene solo registrato, in Note Av per ora non cambia niente.') : null);
  const timer = setInterval(() => { if (--resta <= 0) chiudi(); else conta.textContent = String(resta); }, 1000);
}

function domandaSparo(testo) {
  return new Promise(fatto => {
    const f = finestraObbligata(h('h3', { class: 'domanda-sparo' }, testo),
      h('div', { class: 'tasti-sparo colonna' },
        h('button', { class: 'tasto pieno', type: 'button', onclick: () => { f.chiudi(); fatto(true); } }, 'Sì, è pronta'),
        h('button', { class: 'tasto chiaro pieno', type: 'button', onclick: () => { f.chiudi(); fatto(false); } }, 'No, ho sparato per sbaglio')));
  });
}

const nuovoUid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));

function sistemaTelefono() {
  if (SP.modello) return SP.modello;
  const ios = UA.match(/OS (\d+)[_.](\d+)/), andr = UA.match(/Android ([\d.]+)/);
  if (IOS) return (/iPad/.test(UA) ? 'iPad' : 'iPhone') + (ios ? ' iOS ' + ios[1] + '.' + ios[2] : '');
  if (ANDROID) return 'Android' + (andr ? ' ' + andr[1] : '');
  return /Windows/.test(UA) ? 'Windows' : /Mac OS/.test(UA) ? 'Mac' : 'altro';
}
function browserTelefono() {
  const ver = re => { const m = UA.match(re); return m ? ' ' + m[1] : ''; };
  return /Edg\//.test(UA) ? 'Edge' + ver(/Edg\/(\d+)/) : /CriOS\//.test(UA) ? 'Chrome' + ver(/CriOS\/(\d+)/)
    : /Chrome\//.test(UA) ? 'Chrome' + ver(/Chrome\/(\d+)/) : /Firefox\//.test(UA) ? 'Firefox' + ver(/Firefox\/(\d+)/)
    : /Safari\//.test(UA) ? 'Safari' + ver(/Version\/(\d+)/) : 'browser';
}
const descrizioneTelefono = () => [sistemaTelefono(), browserTelefono(), standalone() ? 'app' : 'nel browser'].join(' · ');

// Ogni tentativo va in coda nel telefono e poi all'ufficio.
function registraSparo(dati) {
  const v = Object.assign({ uid: nuovoUid(), quando: new Date().toISOString(),
    sub_id: (S.chi && S.chi.sub_id) || ricordato('sparo-sub') || null,
    dispositivo: idDispositivo(), telefono: descrizioneTelefono() }, dati);
  SP.coda.push(v);
  SP.storia.push(voceStoria(v));
  scriviJson('spari-coda', SP.coda);
  scriviJson('spari-storia', SP.storia);
  inviaSpari();
  return v;
}

// «Annulla» di Martina entro i 10 secondi: se lo Sparo e' gia' partito, si
// rimanda con l'annullamento (il database lo accetta solo entro i 10 s).
function annullaSparo(v) {
  v.annullato_il = new Date().toISOString();
  const s = SP.storia.find(x => x.uid === v.uid);
  if (s) s.annullato_il = v.annullato_il;
  if (!SP.coda.includes(v)) SP.coda.push(v);
  scriviJson('spari-coda', SP.coda);
  scriviJson('spari-storia', SP.storia);
  inviaSpari();
  toast('Annullato: la bolletta ' + v.bolla + ' torna com’era.');
}

// Manda all'ufficio gli Spari in coda, uno per volta e in ordine. Senza rete
// (o con l'accesso da rinnovare) si ferma e riprova piu' tardi.
async function inviaSpari() {
  if (SP.inviando || !SP.coda.length || !S.chi || !sb) return;
  SP.inviando = true;
  try {
    for (let giri = SP.coda.length + 2; SP.coda.length && giri > 0; giri--) {
      const v = SP.coda[0];
      const mandato = JSON.stringify(v);
      let error;
      try { ({ error } = await sb.rpc('registra_sparo_prova', { p: v })); } catch (e) { error = e; }
      if (error) {
        const codice = String(error.code || error.status || '');
        if (erroreDiRete(error) || ['42501', 'PGRST301', 'PGRST303', '401'].includes(codice)) break;
        console.warn('Sparo non registrato', error);
        v.rifiuti = (v.rifiuti || 0) + 1;
        SP.coda.shift();
        if (v.rifiuti < 5) SP.coda.push(v);            // in fondo: si riprova al giro dopo
      } else if (JSON.stringify(v) === mandato) SP.coda.shift();   // annullato nel frattempo: si rimanda
      scriviJson('spari-coda', SP.coda);
    }
  } finally { SP.inviando = false; }
}

/* ---------------------------------------------------------------------------
   Prova dello Sparo (solo Admin)
   Ogni tentativo del Sub in prova con il suo giudizio, e il conto: la prova e'
   superata se almeno il 95% degli Spari e' corretto nelle 48 ore dal primo
   Sparo, contate solo dal lunedi' al venerdi' (gli Spari del sabato contano,
   ma non allungano ne' accorciano le 48 ore).
   Giudizio automatico: corretto se il numero letto e' una bolletta del Sub (o
   una Bolletta di Riparazione); sbagliato se la fotocamera e' rimasta aperta
   almeno 3 secondi senza leggere, o non si e' aperta; da verificare se il
   numero non risulta tra le sue bollette o se Martina l'ha annullato.
   L'Admin puo' sempre decidere da se'.
   --------------------------------------------------------------------------- */

const PROVA_ORE = 48;
const PROVA_SOGLIA = 95;
const ESITI_SPARO = {
  iniziata: 'Iniziata', pronta: 'Pronta', gia_pronta: 'Già pronta (3° Sparo)', rientrata: 'Già rientrata: rifiutato',
  per_sbaglio: '2° Sparo per sbaglio', non_letto: 'Chiuso senza leggere', errore_fotocamera: 'Fotocamera non aperta',
};
const GIUDIZI = { corretto: 'Corretto', sbagliato: 'Sbagliato', escluso: 'Non conta' };

// La fine delle `ore` lavorative partendo da `inizio`: il sabato e la
// domenica l'orologio della prova e' fermo.
function fineOreLavorative(inizio, ore) {
  let resto = ore * 3600e3, t = new Date(inizio);
  for (let i = 0; i < 400; i++) {
    const domani = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    if (t.getDay() !== 0 && t.getDay() !== 6) {
      if (resto <= domani - t) return new Date(t.getTime() + resto);
      resto -= domani - t;
    }
    t = domani;
  }
  return t;
}

function oreLavorativeTra(a, b) {
  let t = new Date(a), ms = 0;
  while (t < b) {
    const domani = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    const fino = domani < b ? domani : b;
    if (t.getDay() !== 0 && t.getDay() !== 6) ms += fino - t;
    t = fino;
  }
  return ms / 3600e3;
}

const insiemeBolle = righe => new Set(righe.flatMap(r => (r.bolle || []).concat(r.riconsegnate || []).map(b => b.b)));

function giudizioAutomatico(v, bolle) {
  if (v.esito === 'non_letto') return (v.durata_ms || 0) < 3000 ? 'escluso' : 'sbagliato';   // aperta e chiusa subito: per sbaglio
  if (v.esito === 'errore_fotocamera') return 'sbagliato';
  if (v.annullato_il) return null;
  if (v.in_dati === 'riparazione' || bolle.has(v.bolla)) return 'corretto';
  return null;
}

function analisiProva(sub, spari, bolle) {
  const dal = sub.sparo_dal ? new Date(sub.sparo_dal) : null;
  const voci = spari.map(v => {
    const auto = giudizioAutomatico(v, bolle);
    return { v, auto, giudizio: v.verifica || auto, t: new Date(v.quando), dentro: false };
  }).sort((a, b) => a.t - b.t);
  const prima = voci.find(x => (!dal || x.t >= dal) && x.giudizio !== 'escluso');
  const inizio = prima ? prima.t : null;
  const fine = inizio ? fineOreLavorative(inizio, PROVA_ORE) : null;
  for (const x of voci) x.dentro = !!inizio && x.t >= inizio && x.t < fine;
  const dentro = voci.filter(x => x.dentro);
  const conta = g => dentro.filter(x => x.giudizio === g).length;
  const a = { voci, inizio, fine, dentro: dentro.length, corretti: conta('corretto'), sbagliati: conta('sbagliato'),
    esclusi: conta('escluso'), daVerificare: dentro.filter(x => !x.giudizio).length };
  const contati = a.corretti + a.sbagliati;
  a.quota = contati ? Math.floor(a.corretti / contati * 1000) / 10 : null;
  a.superata = contati > 0 && a.corretti * 100 >= PROVA_SOGLIA * contati;
  a.trascorse = inizio ? Math.min(PROVA_ORE, oreLavorativeTra(inizio, new Date())) : 0;
  a.stato = !inizio ? 'non_iniziata' : Date.now() < fine.getTime() ? 'in_corso'
    : a.daVerificare ? 'da_verificare' : a.superata ? 'superata' : 'non_superata';
  return a;
}

const fmtGiornoOra = d => d.toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtSparo = ts => new Date(ts).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtQuota = a => a.quota === null ? '—' : String(a.quota).replace('.', ',') + '%';

async function datiProva(s, leggi) {
  const [spari, righe] = await Promise.all([
    leggi(sb.from('sparo_prova').select('*').eq('sub_id', s.id).order('quando')),
    leggi(sb.from('riga').select('commessa,bolle,riconsegnate').eq('sub_id', s.id)),
  ]);
  return analisiProva(s, spari, insiemeBolle(righe));
}

// Per la Bacheca: una riga per ogni Sub in prova.
async function riquadriProvaSparo() {
  const out = [];
  for (const s of S.subs.filter(x => x.sparo === 'prova')) {
    const a = await datiProva(s, facoltativo);
    const quanti = a.dentro + (a.dentro === 1 ? ' tentativo' : ' tentativi');
    const testo = {
      non_iniziata: 'non ancora iniziata (le 48 ore partono dal primo Sparo).',
      in_corso: quanti + ', ' + fmtQuota(a) + ' corretti · finisce ' + fmtGiornoOra(a.fine) + (a.daVerificare ? ' · ' + a.daVerificare + ' da verificare' : '') + '.',
      da_verificare: 'finita: ' + a.daVerificare + ' Spari da verificare.',
      superata: 'superata con il ' + fmtQuota(a) + ' di Spari corretti.',
      non_superata: 'non superata (' + fmtQuota(a) + ' di Spari corretti, serve il ' + PROVA_SOGLIA + '%).',
    }[a.stato];
    out.push(h('div', { class: 'avviso prova-sparo-riga' }, ico('barcode'),
      h('span', null, h('b', null, 'Prova dello Sparo · ' + s.nome + ': '), testo),
      h('button', { class: 'tasto piccolo chiaro', onclick: () => vai('sparo') }, 'Apri')));
  }
  return out;
}

async function vistaSparo() {
  const subs = S.subs.filter(s => s.sparo);
  const blocchi = [];
  for (const s of subs) blocchi.push(bloccoProva(s, await datiProva(s, q)));
  riempi(corpo(),
    h('div', { class: 'intestazione' }, h('h2', null, 'Prova dello Sparo'),
      h('p', null, 'Il tasto «Spara bolletta» registra ogni tentativo ma non cambia niente in Note Av. La prova è superata se almeno il '
        + PROVA_SOGLIA + '% degli Spari è corretto nelle ' + PROVA_ORE + ' ore lavorative (lunedì–venerdì) dal primo Sparo.')),
    subs.length ? blocchi : vuoto('Nessuna prova', 'Nessun Sub ha il tasto «Spara bolletta».'));
  disegnaBarra();
}

function bloccoProva(s, a) {
  const contati = a.corretti + a.sbagliati;
  const su = a.corretti + ' su ' + contati;
  const titolo = { non_iniziata: 'Non ancora iniziata', in_corso: 'In corso', da_verificare: 'Finita: restano Spari da verificare',
    superata: 'Prova superata', non_superata: 'Prova non superata' }[a.stato];
  const frase = {
    non_iniziata: 'Le ' + PROVA_ORE + ' ore partono dal primo Sparo di ' + s.nome + '.',
    in_corso: fmtQuota(a) + ' di Spari corretti finora (' + su + '). Finisce ' + fmtGiornoOra(a.fine) + '.',
    da_verificare: 'Decidi qui sotto gli Spari «da verificare»: poi la pagina dice com’è andata.',
    superata: fmtQuota(a) + ' di Spari corretti (' + su + '). Ora si fa il resto: stati e colori delle bollette, Avvisi di Avanzamento, notifiche e READLY; poi l’ADR «Sparo con la fotocamera dello smartphone invece della pistola».',
    non_superata: fmtQuota(a) + ' di Spari corretti (' + su + '), ne serve almeno il ' + PROVA_SOGLIA + '%. Prima di tornare alla pistola si riprova con un Android economico lasciato in laboratorio: «Ricomincia la prova da adesso».',
  }[a.stato];
  const barra = h('div', null);
  if (a.inizio) setTimeout(() => { barra.style.width = Math.round(a.trascorse / PROVA_ORE * 100) + '%'; }, 60);

  const righe = a.voci.slice().reverse().map(x => rigaSparo(x));
  const excel = () => scaricaExcel(('Note Av - Prova dello Sparo - ' + s.nome + ' - ' + oggiIso() + '.xlsx').replace(/[\\/:*?"<>|]/g, ' '), [{
    nome: 'Spari',
    colonne: ['Quando', 'Nella prova', 'Bolletta', 'Codice letto', 'Commessa', 'Pezzi', 'Nei dati', 'Esito', 'Annullato', 'Lettura (s)',
      'Lettore', 'Fotogrammi', 'Fotocamera', 'Telefono', 'Errore', 'Giudizio', 'Deciso da'],
    righe: a.voci.map(({ v, giudizio, dentro }) => [fmtSparo(v.quando), dentro ? 'Sì' : 'No', v.bolla, v.codice, v.commessa, v.pezzi, v.in_dati,
      ESITI_SPARO[v.esito] || v.esito, v.annullato_il ? (v.annullato_da === 'admin' ? 'dall’Admin' : 'da ' + s.nome) : '',
      v.durata_ms != null ? Math.round(v.durata_ms / 100) / 10 : null, v.fonte, v.fotogrammi, v.video, v.telefono, v.nota,
      giudizio ? GIUDIZI[giudizio] : 'Da verificare', v.verifica ? 'Admin' : 'automatico']) }]);

  return h('section', { class: 'prova-sparo' },
    S.subs.filter(x => x.sparo).length > 1 ? h('h3', { class: 'gruppo-sub' }, s.nome) : null,
    h('div', { class: 'prova-esito ' + a.stato },
      h('h3', null, titolo), h('p', null, frase),
      a.inizio ? [h('div', { class: 'progresso' + (a.stato === 'superata' ? ' fatto' : '') }, barra),
        h('p', { class: 'tenue' }, 'Iniziata ' + fmtGiornoOra(a.inizio) + ' · trascorse ' + String(Math.floor(a.trascorse * 10) / 10).replace('.', ',')
          + ' ore lavorative su ' + PROVA_ORE + ' · finisce ' + fmtGiornoOra(a.fine))] : null,
      h('div', { class: 'numeri' },
        numero('Nella prova', String(a.dentro), true), numero('Corretti', String(a.corretti)), numero('Sbagliati', String(a.sbagliati)),
        numero('Da verificare', String(a.daVerificare)), numero('Non contano', String(a.esclusi))),
      h('div', { class: 'azioni-prova' },
        a.voci.length ? tastoExcel(excel) : null,
        s.sparo === 'prova' ? h('button', { class: 'tasto piccolo chiaro', type: 'button', onclick: async () => {
          if (!confirm('Ricominciare la prova di ' + s.nome + ' da adesso? Gli Spari fatti finora restano nell’elenco ma non contano più.')) return;
          try {
            await q(sb.rpc('riparti_prova_sparo', { p_sub: s.id }));
            S.subs = await q(sb.from('sub').select('*').order('ordine').order('nome'));
            toast('La prova ricomincia dal prossimo Sparo.');
            vistaSparo().catch(e => gestisciErrore(e, 'sparo'));
          } catch (e) { gestisciErrore(e, 'sparo'); }
        } }, 'Ricomincia la prova da adesso') : null)),
    righe.length ? h('div', { class: 'tabella-box' }, h('table', { class: 't' },
      h('thead', null, h('tr', null, ['Quando', 'Bolletta', 'Esito', 'Lettura', 'Telefono', 'Giudizio'].map(t => h('th', null, t)))),
      h('tbody', null, righe)))
      : vuoto('Ancora nessuno Sparo', 'Qui compare ogni tentativo di ' + s.nome + ', anche quando la fotocamera si chiude senza leggere.'));
}

function rigaSparo({ v, auto, giudizio, dentro }) {
  const annullato = v.annullato_il ? 'annullato ' + (v.annullato_da === 'admin' ? 'dall’Admin' : 'da Martina') : null;
  const nonNeiDati = { attesa: 'non tra le sue bollette (Sparo in Attesa)', riparazione: 'Bolletta di Riparazione' }[v.in_dati];
  const azioni = Object.keys(GIUDIZI).filter(g => giudizio !== g).map(g =>
    h('button', { type: 'button', onclick: () => azioneSparo(v.id, g) }, GIUDIZI[g]));
  if (v.verifica) azioni.push(h('button', { type: 'button', onclick: () => azioneSparo(v.id, 'automatico') }, 'Automatico'));
  if (v.esito === 'iniziata' || v.esito === 'pronta') azioni.push(v.annullato_il
    ? h('button', { type: 'button', onclick: () => azioneSparo(v.id, 'ripristina') }, 'Ripristina lo Sparo')
    : h('button', { type: 'button', onclick: () => azioneSparo(v.id, 'annulla') }, 'Annulla lo Sparo'));
  // ogni cella in un solo blocco: sul telefono la tabella diventa una scheda
  const cella = (l, ...dentroCella) => h('td', { 'data-l': l }, h('div', null, dentroCella));
  return h('tr', { class: dentro ? null : 'fuori' },
    h('td', { class: 'testa', 'data-l': 'Quando' }, h('div', null, fmtSparo(v.quando),
      dentro ? null : h('div', { class: 'tenue' }, 'fuori dalla prova'))),
    cella('Bolletta', v.bolla ? [h('b', null, v.bolla), h('span', { class: 'tenue' }, ' (' + v.codice + ')'),
      h('div', { class: 'tenue' }, v.commessa ? v.commessa + ' · ' + pz(v.pezzi) + ' pz' : nonNeiDati || '')] : '—'),
    cella('Esito', ESITI_SPARO[v.esito] || v.esito, annullato ? h('div', null, h('span', { class: 'etichetta' }, annullato)) : null),
    cella('Lettura', v.durata_ms != null ? String(Math.round(v.durata_ms / 100) / 10).replace('.', ',') + ' s' : '',
      v.fonte ? h('div', { class: 'tenue' }, (v.fonte === 'interno' ? 'lettore di Note Av' : v.fonte === 'nativo' ? 'lettore del telefono' : 'entrambi i lettori')
        + (v.fotogrammi ? ' · ' + v.fotogrammi + ' fotogrammi' : '')) : null,
      v.nota ? h('div', { class: 'tenue' }, v.nota) : null),
    cella('Telefono', v.telefono || '', v.video ? h('div', { class: 'tenue' }, 'fotocamera ' + v.video) : null),
    h('td', { class: 'blocco', 'data-l': 'Giudizio' },
      h('span', { class: 'giudizio ' + (giudizio || 'da-verificare') }, giudizio ? GIUDIZI[giudizio] : 'Da verificare'),
      h('span', { class: 'tenue' }, v.verifica ? ' · deciso da te' : auto ? ' · automatico' : ''),
      h('div', { class: 'azioni-sparo' }, azioni)));
}

async function azioneSparo(id, azione) {
  try { await q(sb.rpc('gestisci_sparo_prova', { p_id: id, p_azione: azione })); }
  catch (e) { return gestisciErrore(e, 'sparo'); }
  vistaSparo().catch(e => gestisciErrore(e, 'sparo'));
}

/* ---------------------------------------------------------------------------
   Guida passo passo (Sub): si apre da sola la prima volta e dal tasto Aiuto
   --------------------------------------------------------------------------- */

const SCHEDA_FINTA = '<rect x="20" y="10" width="260" height="150" rx="18" style="fill:var(--surface);stroke:var(--line)" stroke-width="2"/>';
const PASSI_GUIDA = [
  { titolo: 'L’ufficio ti scrive',
    testo: 'Quando ha bisogno di sapere qualcosa su una commessa, l’Ufficio Avanzamento Produzione ti scrive una nota. La trovi nel riquadro giallo.',
    disegno: SCHEDA_FINTA +
      '<rect x="38" y="28" width="92" height="14" rx="6" style="fill:var(--ink-3)"/><rect x="198" y="25" width="64" height="20" rx="8" style="fill:var(--sole)"/>' +
      '<rect x="38" y="60" width="224" height="80" rx="14" style="fill:var(--sole-2);stroke:var(--sole-bordo)" stroke-width="2"/>' +
      '<rect x="54" y="78" width="150" height="10" rx="5" style="fill:var(--ink-2)"/><rect x="54" y="98" width="188" height="10" rx="5" style="fill:var(--ink-3)"/>' +
      '<rect x="54" y="118" width="118" height="10" rx="5" style="fill:var(--ink-3)"/>' },
  { titolo: 'Tu rispondi',
    testo: 'Scrivi nel riquadro bianco quanti pezzi consegni e quando, per esempio «35 pz domani, il resto venerdì». Se ti manca qualcosa, scrivilo. Si salva da solo mentre scrivi.',
    disegno: SCHEDA_FINTA +
      '<rect x="38" y="26" width="224" height="66" rx="12" style="fill:var(--surface);stroke:var(--accent)" stroke-width="3"/>' +
      '<rect x="52" y="44" width="140" height="10" rx="5" style="fill:var(--ink-2)"/><rect x="52" y="64" width="86" height="10" rx="5" style="fill:var(--ink-3)"/>' +
      '<rect x="142" y="60" width="3" height="18" style="fill:var(--accent)"/>' +
      '<rect x="38" y="106" width="132" height="38" rx="10" style="fill:var(--surface);stroke:var(--line)" stroke-width="2"/>' +
      '<rect x="50" y="118" width="70" height="12" rx="5" style="fill:var(--ink-2)"/><rect x="134" y="114" width="24" height="22" rx="4" style="fill:none;stroke:var(--ink-2)" stroke-width="2.5"/>' +
      '<g transform="translate(204 112) rotate(-35)"><rect x="0" y="-8" width="50" height="16" rx="3" style="fill:var(--sole)"/><path d="M0 -8 L-16 0 L0 8 Z" style="fill:var(--ink-2)"/></g>' },
  { titolo: 'Premi INVIA',
    testo: 'Quando hai finito premi il tasto verde in fondo. Finché non lo premi, l’ufficio non vede quello che hai scritto.',
    disegno: SCHEDA_FINTA +
      '<rect x="38" y="30" width="224" height="12" rx="6" style="fill:var(--line)"/><rect x="38" y="52" width="160" height="12" rx="6" style="fill:var(--line)"/>' +
      '<rect x="38" y="90" width="224" height="52" rx="16" style="fill:var(--verde)"/>' +
      '<text x="150" y="122" text-anchor="middle" style="fill:var(--verde-ink);font:700 17px system-ui,sans-serif">INVIA ALL’UFFICIO</text>' +
      '<circle cx="236" cy="128" r="16" style="fill:none;stroke:var(--sole)" stroke-width="4"/>' },
  { titolo: 'Il telefono ti avvisa',
    testo: 'Quando Note Av te lo chiede, tocca «Sì, avvisami»: il telefono suonerà quando l’ufficio ti scrive. E non serve tenerla aperta.',
    disegno: '<rect x="20" y="44" width="260" height="80" rx="20" style="fill:var(--surface);stroke:var(--line)" stroke-width="2"/>' +
      '<rect x="36" y="60" width="48" height="48" rx="12" fill="#F79A3E"/><path d="M46 92 A14 14 0 0 1 74 92 Z" fill="#fff"/><line x1="44" y1="98" x2="76" y2="98" stroke="#fff" stroke-width="3" stroke-dasharray="5 4" stroke-linecap="round"/>' +
      '<rect x="98" y="66" width="90" height="12" rx="6" style="fill:var(--ink-2)"/><rect x="98" y="88" width="160" height="10" rx="5" style="fill:var(--ink-3)"/>' +
      '<g transform="translate(244 22)" style="stroke:var(--accent)" fill="none" stroke-width="3" stroke-linecap="round"><path d="M-10 14v-6a10 10 0 0 1 20 0v6l3 3h-26z"/><path d="M-3 20a3 3 0 0 0 6 0"/></g>' },
];

function apriGuida(da) {
  let i = da || 0;
  const corpoGuida = h('div');
  const f = finestra(corpoGuida);
  const fine = () => { ricorda('guida', '1'); f.chiudi(); };
  const mostra = () => {
    const p = PASSI_GUIDA[i];
    const ultimo = i === PASSI_GUIDA.length - 1;
    riempi(corpoGuida,
      h('div', { class: 'guida-passo' },
        h('div', { class: 'disegno' }, svg('<svg viewBox="0 0 300 170" aria-hidden="true">' + p.disegno + '</svg>')),
        h('h3', null, h('span', { class: 'passo-n' }, String(i + 1)), p.titolo),
        h('p', null, p.testo)),
      h('div', { class: 'puntini', 'aria-hidden': 'true' }, PASSI_GUIDA.map((x, j) => h('span', { class: j === i ? 'si' : null }))),
      h('div', { class: 'guida-tasti' },
        i > 0 ? h('button', { class: 'tasto chiaro', onclick: () => { i--; mostra(); } }, 'Indietro') : null,
        h('button', { class: 'tasto', onclick: () => { if (ultimo) fine(); else { i++; mostra(); } } }, ultimo ? 'Ho capito, iniziamo!' : 'Avanti →')));
  };
  mostra();
}

/* ---------------------------------------------------------------------------
   Menu / Aiuto: guida, installazione, notifiche, aggiornamenti, uscita
   --------------------------------------------------------------------------- */

function apriMenu() {
  const sub = S.io === 'sub';
  const st = statoNotifiche();
  let f;
  const avvisi = st === 'attive' ? h('p', { class: 'etichetta verde', style: 'font-size:15px;padding:8px 12px' }, 'Avvisi attivi su questo dispositivo')
    : st === 'da-chiedere' ? h('button', { class: 'tasto chiaro pieno', onclick: () => { f.chiudi(); chiediNotifiche(); } }, ico('campanella'), 'Attiva gli avvisi')
    : st === 'negate' ? h('p', { class: 'nota-piccola' }, 'Gli avvisi sono bloccati per Note Av: per riattivarli apri le impostazioni del browser o del telefono.')
    : st === 'ios-home' ? h('p', { class: 'nota-piccola' }, 'Su iPhone gli avvisi arrivano solo se Note Av è sulla schermata Home.')
    : null;
  f = finestra(
    h('h3', null, sub ? 'Aiuto' : 'Menu'),
    h('div', { class: 'menu-aiuto' },
      sub ? h('button', { class: 'tasto pieno', onclick: () => { f.chiudi(); apriGuida(0); } }, ico('aiuto'), 'Come funziona Note Av') : null,
      sub ? h('button', { class: 'tasto chiaro pieno', onclick: () => { f.chiudi(); apriAvviso(false); } }, ico('attenzione'), 'Avviso sulle assegnazioni') : null,
      !sub && S.subs.some(s => s.sparo) ? h('button', { class: 'tasto chiaro pieno', onclick: () => { f.chiudi(); vai('sparo'); } }, ico('barcode'), 'Prova dello Sparo') : null,
      standalone() ? null : h('button', { class: 'tasto chiaro pieno', onclick: () => { f.chiudi(); installa(); } }, ico(TELEFONO ? 'telefono' : 'schermo'), TELEFONO ? 'Metti Note Av sul telefono' : 'Installa Note Av sul computer'),
      avvisi,
      h('p', { class: 'nota-piccola' }, testoAggiornato() + '. I pezzi si aggiornano circa ogni 2 ore; le note arrivano subito.'),
      TELEFONO ? null : h('div', { class: 'qr-telefono' }, h('img', { src: 'icone/qr-note-av.svg', alt: 'Codice QR di Note Av' }),
        h('span', null, 'Vuoi Note Av anche sul telefono? Inquadra questo codice con la fotocamera.')),
      sub ? h('p', { class: 'nota-piccola' }, 'Hai bisogno? Chiama l’Ufficio Avanzamento Produzione.') : null,
      h('button', { class: 'tasto chiaro pieno', onclick: () => {
        if (sub && !confirm('Vuoi davvero uscire? Per rientrare ti serviranno nome utente e password.')) return;
        f.chiudi(); esci();
      } }, ico('esci'), 'Esci')));
}

/* Installazione: Android e PC hanno il tasto del browser, iPhone no. */
async function installa() {
  if (S.promptInstalla) {
    const p = S.promptInstalla;
    S.promptInstalla = null;
    try { await p.prompt(); await p.userChoice; } catch (e) { /* niente */ }
    aggiornaInviti();
    return;
  }
  const icona = n => h('span', { class: 'icona-in-linea' }, ico(n));
  const passo = (n, ...testo) => h('li', null, h('span', { class: 'passo-n' }, String(n)), h('span', null, testo));
  let titolo, passi;
  if (IOS) {
    const safari = /Safari\//.test(UA) && !/CriOS|FxiOS|EdgiOS|GSA\//.test(UA);
    const altro = /CriOS|FxiOS|EdgiOS/.test(UA);
    titolo = 'Metti Note Av sull’iPhone';
    passi = (safari || altro) ? [
      passo(1, 'Tocca il tasto Condividi ', icona('condividi'), safari ? ' (in basso al centro; su iPad in alto).' : ' (in alto, vicino all’indirizzo).'),
      passo(2, 'Scorri e tocca «Aggiungi alla schermata Home» ', icona('aggiungi'), '.'),
      passo(3, 'Tocca «Aggiungi» in alto a destra.'),
      passo(4, 'Apri Note Av dall’icona del sole sulla schermata Home ed entra con nome utente e password.'),
    ] : [
      passo(1, 'Questa pagina è aperta dentro un’altra app: aprila con Safari. Tocca i puntini o la bussola e scegli «Apri in Safari».'),
      passo(2, 'In Safari tocca Condividi ', icona('condividi'), ' e poi «Aggiungi alla schermata Home».'),
      passo(3, 'Apri Note Av dall’icona del sole ed entra con nome utente e password.'),
    ];
  } else if (ANDROID) {
    titolo = 'Metti Note Av sul telefono';
    passi = [
      /; wv\)/.test(UA) ? passo('!', 'Se la pagina è aperta dentro WhatsApp, tocca i tre puntini ', icona('puntini'), ' e scegli «Apri in Chrome».') : null,
      passo(1, 'In Chrome tocca i tre puntini ', icona('puntini'), ' in alto a destra.'),
      passo(2, 'Tocca «Installa app» oppure «Aggiungi a schermata Home».'),
      passo(3, 'Conferma con «Installa»: Note Av compare tra le tue app con l’icona del sole.'),
    ];
  } else {
    titolo = 'Installa Note Av sul computer';
    passi = [
      passo(1, 'Apri Note Av con Chrome o Edge.'),
      passo(2, 'Nella barra dell’indirizzo, a destra, clicca l’icona Installa ', icona('schermo'), ' (oppure menu ', icona('puntini'), ' → «App» → «Installa Note Av»).'),
      passo(3, 'Clicca «Installa»: Note Av si apre in una finestra sua e la trovi nel menu Start e sulla barra delle applicazioni.'),
    ];
  }
  const f = finestra(h('h3', null, titolo),
    h('ol', { class: 'passi' }, passi),
    TELEFONO ? null : h('div', { class: 'qr-telefono' }, h('img', { src: 'icone/qr-note-av.svg', alt: 'Codice QR di Note Av' }),
      h('span', null, 'Per il telefono: inquadra questo codice con la fotocamera e segui i passi che compaiono.')),
    h('button', { class: 'tasto pieno', style: 'margin-top:14px', onclick: () => f.chiudi() }, 'Ho capito'));
}

/* ---------------------------------------------------------------------------
   Inviti in cima alla pagina: PC dell'ufficio fermo, installazione, notifiche
   --------------------------------------------------------------------------- */

// Il PC dell'ufficio lascia un segno di vita ogni pochi minuti: se manca da
// piu' di 20 minuti i numeri e gli avvisi sono fermi (le note no).
function pcFermoDa() {
  const pc = S.stato && S.stato.fonti && S.stato.fonti.pc;
  if (!pc) return null;
  return (Date.now() - new Date(pc).getTime()) > 20 * 60 * 1000 ? pc : null;
}

function invitoChiuso(k) { try { return sessionStorage.getItem('noteav-chiuso-' + k) === '1'; } catch (e) { return !!_memoria['chiuso-' + k]; } }
function chiudiInvito(k) { try { sessionStorage.setItem('noteav-chiuso-' + k, '1'); } catch (e) { _memoria['chiuso-' + k] = true; } aggiornaInviti(); }

function aggiornaInviti() {
  const box = document.getElementById('inviti');
  if (!box || !S.io) return;
  const pezzi = [];
  const fermo = S.io === 'admin' && pcFermoDa();
  if (fermo) pezzi.push(h('div', { class: 'banner allarme' }, ico('attenzione'),
    h('span', null, h('b', null, 'Il PC dell’ufficio non risponde ' + quandoParlato(fermo).replace(/^alle /, 'dalle ').replace(/^ieri /, 'da ieri ').replace(/^il /, 'dal ') + '. '),
      'Numeri, notifiche e copia serale sono fermi finché non si riaccende; le note funzionano lo stesso.')));

  const st = statoNotifiche();
  const puoInstallare = !standalone() && (TELEFONO || S.promptInstalla);
  if (puoInstallare && !invitoChiuso('installa')) {
    pezzi.push(h('div', { class: 'banner' }, svg(SOLE),
      h('span', null, TELEFONO
        ? (IOS ? 'Metti Note Av sulla schermata Home: la ritrovi tra le app e ti arrivano gli avvisi.' : 'Metti Note Av sul telefono: la ritrovi tra le app con l’icona del sole.')
        : 'Installa Note Av sul computer: si apre in una finestra sua, come un programma.'),
      h('button', { class: 'tasto piccolo', onclick: installa }, TELEFONO ? 'Metti sul telefono' : 'Installa'),
      h('button', { class: 'link', onclick: () => chiudiInvito('installa') }, 'Più tardi')));
  } else if (st === 'attive') {
    if (!S.pushRinnovata) { S.pushRinnovata = true; iscriviNotifiche().catch(e => console.warn('iscrizione push', e)); }   // rinnova in silenzio, una volta
  } else if (st === 'da-chiedere' && !invitoChiuso('notifiche')) {
    pezzi.push(h('div', { class: 'banner' }, ico('campanella'),
      h('span', null, S.io === 'admin' ? 'Vuoi un avviso quando un Sub risponde?' : 'Vuoi che il telefono ti avvisi quando l’ufficio ti scrive?'),
      h('button', { class: 'tasto piccolo', onclick: chiediNotifiche }, 'Sì, avvisami'),
      h('button', { class: 'link', onclick: () => chiudiInvito('notifiche') }, 'Più tardi')));
  }
  riempi(box, pezzi);
}

/* ---------------------------------------------------------------------------
   Notifiche push: si chiedono con un tasto (i browser lo pretendono) e si
   registrano sul database; le manda il PC dell'ufficio.
   --------------------------------------------------------------------------- */

function statoNotifiche() {
  const ok = CFG.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return IOS && !standalone() ? 'ios-home' : 'non-supportate';
  if (Notification.permission === 'granted') return 'attive';
  if (Notification.permission === 'denied') return 'negate';
  return 'da-chiedere';
}

function chiaveVapid() {
  const b = CFG.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b + '='.repeat((4 - b.length % 4) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

async function iscriviNotifiche() {
  const reg = await navigator.serviceWorker.ready;
  let iscr = await reg.pushManager.getSubscription();
  if (!iscr) iscr = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapid() });
  const j = iscr.toJSON();
  await q(sb.rpc('iscrivi_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
}

async function chiediNotifiche() {
  try {
    const esito = await Notification.requestPermission();
    if (esito === 'granted') { await iscriviNotifiche(); S.pushRinnovata = true; toast('Fatto! Ti avviseremo su questo dispositivo.'); }
    else toast('Avvisi non attivati. Puoi attivarli quando vuoi dal tasto ' + (S.io === 'sub' ? 'Aiuto.' : 'Menu.'));
  } catch (e) { gestisciErrore(e, 'notifiche'); }
  aggiornaInviti();
}

/* ---------------------------------------------------------------------------
   Controllo periodico: sessione ancora valida, novita' dall'altra parte
   --------------------------------------------------------------------------- */

let _timer;
function avviaControlloPeriodico() {
  clearInterval(_timer);
  _timer = setInterval(controlloPeriodico, 90 * 1000);
  if (!S.ascoltaVisibilita) {
    S.ascoltaVisibilita = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) controlloPeriodico(); });
  }
}

async function controlloPeriodico() {
  if (!S.chi || document.hidden) return;
  if ((await controllaSessione()) !== 'ok') return;     // 'rete': si riprova al giro dopo, senza uscire
  if (SP.coda.length) inviaSpari();                     // Spari rimasti nel telefono
  try {
    const st = await q(sb.from('stato_dati').select('*'));
    const cambiati = st[0] && (!S.stato || st[0].aggiornato !== S.stato.aggiornato);
    S.stato = st[0] || S.stato;
    const agg = document.getElementById('aggiornato');
    if (agg) agg.textContent = testoAggiornato();
    aggiornaInviti();
    const scrivendo = document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
    if (scrivendo || _attese.size || document.querySelector('.velo')) return;
    // numeri nuovi dal PC (Carico, Aperte, Chiuse): anche Sub e commesse nuove
    if (cambiati) { try { S.subs = await q(sb.from('sub').select('*').order('ordine').order('nome')); } catch (e) { /* al giro dopo */ } }
    if (S.vista === 'bacheca') return vistaBacheca();
    if (S.vista === 'sparo') return vistaSparo();
    await contaDaLeggere();
    aggiornaConta();
    if (S.vista === 'righe' && !S.archivio && (S.daLeggere || cambiati)) return vistaRighe();
    if (cambiati && S.vista === 'carico') return vistaCarico();
    if (cambiati && S.vista === 'consegne') return vistaConsegne();
  } catch (e) { /* riprova al giro dopo */ }
}

avvio().catch(e => { console.error(e); vistaAccesso('Qualcosa non è andato: riprova.'); });
