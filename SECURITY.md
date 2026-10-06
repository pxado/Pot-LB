# Security

Fox Pvt. Ltd. credentials, tokens, private keys, database files, and production environment files must never be committed to this repository.

Employee passwords are stored only as salted scrypt hashes. Session cookies are HttpOnly and SameSite=Strict. Administrative actions are role-gated and written to the audit log.

The repository intentionally contains no default employee or administrator credentials. The first administrator is created through the bootstrap command using environment variables.

Report security issues privately to the repository maintainers. Do not place sensitive details in public issues.
