// Helper to escape inserted HTML
function escapeHtml(str) {
  return String(str).replace(/[&<>\"]/g, function(match) {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return match;
    }
  });
}

// Filter rows in a table by query (matches attribute or value)
function filterTableRows(selector, query) {
  const q = (query || '').trim().toLowerCase();
  const rows = document.querySelectorAll(selector);
  rows.forEach(r => {
    if (!q) {
      r.style.display = '';
      return;
    }
    const tds = r.querySelectorAll('td');
    const text = Array.from(tds).map(td => td.textContent || '').join(' ').toLowerCase();
    r.style.display = text.indexOf(q) !== -1 ? '' : 'none';
  });
}

// Wire search inputs
function setupSearchListeners() {
  const httpSearch = document.getElementById('http-search');
  const jsSearch = document.getElementById('js-search');
  if (httpSearch) {
    httpSearch.addEventListener('input', () => {
      filterTableRows('#http-attrs tbody tr', httpSearch.value);
      filterTableRows('#other-headers-table tbody tr', httpSearch.value);
      // If any matching rows appear in the "Other headers" table, open the details
      try {
        const otherRows = document.querySelectorAll('#other-headers-table tbody tr');
        const anyVisible = Array.from(otherRows).some(r => window.getComputedStyle(r).display !== 'none');
        const otherDetails = document.getElementById('other-headers');
        if (otherDetails) otherDetails.open = anyVisible;
      } catch (e) {
        // ignore DOM errors
      }
    });
  }
  if (jsSearch) {
    jsSearch.addEventListener('input', () => {
      filterTableRows('#js-attrs tbody tr', jsSearch.value);
    });
  }
}

setupSearchListeners();

async function sendFingerprint() {
  const payload = {
    user_agent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone_offset_minutes: new Date().getTimezoneOffset(),
    language: navigator.language,
    // metadata: a rich object with various navigator and screen hints
    metadata: {
      platform: navigator.platform,
      vendor: navigator.vendor,
      languages: navigator.languages || [navigator.language],
      deviceMemory: navigator.deviceMemory || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      cookieEnabled: navigator.cookieEnabled === undefined ? null : navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack || null,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      product: navigator.product || null,
      userAgentData: (navigator.userAgentData && typeof navigator.userAgentData === 'object') ? navigator.userAgentData : null,
      screen: {
        width: (window.screen && window.screen.width) || null,
        height: (window.screen && window.screen.height) || null,
        availWidth: (window.screen && window.screen.availWidth) || null,
        availHeight: (window.screen && window.screen.availHeight) || null,
        availTop: (window.screen && window.screen.availTop) || null,
        availLeft: (window.screen && window.screen.availLeft) || null,
        colorDepth: (window.screen && window.screen.colorDepth) || null,
        pixelDepth: (window.screen && window.screen.pixelDepth) || null
      }
    }
  };

  // Synchronous helpers for richer attributes
  try {
    // Canvas fingerprint: draw a richer fingerprint sample and compute a short SHA-1 hash.
    // Also keep a small data-URL preview for immediate display.
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 80;
    const ctx = canvas.getContext('2d');
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#fffb');
    grad.addColorStop(0.5, '#f0f8ff');
    grad.addColorStop(1, '#fff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw some shapes
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 60, 40);
    ctx.strokeStyle = '#069';
    ctx.lineWidth = 2;
    ctx.strokeRect(80, 10, 70, 40);
    // Draw multilingual text and emoji with different fonts
    ctx.fillStyle = '#222';
    ctx.font = '18px Arial';
    ctx.fillText('Cwm fjordbank glyphs vext quiz', 10, 35);
    try { ctx.font = '20px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; } catch (e) {}
    ctx.fillText('🙂 ✨ 漢字', 10, 62);
    // small rotation test
    ctx.save();
    ctx.translate(260, 40);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#b33';
    ctx.font = '16px Georgia';
    ctx.fillText('ƒ', 0, 0);
    ctx.restore();
    // Capture preview as data URL (small PNG)
    try {
      payload.canvas_preview = canvas.toDataURL('image/png');
    } catch (e) {
      payload.canvas_preview = null;
    }
    // toBlob is async — await the blob and hash it using SubtleCrypto
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    if (blob && window.crypto && crypto.subtle) {
      const buf = await blob.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-1', buf);
      const hashArray = Array.from(new Uint8Array(hashBuf));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      // Keep a short form for display/storage
      payload.canvas_hash = hashHex.slice(0, 16);
    } else {
      payload.canvas_hash = null;
    }
  } catch (e) {
    payload.canvas_hash = null;
  }

  try {
    if (navigator.plugins) {
      payload.plugins_count = navigator.plugins.length || 0;
      const plugins = [];
      for (let i = 0; i < navigator.plugins.length; i++) {
        try {
          const p = navigator.plugins[i];
          const name = p && (p.name || p.filename || '') || '';
          const desc = p && p.description ? (': ' + p.description) : '';
          plugins.push(name + desc);
        } catch (e) {}
      }
      payload.plugins = plugins.slice(0, 40);
    } else {
      payload.plugins_count = 0;
      payload.plugins = [];
    }
  } catch (e) { payload.plugins_count = 0; payload.plugins = []; }

  try {
    payload.mimeTypes_count = (navigator.mimeTypes && navigator.mimeTypes.length) || 0;
  } catch (e) { payload.mimeTypes_count = 0; }

  try {
    payload.webdriver = !!navigator.webdriver;
  } catch (e) { payload.webdriver = null; }

  try {
    payload.java_enabled = (typeof navigator.javaEnabled === 'function') ? !!navigator.javaEnabled() : null;
  } catch (e) { payload.java_enabled = null; }

  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    payload.connection_effective_type = conn && conn.effectiveType ? conn.effectiveType : null;
  } catch (e) { payload.connection_effective_type = null; }

  try {
    // Collect some navigator-level fields often used in fingerprinting
    payload.product = navigator.product || null;
    payload.productSub = navigator.productSub || null;
    payload.vendor = navigator.vendor || null;
    payload.vendorSub = navigator.vendorSub || null;
    payload.buildID = navigator.buildID || null;
  } catch (e) {}

  try {
    // Fonts if available via FontFaceSet
    if (document.fonts && typeof document.fonts.forEach === 'function') {
      const fonts = [];
      document.fonts.forEach(f => { try { if (f && f.family) fonts.push(f.family); } catch (e) {} });
      payload.fonts = fonts.slice(0, 40);
      payload.fonts_count = fonts.length;
    } else {
      payload.fonts = [];
      payload.fonts_count = 0;
    }
  } catch (e) { payload.fonts = []; }

  try {
    // Simple adblock detection: look for blocked ad element
    const bait = document.createElement('div');
    bait.className = 'adsbox';
    bait.style.width = '1px';
    bait.style.height = '1px';
    bait.style.position = 'absolute';
    bait.style.left = '-9999px';
    document.body.appendChild(bait);
    payload.adblock = !(bait.offsetParent || bait.offsetHeight || bait.offsetWidth);
    document.body.removeChild(bait);
  } catch (e) { payload.adblock = null; }

  // Try to obtain the client's public IP from a simple IP service and
  // include it in the payload. This is convenient for testing but can be
  // spoofed by clients, so prefer server-detected X-Forwarded-For in prod.
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    if (ipRes.ok) {
      const ipJson = await ipRes.json();
      payload.client_ip = ipJson.ip;
    }
  } catch (e) {
    // ignore failures to fetch public IP — continue without it
  }

  try {
    const res = await fetch('/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    // Render full JSON response for debugging
    const resultEl = document.getElementById('result');
    resultEl.textContent = '';
    // Reveal the result card (it is hidden by default in CSS)
    resultEl.style.display = 'block';

    // Populate HTTP headers table with ordered attributes first
    const httpTbody = document.querySelector('#http-attrs tbody');
    httpTbody.innerHTML = '';
    const headers = data.request_headers || {};

    // (escapeHtml is defined at module scope)

    // Ordered attributes to show first (use lowercase header names)
    const ordered = [
      ['user-agent', 'User agent'],
      ['accept', 'Accept'],
      ['accept-encoding', 'Content encoding'],
      ['accept-language', 'Content language'],
      ['if-none-match', 'If none match'],
      ['upgrade-insecure-requests', 'Upgrade Insecure Requests'],
      ['referer', 'Referer']
    ];

    const seen = new Set();
    ordered.forEach(([key, label]) => {
      const value = headers[key] || '';
      seen.add(key);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(label)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(String(value))}</td>
      `;
      httpTbody.appendChild(tr);
    });

    // Append any other headers that were not in the ordered list into the collapsible other-headers table
    const otherTbody = document.querySelector('#other-headers-table tbody');
    otherTbody.innerHTML = '';
    Object.keys(headers).forEach(key => {
      if (seen.has(key)) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(key)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(String(headers[key]))}</td>
      `;
      otherTbody.appendChild(tr);
    });

    // Apply current search filters (if any)
    const httpSearchVal = (document.getElementById('http-search') || {}).value || '';
    const jsSearchVal = (document.getElementById('js-search') || {}).value || '';
    filterTableRows('#http-attrs tbody tr', httpSearchVal);
    filterTableRows('#other-headers-table tbody tr', httpSearchVal);
    filterTableRows('#js-attrs tbody tr', jsSearchVal);
    // Ensure the Other headers details is opened if any rows are visible after filtering
    try {
      const otherRows = document.querySelectorAll('#other-headers-table tbody tr');
      const anyVisible = Array.from(otherRows).some(r => window.getComputedStyle(r).display !== 'none');
      const otherDetails = document.getElementById('other-headers');
      if (otherDetails) otherDetails.open = anyVisible;
    } catch (e) {
      // ignore
    }

    // Populate JS attributes table
    const jsTbody = document.querySelector('#js-attrs tbody');
    jsTbody.innerHTML = '';
    const event = data.event || {};

    // Build a flattened view of JS-relevant attributes to display
    const jsAttrs = {
      'user_agent': event.user_agent || payload.user_agent,
      'timezone': event.timezone || payload.timezone,
      'timezone_offset_minutes': event.timezone_offset_minutes || payload.timezone_offset_minutes || '',
      'language': event.language || payload.language,
      'platform': (event.metadata && event.metadata.platform) || (payload.metadata && payload.metadata.platform) || '',
      'screen_width': (event.metadata && event.metadata.screen && event.metadata.screen.width) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.width) || '',
      'screen_height': (event.metadata && event.metadata.screen && event.metadata.screen.height) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.height) || '',
      'screen_colorDepth': (event.metadata && event.metadata.screen && event.metadata.screen.colorDepth) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.colorDepth) || '',
      'screen_pixelDepth': (event.metadata && event.metadata.screen && event.metadata.screen.pixelDepth) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.pixelDepth) || '',
      'screen_availWidth': (event.metadata && event.metadata.screen && event.metadata.screen.availWidth) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.availWidth) || '',
      'screen_availHeight': (event.metadata && event.metadata.screen && event.metadata.screen.availHeight) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.availHeight) || '',
      'screen_availTop': (event.metadata && event.metadata.screen && event.metadata.screen.availTop) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.availTop) || '',
      'screen_availLeft': (event.metadata && event.metadata.screen && event.metadata.screen.availLeft) || (payload.metadata && payload.metadata.screen && payload.metadata.screen.availLeft) || '',
      'languages': Array.isArray((event.metadata && event.metadata.languages) || (payload.metadata && payload.metadata.languages)) ? ((event.metadata && event.metadata.languages) || (payload.metadata && payload.metadata.languages)).join(', ') : '',
      'deviceMemory': (event.metadata && event.metadata.deviceMemory) || (payload.metadata && payload.metadata.deviceMemory) || '',
      'hardwareConcurrency': (event.metadata && event.metadata.hardwareConcurrency) || (payload.metadata && payload.metadata.hardwareConcurrency) || '',
      'cookieEnabled': (event.metadata && event.metadata.cookieEnabled) || (payload.metadata && payload.metadata.cookieEnabled) || '',
      'doNotTrack': (event.metadata && event.metadata.doNotTrack) || (payload.metadata && payload.metadata.doNotTrack) || '',
      'maxTouchPoints': (event.metadata && event.metadata.maxTouchPoints) || (payload.metadata && payload.metadata.maxTouchPoints) || '',
      'product': event.product || payload.product || '',
      'productSub': event.productSub || payload.productSub || '',
      'vendor': event.vendor || payload.vendor || '',
      'vendorSub': event.vendorSub || payload.vendorSub || '',
      'buildID': event.buildID || payload.buildID || '',
      'plugins_count': event.plugins_count || payload.plugins_count || 0,
      'plugins': (event.plugins && event.plugins.join(', ')) || (payload.plugins && payload.plugins.join(', ')) || '',
      'mimeTypes_count': event.mimeTypes_count || payload.mimeTypes_count || 0,
      'webdriver': event.webdriver || payload.webdriver || false,
      'connection_effective_type': event.connection_effective_type || payload.connection_effective_type || '',
      'fonts': (event.fonts && event.fonts.join(', ')) || (payload.fonts && payload.fonts.join(', ')) || '',
      'fonts_count': (typeof event.fonts_count !== 'undefined') ? event.fonts_count : (payload.fonts_count || 0),
      'canvas_hash': (event.canvas_hash && event.canvas_hash.slice(0, 200)) || (payload.canvas_hash && payload.canvas_hash.slice(0, 200)) || '',
      'fonts_count': (event.fonts_count || payload.fonts_count) || 0,
      'adblock': (event.adblock !== undefined ? event.adblock : payload.adblock),
      'java_enabled': (typeof event.java_enabled !== 'undefined') ? event.java_enabled : (typeof payload.java_enabled !== 'undefined' ? payload.java_enabled : '')
    };

    const addRow = (name, value) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(name)}</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(value === undefined || value === null ? '' : String(value))}</td>`;
      jsTbody.appendChild(tr);
    };

    Object.keys(jsAttrs).forEach(k => addRow(k, jsAttrs[k]));

    // If we have a canvas preview (data URL), attach it inside the canvas_hash row's value cell
    try {
      const preview = payload.canvas_preview || (event && event.canvas_preview);
      if (preview) {
        // Find the row for canvas_hash in the JS attributes table
        const rows = document.querySelectorAll('#js-attrs tbody tr');
        for (let i = 0; i < rows.length; i++) {
          try {
            const firstTd = rows[i].querySelector('td');
            if (!firstTd) continue;
            const key = (firstTd.textContent || '').trim();
            if (key === 'canvas_hash') {
              const valueTd = rows[i].querySelectorAll('td')[1];
              if (valueTd) {
                const img = document.createElement('img');
                img.src = preview;
                img.alt = 'canvas preview';
                img.style.maxWidth = '160px';
                img.style.marginLeft = '12px';
                img.style.verticalAlign = 'middle';
                valueTd.appendChild(img);
              }
              break;
            }
          } catch (e) { /* ignore per-row errors */ }
        }
      }
    } catch (e) {}

    // Add a toggle button to show/hide the full JSON response
    const rawBtn = document.createElement('button');
    rawBtn.type = 'button';
    rawBtn.textContent = 'Show raw data';
    rawBtn.style.display = 'inline-block';
    rawBtn.style.marginTop = '12px';
    rawBtn.style.marginRight = '8px';

    const pre = document.createElement('pre');
    pre.style.marginTop = '12px';
    pre.style.display = 'none';
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = JSON.stringify(data, null, 2);

    rawBtn.addEventListener('click', () => {
      const isHidden = pre.style.display === 'none';
      pre.style.display = isHidden ? '' : 'none';
      rawBtn.textContent = isHidden ? 'Hide raw data' : 'Show raw data';
    });

    resultEl.appendChild(rawBtn);
    resultEl.appendChild(pre);

  } catch (err) {
    document.getElementById('result').textContent = 'Error: ' + err;
  }
}

document.getElementById('send').addEventListener('click', sendFingerprint);
