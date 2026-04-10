import mariadb, { type Pool } from 'mariadb'

let pool: Pool | null = null

export function getMariaPool() {
  if (pool) {
    return pool
  }

  const config = useRuntimeConfig()

  pool = mariadb.createPool({
    host: config.mariadbHost,
    port: config.mariadbPort,
    user: config.mariadbUser,
    password: config.mariadbPassword,
    database: config.mariadbDatabase,
    connectionLimit: 8,
    acquireTimeout: 10000,
    connectTimeout: 10000,
    charset: 'utf8mb4',
  })

  return pool
}

export async function dbQuery<T = Record<string, any>>(sql: string, params: unknown[] = []) {
  const connection = await getMariaPool().getConnection()

  try {
    return await connection.query<T[]>(sql, params)
  } finally {
    connection.release()
  }
}
