/* Note Av - la pagina della Titolare: Controllo PDC (database\titolare.sql, script\readly_pdc.py).
   Sola lettura. I numeri arrivano gia' fatti in pdc_settimana (una riga per settimana); i pop-up di
   READLY in avviso_profilo. Tutta la grafica sta sotto #tit (app\titolare.css). */
(function () {
'use strict';

const GG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];
const fmt = n => (n || 0).toLocaleString('it-IT');
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gData = s => new Date(s + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const dd = s => { const d = new Date(s + 'T12:00'); return d.getDate() + ' ' + d.toLocaleDateString('it-IT', { month: 'long' }); };
const iniz = s => (s || '').replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase();
const ORD = { rosso: 0, giallo: 1, verde: 2, blu: 3 };
const NOMI_STATO = { rosso: 'In ritardo', giallo: 'Indietro', verde: 'In linea', blu: 'Oltre il piano' };
function parseScad(s) { const m = /(\d+)\/(\d+)\/(\d+)/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; }

let D = { settimane: [] }, W, obiettivoOggi, OGGI_D, giac, radice, client = null, avvisiInCoda = [];
const S = { w: 0, scheda: 'settimana', modo: 'commessa', q: '', stato: null, scad: null, causale: null, chiara: false,
            aperta: null, giorno: 0, storAperta: null, _focus: false };
const fotoCache = {};

/* --------------------------------------------------------------------------- dati */

function prepara(w) {
  if (w._ok) return w; w._ok = true;
  w.num = w.numero; w.righe = w.righe || []; w.modifiche = w.modifiche || []; w.anticipi = w.anticipi || [];
  w.fuori = w.fuori || []; w.sub = w.sub || []; w.rientri = w.rientri || []; w.giacenza = w.giacenza || [];
  w.revisione = w.revisione || []; w.foto = w.foto || {}; w.auto4 = w.auto4 || [];
  const lav = new Set(w.lavorativi || w.giorni);
  const lavIdx = w.giorni.map((g, i) => lav.has(g) ? i : -1).filter(i => i >= 0);
  const fatti = lavIdx.filter(i => i <= w.oggi).length;
  w._ob = w.chiusa ? 1 : (lavIdx.length ? fatti / lavIdx.length : 0);
  w._lav = lav;
  w._od = new Date((w.oggi >= 0 ? w.giorni[w.oggi] : w.lunedi) + 'T12:00');
  const g = {}; w.giacenza.forEach(x => g[x.commessa + '|' + x.articolo] = x); w._giac = g;
  const modC = new Set(w.modifiche.map(m => m.commessa));
  w.righe.forEach(r => {
    r.sp = r.sped.reduce((a, b) => a + b, 0);
    const x = g[r.commessa + '|' + r.articolo]; r.giac = x ? x.giacenza : 0; r.verbale = x && x.verbale;
    r.cop = Math.min(r.T, r.sp + r.giac); r.scadD = parseScad(r.scadenza); r.chiara = modC.has(r.commessa);
    const fd = w.foto[r.articolo] || {}; r.fotoP = fd.foto || null; r.dibaP = fd.diba || null;
    r.stato = statoDi(r.sp, r.T, r.scadD, w._ob, w._od);
  });
  w._T = w.righe.reduce((a, r) => a + r.T, 0); w._sp = w.righe.reduce((a, r) => a + r.sp, 0);
  return w;
}
function statoDi(sp, T, scadD, ob, od) {
  const p = T ? sp / T : 0;
  return p > 1 ? 'blu' : p >= ob - 1e-9 ? 'verde' : (scadD && scadD < od) ? 'rosso' : 'giallo';
}
function scegli(i) {
  S.w = i; W = prepara(D.settimane[i]); obiettivoOggi = W._ob; OGGI_D = W._od; giac = W._giac;
  const gg = [...new Set(W.rientri.map(v => v.giorno))].sort();
  S.giorno = gg.length ? W.giorni.indexOf(gg[gg.length - 1]) : Math.max(0, W.oggi);
  S.aperta = null; S.stato = null; S.causale = null; S.chiara = false; S.storAperta = null;
}
function conSettimana(w, fn) {
  const prima = [W, obiettivoOggi, OGGI_D, giac];
  prepara(w); W = w; obiettivoOggi = w._ob; OGGI_D = w._od; giac = w._giac;
  try { return fn(); } finally { [W, obiettivoOggi, OGGI_D, giac] = prima; }
}

function aggrega() {
  if (S.modo === 'commessa') return W.righe.map(r => ({ ...r, chiave: r.commessa + '|' + r.articolo }));
  const m = {};
  W.righe.forEach(r => {
    const k = r.articolo;
    if (!m[k]) m[k] = { ...r, chiave: k, commesse: [], T: 0, sp: 0, giac: 0, cop: 0, sped: [0, 0, 0, 0, 0], prec: 0, lanciata: 0, chiara: false, forzata: false, ddt: [] };
    const a = m[k]; a.commesse.push(r.commessa);
    a.T += r.T; a.sp += r.sp; a.giac += r.giac; a.cop += r.cop; a.lanciata += r.lanciata || 0; a.chiara ||= r.chiara; a.forzata ||= r.forzata;
    r.sped.forEach((q, i) => a.sped[i] += q); a.ddt = a.ddt.concat(r.ddt || []);
    if (!a.scadD || (r.scadD && r.scadD < a.scadD)) { a.scadD = r.scadD; a.scadenza = r.scadenza; }
  });
  return Object.values(m).map(a => { a.stato = statoDi(a.sp, a.T, a.scadD, obiettivoOggi, OGGI_D); return a; });
}
function filtra(lista) {
  const q = S.q.trim().toLowerCase();
  return lista.filter(r => {
    if (q && !(r.commessa + ' ' + r.articolo + ' ' + r.descr + ' ' + r.descr_col + ' ' + (r.commesse || []).join(' ')).toLowerCase().includes(q)) return false;
    if (S.stato && r.stato !== S.stato) return false;
    if (S.scad === 'scadute' && !(r.scadD && r.scadD < OGGI_D)) return false;
    if (S.scad === '7gg' && !(r.scadD && r.scadD >= OGGI_D && (r.scadD - OGGI_D) <= 7 * 864e5)) return false;
    if (S.causale && r.causale !== S.causale) return false;
    if (S.chiara && !r.chiara) return false;
    return true;
  }).sort((a, b) => ORD[a.stato] - ORD[b.stato] || (b.T - b.sp) - (a.T - a.sp));
}

/* --------------------------------------------------------------------------- disegno */

const $ = s => radice.querySelector(s);
const ICO = { settimana: 'M3 5h18M3 12h18M3 19h12', collaudato: 'M5 13l4 4L19 7', sub: 'M4 7h16M4 12h10M4 17h7', rientri: 'M20 12H6m5-6-6 6 6 6' };
const svg = (d, n = 18) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
function foto(r, cls) { return `<div class="${cls}" ${r.fotoP ? `data-foto="${esc(r.fotoP)}"` : ''}>${esc(iniz(r.modello))}</div>`; }

function testata() {
  const ultimo = S.w === D.settimane.length - 1;
  const t = W._T;
  const g = W.oggi >= 0 ? W.giorni[W.oggi] : null;
  const stato = !W.pdc ? 'In attesa della mail PDC' : W.chiusa ? 'Settimana chiusa · venerdì ' + dd(W.giorni[4])
    : g ? 'Spedizioni lette fino a ' + gData(g) : 'Nessuna spedizione ancora letta';
  return `<header class="top">
    <div><div class="eyebrow">Firenze Moda · Piani di consegna</div>
      <h1>${saluto()}, Benedetta</h1>
      <div class="settnav"><button data-w="-1" ${S.w === 0 ? 'disabled' : ''} aria-label="Settimana prima">‹</button>
        <p>Settimana ${W.num} · dal ${dd(W.giorni[0]).split(' ')[0]} al ${dd(W.giorni[4])}${W.pdc ? ` · ${fmt(t)} pz pianificati su ${W.righe.length} commesse` : ''}</p>
        <button data-w="1" ${ultimo ? 'disabled' : ''} aria-label="Settimana dopo">›</button></div></div>
    <div class="destra"><div class="stato-run"><span class="pt"></span><span>${esc(stato)}</span></div>
      <button class="tondo" data-tema="1" title="Chiaro / scuro" aria-label="Chiaro o scuro">◐</button>
      <button class="tondo" data-esci="1">Esci</button></div>
  </header>
  <nav class="schede" role="tablist">${[['settimana', 'Settimana', W.righe.length], ['collaudato', 'Collaudato', oggiColl().giacenza.filter(x => x.giacenza > 0).length], ['sub', 'Sub', null], ['rientri', 'Rientri', null]]
    .map(([k, n, c]) => `<button role="tab" aria-selected="${S.scheda === k}" data-s="${k}">${svg(ICO[k])}${n}${c ? `<span class="n">${c}</span>` : ''}</button>`).join('')}</nav>`;
}
function saluto() { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; }

function ritmoHTML(w, titolo) {
  const T = w._T, per = [0, 0, 0, 0, 0]; w.righe.forEach(r => r.sped.forEach((q, j) => per[j] += q));
  const lav = w.giorni.map(g => w._lav.has(g)); const nLav = lav.filter(Boolean).length || 1;
  let cum = 0, k = 0;
  return `<section class="ritmo"><div class="ritmo-h"><h3>${titolo}</h3><span>Pezzi spediti ogni giorno, rispetto all'obiettivo cumulato</span></div><div class="giorni">${per.map((q, i) => {
    if (!lav[i]) return `<div class="g festa"><div class="d">${GG[i]} ${w.giorni[i].slice(8)}</div><div class="q">—</div><div class="t">festivo</div></div>`;
    k++; cum += q; const fut = !w.chiusa && i > w.oggi; const obj = Math.round(T * k / nLav);
    return `<div class="g ${!w.chiusa && i === w.oggi ? 'oggi' : ''} ${fut ? 'futuro' : ''}"><div class="d">${GG[i]} ${w.giorni[i].slice(8)}</div><div class="q">${fut ? '—' : fmt(q)}</div><div class="bar"><i style="width:${fut ? 0 : Math.min(100, pct(cum, obj))}%"></i></div><div class="t">${fut ? `obiettivo ${fmt(obj)}` : `${fmt(cum)} di ${fmt(obj)} attesi`}</div></div>`;
  }).join('')}</div></section>`;
}
function fonteHTML(w) {
  if (!w.pdc) return '';
  const diff = w.auto4.filter(a => a.differenze.length);
  const ddt = w.ddt_letti || [];
  const conta = t => ddt.filter(d => d.tipo === t).length;
  return `<div class="info"><span>ⓘ</span><div><b>PDC di Benedetta</b> · mail di ${esc(w.pdc.mail)}${w.pdc.versioni > 1 ? ` (versione ${w.pdc.versioni}: vale l'ultima)` : ''}.
    Spedito dai DDT: ${conta('prodotto finito')} di prodotto finito${conta('campioni') ? `, ${conta('campioni')} di campioni Artlab (esclusi)` : ''}${conta('lavorazione') ? `, ${conta('lavorazione')} di lavorazione esterna (esclusi)` : ''}.
    ${w.auto4.length ? `Doppio controllo con lo spedito di Bruna: ${diff.length ? diff.length + ' giorn' + (diff.length > 1 ? 'i' : 'o') + ' con differenze' : 'tutto torna'}.` : ''}
    ${diff.length ? `<details><summary>Vedi le differenze</summary><ul class="modlist">${diff.map(a => `<li><b>${gData(a.giorno)}</b>: Bruna ${fmt(a.auto4)} pz, DDT ${fmt(a.ddt)} pz — ${a.differenze.map(x => `${esc(x.articolo)} (Bruna ${x.auto4}, DDT ${x.ddt}${Object.keys(x.altro || {}).length ? ', ' + Object.entries(x.altro).map(([t, q]) => q + ' ' + t).join(', ') : ''})`).join('; ')}</li>`).join('')}</ul></details>` : ''}</div></div>`;
}

function vistaSettimana() {
  if (!W.pdc) return `<div class="vuota"><h3>Non arrivata mail PDC questa settimana</h3><p>Appena arriva la tua mail «PDC» con l'Excel, READLY fa partire il controllo da solo e ti avvisa.</p></div>${storicoHTML()}`;
  const R = W.righe, T = W._T, sp = W._sp, cop = R.reduce((a, r) => a + r.cop, 0);
  const att = Math.round(T * obiettivoOggi);
  const conta = s => R.filter(r => r.stato === s).length;
  const causali = [...new Set(R.map(r => r.causale).filter(Boolean))];
  const lista = filtra(aggrega());
  const modT = W.modifiche.reduce((a, m) => a + (m.dopo_T - m.prima_T), 0);
  return `
  <section class="kpi">
    <div class="k"><div class="l">Pianificato</div><div class="v">${fmt(T)}<small>pz</small></div><div class="s">colonna della settimana nel PDC</div><div class="spiega">Il 100% della settimana: i pezzi della colonna gialla del PDC che hai mandato (solo le righe con quantità).</div></div>
    <div class="k accento"><div class="l">Spedito</div><div class="v">${pct(sp, T)}%<small>${fmt(sp)} pz</small></div><div class="s">${W.chiusa ? 'a fine settimana' : sp >= att ? 'in linea con l\'obiettivo' : 'sotto l\'obiettivo di oggi'}</div><div class="spiega">Prodotto finito già partito verso Gucci, contato dai DDT di GEA (data del DDT). Esclusi campioni Artlab e lavorazioni esterne.</div></div>
    <div class="k"><div class="l">Coperto</div><div class="v">${pct(cop, T)}%<small>${fmt(cop)} pz</small></div><div class="s">spedito + collaudato pronto</div><div class="spiega">Quanto del piano è già al sicuro: lo spedito più i pezzi collaudati conformi in attesa di partire, per le commesse del PDC.</div></div>
    ${W.chiusa ? `<div class="k"><div class="l">Esito</div><div class="v">${pct(sp, T)}%</div><div class="s">${fmt(Math.max(0, T - sp))} pz rimasti da spedire</div><div class="spiega">Lo spedito finale della settimana rispetto al piano.</div></div>`
      : `<div class="k"><div class="l">Obiettivo di oggi</div><div class="v">${Math.round(obiettivoOggi * 100)}%<small>${fmt(att)} pz</small></div><div class="s">20% del piano per ogni giorno</div><div class="spiega">Dove dovremmo essere oggi per chiudere al 100%: ogni giorno lavorativo vale il 20% del piano. Se lo spedito è sotto, siamo indietro.</div></div>`}
  </section>
  ${fonteHTML(W)}
  ${ritmoHTML(W, 'Il ritmo della settimana')}
  ${W.modifiche.length ? `<section class="avviso"><div class="ic">${esc(iniz(W.modifiche_da || '?'))}</div><div><b>${esc(W.modifiche_da || 'Qualcuno')} ha spostato ${W.modifiche.length} righe nel file su Z:</b> · ${esc(W.modifiche_il || '')}<p>Il tuo 100% resta quello del PDC che hai mandato. Sul file operativo la settimana cambia di ${modT > 0 ? '+' : ''}${fmt(modT)} pz.</p><ul class="modlist" id="tit-modlist" hidden>${W.modifiche.map(m => `<li><b>${esc(m.commessa)}</b> · questa settimana ${m.prima_T} → ${m.dopo_T} · settimana prossima ${m.prima_U} → ${m.dopo_U}</li>`).join('')}</ul></div><button data-vedimod="1">Vedi le righe</button></section>` : ''}
  <div class="strumenti">
    <div class="seg" role="group" aria-label="Vista"><button aria-pressed="${S.modo === 'commessa'}" data-modo="commessa">Per commessa</button><button aria-pressed="${S.modo === 'articolo'}" data-modo="articolo">Per articolo</button></div>
    <label class="cerca">${svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5', 16)}<input id="tit-q" placeholder="Cerca commessa, modello, descrizione…" value="${esc(S.q)}"></label>
  </div>
  <div class="chips">
    ${['rosso', 'giallo', 'verde', 'blu'].map(k => `<button class="chip" data-stato="${k}" aria-pressed="${S.stato === k}"><span class="dot s-${k}"></span>${NOMI_STATO[k]}<span class="c">${conta(k)}</span></button>`).join('')}
    <span class="sep"></span>
    <button class="chip" data-scad="scadute" aria-pressed="${S.scad === 'scadute'}">Scadute</button>
    <button class="chip" data-scad="7gg" aria-pressed="${S.scad === '7gg'}">Scadenza entro 7 giorni</button>
    ${W.modifiche.length ? `<button class="chip" data-chiara="1" aria-pressed="${S.chiara}">Cambiate da ${esc(W.modifiche_da || 'Z:')}</button>` : ''}
    ${causali.length ? `<select class="selchip ${S.causale ? 'on' : ''}" id="tit-causale" aria-label="Causale"><option value="">Causale: tutte</option>${causali.map(c => `<option ${S.causale === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
  </div>
  ${tabellaHTML(lista)}
  ${W.anticipi.length ? `<h2 class="sez">Anticipi</h2><p class="sez">Spediti questa settimana ma pianificati per le prossime: non entrano nel 100%.</p>${tabellina(W.anticipi)}` : ''}
  ${W.fuori.length ? `<h2 class="sez">Fuori dal PDC</h2><p class="sez">Spediti come prodotto finito ma non presenti nel PDC: da verificare.</p>${tabellina(W.fuori)}` : ''}
  ${storicoHTML()}`;
}
function tabellina(v) {
  return `<div class="card" style="padding:6px 8px"><table class="lista"><thead><tr><th>Commessa</th><th class="nasc">Articolo</th><th>Giorno</th><th class="nasc">DDT</th><th class="num">Pezzi</th></tr></thead><tbody>${v.map(a => `<tr><td><b>${esc(a.commessa)}</b><br><span style="color:var(--t-muted);font-size:12.5px">${esc(a.descr)}</span></td><td class="nasc">${esc(a.articolo)}</td><td>${gData(a.giorno)}</td><td class="nasc">${esc(a.ddt || '')}</td><td class="num">${fmt(a.pezzi)}</td></tr>`).join('')}</tbody></table></div>`;
}
function tabellaHTML(lista) {
  return `<section class="tab">
    <div class="riga testa"><span></span><span>${S.modo === 'commessa' ? 'Commessa' : 'Articolo'}</span><span class="num">Piano</span>${GG.map(g => `<span class="num">${g}</span>`).join('')}<span class="num">Spedito</span><span>Avanzamento</span><span></span></div>
    ${lista.length ? lista.map(rigaHTML).join('') : `<div class="vuoto">Nessuna riga con questi filtri.</div>`}
  </section>`;
}
function rigaHTML(r) {
  const titolo = S.modo === 'commessa' ? r.commessa : `${r.modello} · ${r.parte} · ${r.colore}`;
  const sotto = S.modo === 'commessa' ? `${r.descr} · ${r.descr_col}` : `${r.descr} · ${r.commesse.length} commess${r.commesse.length > 1 ? 'e' : 'a'}`;
  const ps = pct(r.sp, r.T), pc = pct(r.cop, r.T);
  const ap = S.aperta === r.chiave + '@' + W.lunedi;
  return `<div class="riga ${ap ? 'aperta' : ''}" data-k="${esc(r.chiave + '@' + W.lunedi)}">
    ${foto(r, 'ff')}
    <div class="nome"><b>${esc(titolo)}${r.chiara ? `<span class="tag chiara">${esc(W.modifiche_da || 'Z:')}</span>` : ''}${r.forzata ? `<span class="tag forz" title="Chiusura forzata dallo script dei verbali">⚠ forzata</span>` : ''}</b><span>${esc(sotto)}</span></div>
    <div class="tot colp" style="color:var(--t-ink2)">${fmt(r.T)}</div>
    ${r.sped.map((q, i) => { const fut = !W.chiusa && i > W.oggi; return `<div class="cg ${fut ? 'fut' : q ? '' : 'zero'} ${!W.chiusa && i === W.oggi ? 'oggi' : ''}">${fut ? '·' : fmt(q)}</div>`; }).join('')}
    <div class="tot">${fmt(r.sp)}</div>
    <div class="barre">
      <div class="b"><span>Spedito</span><div class="tr"><i class="f-${r.stato}" style="width:${Math.min(100, ps)}%"></i><span class="obj" style="left:${obiettivoOggi * 100}%"></span></div><span class="p">${ps}%</span></div>
      <div class="b"><span>Coperto</span><div class="tr"><i class="f-cop" style="width:${Math.min(100, pc)}%"></i></div><span class="p">${pc}%</span></div>
    </div>
    <span class="st s-${r.stato}" title="${NOMI_STATO[r.stato]}"></span>
    ${ap ? `<div class="dett">
      ${foto(r, 'big')}
      <div><dl>
        <dt>Articolo</dt><dd>${esc(r.modello)} · ${esc(r.parte)} · ${esc(r.colore)}</dd>
        <dt>Colore</dt><dd>${esc(r.descr_col)}</dd>
        ${S.modo === 'commessa' ? `<dt>Scadenza commessa</dt><dd>${esc(r.scadenza)}</dd><dt>Lanciata</dt><dd>${fmt(r.lanciata)} pz</dd><dt>Arretrato (Precedente)</dt><dd>${fmt(r.prec)} pz</dd>` : `<dt>Commesse</dt><dd>${r.commesse.map(esc).join('<br>')}</dd>`}
        <dt>Collaudato pronto</dt><dd>${fmt(r.giac)} pz${r.verbale ? ` · ultimo verbale ${esc(r.verbale)}` : ''}</dd>
        <dt>Da spedire</dt><dd>${fmt(Math.max(0, r.T - r.sp))} pz</dd>
        <dt>Causale PDC</dt><dd>${esc(r.causale || '—')}</dd>
        ${(r.ddt || []).length ? `<dt>DDT</dt><dd>${[...new Set(r.ddt)].map(esc).join(', ')}</dd>` : ''}
      </dl>
      <div class="azioni"><button class="btn pieno" data-diba="${esc(r.dibaP || '')}" ${r.dibaP ? '' : 'disabled title="DiBa non ancora disponibile"'}>Apri la DiBa</button></div></div>
    </div>` : ''}
  </div>`;
}

function pannelloStorico(i) {
  return conSettimana(D.settimane[i], () => {
    const w = W, T = w._T, sp = w._sp;
    if (!w.pdc) return `<div class="pannello"><div class="vuota"><h3>Nessun PDC per la settimana ${w.num}</h3></div></div>`;
    const cop = w.righe.reduce((a, r) => a + r.cop, 0);
    const conta = s => w.righe.filter(r => r.stato === s).length;
    const lista = aggrega().filter(r => !S.stato || r.stato === S.stato).sort((a, b) => ORD[a.stato] - ORD[b.stato] || (b.T - b.sp) - (a.T - a.sp));
    return `<div class="pannello">
      <div class="kpi">
        <div class="k"><div class="l">Pianificato</div><div class="v">${fmt(T)}<small>pz</small></div></div>
        <div class="k accento"><div class="l">Spedito</div><div class="v">${pct(sp, T)}%<small>${fmt(sp)} pz</small></div></div>
        <div class="k"><div class="l">Coperto</div><div class="v">${pct(cop, T)}%<small>${fmt(cop)} pz</small></div></div>
        <div class="k"><div class="l">Rimasti</div><div class="v">${fmt(Math.max(0, T - sp))}<small>pz</small></div></div>
      </div>
      ${ritmoHTML(w, `Il ritmo della settimana ${w.num} <small style="font:400 13px var(--t-font);color:var(--t-muted);margin-left:8px">${conta('rosso')} in ritardo · ${conta('giallo')} indietro · ${conta('verde')} in linea · ${conta('blu')} oltre</small>`)}
      ${fonteHTML(w)}
      <div class="strumenti"><div class="seg" role="group" aria-label="Vista"><button aria-pressed="${S.modo === 'commessa'}" data-modo="commessa">Per commessa</button><button aria-pressed="${S.modo === 'articolo'}" data-modo="articolo">Per articolo</button></div>
        <span style="flex:1"></span><button class="btn" data-apriw="${i}">Apri tutta la settimana ${w.num} ›</button></div>
      ${tabellaHTML(lista)}
    </div>`;
  });
}
function storicoHTML() {
  const righe = D.settimane.map((w, i) => [prepara(w), i]).reverse().map(([w, i]) => {
    const p = pct(w._sp, w._T), per = [0, 0, 0, 0, 0]; w.righe.forEach(r => r.sped.forEach((q, j) => per[j] += q)); const mx = Math.max(1, ...per);
    const es = !w.pdc ? ['cuoio', 'Senza PDC'] : !w.chiusa ? ['cuoio', 'In corso'] : p >= 100 ? ['verde', 'Piano rispettato'] : p >= 80 ? ['giallo', 'Quasi'] : ['rosso', 'Sotto il piano'];
    const col = p >= 100 ? 'var(--t-verde)' : p >= 80 ? 'var(--t-giallo)' : w.chiusa ? 'var(--t-rosso)' : 'var(--t-cuoio)';
    const ap = S.storAperta === i;
    return `<tr data-wsel="${i}" class="${i === S.w ? 'qui' : ''} ${ap ? 'ap' : ''}"><td><b style="white-space:nowrap"><span class="freccia">${i === S.w ? '●' : ap ? '▾' : '▸'}</span> Settimana ${w.num}</b><br><span style="color:var(--t-muted);font-size:12.5px">${dd(w.giorni[0]).split(' ')[0]}–${dd(w.giorni[4])}</span></td>
      <td class="num nasc">${fmt(w._T)}</td><td class="num">${fmt(w._sp)}</td>
      <td><div style="display:flex;align-items:center;gap:10px"><div class="barretta" style="flex:1"><i style="width:${Math.min(100, p)}%;background:${col}"></i></div><b style="width:42px;text-align:right">${p}%</b></div></td>
      <td class="nasc"><div class="spark">${per.map((q, j) => `<i class="${!w.chiusa && j > w.oggi ? 'f' : ''}" style="height:${Math.max(8, q * 100 / mx)}%" title="${GG[j]}: ${fmt(q)}"></i>`).join('')}</div></td>
      <td class="nasc"><span class="pill ${es[0]}">${es[1]}</span></td></tr>
      ${ap ? `<tr class="esp"><td colspan="6">${pannelloStorico(i)}</td></tr>` : ''}`;
  }).join('');
  return `<h2 class="sez">Storico delle settimane</h2><p class="sez">Ogni settimana confrontata con il suo PDC. Tocca una settimana passata per vederne la tabella qui sotto.</p>
  <div class="card" style="padding:6px 8px"><table class="lista storico"><thead><tr><th>Settimana</th><th class="num nasc">Piano</th><th class="num">Spedito</th><th>Avanzamento</th><th class="nasc">Lun → Ven</th><th class="nasc">Esito</th></tr></thead><tbody>${righe}</tbody></table></div>`;
}

// Il collaudato e' sempre quello di oggi (l'ultima settimana calcolata), qualunque settimana si stia guardando.
function oggiColl() { return prepara(D.settimane[D.settimane.length - 1]); }
function vistaCollaudato() {
  const W = oggiColl();
  const G = W.giacenza.filter(g => g.giacenza > 0).sort((a, b) => b.giacenza - a.giacenza);
  const tot = G.reduce((a, g) => a + g.giacenza, 0), rev = W.revisione.reduce((a, r) => a + r.pezzi, 0);
  const ver = W.giacenza.filter(g => g.eccedenza > 0);
  const q = S.q.toLowerCase(), F = G.filter(g => !q || (g.commessa + ' ' + g.articolo).toLowerCase().includes(q));
  const al = 'aggiornato ' + new Date(W.aggiornato).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `
  <section class="kpi">
    <div class="k accento"><div class="l">Collaudato pronto</div><div class="v">${fmt(tot)}<small>pz</small></div><div class="s">conformi non ancora spediti · ${al}</div><div class="spiega">Pezzi dati conformi nei verbali di collaudo Gucci dall'11/11, meno quelli già spediti (DDT di GEA; per l'11-13/11 la stampa dello spedito). Mai sotto zero.</div></div>
    <div class="k"><div class="l">Commesse</div><div class="v">${G.length}</div><div class="s">con pezzi in giacenza</div><div class="spiega">Le commesse che hanno almeno un pezzo collaudato pronto a partire.</div></div>
    <div class="k"><div class="l">In revisione</div><div class="v">${fmt(rev)}<small>pz</small></div><div class="s">da ripresentare a Gucci</div><div class="spiega">Pezzi segnati «da revisionare» nei verbali: tornano nel collaudato quando un nuovo verbale (V.rev.) li dà conformi.</div></div>
    <div class="k"><div class="l">Da verificare</div><div class="v">${ver.length}</div><div class="s">spediti più dei collaudati</div><div class="spiega">Righe dove risultano spediti più pezzi di quelli collaudati dall'11/11: di solito pezzi collaudati prima di quella data.</div></div>
  </section>
  <div class="strumenti"><label class="cerca">${svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5', 16)}<input id="tit-q" placeholder="Cerca commessa o articolo…" value="${esc(S.q)}"></label></div>
  <div class="card" style="padding:6px 8px"><table class="lista"><thead><tr><th>Commessa</th><th class="nasc">Articolo</th><th class="num nasc">Collaudato</th><th class="num nasc">Spedito</th><th class="num">In giacenza</th><th class="nasc">Ultimo verbale</th></tr></thead>
  <tbody>${F.map(g => `<tr><td><b>${esc(g.commessa)}</b>${g.forzata ? ` <span class="pill rosso" title="Chiusura forzata dallo script dei verbali">⚠ forzata</span>` : ''}</td><td class="nasc">${esc(g.articolo)}</td><td class="num nasc">${fmt(g.collaudato)}</td><td class="num nasc">${fmt(g.spedito)}</td><td class="num"><b>${fmt(g.giacenza)}</b></td><td class="nasc">${esc(g.verbale || '')}</td></tr>`).join('') || `<tr><td colspan="6" class="vuoto">Niente in giacenza.</td></tr>`}</tbody>
  <tfoot><tr><td>Totale</td><td class="nasc"></td><td class="nasc"></td><td class="nasc"></td><td class="num">${fmt(F.reduce((a, g) => a + g.giacenza, 0))}</td><td class="nasc"></td></tr></tfoot></table></div>
  <div class="griglia2" style="margin-top:16px">
    <div class="card"><h4>In revisione</h4><div class="sub">Pezzi che Gucci ha rimandato indietro: tornano nel collaudato quando un nuovo verbale li dà conformi.</div>
      <table class="lista"><tbody>${W.revisione.length ? W.revisione.map(r => `<tr><td><b>${esc(r.commessa)}</b><br><span style="color:var(--t-muted);font-size:12.5px">verbale ${esc(r.verbale)} · dal ${gData(r.dal)}</span></td><td class="num">${r.pezzi} pz</td><td class="num"><span class="pill ${r.giorni >= 5 ? 'rosso' : 'giallo'}">${r.giorni} giorni</span></td></tr>`).join('') : `<tr><td style="color:var(--t-muted)">Nessun pezzo in revisione.</td></tr>`}</tbody></table></div>
    <div class="card"><h4>Da verificare</h4><div class="sub">Spediti più pezzi di quelli collaudati dall'11/11: erano collaudati prima. La giacenza resta a 0.</div>
      <table class="lista"><tbody>${ver.length ? ver.map(g => `<tr><td><b>${esc(g.commessa)}</b><br><span style="color:var(--t-muted);font-size:12.5px">${esc(g.articolo)}</span></td><td class="num">+${fmt(g.eccedenza)} pz</td></tr>`).join('') : `<tr><td style="color:var(--t-muted)">Niente da verificare.</td></tr>`}</tbody></table></div>
  </div>`;
}

function vistaSub() {
  const per = {}, nomi = {};
  W.sub.forEach(v => { nomi[v.sub] = v.nome || v.sub; (per[v.sub] ||= {}); (per[v.sub][v.commessa] ||= [0, 0, 0, 0, 0]); const i = W.giorni.indexOf(v.giorno); if (i >= 0) per[v.sub][v.commessa][i] += v.pezzi; });
  const subs = Object.entries(per).map(([s, c]) => [s, c, Object.values(c).flat().reduce((a, b) => a + b, 0)]).sort((a, b) => b[2] - a[2]);
  const tot = subs.reduce((a, s) => a + s[2], 0);
  if (!subs.length) return `<div class="vuota"><h3>Nessun rientro dai Sub in questa settimana</h3></div>`;
  return `
  <section class="kpi">
    <div class="k accento"><div class="l">Riconsegnato dai Sub</div><div class="v">${fmt(tot)}<small>pz</small></div><div class="s">fase 5 chiusa · Zeta Due come nell'Admin</div><div class="spiega">I pezzi che i Sub ci hanno riconsegnato questa settimana, presi da Note Av come nella pagina Admin.</div></div>
    <div class="k"><div class="l">Sub attivi</div><div class="v">${subs.length}</div><div class="s">questa settimana</div><div class="spiega">I Sub che hanno riconsegnato almeno un pezzo.</div></div>
    <div class="k"><div class="l">Il più veloce</div><div class="v" style="font-size:26px">${esc(nomi[subs[0][0]])}</div><div class="s">${fmt(subs[0][2])} pz</div><div class="spiega">Il Sub che ha riconsegnato più pezzi in settimana.</div></div>
    <div class="k"><div class="l">Commesse rientrate</div><div class="v">${new Set(W.sub.map(v => v.commessa)).size}</div><div class="s">almeno un pezzo</div><div class="spiega">Le commesse diverse riconsegnate dai Sub in settimana.</div></div>
  </section>
  <div class="subtot">${subs.map(([s, , t]) => `<span class="pill cuoio">${esc(nomi[s])} · ${fmt(t)}</span>`).join('')}</div>
  <div class="griglia2">${subs.map(([s, c, t]) => `<div class="card"><h4>${esc(nomi[s])}</h4><div class="sub">${fmt(t)} pezzi riconsegnati</div>
    <table class="lista"><thead><tr><th>Commessa</th>${GG.map(g => `<th class="num">${g}</th>`).join('')}</tr></thead>
    <tbody>${Object.entries(c).map(([k, q]) => `<tr><td>${esc(k)}</td>${q.map(x => `<td class="num" style="${x ? '' : 'color:var(--t-linea2)'}">${x || '·'}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td>Totale</td>${GG.map((_, i) => `<td class="num">${fmt(Object.values(c).reduce((a, q) => a + q[i], 0)) || '·'}</td>`).join('')}</tr></tfoot></table></div>`).join('')}</div>`;
}

function vistaRientri() {
  const g = W.giorni[S.giorno];
  const V = W.rientri.filter(v => v.giorno === g);
  const per = {}; V.forEach(v => (per[v.nome || v.sub] ||= []).push(v));
  const forz = new Set(W.giacenza.filter(x => x.forzata).map(x => x.commessa).concat(W.righe.filter(r => r.forzata).map(r => r.commessa)));
  const ultimo = W.chiusa ? 4 : Math.max(S.giorno, W.giorni.findIndex(x => x === new Date().toISOString().slice(0, 10)));
  return `
  <div class="navg"><button data-g="-1" aria-label="Giorno prima" ${S.giorno <= 0 ? 'disabled' : ''}>‹</button><b>${gData(g)}</b><button data-g="1" aria-label="Giorno dopo" ${S.giorno >= Math.min(4, ultimo) ? 'disabled' : ''}>›</button></div>
  <p class="sez">${fmt(V.reduce((a, v) => a + (v.pezzi || 0), 0))} pezzi rientrati dai Sub, con la bolletta che ha chiuso la fase 5.</p>
  ${V.length ? `<div class="griglia2">${Object.entries(per).map(([s, vv]) => `<div class="card"><h4>${esc(s)}</h4><div class="sub">${fmt(vv.reduce((a, v) => a + (v.pezzi || 0), 0))} pezzi</div>
    <table class="lista"><thead><tr><th>Commessa</th><th>Bolletta</th><th class="num">Pezzi</th></tr></thead><tbody>${vv.map(v => `<tr><td><b>${esc(v.commessa)}</b>${forz.has(v.commessa) ? ` <span class="pill rosso" title="Chiusura forzata dallo script dei verbali">⚠</span>` : ''}</td><td>${v.bolla ? `<span class="pill cuoio">n. ${esc(v.bolla)}</span>` : '—'}</td><td class="num">${fmt(v.pezzi)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`
    : `<div class="card vuoto">Nessun rientro in questo giorno.</div>`}`;
}

function disegna() {
  if (!D.settimane.length) {
    radice.innerHTML = `<div class="wrap"><header class="top"><div><div class="eyebrow">Firenze Moda · Piani di consegna</div><h1>${saluto()}, Benedetta</h1></div><div class="destra"><button class="tondo" data-esci="1">Esci</button></div></header><div class="vuota"><h3>La pagina si sta preparando</h3><p>READLY non ha ancora pubblicato il primo Controllo PDC. Ti avviso appena è pronto.</p></div></div>${veloHTML()}`;
    return;
  }
  const corpo = { settimana: vistaSettimana, collaudato: vistaCollaudato, sub: vistaSub, rientri: vistaRientri }[S.scheda]();
  const pop = $('#tit-velo'); const popAperto = pop && pop.classList.contains('on') ? pop.outerHTML : null;
  radice.innerHTML = `<div class="wrap">${testata()}<main>${corpo}</main></div>${popAperto || veloHTML()}`;
  const q = $('#tit-q'); if (q && S._focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  caricaFoto();
}
function veloHTML() { return `<div class="velo" id="tit-velo"><div class="pop" id="tit-pop"></div></div>`; }

async function caricaFoto() {
  if (!client) return;
  for (const el of radice.querySelectorAll('[data-foto]')) {
    const p = el.getAttribute('data-foto');
    try {
      if (!(p in fotoCache)) {
        fotoCache[p] = null;
        const { data } = await client.storage.from('qualita').download(p);
        fotoCache[p] = data ? URL.createObjectURL(data) : null;
      }
      if (fotoCache[p] && el.isConnected) { el.innerHTML = ''; const im = new Image(); im.alt = ''; im.src = fotoCache[p]; el.appendChild(im); }
    } catch (e) { /* resta il segnaposto */ }
  }
}

/* --------------------------------------------------------------------------- eventi */

function suClic(e) {
  const b = e.target.closest('button,[data-k],[data-wsel]');
  if (!b || !radice.contains(b)) return;
  if (b.dataset.wsel !== undefined && e.target.closest('.esp')) return;
  if (b.dataset.chiudi !== undefined) { chiudiPopup(b.dataset.chiudi === 'apri'); return; }
  if (b.dataset.wsel !== undefined) { const i = +b.dataset.wsel; if (i === S.w) { scrollTo({ top: 0, behavior: 'smooth' }); return; } S.storAperta = S.storAperta === i ? null : i; S.aperta = null; return disegna(); }
  if (b.dataset.apriw !== undefined) { scegli(+b.dataset.apriw); disegna(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (b.dataset.w) { const i = S.w + +b.dataset.w; if (i >= 0 && i < D.settimane.length) { scegli(i); disegna(); } return; }
  if (b.dataset.s) { S.scheda = b.dataset.s; S.q = ''; S.aperta = null; disegna(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (b.dataset.modo) { S.modo = b.dataset.modo; S.aperta = null; return disegna(); }
  if (b.dataset.stato) { S.stato = S.stato === b.dataset.stato ? null : b.dataset.stato; return disegna(); }
  if (b.dataset.scad) { S.scad = S.scad === b.dataset.scad ? null : b.dataset.scad; return disegna(); }
  if (b.dataset.chiara) { S.chiara = !S.chiara; return disegna(); }
  if (b.dataset.vedimod) { const l = $('#tit-modlist'); l.hidden = !l.hidden; b.textContent = l.hidden ? 'Vedi le righe' : 'Nascondi'; return; }
  if (b.dataset.g) { S.giorno = Math.max(0, Math.min(4, S.giorno + +b.dataset.g)); return disegna(); }
  if (b.dataset.diba !== undefined) { if (b.dataset.diba) apriDiba(b.dataset.diba); return; }
  if (b.dataset.tema) { const scuro = document.body.classList.contains('tit-scuro') || (!document.body.classList.contains('tit-chiaro') && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('tit-scuro', !scuro); document.body.classList.toggle('tit-chiaro', scuro);
    try { localStorage.setItem('tit-tema', scuro ? 'chiaro' : 'scuro'); } catch (er) { /* niente */ } return; }
  if (b.dataset.esci) { if (client) client.auth.signOut({ scope: 'local' }).finally(() => location.reload()); return; }
  if (b.dataset.k && !e.target.closest('.dett')) { S.aperta = S.aperta === b.dataset.k ? null : b.dataset.k; disegna(); }
}
async function apriDiba(p) {
  if (!client) return;
  const win = window.open('', '_blank');
  const { data, error } = await client.storage.from('qualita').createSignedUrl(p, 120);
  if (error || !data) { if (win) win.close(); return; }
  if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
}

/* --------------------------------------------------------------------------- pop-up */

const ICON_POP = { controllo: 'M5 13l4 4L19 7', collaudo: 'M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z', pdc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  revisione: 'M12 8v5m0 3h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z', senza_pdc: 'M4 6h16v12H4zM4 7l8 6 8-6' };
function mostraPopup(a) {
  const v = $('#tit-velo'), p = $('#tit-pop'); if (!v || !p) return;
  const d = a.dati || {};
  const mini = a.tipo === 'controllo' ? `<div class="mini"><div>Oggi<b>${fmt(d.oggi)}</b></div><div>Settimana<b>${d.perc || 0}%</b></div><div>Spedito<b>${fmt(d.spedito)}</b></div></div>` : '';
  p.innerHTML = `<div class="sig">${svg(ICON_POP[a.tipo] || ICON_POP.controllo, 30)}</div><h3>${esc(a.titolo)}</h3><p>${esc(a.testo)}</p>${mini}
    <div class="az">${a.tipo === 'controllo' || a.tipo === 'pdc' ? `<button class="btn" data-chiudi="">Più tardi</button><button class="btn pieno" data-chiudi="apri">Apri la settimana</button>` : `<button class="btn pieno" data-chiudi="">Ho capito</button>`}</div>`;
  p.dataset.id = a.id || '';
  v.classList.add('on');
}
async function chiudiPopup(apri) {
  const v = $('#tit-velo'), p = $('#tit-pop');
  const id = p && p.dataset.id;
  if (v) v.classList.remove('on');
  if (id && client) await client.rpc('avviso_visto', { p_id: +id }).catch(() => {});
  avvisiInCoda = avvisiInCoda.filter(a => String(a.id) !== String(id));
  if (apri) { await ricarica(); S.scheda = 'settimana'; scegli(D.settimane.length - 1); disegna(); scrollTo({ top: 0, behavior: 'smooth' }); }
  if (avvisiInCoda.length) setTimeout(() => mostraPopup(avvisiInCoda[0]), 400);
}
async function controllaAvvisi() {
  if (!client) return;
  const { data } = await client.from('avviso_profilo').select('*').is('visto_il', null).order('creato_il').limit(10);
  if (!data || !data.length) return;
  const nuovi = data.filter(a => !avvisiInCoda.some(x => x.id === a.id));
  if (!nuovi.length) return;
  avvisiInCoda = avvisiInCoda.concat(nuovi);
  await ricarica(); disegna();
  const v = $('#tit-velo'); if (v && !v.classList.contains('on')) mostraPopup(avvisiInCoda[0]);
}

/* --------------------------------------------------------------------------- avvio */

async function ricarica() {
  if (!client) return;
  const { data, error } = await client.from('pdc_settimana').select('lunedi,numero,dati,aggiornato_il').order('lunedi');
  if (error) throw error;
  const eraUltima = !D.settimane.length || S.w === D.settimane.length - 1;
  D = { settimane: (data || []).map(r => r.dati) };
  if (D.settimane.length) scegli(eraUltima ? D.settimane.length - 1 : Math.min(S.w, D.settimane.length - 1));
}

function prepararePagina() {
  document.body.classList.add('titolare');
  try { const t = localStorage.getItem('tit-tema'); if (t) document.body.classList.add(t === 'scuro' ? 'tit-scuro' : 'tit-chiaro'); } catch (e) { /* niente */ }
  const app = document.getElementById('app');
  app.innerHTML = '<div id="tit"><div id="tit-pagina"></div></div>';
  radice = document.getElementById('tit-pagina');
  radice.addEventListener('click', suClic);
  radice.addEventListener('change', e => { if (e.target.id === 'tit-causale') { S.causale = e.target.value || null; disegna(); } });
  radice.addEventListener('input', e => { if (e.target.id === 'tit-q') { S.q = e.target.value; S._focus = true; disegna(); S._focus = false; } });
}

/* Chiamata da app.js dopo l'accesso con ruolo «titolare». */
/* Animazione d'ingresso: il controllo. Un foglio del PDC viene letto riga per riga,
   ogni riga prende la sua spunta, sotto scorrono i passi del controllo; poi si apre la pagina. */
function introControllo() {
  const calmo = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const righe = [0, 1, 2, 3, 4].map(i => {
    const y = 58 + i * 30, w = [118, 96, 132, 84, 110][i];
    return `<g class="ri" style="--i:${i}"><rect class="bar" x="34" y="${y}" width="${w}" height="9" rx="4.5"/><rect class="num" x="176" y="${y}" width="26" height="9" rx="4.5"/>` +
      `<path class="spunta" pathLength="1" d="M214 ${y + 4.5} l6 6 l11 -12"/></g>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'tit-intro' + (calmo ? ' calmo' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="foglio"><svg viewBox="0 0 260 230" aria-hidden="true">
      <rect class="carta" x="12" y="12" width="236" height="206" rx="16"/>
      <rect class="testa" x="34" y="30" width="70" height="8" rx="4"/><rect class="testa2" x="196" y="30" width="30" height="8" rx="4"/>
      ${righe}
      <rect class="scan" x="22" y="50" width="216" height="24" rx="8"/>
    </svg></div>
    <div class="marca">Firenze Moda · Piani di consegna</div>
    <div class="titolo">Controllo PDC</div>
    <div class="passi"><span>Leggo il PDC della settimana</span><span>Confronto i DDT di GEA</span><span>Conto il collaudato</span><span>Tutto pronto</span></div>
    <div class="avanz"><i></i></div>`;
  document.getElementById('tit').append(el);
  const minimo = new Promise(r => setTimeout(r, calmo ? 300 : 2600));
  return {
    chiudi: async () => { await minimo; el.classList.add('via'); setTimeout(() => el.remove(), 600); }
  };
}

window.avviaTitolare = async function (sb) {
  client = sb;
  prepararePagina();
  const intro = introControllo();
  try { await ricarica(); } finally { disegna(); await intro.chiudi(); }
  await controllaAvvisi().catch(() => {});
  setInterval(() => controllaAvvisi().catch(() => {}), 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controllaAvvisi().catch(() => {}); });
};

/* Prova senza Supabase (app\prova_titolare.html): dati e pop-up finti. */
window.provaTitolare = async function (dati, avvisi) {
  prepararePagina();
  const intro = introControllo();
  D = { settimane: dati };
  if (D.settimane.length) scegli(D.settimane.length - 1);
  disegna();
  await intro.chiudi();
  if (avvisi && avvisi.length) { avvisiInCoda = avvisi; mostraPopup(avvisi[0]); }
};
})();
