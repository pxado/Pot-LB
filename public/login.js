(async () => {
  const DEVICE_KEY = 'fox_device_id';
  const ATTEMPT_KEY = 'fox_login_attempts';
  const CLIENT_ATTEMPT_LIMIT = 5;
  const CLIENT_WINDOW_MS = 30_000;

  function getDeviceId() {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `fox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
  }

  function readAttempts() {
    const now = Date.now();
    let values = [];
    try {
      values = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '[]');
    } catch {}
    values = Array.isArray(values) ? values.filter((time) => Number.isFinite(time) && now - time < CLIENT_WINDOW_MS) : [];
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(values));
    return values;
  }

  function recordFailure() {
    const values = readAttempts();
    values.push(Date.now());
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(values));
  }

  function clientDelaySeconds() {
    const values = readAttempts();
    if (values.length < CLIENT_ATTEMPT_LIMIT) return 0;
    const remaining = CLIENT_WINDOW_MS - (Date.now() - values[0]);
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  try {
    const response = await fetch('/api/session', { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const session = await response.json();
      if (session.user.mustChangePassword) window.location.replace('/portal');
      else window.location.replace(session.user.role === 'administrator' ? '/admin' : '/portal');
      return;
    }
  } catch {}

  const form = document.querySelector('#login-form');
  const errorNode = document.querySelector('#login-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorNode.hidden = true;

    const localDelay = clientDelaySeconds();
    if (localDelay > 0) {
      errorNode.textContent = `Please wait ${localDelay} seconds before trying again.`;
      errorNode.hidden = false;
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    try {
      const data = new FormData(form);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fox-Device-ID': getDeviceId()
        },
        body: JSON.stringify({ employeeId: data.get('employeeId'), password: data.get('password') })
      });
      const payload = await response.json();

      if (!response.ok) {
        if (response.status === 401) recordFailure();
        throw new Error(payload.error || 'Sign in failed');
      }

      localStorage.removeItem(ATTEMPT_KEY);
      if (payload.user.mustChangePassword) window.location.replace('/portal');
      else window.location.replace(payload.user.role === 'administrator' ? '/admin' : '/portal');
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
})();
