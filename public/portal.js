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
      message.classList.remove('form-error');
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

  const [dashboard, directoryResponse] = await Promise.all([
    Fox.api('/api/dashboard'),
    Fox.api('/api/directory')
  ]);

  portalContent.hidden = false;
  const user = dashboard.user;
  const roleLabel = Fox.formatRole(user.role);

  document.querySelector('#welcome-name').textContent = `Welcome, ${user.fullName}`;
  document.querySelector('#welcome-role').textContent = roleLabel;
  document.querySelector('#profile-name').textContent = user.fullName;
  document.querySelector('#profile-title').textContent = roleLabel;
  document.querySelector('#profile-id').textContent = user.employeeId;
  document.querySelector('#profile-role').textContent = roleLabel;
  document.querySelector('#profile-initials').textContent = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const departmentRow = document.querySelector('#profile-department-row');
  if (user.role === 'administrator' || !user.department) {
    departmentRow.hidden = true;
  } else {
    document.querySelector('#profile-department').textContent = user.department;
  }

  if (user.role === 'administrator') document.querySelector('#admin-link').hidden = false;

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

  const directory = directoryResponse.employees;

  function renderDirectory(filter = '') {
    const needle = filter.trim().toLowerCase();
    const visible = directory.filter((employee) => {
      const values = [employee.fullName, employee.role, employee.department].filter(Boolean);
      return !needle || values.some((value) => String(value).toLowerCase().includes(needle));
    });

    const grid = document.querySelector('#directory-grid');
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state directory-empty';
      empty.innerHTML = '<strong>No matching employees.</strong><span>Try a different name, role, or department.</span>';
      grid.replaceChildren(empty);
      return;
    }

    grid.replaceChildren(...visible.map((employee) => {
      const card = document.createElement('article');
      card.className = 'person-card';

      const avatar = document.createElement('div');
      avatar.className = 'person-avatar';
      avatar.textContent = employee.fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');

      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = employee.fullName;
      const role = document.createElement('span');
      role.textContent = Fox.formatRole(employee.role);
      const meta = document.createElement('small');
      meta.textContent = employee.role === 'administrator' || !employee.department
        ? 'Organization-wide'
        : employee.department;
      info.append(name, role, meta);
      card.append(avatar, info);
      return card;
    }));
  }

  document.querySelector('#directory-search').addEventListener('input', (event) => renderDirectory(event.target.value));
  renderDirectory();
})();
