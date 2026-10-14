/**
 * GateKeeper TS landing page - live playground.
 *
 * Talks to the deployed API over HTTP and WebSocket. Written dependency-free so
 * the static site on Vercel stays trivial to host.
 */
(function () {
  'use strict';

  var CONFIG = window.GATEKEEPER_CONFIG || {};
  var STORE_KEY = 'gatekeeper.apiBaseUrl';

  var base = '';
  var socket = null;
  var lastInvite = null;

  function el(id) {
    return document.getElementById(id);
  }

  function normalise(url) {
    return (url || '').trim().replace(/\/+$/, '');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function randomDigits(n) {
    var out = '';
    for (var i = 0; i < n; i += 1) {
      out += Math.floor(Math.random() * 10);
    }
    return out;
  }

  function stamp() {
    var d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  /* -------------------------------- UI --------------------------------- */

  function setStatus(kind, text) {
    var pill = el('api-status');
    if (!pill) return;
    pill.className = 'status-pill' + (kind ? ' ' + kind : '');
    el('api-status-text').textContent = text;
  }

  function setControlsEnabled(on) {
    ['btn-create', 'btn-valid', 'btn-reuse', 'btn-unknown'].forEach(function (id) {
      var button = el(id);
      if (button) button.disabled = !on;
    });
  }

  function prepend(boxId, html) {
    var box = el(boxId);
    if (!box) return;
    var placeholder = box.querySelector('.muted, .notice');
    if (placeholder) placeholder.remove();
    var row = document.createElement('div');
    row.innerHTML = html;
    box.insertBefore(row, box.firstChild);
    while (box.childNodes.length > 40) {
      box.removeChild(box.lastChild);
    }
  }

  /* ------------------------------ transport ---------------------------- */

  function request(path, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs || 9000);

    var init = options || {};
    init.signal = controller.signal;

    return fetch(base + path, init)
      .then(function (res) {
        return res.text().then(function (text) {
          return { ok: res.ok, status: res.status, text: text };
        });
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function postJson(path, body) {
    return request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  /* -------------------------------- health ----------------------------- */

  function healthCheck() {
    return request('/health', { method: 'GET' }, 7000)
      .then(function (res) {
        if (!res.ok) return null;
        return parseJson(res.text);
      })
      .catch(function () {
        return null;
      });
  }

  /* ------------------------------ websocket ---------------------------- */

  function connectRealtime() {
    if (socket) {
      try {
        socket.close();
      } catch (error) {
        /* ignore */
      }
    }
    var wsUrl = base.replace(/^http/, 'ws') + '/realtime';

    try {
      socket = new WebSocket(wsUrl);
    } catch (error) {
      return;
    }

    socket.onopen = function () {
      socket.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { gateId: null } }));
      prepend('event-feed', '<span class="muted">connected · ' + escapeHtml(wsUrl) + '</span>');
    };

    socket.onmessage = function (event) {
      var message = parseJson(event.data);
      if (!message || !message.type) return;

      if (message.type === 'ACCESS_EVENT') {
        var p = message.payload;
        var verdict = p.granted
          ? '<span class="grant">GRANT</span>'
          : '<span class="deny">DENY </span>';
        prepend(
          'event-feed',
          '<span class="time">' + stamp() + '</span> ' + verdict + ' ' +
            escapeHtml(p.gateId) + ' ' + escapeHtml(p.accessMethod) +
            (p.granted ? '' : ' <span class="muted">(' + escapeHtml(p.rejectionReason || '') + ')</span>'),
        );
      } else if (message.type === 'GATE_STATUS') {
        var g = message.payload;
        prepend(
          'event-feed',
          '<span class="time">' + stamp() + '</span> <span class="muted">gate</span> ' +
            escapeHtml(g.gateId) + ' ' + escapeHtml(g.previous) + ' → ' + escapeHtml(g.current),
        );
      } else if (message.type === 'INVITATION_EVENT') {
        prepend(
          'event-feed',
          '<span class="time">' + stamp() + '</span> <span class="muted">invitation ' +
            escapeHtml(message.payload.action.toLowerCase()) + '</span> ' +
            escapeHtml(message.payload.visitorName),
        );
      }
    };

    socket.onerror = function () {
      prepend('event-feed', '<span class="deny">realtime socket error</span>');
    };

    socket.onclose = function () {
      prepend('event-feed', '<span class="muted">realtime disconnected</span>');
    };
  }

  /* ------------------------------- actions ----------------------------- */

  function createInvitation() {
    var button = el('btn-create');
    if (button) button.disabled = true;

    var body = {
      residentUnit: 'DEMO-UNIT-' + randomDigits(2),
      visitorName: 'Web Demo Visitor',
      licensePlate: 'DEMO ' + randomDigits(3) + ' ' + randomDigits(3),
      visitorIdNumber: '9001015800083',
      phoneNumber: '+27 82 555 ' + randomDigits(4),
      allowedMethods: ['PIN_CODE', 'LICENSE_PLATE'],
      maxUses: 1,
      ttlMinutes: 30,
    };

    postJson('/api/invitations', body)
      .then(function (res) {
        var data = parseJson(res.text);
        if (!res.ok || !data || !data.invitation) {
          throw new Error('HTTP ' + res.status);
        }
        lastInvite = data.invitation;
        var box = el('invite-result');
        box.className = 'invite-result show';
        box.innerHTML =
          'access code <b>' + escapeHtml(lastInvite.accessCode) + '</b><br>' +
          '<span class="muted">unit ' + escapeHtml(lastInvite.residentUnit) +
          ' · plate ' + escapeHtml(lastInvite.licensePlate) +
          ' · id ' + escapeHtml(lastInvite.maskedIdNumber) + '</span>';
        prepend('decision-log',
          '<span class="time">' + stamp() + '</span> <span class="muted">invitation created — code</span> ' +
          escapeHtml(lastInvite.accessCode));
      })
      .catch(function (error) {
        prepend('decision-log', '<span class="deny">create failed:</span> ' + escapeHtml(error.message));
      })
      .finally(function () {
        if (button) button.disabled = false;
      });
  }

  function scan(body, label) {
    postJson('/api/access/verify', body)
      .then(function (res) {
        var data = parseJson(res.text);
        if (!data || !data.decision) {
          throw new Error('HTTP ' + res.status);
        }
        var d = data.decision;
        var verdict = d.granted
          ? '<span class="grant">GRANTED</span>'
          : '<span class="deny">DENIED</span>';
        prepend(
          'decision-log',
          '<span class="time">' + stamp() + '</span> ' + verdict + ' ' +
            '<span class="muted">' + escapeHtml(label) + '</span> · ' + escapeHtml(d.gateId) +
            ' ' + escapeHtml(d.accessMethod) +
            (d.granted
              ? ' <span class="muted">unit ' + escapeHtml(d.residentUnit || '-') + '</span>'
              : ' <span class="muted">' + escapeHtml(d.rejectionReason || '') + '</span>'),
        );
      })
      .catch(function (error) {
        prepend('decision-log', '<span class="deny">scan failed:</span> ' + escapeHtml(error.message));
      });
  }

  function scanValid() {
    if (!lastInvite) return;
    scan({ gateId: 'GATE-NORTH', accessMethod: 'PIN_CODE', accessCode: lastInvite.accessCode }, 'valid code');
  }

  function scanReuse() {
    if (!lastInvite) return;
    scan({ gateId: 'GATE-SOUTH', accessMethod: 'LICENSE_PLATE', licensePlate: lastInvite.licensePlate }, 'same invitation, second use');
  }

  function scanUnknown() {
    scan(
      { gateId: 'GATE-VISITOR', accessMethod: 'LICENSE_PLATE', licensePlate: 'ZZ ' + randomDigits(3) + ' ' + randomDigits(3) },
      'unknown plate',
    );
  }

  /* --------------------------------- boot ------------------------------ */

  function probe() {
    setStatus('', 'checking live API…');
    healthCheck().then(function (health) {
      if (health && health.status === 'ok') {
        setStatus('online', 'live API online · ' + health.gateCount + ' gates');
        setControlsEnabled(true);
        connectRealtime();
      } else {
        setStatus('offline', 'live API unreachable');
        setControlsEnabled(false);
        prepend(
          'event-feed',
          '<span class="notice">Could not reach ' + escapeHtml(base) +
            '. Deploy the API on Render (see the Deploy section) or paste a reachable URL above.</span>',
        );
      }
    });
  }

  function wire() {
    var save = el('api-url-save');
    if (save) {
      save.addEventListener('click', function () {
        var input = el('api-url-input');
        var value = normalise(input && input.value);
        if (!value) return;
        try {
          localStorage.setItem(STORE_KEY, value);
        } catch (error) {
          /* ignore */
        }
        base = value;
        el('btn-create') && (el('btn-create').disabled = true);
        probe();
      });
    }

    el('btn-create') && el('btn-create').addEventListener('click', createInvitation);
    el('btn-valid') && el('btn-valid').addEventListener('click', scanValid);
    el('btn-reuse') && el('btn-reuse').addEventListener('click', scanReuse);
    el('btn-unknown') && el('btn-unknown').addEventListener('click', scanUnknown);
  }

  function init() {
    var stored = null;
    try {
      stored = localStorage.getItem(STORE_KEY);
    } catch (error) {
      stored = null;
    }

    base = normalise(stored || CONFIG.apiBaseUrl || '');
    var input = el('api-url-input');
    if (input && base) input.value = base;

    wire();

    if (!base) {
      setStatus('offline', 'no API URL configured');
      prepend('event-feed', '<span class="notice">Paste your API URL above to enable the live demo.</span>');
      return;
    }
    probe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
