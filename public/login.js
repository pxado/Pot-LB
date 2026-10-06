(async () => {
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
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const data = new FormData(form);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: data.get('employeeId'), password: data.get('password') })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sign in failed');
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
