(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const logLines = [];
  let desired = false, active = false, starting = false, session = 0, restarts = 0;
  let recognition = null, restartTimer = null, lastEndAt = null, lastShown = '';
  let savedTranscript = '', sessionText = '', lastResultAt = 0, pendingRestart = false;
  const time = () => new Date().toLocaleTimeString();
  function log(message) {
    const line = `[${time()}] ${message}`;
    logLines.push(line);
    if (logLines.length > 500) logLines.shift();
    $('log').textContent = logLines.join('\n');
    $('log').scrollTop = $('log').scrollHeight;
  }
  function status(label, kind = '') {
    $('state').textContent = label;
    $('dot').className = `dot ${kind}`;
    $('start').disabled = desired;
    $('stop').disabled = !desired;
    $('mode').disabled = desired;
  }
  function showTranscript() {
    // Keep a stable best hypothesis per session rather than concatenating every event.
    const combined = [savedTranscript, sessionText].filter(Boolean).join('\n');
    $('transcript').value = combined;
    if (window.shelfV8) window.shelfV8.scheduleParse();
  }
  function closeSession() {
    if (sessionText.trim()) savedTranscript = [savedTranscript, sessionText.trim()].filter(Boolean).join('\n');
    sessionText = ''; lastShown = '';
    showTranscript();
  }
  function normalize(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
  function createRecognizer() {
    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    const thisSession = ++session;
    $('session').textContent = session;
    let latest = '', eventCount = 0;
    r.onstart = () => {
      if (recognition !== r) return;
      active = true; starting = false;
      const gap = lastEndAt === null ? null : Math.round(performance.now() - lastEndAt);
      if (gap !== null) { $('gap').textContent = `${gap} ms`; log(`START session=${thisSession} gap=${gap}ms`); }
      else log(`START session=${thisSession}`);
      status('Listening', 'on');
    };
    r.onresult = event => {
      if (recognition !== r) return;
      eventCount++;
      // Some Android implementations emit a succession of cumulative hypotheses
      // as separate FINAL entries. Do not join all entries blindly.
      const candidates = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const t = normalize(result && result[0] && result[0].transcript);
        if (t) candidates.push({ text: t, final: !!result.isFinal });
      }
      // Choose the longest cumulative hypothesis when results overlap; otherwise
      // preserve independent phrases. This test favors avoiding duplication.
      let assembled = '';
      for (const c of candidates) {
        const t = c.text;
        if (!assembled) assembled = t;
        else if (t === assembled || assembled.endsWith(t)) continue;
        else if (t.startsWith(assembled)) assembled = t;
        else if (assembled.startsWith(t)) continue;
        else {
          const a = assembled.toLowerCase().split(/\s+/), b = t.toLowerCase().split(/\s+/);
          let overlap = 0;
          for (let n = Math.min(a.length, b.length); n > 0; n--) {
            if (a.slice(-n).join(' ') === b.slice(0,n).join(' ')) { overlap = n; break; }
          }
          assembled += ' ' + t.split(/\s+/).slice(overlap).join(' ');
        }
      }
      assembled = normalize(assembled);
      if (assembled && assembled !== latest) {
        const delta = assembled.startsWith(latest) ? normalize(assembled.slice(latest.length)) : '';
        const isCorrection = latest && !assembled.startsWith(latest);
        // Throttle logging of incremental single-word hypotheses while retaining changes.
        log(`${isCorrection ? 'REVISED' : 'HEARD'} session=${thisSession} ${delta && !isCorrection ? '+' + JSON.stringify(delta) : JSON.stringify(assembled)}`);
        latest = assembled;
        sessionText = assembled;
        lastResultAt = performance.now();
        showTranscript();
      }
      $('live').textContent = `Recognition events: ${eventCount} · result slots: ${event.results.length}`;
    };
    r.onerror = e => {
      if (recognition !== r) return;
      log(`ERROR session=${thisSession} code=${e.error || 'unknown'}${e.message ? ' message='+e.message : ''}`);
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) {
        desired = false; clearTimeout(restartTimer); status('Error');
        $('warn').textContent = `Speech recognition error: ${e.error}. Check microphone permission and browser support.`;
      }
    };
    r.onend = () => {
      if (recognition !== r) return;
      active = false; starting = false;
      lastEndAt = performance.now();
      log(`END session=${thisSession} results=${eventCount} lastSpeechAgo=${lastResultAt ? Math.round(lastEndAt-lastResultAt)+'ms' : 'none'} desired=${desired}`);
      closeSession();
      recognition = null;
      if (desired && $('mode').value === 'restart') {
        restarts++;
        $('restarts').textContent = restarts;
        pendingRestart = true;
        status('Restarting…', 'wait');
        log(`RESTART scheduled after 350ms; count=${restarts}`);
        restartTimer = setTimeout(() => {
          restartTimer = null; pendingRestart = false;
          if (desired) startSession();
        }, 350);
      } else {
        desired = false; status('Stopped');
      }
    };
    return r;
  }
  function startSession() {
    if (!desired || active || starting || recognition) return;
    starting = true;
    recognition = createRecognizer();
    status('Starting…', 'wait');
    log(`START REQUEST session=${session}`);
    try { recognition.start(); }
    catch (e) {
      log(`START FAILED session=${session}: ${e.name || e.message}`);
      recognition = null; starting = false;
      if (desired && $('mode').value === 'restart') {
        restartTimer = setTimeout(() => { restartTimer = null; startSession(); }, 1000);
      } else { desired = false; status('Error'); }
    }
  }
  $('start').addEventListener('click', () => {
    if (!SpeechRecognition) { $('warn').textContent = 'SpeechRecognition is not supported in this browser. Try Chrome on Android.'; log('UNSUPPORTED browser'); return; }
    if (desired) return;
    $('warn').textContent = '';
    // Preserve text the user may have edited between recordings.
    savedTranscript = $('transcript').value.trim();
    sessionText = ''; lastShown = ''; lastEndAt = null; lastResultAt = 0;
    desired = true;
    log(`USER tapped Start; mode=${$('mode').value}`);
    startSession();
  });
  $('stop').addEventListener('click', () => {
    log('USER tapped Stop');
    desired = false;
    clearTimeout(restartTimer); restartTimer = null; pendingRestart = false;
    if (recognition) {
      status('Stopping…', 'wait');
      try { recognition.stop(); } catch(e) { log(`STOP exception: ${e.message}`); status('Stopped'); }
    } else { status('Stopped'); }
  });
  $('clearText').addEventListener('click', () => {
    savedTranscript = ''; sessionText = ''; lastShown = '';
    $('transcript').value = ''; $('live').textContent = '';
    log('USER cleared transcript');
    if (window.shelfV8) window.shelfV8.scheduleParse();
  });
  $('clearLog').addEventListener('click', () => { logLines.length = 0; $('log').textContent = ''; log('Log cleared'); });
  $('copyLog').addEventListener('click', async () => {
    const data = logLines.join('\n');
    try { await navigator.clipboard.writeText(data); $('copyLog').textContent = 'Copied!'; setTimeout(() => $('copyLog').textContent = 'Copy log', 1300); }
    catch(e) { log(`COPY failed: ${e.message}`); $('warn').textContent = 'Clipboard copy failed. Select the log manually.'; }
  });
  $('transcript').addEventListener('input', () => { if (window.shelfV8) window.shelfV8.scheduleParse(); });
  log(`V8 ready; browser=${navigator.userAgent}`);
  if (!SpeechRecognition) $('warn').textContent = 'Speech recognition unavailable in this browser.';
})();
