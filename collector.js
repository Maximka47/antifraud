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

// Create a small similarity bubble element (colored by percentage)
function createSimBubble(pct) {
  const span = document.createElement('span');
  span.className = 'sim-bubble';
  // apply inline styles to ensure bubble appearance across environments
  span.style.display = 'inline-block';
  span.style.padding = '4px 8px';
  span.style.borderRadius = '999px';
  span.style.fontSize = '12px';
  span.style.fontWeight = '600';
  span.style.color = '#ffffff';
  span.style.minWidth = '36px';
  span.style.textAlign = 'center';
  span.style.lineHeight = '1';
  span.style.verticalAlign = 'middle';
  span.style.boxShadow = '0 1px 0 rgba(0,0,0,0.05)';

  if (pct === '' || pct === null || typeof pct === 'undefined') {
    span.style.background = 'transparent';
    span.style.color = 'var(--muted)';
    span.textContent = '';
    return span;
  }

  const n = parseInt(pct, 10);
  const nn = Number.isNaN(n) ? 0 : n;
  let bg = '#9ca3ff'; // default blue
  if (nn >= 85) bg = '#10b981'; // green
  else if (nn >= 60) bg = '#f59e0b'; // amber
  else if (nn > 0) bg = '#ef4444'; // red
  span.style.background = bg;
  span.textContent = String(nn) + '%';
  return span;
}

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

    // Ordered attributes to show first (headerName, compareKey, label)
    const ordered = [
      ['user-agent', 'user_agent', 'User agent'],
      ['accept', 'accept', 'Accept'],
      ['accept-encoding', 'content_encoding', 'Content encoding'],
      ['accept-language', 'language', 'Content language'],
      ['if-none-match', 'if_none_match', 'If none match'],
      ['upgrade-insecure-requests', 'upgrade_insecure_requests', 'Upgrade Insecure Requests'],
      ['referer', 'referer', 'Referer']
    ];

    const seen = new Set();
    ordered.forEach(([key, attrKey, label]) => {
      const value = headers[key] || '';
      seen.add(key);
      const tr = document.createElement('tr');
      tr.dataset.attr = attrKey || key;
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(label)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(String(value))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee"></td>
      `;
      httpTbody.appendChild(tr);
    });

    // Append any other headers that were not in the ordered list into the collapsible other-headers table
    const otherTbody = document.querySelector('#other-headers-table tbody');
    otherTbody.innerHTML = '';
    Object.keys(headers).forEach(key => {
      if (seen.has(key)) return;
      const tr = document.createElement('tr');
      tr.dataset.attr = key;
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(key)}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(String(headers[key]))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee"></td>
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
      tr.dataset.attr = name;
      tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(name)}</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(value === undefined || value === null ? '' : String(value))}</td><td style="padding:8px;border-bottom:1px solid #eee"></td>`;
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

    // Request similarity comparison from the backend and render results
    try {
      const cmpRes = await fetch('/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
        if (cmpRes.ok) {
        const cmpJson = await cmpRes.json();
        // Render similarity section at bottom of page
        let simSection = document.getElementById('similarity-section');
        if (!simSection) {
          simSection = document.createElement('section');
          simSection.id = 'similarity-section';
          simSection.style.marginTop = '18px';
        } else {
          simSection.innerHTML = '';
        }
        const h = document.createElement('h2');
        h.textContent = 'Similarity Matches (top 10)';
        simSection.appendChild(h);

        // Extract matches and uniques from response
        const matches = cmpJson.matches || [];
        // Render the 5 most unique IDs (returned as `unique_ids`)
        const uniques = cmpJson.unique_ids || [];
        if (uniques.length === 0) {
          const p = document.createElement('p');
          p.textContent = 'No unique IDs found.';
          simSection.appendChild(p);
        } else {
          const list = document.createElement('div');
          list.style.display = 'flex';
          list.style.flexDirection = 'column';
          list.style.gap = '8px';
          uniques.forEach(u => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'flex-start';
            row.style.border = '1px solid #f0f0f0';
            row.style.padding = '8px';
            row.style.borderRadius = '6px';

            const left = document.createElement('div');
            left.style.maxWidth = '80%';
            left.style.wordBreak = 'break-all';
            const title = document.createElement('div');
            title.innerHTML = `<strong>${escapeHtml(u.id || '')}</strong>`;
            left.appendChild(title);

            // attributes details
            const details = document.createElement('details');
            details.style.marginTop = '6px';
            const summary = document.createElement('summary');
            summary.textContent = 'Attributes';
            details.appendChild(summary);

            const tbl = document.createElement('table');
            tbl.style.width = '100%';
            tbl.style.borderCollapse = 'collapse';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Attribute</th><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Value</th><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd;">Similarity</th></tr>';
            tbl.appendChild(thead);
            const tb = document.createElement('tbody');
            const attrs = u.attributes || {};
            const perObj = u.per_attribute || {};
            Object.keys(attrs).forEach(k => {
              try {
                const tr = document.createElement('tr');
                const tdK = document.createElement('td');
                tdK.style.padding = '6px';
                tdK.style.borderBottom = '1px solid #f5f5f5';
                tdK.style.width = '40%';
                tdK.innerHTML = `<strong>${escapeHtml(k)}</strong>`;

                const tdV = document.createElement('td');
                tdV.style.padding = '6px';
                tdV.style.borderBottom = '1px solid #f5f5f5';
                let val = attrs[k];
                if (Array.isArray(val)) val = val.join(', ');
                if (val === null || typeof val === 'undefined') val = '';
                tdV.textContent = String(val);

                const tdS = document.createElement('td');
                tdS.style.padding = '6px';
                tdS.style.borderBottom = '1px solid #f5f5f5';
                const simVal = typeof perObj[k] !== 'undefined' ? perObj[k] : '';
                tdS.appendChild(createSimBubble(simVal));

                tr.appendChild(tdK);
                tr.appendChild(tdV);
                tr.appendChild(tdS);
                tb.appendChild(tr);
              } catch (e) {}
            });
            tbl.appendChild(tb);
            details.appendChild(tbl);
            left.appendChild(details);

            const right = document.createElement('div');
            right.style.marginLeft = '12px';
            right.appendChild(createSimBubble(u.uniqueness));

            row.appendChild(left);
            row.appendChild(right);
            list.appendChild(row);
          });
          simSection.appendChild(list);
        }

        // Append (or move) similarity section to bottom of main container
        const container = document.querySelector('.container') || document.body;
        container.appendChild(simSection);

        // Fill similarity cells in existing tables from the top match (if any)
        if (matches.length > 0) {
          const top = matches[0];
          const perTop = top.per_attribute || {};

          // JS table rows
          const jsRows = document.querySelectorAll('#js-attrs tbody tr');
          jsRows.forEach(r => {
            try {
              const attr = r.dataset.attr;
              const tds = r.querySelectorAll('td');
              if (!tds || tds.length < 3) return;
              const raw = (typeof perTop[attr] !== 'undefined' && perTop[attr] !== '') ? perTop[attr] : (cmpJson.incoming_similarity && typeof cmpJson.incoming_similarity[attr] !== 'undefined' ? cmpJson.incoming_similarity[attr] : '');
              tds[2].innerHTML = '';
              tds[2].appendChild(createSimBubble(raw));
            } catch (e) {}
          });

          // HTTP ordered rows
          const httpRows = document.querySelectorAll('#http-attrs tbody tr');
          httpRows.forEach(r => {
            try {
              const attr = r.dataset.attr;
              const tds = r.querySelectorAll('td');
              if (!tds || tds.length < 3) return;
              const raw = (typeof perTop[attr] !== 'undefined' && perTop[attr] !== '') ? perTop[attr] : (cmpJson.incoming_similarity && typeof cmpJson.incoming_similarity[attr] !== 'undefined' ? cmpJson.incoming_similarity[attr] : '');
              tds[2].innerHTML = '';
              tds[2].appendChild(createSimBubble(raw));
            } catch (e) {}
          });

          // Other headers rows
          const otherRows = document.querySelectorAll('#other-headers-table tbody tr');
          otherRows.forEach(r => {
            try {
              const attr = r.dataset.attr;
              const tds = r.querySelectorAll('td');
              if (!tds || tds.length < 3) return;
              const raw = (typeof perTop[attr] !== 'undefined' && perTop[attr] !== '') ? perTop[attr] : (cmpJson.incoming_similarity && typeof cmpJson.incoming_similarity[attr] !== 'undefined' ? cmpJson.incoming_similarity[attr] : '');
              tds[2].innerHTML = '';
              tds[2].appendChild(createSimBubble(raw));
            } catch (e) {}
          });
        }
      }
    } catch (e) {
      // ignore compare errors
    }

  } catch (err) {
    document.getElementById('result').textContent = 'Error: ' + err;
  }
}

document.getElementById('send').addEventListener('click', sendFingerprint);
