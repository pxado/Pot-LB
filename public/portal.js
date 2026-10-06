(async () => {
  const session = await Fox.loadSession();
  if (!session) return;

  document.querySelector('#top-user').textContent = `${session.user.fullName} · ${Fox.formatRole(session.user.role)}`;
  document.querySelector('#logout-button').addEventListener('click', Fox.logout);

  const passwordPanel = document.querySelector('#password-required');
  const portalContent = document.querySelector('#portal-content');

  if (session.user.mustChangePassword) {
    passwordPanel.hidden = false;
    portalContent.hidden = true;
    const form = document.querySelector('#change-password-form');
    const message = document.querySelector('#password-message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = '';
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const data = new FormData(form);
        await Fox.api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') })
        });
        message.textContent = 'Password changed. Sign in again with your new password.';
        setTimeout(() => window.location.replace('/login'), 900);
      } catch (error) {
        message.textContent = error.message;
        message.classList.add('form-error');
      } finally {
        submit.disabled = false;
      }
    });
    return;
  }

  const dashboard = await Fox.api('/api/dashboard');
  portalContent.hidden = false;
  document.querySelector('#welcome-name').textContent = `Welcome, ${dashboard.user.fullName}`;
  document.querySelector('#welcome-role').textContent = Fox.formatRole(dashboard.user.role);
  document.querySelector('#department-chip').textContent = dashboard.user.department;
  if (dashboard.user.role === 'administrator') document.querySelector('#admin-link').hidden = false;

  const moduleGrid = document.querySelector('#module-grid');
  moduleGrid.replaceChildren(...dashboard.modules.map((module, index) => {
    const card = document.createElement('article');
    card.className = 'module-card';
    const marker = document.createElement('span');
    marker.textContent = String(index + 1).padStart(2, '0');
    const heading = document.createElement('h3');
    heading.textContent = module.title;
    const description = document.createElement('p');
    description.textContent = module.description;
    card.append(marker, heading, description);
    return card;
  }));
})();
