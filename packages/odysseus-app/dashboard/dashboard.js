/**
 * Odysseus Agent — Living Dashboard Engine
 *
 * Zero dependencies. Consumes SSE consciousness stream and REST API.
 * All DOM manipulation uses safe methods (createElement + textContent).
 */

(function () {
  'use strict';

  // ── Config ──
  const SSE_PATH = '/events';
  const REST_BASE = '';
  const MAX_EVENTS = 200;
  const RECONNECT_MS = 3000;
  const NEURAL_PARTICLES = 60;
  const PULSE_WINDOW = 120; // seconds of pulse history

  // ── State ──
  let connected = false;
  let startTime = Date.now();
  let eventCount = 0;
  let eventsPerMin = 0;
  let toolCallCount = 0;
  let memoryOps = 0;
  let errorCount = 0;
  let eventTimestamps = [];
  let pulseHistory = new Array(PULSE_WINDOW).fill(0);
  let currentEmotion = { valence: 0.5, arousal: 0.5, label: 'neutral' };
  let agentState = {
    model: '--',
    phase: '--',
    loops: 0,
    cells: 0,
    episodes: 0,
    goals: 0,
  };

  // ── DOM refs ──
  const statusDot = document.getElementById('status-dot');
  const uptimeEl = document.getElementById('uptime');
  const eventRateEl = document.getElementById('event-rate');
  const eventStreamEl = document.getElementById('event-stream');
  const agentStateEl = document.getElementById('agent-state');
  const emotionLabel = document.getElementById('emotion-label');
  const emotionCanvas = document.getElementById('emotion-canvas');
  const neuralCanvas = document.getElementById('neural-canvas');
  const pulseCanvas = document.getElementById('pulse-canvas');

  // Metric elements
  const mEvents = document.getElementById('m-events');
  const mEventsBar = document.getElementById('m-events-bar');
  const mTools = document.getElementById('m-tools');
  const mToolsBar = document.getElementById('m-tools-bar');
  const mMemory = document.getElementById('m-memory');
  const mMemoryBar = document.getElementById('m-memory-bar');
  const mErrors = document.getElementById('m-errors');
  const mErrorsBar = document.getElementById('m-errors-bar');

  // ── Neural Canvas (background particles) ──
  const nCtx = neuralCanvas.getContext('2d');
  let particles = [];

  function initNeural() {
    neuralCanvas.width = window.innerWidth;
    neuralCanvas.height = window.innerHeight;
    particles = [];
    for (let i = 0; i < NEURAL_PARTICLES; i++) {
      particles.push({
        x: Math.random() * neuralCanvas.width,
        y: Math.random() * neuralCanvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1,
      });
    }
  }

  function drawNeural() {
    nCtx.clearRect(0, 0, neuralCanvas.width, neuralCanvas.height);
    const w = neuralCanvas.width;
    const h = neuralCanvas.height;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      nCtx.beginPath();
      nCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      nCtx.fillStyle = 'rgba(110, 231, 183, 0.5)';
      nCtx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          nCtx.beginPath();
          nCtx.moveTo(p.x, p.y);
          nCtx.lineTo(q.x, q.y);
          nCtx.strokeStyle = `rgba(110, 231, 183, ${0.15 * (1 - dist / 120)})`;
          nCtx.stroke();
        }
      }
    }
  }

  // ── Pulse Timeline (bottom waveform) ──
  const pCtx = pulseCanvas.getContext('2d');
  let pulseFrame = 0;

  function resizePulse() {
    const rect = pulseCanvas.parentElement.getBoundingClientRect();
    pulseCanvas.width = rect.width;
    pulseCanvas.height = rect.height;
  }

  function drawPulse() {
    const w = pulseCanvas.width;
    const h = pulseCanvas.height;
    pCtx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const step = w / PULSE_WINDOW;

    // Glow
    pCtx.beginPath();
    pCtx.moveTo(0, mid);
    for (let i = 0; i < PULSE_WINDOW; i++) {
      const amp = pulseHistory[i] * (h * 0.35);
      const wave = Math.sin((i + pulseFrame * 0.02) * 0.3) * amp * 0.3;
      pCtx.lineTo(i * step, mid - amp + wave);
    }
    pCtx.strokeStyle = 'rgba(110, 231, 183, 0.1)';
    pCtx.lineWidth = 6;
    pCtx.stroke();

    // Main line
    pCtx.beginPath();
    pCtx.moveTo(0, mid);
    for (let i = 0; i < PULSE_WINDOW; i++) {
      const amp = pulseHistory[i] * (h * 0.35);
      pCtx.lineTo(i * step, mid - amp);
    }
    pCtx.strokeStyle = '#6ee7b7';
    pCtx.lineWidth = 1.5;
    pCtx.stroke();

    // Shift history
    pulseFrame++;
    if (pulseFrame % 60 === 0) {
      pulseHistory.shift();
      pulseHistory.push(0);
    }
  }

  // ── Emotion Ring ──
  const eCtx = emotionCanvas.getContext('2d');

  function drawEmotionRing() {
    const size = 120;
    const cx = size / 2;
    const cy = size / 2;
    const r = 42;

    eCtx.clearRect(0, 0, size, size);

    // Outer ring
    eCtx.beginPath();
    eCtx.arc(cx, cy, r, 0, Math.PI * 2);
    eCtx.strokeStyle = '#1e1e2e';
    eCtx.lineWidth = 3;
    eCtx.stroke();

    // Active arc (valence determines start, arousal determines sweep)
    const startAngle = -Math.PI / 2 + (currentEmotion.valence - 0.5) * Math.PI;
    const sweep = currentEmotion.arousal * Math.PI * 1.5 + 0.3;
    eCtx.beginPath();
    eCtx.arc(cx, cy, r, startAngle, startAngle + sweep);
    eCtx.strokeStyle = '#f0abfc';
    eCtx.lineWidth = 3;
    eCtx.lineCap = 'round';
    eCtx.stroke();

    // Inner dot position based on valence/arousal
    const dotX = cx + (currentEmotion.valence - 0.5) * r * 1.2;
    const dotY = cy + (0.5 - currentEmotion.arousal) * r * 1.2;
    eCtx.beginPath();
    eCtx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    eCtx.fillStyle = '#f0abfc';
    eCtx.fill();

    // Pulse rings
    const t = Date.now() / 1000;
    for (let i = 0; i < 2; i++) {
      const phase = (t + i * 0.5) % 1;
      eCtx.beginPath();
      eCtx.arc(dotX, dotY, 4 + phase * 16, 0, Math.PI * 2);
      eCtx.strokeStyle = `rgba(240, 171, 252, ${0.4 * (1 - phase)})`;
      eCtx.lineWidth = 1;
      eCtx.stroke();
    }
  }

  // ── Event rendering (safe DOM — no innerHTML) ──
  function getEventClass(type) {
    if (type.startsWith('cycle')) return 'cycle';
    if (type.startsWith('llm') || type.startsWith('stream')) return 'llm';
    if (type.startsWith('tool')) return 'tool';
    if (type.startsWith('memory') || type.startsWith('hippocampus')) return 'memory';
    if (type.startsWith('cell') || type.startsWith('spawn')) return 'cell';
    if (type.startsWith('emotion') || type.startsWith('persona')) return 'emotion';
    if (type.startsWith('error') || type.startsWith('circuit')) return 'error';
    if (type.startsWith('experiment')) return 'experiment';
    return 'other';
  }

  function summarizeEvent(type, data) {
    // Phase change
    if (type === 'phase_change' && data.phase) {
      return 'Phase → ' + data.phase;
    }
    // Perception
    if (type === 'perception') {
      var src = data.source || data.data || {};
      return 'Perceived: ' + (src.type || src.message || 'stimulus');
    }
    // Reasoning
    if (type === 'reasoning') {
      var conclusion = data.conclusion || '';
      if (conclusion.length > 120) conclusion = conclusion.slice(0, 117) + '...';
      return conclusion || 'Reasoning cycle';
    }
    // Tool events
    if (type.startsWith('tool')) {
      var toolName = data.tool || data.name || 'unknown';
      var success = data.success !== false && data.error == null;
      return (success ? '✓' : '✗') + ' ' + toolName;
    }
    // Memory
    if (type.startsWith('memory')) {
      var key = data.key || data.id || '';
      return 'Memory: ' + (key || 'store/recall');
    }
    // Cycle
    if (type.startsWith('cycle')) {
      var phase = data.phase || '';
      var loop = data.loopCount || '';
      return 'Cycle #' + loop + (phase ? ' [' + phase + ']' : '');
    }
    // LLM
    if (type.startsWith('llm')) {
      var tokens = data.tokens || data.usage || '';
      return 'LLM call' + (tokens ? ' (' + tokens + ' tokens)' : '');
    }
    // Emotion
    if (type.startsWith('emotion')) {
      return 'Emotion: ' + (data.label || 'update');
    }
    // Generic fallback
    var fallback = '';
    try { fallback = JSON.stringify(data); } catch { fallback = String(data); }
    return fallback.slice(0, 150);
  }

  function renderEvent(event) {
    const type = event.type || 'unknown';
    const data = event.data || {};
    const now = new Date();
    const time = now.toLocaleTimeString('en', { hour12: false });

    const item = document.createElement('div');
    item.className = 'event-item';

    // Header row
    const header = document.createElement('div');
    header.className = 'event-header';

    const badge = document.createElement('span');
    badge.className = 'event-type ' + getEventClass(type);
    badge.textContent = type;

    const timeEl = document.createElement('span');
    timeEl.className = 'event-time';
    timeEl.textContent = time;

    header.appendChild(badge);
    header.appendChild(timeEl);
    item.appendChild(header);

    // Summary line
    const summaryEl = document.createElement('div');
    summaryEl.className = 'event-data';
    summaryEl.textContent = summarizeEvent(type, data);
    item.appendChild(summaryEl);

    // Insert at top
    const panelTitle = eventStreamEl.querySelector('.panel-title');
    if (panelTitle && panelTitle.nextSibling) {
      eventStreamEl.insertBefore(item, panelTitle.nextSibling);
    } else {
      eventStreamEl.appendChild(item);
    }

    // Trim old events
    const events = eventStreamEl.querySelectorAll('.event-item');
    if (events.length > MAX_EVENTS) {
      for (let i = MAX_EVENTS; i < events.length; i++) {
        events[i].remove();
      }
    }

    // Auto-scroll
    eventStreamEl.scrollTop = 0;
  }

  // ── State + Metric updates ──
  function updateStateUI() {
    const items = agentStateEl.querySelectorAll('.state-item');
    const values = [agentState.model, agentState.phase, agentState.loops, agentState.cells, agentState.episodes, agentState.goals];
    items.forEach((item, i) => {
      const val = item.querySelector('.value');
      if (val && values[i] !== undefined) {
        val.textContent = values[i];
      }
    });
  }

  function updateMetrics() {
    const now = Date.now();
    eventTimestamps = eventTimestamps.filter(t => now - t < 60000);
    eventsPerMin = eventTimestamps.length;

    mEvents.textContent = eventsPerMin;
    mEventsBar.style.width = Math.min(100, eventsPerMin) + '%';
    mTools.textContent = toolCallCount;
    mToolsBar.style.width = Math.min(100, toolCallCount * 2) + '%';
    mMemory.textContent = memoryOps;
    mMemoryBar.style.width = Math.min(100, memoryOps * 3) + '%';
    mErrors.textContent = errorCount;
    mErrorsBar.style.width = Math.min(100, errorCount * 10) + '%';
  }

  function updateUptime() {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    uptimeEl.textContent = h + ':' + m + ':' + sec;
    eventRateEl.textContent = eventsPerMin + ' evt/s';
  }

  // ── SSE event handler ──
  function handleSSEEvent(e) {
    let payload;
    try {
      payload = JSON.parse(e.data);
    } catch {
      return;
    }

    // Normalize: named SSE events carry {type, source, data, ...}
    // Hook events (cycle:start, llm:call, etc.) carry the payload directly
    const sseType = e.type || '';  // the SSE event name (e.g. "consciousness", "cycle:start")
    const eventType = payload.type || sseType;
    const eventData = payload.data || payload;

    const event = { type: eventType, data: eventData };

    eventCount++;
    eventTimestamps.push(Date.now());
    pulseHistory[pulseHistory.length - 1] = Math.min(1, pulseHistory[pulseHistory.length - 1] + 0.15);

    if (eventType.startsWith('tool')) {
      toolCallCount++;
    }
    if (eventType.startsWith('memory') || eventType.startsWith('hippocampus')) {
      memoryOps++;
    }
    if (eventType.startsWith('error') || eventType.startsWith('circuit')) {
      errorCount++;
    }
    if (eventType.startsWith('emotion') || eventType === 'persona.update') {
      handleEmotionEvent(eventData);
    }
    if (sseType.startsWith('cycle') || eventType.startsWith('cycle')) {
      agentState.phase = eventData?.phase || eventData?.data?.phase || agentState.phase;
      agentState.loops = eventData?.loopCount || agentState.loops;
    }
    // Consciousness events carry brainstem phase info
    if (eventType === 'phase_change') {
      agentState.phase = eventData?.phase || agentState.phase;
    }

    renderEvent(event);
    updateMetrics();
  }

  // ── SSE Connection ──
  function connectSSE() {
    const es = new EventSource(SSE_PATH);

    es.onopen = function () {
      connected = true;
      statusDot.classList.remove('disconnected');
    };

    // Catch unnamed events (data-only, no event: prefix)
    es.onmessage = handleSSEEvent;

    // Listen for all named SSE event types from the agent
    var namedEvents = [
      'consciousness',
      'cycle:start', 'cycle:end',
      'llm:call', 'llm:response',
      'tool:execute', 'tool:result',
      'memory:store',
      'cell:spawn',
      'goal:created',
      'delegate:start', 'delegate:complete',
      'plugin:loaded', 'plugin:unloaded',
      'input:received', 'input:processed',
      'error:pipeline',
      'emotion:update', 'persona.update',
      'prediction.update', 'narrative.update',
      'proactive.suggestion',
      'experiment:begin', 'experiment:verified',
      'experiment:decided', 'experiment:recorded',
      'mission:started', 'mission:stopped',
    ];
    for (var i = 0; i < namedEvents.length; i++) {
      es.addEventListener(namedEvents[i], handleSSEEvent);
    }

    es.onerror = function () {
      connected = false;
      statusDot.classList.add('disconnected');
      setTimeout(function () {
        es.close();
        connectSSE();
      }, RECONNECT_MS);
    };
  }

  // ── Emotion handler ──
  function handleEmotionEvent(data) {
    if (!data) return;
    if (data.valence !== undefined) currentEmotion.valence = data.valence;
    if (data.arousal !== undefined) currentEmotion.arousal = data.arousal;
    if (data.label) {
      currentEmotion.label = data.label;
      emotionLabel.textContent = data.label;
    }
  }

  // ── REST state polling (every 5s) ──
  function pollState() {
    fetch(REST_BASE + '/status')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // /status returns { modules: { brainstem, hippocampus, synapse, ... } }
        var m = data.modules || {};
        if (m.brainstem) {
          agentState.phase = m.brainstem.phase || agentState.phase;
          agentState.loops = m.brainstem.loopCount || agentState.loops;
        }
        if (m.synapse) {
          agentState.cells = m.synapse.cells || agentState.cells;
        }
        if (m.hippocampus) {
          agentState.episodes = m.hippocampus.episodes || agentState.episodes;
        }
        if (m.prefrontal) {
          agentState.goals = (m.prefrontal.activePlans || 0) + (m.prefrontal.completedGoals || 0);
        }
        updateStateUI();
      })
      .catch(function () { /* ignore fetch failures */ });

    fetch(REST_BASE + '/health')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.llmResilience && data.llmResilience.model) {
          agentState.model = data.llmResilience.model;
          updateStateUI();
        }
      })
      .catch(function () { /* ignore */ });
  }

  // ── Animation loop ──
  function animate() {
    drawNeural();
    drawPulse();
    drawEmotionRing();
    updateUptime();
    requestAnimationFrame(animate);
  }

  // ── Init ──
  function init() {
    initNeural();
    resizePulse();
    window.addEventListener('resize', function () {
      initNeural();
      resizePulse();
    });

    connectSSE();
    pollState();
    setInterval(pollState, 5000);

    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
