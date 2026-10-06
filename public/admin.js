(async () => {
  const session = await Fox.loadSession();
  if (!session) return;
  if (session.user.mustChangePassword) return window.location.replace('/portal');
  if (session.user.role !== 'administrator') return window.location.replace('/portal');

  document.querySelector('#top-user').textContent = `${session.user.fullName} · Administrator`;
  document.querySelector('#logout-button').addEventListener('click', Fox.logout);

  let employees = [];
  let roles = [];
  let editingEmployee = null;

  const createDialog = document.querySelector('#create-dialog');
  const editDialog = document.querySelector('#edit-dialog');
  const resetDialog = document.querySelector('#reset-dialog');
  const createForm = document.querySelector('#create-form');
  const editForm = document.querySelector('#edit-form');
  const resetForm = document.querySelector('#reset-form');

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`).close());
  });

  function setMessage(id, value, error = false) {
    const node = document.querySelector(id);
    node.textContent = value || '';
    node.classList.toggle('form-error', error);
  }

  function fillRoleSelect(select, selected) {
    select.replaceChildren(...roles.map((role) => {
      const option = document.createElement('option');
      option.value = role.key;
      option.textContent = role.label;
      option.selected = selected === role.key;
      return option;
    }));
  }

  function syncDepartmentField(form, fieldId) {
    const role = form.elements.role.value;
    const field = document.querySelector(fieldId);
    const input = form.elements.department;
    const administrator = role === 'administrator';
    field.hidden = administrator;
    input.required = !administrator;
    if (administrator) input.value = '';
  }

  function renderRoles() {
    const grid = document.querySelector('#role-grid');
    grid.replaceChildren(...roles.map((role) => {
      const card = document.createElement('article');
      card.className = 'role-card';
      const title = document.createElement('strong');
      title.textContent = role.label;
      const copy = document.createElement('p');
      copy.textContent = role.description;
      card.append(title, copy);
      return card;
    }));
  }

  function renderEmployees(filter = '') {
    const body = document.querySelector('#employee-table');
    const needle = filter.trim().toLowerCase();
    const visible = employees.filter((employee) => {
      const values = [employee.employeeId, employee.fullName, employee.department, employee.role].filter(Boolean);
      return !needle || values.some((value) => String(value).toLowerCase().includes(needle));
    });

    body.replaceChildren(...visible.map((employee) => {
      const row = document.createElement('tr');
      const department = employee.role === 'administrator' ? '' : (employee.department ?? '');
      const values = [employee.employeeId, employee.fullName, department, Fox.formatRole(employee.role)];

      values.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index === 2 && !value) cell.className = 'empty-cell';
        row.append(cell);
      });

      const status = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = `status-pill ${employee.active ? 'status-active' : 'status-inactive'}`;
      pill.textContent = employee.active ? 'Active' : 'Inactive';
      status.append(pill);
      row.append(status);

      const lastLogin = document.createElement('td');
      lastLogin.textContent = Fox.formatDate(employee.lastLoginAt);
      row.append(lastLogin);

      const actions = document.createElement('td');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'action-link';
      edit.textContent = 'Manage';
      edit.addEventListener('click', () => openEdit(employee));
      actions.append(edit);
      row.append(actions);
      return row;
    }));
  }

  function renderAuthEvents(events) {
    const body = document.querySelector('#auth-event-table');
    body.replaceChildren(...events.map((event) => {
      const row = document.createElement('tr');
      const time = document.createElement('td');
      time.textContent = Fox.formatDate(event.created_at);

      const employee = document.createElement('td');
      employee.textContent = event.employee_id_input || '—';

      const outcome = document.createElement('td');
      const pill = document.createElement('span');
      const success = event.outcome === 'success';
      pill.className = `status-pill ${success ? 'status-active' : 'status-inactive'}`;
      pill.textContent = event.outcome.replace('_', ' ');
      outcome.append(pill);

      const ip = document.createElement('td');
      ip.textContent = event.client_ip || '—';

      const device = document.createElement('td');
      device.textContent = event.device_id ? event.device_id.slice(0, 12) : '—';
      if (event.device_id) device.title = event.device_id;

      const edge = document.createElement('td');
      edge.textContent = event.railway_edge || '—';

      row.append(time, employee, outcome, ip, device, edge);
      return row;
    }));
  }

  function renderAudit(events) {
    const list = document.querySelector('#audit-list');
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>No administrative activity yet.</strong><span>Account and access changes will be recorded here.</span>';
      list.replaceChildren(empty);
      return;
    }

    list.replaceChildren(...events.map((event) => {
      const item = document.createElement('article');
      item.className = 'audit-event';
      const code = document.createElement('code');
      code.textContent = event.action;
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = event.target_name ? `${event.target_name} (${event.target_employee_id})` : 'Organization event';
      const actor = document.createElement('span');
      actor.textContent = event.actor_name ? `By ${event.actor_name} (${event.actor_employee_id})` : 'System bootstrap';
      detail.append(title, actor);
      const time = document.createElement('time');
      time.textContent = Fox.formatDate(event.created_at);
      item.append(code, detail, time);
      return item;
    }));
  }

  async function refresh() {
    const [overview, employeeResponse, authResponse, auditResponse] = await Promise.all([
      Fox.api('/api/admin/overview'),
      Fox.api('/api/admin/employees'),
      Fox.api('/api/admin/auth-events?limit=50'),
      Fox.api('/api/admin/audit?limit=30')
    ]);

    employees = employeeResponse.employees;
    document.querySelector('#stat-employees').textContent = overview.totals.employees;
    document.querySelector('#stat-active').textContent = overview.totals.activeEmployees;
    document.querySelector('#stat-departments').textContent = overview.totals.departments;
    document.querySelector('#stat-admins').textContent = overview.totals.activeAdministrators;
    renderEmployees(document.querySelector('#employee-search').value);
    renderAuthEvents(authResponse.events);
    renderAudit(auditResponse.events);
  }

  function openEdit(employee) {
    editingEmployee = employee;
    editForm.elements.id.value = employee.id;
    editForm.elements.employeeId.value = employee.employeeId;
    editForm.elements.fullName.value = employee.fullName;
    fillRoleSelect(editForm.elements.role, employee.role);
    editForm.elements.department.value = employee.department ?? '';
    editForm.elements.active.checked = employee.active;
    syncDepartmentField(editForm, '#edit-department-field');
    setMessage('#edit-message', '');
    editDialog.showModal();
  }

  const roleResponse = await Fox.api('/api/meta/roles');
  roles = roleResponse.roles;
  fillRoleSelect(document.querySelector('#create-role'), 'employee');
  fillRoleSelect(document.querySelector('#edit-role'));
  renderRoles();
  await refresh();

  createForm.elements.role.addEventListener('change', () => syncDepartmentField(createForm, '#create-department-field'));
  editForm.elements.role.addEventListener('change', () => syncDepartmentField(editForm, '#edit-department-field'));

  document.querySelector('#employee-search').addEventListener('input', (event) => renderEmployees(event.target.value));

  document.querySelector('#open-create').addEventListener('click', () => {
    createForm.reset();
    fillRoleSelect(document.querySelector('#create-role'), 'employee');
    syncDepartmentField(createForm, '#create-department-field');
    setMessage('#create-message', '');
    createDialog.showModal();
  });

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(createForm);
    const role = data.get('role');
    setMessage('#create-message', '');
    try {
      await Fox.api('/api/admin/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: data.get('employeeId'),
          fullName: data.get('fullName'),
          department: role === 'administrator' ? null : data.get('department'),
          role,
          password: data.get('password')
        })
      });
      createDialog.close();
      await refresh();
    } catch (error) {
      setMessage('#create-message', error.message, true);
    }
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(editForm);
    const role = data.get('role');
    setMessage('#edit-message', '');
    try {
      await Fox.api(`/api/admin/employees/${data.get('id')}`, {
        method: 'PATCH',
        body: JSON.stringify({
          employeeId: data.get('employeeId'),
          fullName: data.get('fullName'),
          department: role === 'administrator' ? null : data.get('department'),
          role,
          active: editForm.elements.active.checked
        })
      });
      editDialog.close();
      await refresh();
    } catch (error) {
      setMessage('#edit-message', error.message, true);
    }
  });

  document.querySelector('#open-reset').addEventListener('click', () => {
    if (!editingEmployee) return;
    resetForm.reset();
    resetForm.elements.id.value = editingEmployee.id;
    document.querySelector('#reset-target').textContent = `${editingEmployee.fullName} · ${editingEmployee.employeeId}`;
    setMessage('#reset-message', '');
    editDialog.close();
    resetDialog.showModal();
  });

  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(resetForm);
    setMessage('#reset-message', '');
    try {
      await Fox.api(`/api/admin/employees/${data.get('id')}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: data.get('password') })
      });
      resetDialog.close();
      await refresh();
    } catch (error) {
      setMessage('#reset-message', error.message, true);
    }
  });
})();
