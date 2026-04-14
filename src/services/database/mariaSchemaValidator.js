const path = require('path');
const mariaClient = require('./mariaClient');

const SCHEMA_SQL_PATH = path.join('database', 'schema', 'mariadb_schema.sql');

async function findMissingTables(tables) {
  const missing = [];

  for (const tableName of tables) {
    const rows = await mariaClient.query('SHOW TABLES LIKE ?', [tableName]);
    if (!rows.length) {
      missing.push(tableName);
    }
  }

  return missing;
}

async function ensureMariaTables(tableNames, contextLabel = 'schema') {
  const missingTables = await findMissingTables(tableNames);
  if (!missingTables.length) {
    return true;
  }

  const missingText = missingTables.join(', ');
  throw new Error(
    `[${contextLabel}] Missing MariaDB tables: ${missingText}. ` +
    `Import schema first: ${SCHEMA_SQL_PATH}`
  );
}

module.exports = {
  SCHEMA_SQL_PATH,
  ensureMariaTables,
};