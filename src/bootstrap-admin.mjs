import { config } from './config.mjs';
import { openDatabase } from './db.mjs';
import { hashPassword } from './password.mjs';

const employeeId = process.env.FOX_BOOTSTRAP_EMPLOYEE_ID;
const fullName = process.env.FOX_BOOTSTRAP_NAME;
const department = process.env.FOX_BOOTSTRAP_DEPARTMENT;
const password = process.env.FOX_BOOTSTRAP_PASSWORD;

if (!employeeId || !fullName || !department || !password) {
  console.error('Set FOX_BOOTSTRAP_EMPLOYEE_ID, FOX_BOOTSTRAP_NAME, FOX_BOOTSTRAP_DEPARTMENT, and FOX_BOOTSTRAP_PASSWORD.');
  process.exit(1);
}

const store = openDatabase(config.databasePath);
try {
  if (store.countActiveAdmins() > 0) {
    throw new Error('An administrator already exists. Use the admin console to create additional administrators.');
  }
  const admin = store.createEmployee({
    employeeId,
    fullName,
    department,
    role: 'administrator',
    passwordHash: hashPassword(password),
    mustChangePassword: false
  });
  store.addAudit({ action: 'bootstrap_admin_created', targetEmployeePk: admin.id, details: { employeeId: admin.employee_id } });
  console.log(`Administrator created for employee ID ${admin.employee_id}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.close();
}
