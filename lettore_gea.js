/* =============================================================================
   NOTE AV - lettore del barcode GEA
   Componente riutilizzabile: apre la fotocamera posteriore, inquadra il codice
   a barre di una bolletta GEA e restituisce il N. Bolla. Non sa niente di
   Sparo, inizio o fine: cosa farne lo decide la pagina che lo usa (oggi lo
   Sparo di Zeta Due; domani, per esempio, le bollette di assemblaggio).

   Il barcode (vedi pistola_barcode\analisi_barcode.md) e' un Interleaved 2 of
   5 (ITF) senza cifra di controllo, sempre di 6 cifre: il N. Bolla con gli
   zeri davanti (009129 = bolletta 9129; 9xxxxx = Bolletta di Riparazione).
   Senza controllo l'ITF si presta a letture parziali, quindi qui si accetta
   SOLO un codice di 6 cifre, con avvio, arresto e zone bianche ai lati,
   letto uguale su piu' fotogrammi.

   Legge da se' (qui sotto, nessuna libreria). Dove il telefono ha un suo
   lettore (BarcodeDetector, per esempio Chrome su Android) usa anche quello,
   e i due votano insieme.

   Uso:
     const r = await LettoreBarcodeGea.apri({ titolo: 'Spara bolletta' });
     r.esito === 'letto'  -> r.codice '009129', r.bolla '9129', r.durata_ms,
                             r.fonte, r.fotogrammi, r.video
     r.esito === 'chiuso' -> chiuso senza leggere (r.durata_ms)
     r.esito === 'errore' -> fotocamera non disponibile (r.errore)
   ============================================================================= */
(function () {
  'use strict';

  // ITF: ogni cifra sono 5 elementi, 2 larghi (w) e 3 stretti (n). Nelle
  // coppie le barre nere fanno la prima cifra, gli spazi bianchi la seconda.
  const SCHEMI = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];
  const CIFRA = new Map(SCHEMI.map((s, i) => [s, String(i)]));
  const COPPIE = 3;            // 6 cifre
  const QUIETE = 5;            // zona bianca minima ai lati, in moduli (sulla bolletta ce ne sono ~10)
  const LINEE = 24;            // linee lette in ogni fotogramma
  const FOTOGRAMMI = 3;        // fotogrammi che devono leggere lo stesso codice...
  const FINESTRA_MS = 2500;    // ...in questo tempo
  const OGNI_MS = 60;          // al massimo ~16 fotogrammi al secondo

  /* --- lettura di una linea ------------------------------------------------ */

  // Una linea di luminosita' (0 nero ... 255 bianco) diventa una fila di
  // strisce alternate. Il bordo fra una striscia e l'altra sta a meta' fra il
  // chiaro e lo scuro vicini, non a una soglia fissa: cosi' regge la carta in
  // ombra, la luce che cambia lungo la linea e un po' di sfocatura.
  // stacco: quanto deve staccarsi un chiaro da uno scuro (frazione del
  // contrasto della linea). Con la foto sfocata le barre strette vicine si
  // impastano e serve uno stacco piu' piccolo; con la foto granulosa, piu'
  // grande.
  function strisce(v, stacco) {
    const n = v.length;
    if (n < 60) return null;
    const s = new Float32Array(n);
    s[0] = v[0]; s[n - 1] = v[n - 1];
    for (let i = 1; i < n - 1; i++) s[i] = (v[i - 1] + 2 * v[i] + v[i + 1]) / 4;
    let lo = 255, hi = 0;
    for (let i = 0; i < n; i++) { if (s[i] < lo) lo = s[i]; if (s[i] > hi) hi = s[i]; }
    if (hi - lo < 40) return null;                 // niente contrasto: niente codice
    const delta = Math.max(8, (hi - lo) * (stacco || 0.15));

    // chiari e scuri alternati: [posizione, valore, chiaro?] tre per volta
    const est = [];
    let mx = -1, px = 0, mn = 256, pn = 0, cerco = 0;  // cerco: 1 un chiaro, -1 uno scuro, 0 non so
    for (let i = 0; i < n; i++) {
      const x = s[i];
      if (x > mx) { mx = x; px = i; }
      if (x < mn) { mn = x; pn = i; }
      if (cerco !== -1 && x < mx - delta) { est.push(px, mx, 1); cerco = -1; mn = x; pn = i; }
      else if (cerco !== 1 && x > mn + delta) { est.push(pn, mn, 0); cerco = 1; mx = x; px = i; }
    }
    if (cerco === 1) est.push(px, mx, 1); else if (cerco === -1) est.push(pn, mn, 0);
    const m = est.length / 3;
    if (m < COPPIE * 10 + 9) return null;

    const w = new Float32Array(m), nero = new Uint8Array(m);
    let prima = 0;
    for (let k = 0; k < m; k++) {
      let bordo = n;
      if (k < m - 1) {
        const a = est[3 * k], b = est[3 * k + 3], soglia = (est[3 * k + 1] + est[3 * k + 4]) / 2;
        bordo = b;
        for (let i = a; i < b; i++) {
          if ((s[i] - soglia) * (s[i + 1] - soglia) <= 0 && s[i] !== s[i + 1]) { bordo = i + (s[i] - soglia) / (s[i] - s[i + 1]); break; }
        }
      }
      w[k] = bordo - prima;
      nero[k] = est[3 * k + 2] ? 0 : 1;
      prima = bordo;
    }
    return { w, nero };
  }

  // Una cifra: i 5 elementi w[i], w[i+2] ... w[i+8] (solo barre o solo spazi).
  function cifra(w, i) {
    const e = [w[i], w[i + 2], w[i + 4], w[i + 6], w[i + 8]];
    const o = e.slice().sort((a, b) => b - a);    // dal piu' largo
    if (o[1] < o[2] * 1.5) return null;           // larghi e stretti non si distinguono
    if (o[0] > o[1] * 2.2 || o[2] > o[4] * 2.5) return null;
    let schema = '';
    for (const x of e) schema += x >= o[1] ? 'w' : 'n';
    return CIFRA.get(schema) || null;
  }

  // Cerca nelle strisce: zona bianca, avvio (4 strette), 3 coppie di cifre,
  // arresto (larga, stretta, stretta), zona bianca. Altrimenti null.
  function decodifica(w, nero) {
    const m = w.length;
    for (let i = 1; i + 4 + COPPIE * 10 + 3 < m; i++) {
      if (!nero[i]) continue;
      const a = w[i], b = w[i + 1], c = w[i + 2], d = w[i + 3];
      const mod = (a + b + c + d) / 4;              // il modulo stretto
      if (Math.max(a, b, c, d) > mod * 1.7 || Math.min(a, b, c, d) < mod * 0.45) continue;
      if (w[i - 1] < mod * QUIETE) continue;
      let codice = '', j = i + 4;
      const coppie = [];
      for (let k = 0; k < COPPIE; k++, j += 10) {
        const x = cifra(w, j), y = cifra(w, j + 1);
        if (x === null || y === null) { codice = null; break; }
        codice += x + y;
        let t = 0;
        for (let q = j; q < j + 10; q++) t += w[q];
        coppie.push(t);
      }
      if (!codice) continue;
      const larga = w[j], s1 = w[j + 1], b2 = w[j + 2];
      if (larga < Math.max(s1, b2) * 1.5 || larga < mod * 1.5 || s1 > mod * 1.9 || b2 > mod * 1.9) continue;
      if (w[j + 3] < mod * QUIETE) continue;
      const media = coppie.reduce((x, y) => x + y, 0) / COPPIE;   // ogni coppia sono 18 moduli
      if (coppie.some(t => Math.abs(t - media) > media * 0.2)) continue;
      if (media < mod * 11 || media > mod * 28) continue;
      if (/^0+$/.test(codice)) continue;
      return codice;
    }
    return null;
  }

  // Il codice letto lungo una linea, nei due versi (bolletta capovolta), o null.
  const STACCHI = [0.15, 0.08];
  function leggiLinea(v) {
    for (const stacco of STACCHI) {
      const r = strisce(v, stacco);
      if (!r) continue;
      const avanti = decodifica(r.w, r.nero);
      if (avanti) return avanti;
      r.w.reverse(); r.nero.reverse();
      const indietro = decodifica(r.w, r.nero);
      if (indietro) return indietro;
    }
    return null;
  }

  // Un fotogramma (ImageData): codice -> quante linee l'hanno letto.
  function leggiFotogramma(img) {
    const W = img.width, H = img.height, px = img.data;
    const voti = new Map();
    const riga = new Float32Array(W);
    for (let k = 0; k < LINEE; k++) {
      const y = Math.floor((k + 0.5) * H / LINEE);
      for (let x = 0, p = y * W * 4; x < W; x++, p += 4) riga[x] = (px[p] * 77 + px[p + 1] * 151 + px[p + 2] * 28) / 256;
      const c = leggiLinea(riga);
      if (c) voti.set(c, (voti.get(c) || 0) + 1);
    }
    return voti;
  }

  // Il codice del fotogramma: quello letto da piu' linee (a pari merito, nessuno).
  function migliore(voti) {
    let primo = null, n1 = 0, n2 = 0;
    for (const [c, n] of voti) {
      if (n > n1) { n2 = n1; n1 = n; primo = c; } else if (n > n2) n2 = n;
    }
    return n1 > n2 ? primo : null;
  }

  // 009129 -> 9129; le Bollette di Riparazione (9xxxxx) restano come sono.
  function bollaDaCodice(codice) {
    return /^9\d{5}$/.test(codice) ? codice : String(parseInt(codice, 10));
  }

  function supportato() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext !== false;
  }

  /* --- suono e vibrazione alla lettura ------------------------------------- */

  let audio = null;
  function preparaSuono() {              // va fatto al tocco del tasto (iPhone)
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      audio = audio || new C();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (e) { audio = null; }
  }
  function bip() {
    if (navigator.vibrate) { try { navigator.vibrate(90); } catch (e) { /* niente */ } }
    if (!audio) return;
    try {
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 1760;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g); g.connect(audio.destination);
      o.start(t); o.stop(t + 0.14);
    } catch (e) { /* niente */ }
  }

  /* --- la finestra della fotocamera ---------------------------------------- */

  function el(tag, classe, testo) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo) e.textContent = testo;
    return e;
  }

  function testoErrore(err) {
    const nome = err && err.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError')
      return 'Note Av non ha il permesso di usare la fotocamera. Consentilo nelle impostazioni del telefono (o del browser) per Note Av e riprova.';
    if (nome === 'NotFoundError' || nome === 'OverconstrainedError' || nome === 'DevicesNotFoundError')
      return 'Non trovo la fotocamera di questo dispositivo.';
    if (nome === 'NotReadableError' || nome === 'TrackStartError')
      return 'La fotocamera è occupata da un’altra app: chiudila e riprova.';
    if (nome === 'non-supportato')
      return 'Questo browser non lascia usare la fotocamera a Note Av. Aggiorna Chrome (Android) o Safari (iPhone) e riprova.';
    return 'La fotocamera non si è aperta. Riprova; se succede ancora, chiudi e riapri Note Av.';
  }

  async function rilevatoreNativo() {
    try {
      if (!('BarcodeDetector' in window)) return null;
      const formati = await window.BarcodeDetector.getSupportedFormats();
      return formati.includes('itf') ? new window.BarcodeDetector({ formats: ['itf'] }) : null;
    } catch (e) { return null; }
  }

  function apri(opzioni) {
    const o = Object.assign({
      titolo: 'Leggi la bolletta',
      aiuto: 'Inquadra il codice a barre della bolletta dentro il riquadro',
      consiglio: 'Tieni fermo il telefono a 10–15 cm dal foglio, con il codice a barre dentro il riquadro.',
    }, opzioni || {});
    preparaSuono();

    return new Promise(fine => {
      const t0 = performance.now();
      const video = el('video', 'lettore-video');
      video.setAttribute('playsinline', ''); video.setAttribute('autoplay', ''); video.muted = true;
      const mirino = el('div', 'lettore-mirino');
      mirino.append(el('span', 'lettore-linea'));
      const aiuto = el('p', 'lettore-aiuto', o.aiuto);
      aiuto.setAttribute('aria-live', 'polite');
      const luce = el('button', 'lettore-luce', 'Luce');
      luce.type = 'button'; luce.hidden = true; luce.setAttribute('aria-pressed', 'false');
      const chiudiT = el('button', 'lettore-chiudi', 'Chiudi');
      chiudiT.type = 'button';
      const tasti = el('div', 'lettore-tasti');
      tasti.append(luce, chiudiT);
      const box = el('div', 'lettore');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', o.titolo);
      box.append(video, el('div', 'lettore-testa', o.titolo), mirino, aiuto, tasti);
      document.body.append(box);

      let stream = null, traccia = null, chiuso = false, letto = false, nativo = null, nativoOccupato = false;
      let fotogramma = 0, timerConsiglio = 0;
      const voti = [];               // [ms, codice, fotogramma]
      const fonti = new Map();       // codice -> chi l'ha letto
      const tela = document.createElement('canvas');
      const ctx = tela.getContext('2d', { willReadFrequently: true });
      const dimensioni = () => video.videoWidth ? video.videoWidth + 'x' + video.videoHeight : null;

      // Il tasto «indietro» di Android chiude la fotocamera, non l'app.
      let conStoria = false;
      try { history.pushState({ lettoreGea: true }, ''); conStoria = true; } catch (e) { /* niente */ }
      const suIndietro = () => { conStoria = false; chiudi({ esito: 'chiuso' }); };
      const suTasto = ev => { if (ev.key === 'Escape') chiudi({ esito: 'chiuso' }); };
      const suNascosta = () => { if (document.hidden) chiudi({ esito: 'chiuso' }); };
      window.addEventListener('popstate', suIndietro);
      document.addEventListener('keydown', suTasto);
      document.addEventListener('visibilitychange', suNascosta);

      function chiudi(esito) {
        if (chiuso) return;
        chiuso = true;
        const misure = dimensioni();          // prima di spegnere la fotocamera
        clearTimeout(timerConsiglio);
        window.removeEventListener('popstate', suIndietro);
        document.removeEventListener('keydown', suTasto);
        document.removeEventListener('visibilitychange', suNascosta);
        if (conStoria && history.state && history.state.lettoreGea) history.back();
        if (stream) stream.getTracks().forEach(t => t.stop());
        box.classList.add('via');
        setTimeout(() => box.remove(), 180);
        fine(Object.assign({ durata_ms: Math.round(performance.now() - t0), video: misure }, esito));
      }
      chiudiT.addEventListener('click', () => chiudi(errore ? { esito: 'errore', errore } : { esito: 'chiuso' }));

      let errore = null;
      function mostraErrore(err) {
        if (chiuso) return;
        errore = ((err && err.name) || 'errore') + (err && err.message ? ': ' + err.message : '');
        box.classList.add('errore');
        aiuto.textContent = testoErrore(err);
        chiudiT.focus();
      }

      luce.addEventListener('click', () => {
        const si = luce.getAttribute('aria-pressed') !== 'true';
        traccia.applyConstraints({ advanced: [{ torch: si }] })
          .then(() => luce.setAttribute('aria-pressed', String(si)), () => { luce.hidden = true; });
      });

      // Il riquadro sullo schermo, in pixel della fotocamera (il video copre
      // tutto lo schermo e ne esce un po'), con un margine: il codice non
      // deve starci preciso.
      function ritaglio() {
        const VW = video.videoWidth, VH = video.videoHeight;
        const rv = video.getBoundingClientRect(), rm = mirino.getBoundingClientRect();
        const sc = Math.max(rv.width / VW, rv.height / VH);
        const ox = rv.left + (rv.width - VW * sc) / 2, oy = rv.top + (rv.height - VH * sc) / 2;
        const mx = rm.width * 0.12, my = rm.height * 0.35;
        const x = Math.max(0, (rm.left - mx - ox) / sc), y = Math.max(0, (rm.top - my - oy) / sc);
        const x2 = Math.min(VW, (rm.right + mx - ox) / sc), y2 = Math.min(VH, (rm.bottom + my - oy) / sc);
        return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
      }

      function vota(codice, f, ora, fonte) {
        if (chiuso || letto) return;
        if (!fonti.has(codice)) fonti.set(codice, new Set());
        fonti.get(codice).add(fonte);
        voti.push([ora, codice, f]);
        while (voti.length && voti[0][0] < ora - FINESTRA_MS) voti.shift();
        const per = new Map();                         // codice -> fotogrammi diversi
        for (const [, c, g] of voti) { if (!per.has(c)) per.set(c, new Set()); per.get(c).add(g); }
        const quanti = per.get(codice).size;
        let altri = 0;
        for (const [c, g] of per) if (c !== codice) altri = Math.max(altri, g.size);
        if (quanti >= FOTOGRAMMI && quanti > altri * 2) {
          letto = true;
          mirino.classList.add('preso');
          bip();
          const r = { esito: 'letto', codice, bolla: bollaDaCodice(codice), fotogrammi: quanti,
                      fonte: [...fonti.get(codice)].sort().join('+') };
          setTimeout(() => chiudi(r), 350);
        }
      }

      // Un'impronta del fotogramma: due immagini vere della fotocamera non sono
      // mai identiche (il sensore ha sempre un po' di grana), quindi la stessa
      // impronta vuol dire lo stesso fotogramma, che non vota due volte.
      let impronta = -1;
      function analizza(ora) {
        const r = ritaglio();
        const scala = Math.min(1, 1600 / r.w);
        const cw = Math.max(1, Math.round(r.w * scala)), ch = Math.max(1, Math.round(r.h * scala));
        if (tela.width !== cw || tela.height !== ch) { tela.width = cw; tela.height = ch; }
        ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, cw, ch);
        const img = ctx.getImageData(0, 0, cw, ch);
        let imp = 0;
        for (let i = 0; i < img.data.length; i += 389) imp = (imp * 31 + img.data[i]) | 0;
        if (imp === impronta) return;
        impronta = imp;
        const f = ++fotogramma;
        const c = migliore(leggiFotogramma(img));
        if (c) vota(c, f, ora, 'interno');
        if (nativo && !nativoOccupato) {
          nativoOccupato = true;
          nativo.detect(img).then(lista => {
            for (const b of lista || []) {
              const v = String(b.rawValue || '');
              if (/^\d{6}$/.test(v) && !/^0+$/.test(v)) vota(v, f, ora, 'nativo');
            }
          }, () => {}).then(() => { nativoOccupato = false; });
        }
      }

      // Un fotogramma ogni OGNI_MS; sui telefoni lenti meno spesso, invece di
      // bloccare tutto.
      function giro() {
        if (chiuso || letto) return;
        const ora = performance.now();
        let intervallo = OGNI_MS;
        if (video.readyState >= 2 && video.videoWidth) {
          try { analizza(ora); } catch (e) { console.warn('lettore', e); }
          intervallo = Math.max(OGNI_MS, (performance.now() - ora) * 1.5);
        }
        setTimeout(giro, intervallo);
      }

      // Piu' pixel = barre piu' larghe a parita' di distanza: si chiede fino al
      // 1440p, il telefono da' il piu' vicino che ha (di solito 1080p).
      if (!supportato()) { mostraErrore({ name: 'non-supportato' }); return; }
      navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } } })
        .then(async st => {
          if (chiuso) { st.getTracks().forEach(t => t.stop()); return; }
          stream = st;
          traccia = st.getVideoTracks()[0];
          video.srcObject = st;
          try { await video.play(); } catch (e) { /* parte da solo con autoplay */ }
          const cap = traccia && traccia.getCapabilities ? traccia.getCapabilities() : {};
          if (cap.focusMode && cap.focusMode.includes('continuous'))
            traccia.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
          if (cap.torch) luce.hidden = false;
          nativo = await rilevatoreNativo();
          timerConsiglio = setTimeout(() => { if (!chiuso && !letto) aiuto.textContent = o.consiglio + (luce.hidden ? '' : ' Se c’è poca luce, tocca «Luce».'); }, 7000);
          giro();
        }, mostraErrore);
    });
  }

  // strisce e decodifica: solo per il collaudo (prove\lettore_prova.html)
  window.LettoreBarcodeGea = { apri, supportato, bollaDaCodice, leggiLinea, leggiFotogramma, strisce, decodifica };
})();
