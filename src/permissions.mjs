export const ROLE_DEFINITIONS = Object.freeze([
  {
    key: 'administrator',
    label: 'Administrator',
    description: 'Organization-wide account, access, and policy administration.',
    permissions: ['*'],
    modules: ['overview', 'people', 'requests', 'attendance', 'documents']
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Team coordination, approvals, reporting, and operational oversight.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'operations', 'quality', 'documents']
  },
  {
    key: 'operations_engineer',
    label: 'Operations Engineer',
    description: 'Automation line, device, and production operations.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'operations', 'quality', 'documents']
  },
  {
    key: 'robotics_technician',
    label: 'Robotics Technician',
    description: 'Robotics maintenance, diagnostics, and floor support.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'operations', 'documents']
  },
  {
    key: 'qa_analyst',
    label: 'QA Analyst',
    description: 'Quality checks, anomaly review, and product verification.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'quality', 'documents']
  },
  {
    key: 'support_executive',
    label: 'Support Executive',
    description: 'Service coordination, customer support, and documentation.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'support', 'documents']
  },
  {
    key: 'employee',
    label: 'Employee',
    description: 'Standard employee self-service and organization workplace access.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'requests', 'attendance', 'documents']
  }
]);

const roles = new Map(ROLE_DEFINITIONS.map((role) => [role.key, role]));

export function roleExists(role) {
  return roles.has(role);
}

export function getRole(role) {
  return roles.get(role) ?? null;
}

export function hasPermission(role, permission) {
  const definition = getRole(role);
  return Boolean(definition && (definition.permissions.includes('*') || definition.permissions.includes(permission)));
}

export function modulesForRole(role) {
  return getRole(role)?.modules ?? [];
}
