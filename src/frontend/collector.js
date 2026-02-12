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
    language: navigator.language,
    metadata: {
      platform: navigator.platform,
      languages: navigator.languages || [navigator.language]
    }
  };

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
    const addRow = (name, value) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee"><strong>${name}</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${value === undefined || value === null ? '' : value}</td>`;
      jsTbody.appendChild(tr);
    };

    addRow('user_agent', event.user_agent || payload.user_agent);
    addRow('timezone', event.timezone || payload.timezone);
    addRow('language', event.language || payload.language);
    if (event.metadata || payload.metadata) {
      const meta = event.metadata || payload.metadata;
      addRow('platform', meta.platform || '');
      addRow('languages', Array.isArray(meta.languages) ? meta.languages.join(', ') : meta.languages);
    }

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
