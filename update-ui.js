/* Persistent manual update button for Haunted Hollow. */
(() => {
  if (!('serviceWorker' in navigator) || document.getElementById('hh-update-button')) return;

  const button = document.createElement('button');
  button.id = 'hh-update-button';
  button.type = 'button';
  button.textContent = 'UPDATE PRÜFEN';
  button.setAttribute('aria-label', 'Nach Updates für Haunted Hollow suchen');
  Object.assign(button.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: 'max(56px, calc(env(safe-area-inset-top) + 56px))',
    right: '12px',
    padding: '9px 12px',
    border: '2px solid #ff8a1f',
    borderRadius: '7px',
    background: '#1a0b2e',
    color: '#fff',
    font: 'bold 12px system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 2px 10px #0009'
  });
  document.body.appendChild(button);

  let checking = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  button.addEventListener('click', async () => {
    if (checking) return;
    checking = true;
    button.disabled = true;
    button.textContent = 'SUCHE UPDATE …';
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('Service worker is not registered');
      await registration.update();

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        button.textContent = 'UPDATE WIRD GELADEN …';
        return;
      }

      if (registration.installing) {
        button.textContent = 'UPDATE WIRD GELADEN …';
        registration.installing.addEventListener('statechange', () => {
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
        return;
      }

      button.textContent = 'BEREITS AKTUELL';
    } catch (error) {
      button.textContent = 'ERNEUT VERSUCHEN';
    }

    setTimeout(() => {
      button.textContent = 'UPDATE PRÜFEN';
      button.disabled = false;
      checking = false;
    }, 2500);
  });
})();
