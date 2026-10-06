export const ROLE_DEFINITIONS = Object.freeze([
  {
    key: 'administrator',
    label: 'Administrator',
    description: 'Full organization and access management.',
    permissions: ['*'],
    modules: ['overview', 'people', 'operations', 'quality', 'support', 'documents']
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Team coordination, reporting, and operational oversight.',
    permissions: ['portal.use'],
    modules: ['overview', 'people', 'operations', 'quality', 'documents']
  },
  {
    key: 'operations_engineer',
    label: 'Operations Engineer',
    description: 'Automation line, device, and production operations.',
    permissions: ['portal.use'],
    modules: ['overview', 'operations', 'quality', 'documents']
  },
  {
    key: 'robotics_technician',
    label: 'Robotics Technician',
    description: 'Robotics maintenance, diagnostics, and floor support.',
    permissions: ['portal.use'],
    modules: ['overview', 'operations', 'documents']
  },
  {
    key: 'qa_analyst',
    label: 'QA Analyst',
    description: 'Quality checks, anomaly review, and product verification.',
    permissions: ['portal.use'],
    modules: ['overview', 'quality', 'documents']
  },
  {
    key: 'support_executive',
    label: 'Support Executive',
    description: 'Customer support, service coordination, and documentation.',
    permissions: ['portal.use'],
    modules: ['overview', 'support', 'documents']
  },
  {
    key: 'employee',
    label: 'Employee',
    description: 'Standard employee workspace access.',
    permissions: ['portal.use'],
    modules: ['overview', 'documents']
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
