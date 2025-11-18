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
    document.getElementById('result').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    document.getElementById('result').textContent = 'Error: ' + err;
  }
}

document.getElementById('send').addEventListener('click', sendFingerprint);
