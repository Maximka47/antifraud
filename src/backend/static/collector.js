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
