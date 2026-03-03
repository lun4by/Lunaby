const mariadb = require('mariadb');
const logger = require('../../utils/logger');

class MariaDBClient {
    constructor() {
        this.pool = null;
    }

    async connect() {
        if (this.pool) return this.pool;

        const host = process.env.MARIADB_HOST || 'localhost';
        const port = parseInt(process.env.MARIADB_PORT || '3306');
        const user = process.env.MARIADB_USER || 'root';
        const password = process.env.MARIADB_PASSWORD || '';
        const database = process.env.MARIADB_DATABASE || 'lunaby';

        this.pool = mariadb.createPool({
            host,
            port,
            user,
            password,
            database,
            connectionLimit: 10,
            acquireTimeout: 10000,
            connectTimeout: 10000,
            charset: 'utf8mb4'
        });

        let conn;
        try {
            conn = await this.pool.getConnection();
            logger.info('MARIADB', `Connected to MariaDB`);
        } finally {
            if (conn) conn.release();
        }

        return this.pool;
    }

    async query(sql, params = []) {
        if (!this.pool) throw new Error('MariaDB not connected. Call connect() first.');
        let conn;
        try {
            conn = await this.pool.getConnection();
            const result = await conn.query(sql, params);
            return result;
        } finally {
            if (conn) conn.release();
        }
    }

    async execute(sql, params = []) {
        return this.query(sql, params);
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            logger.info('MARIADB', 'Connection pool closed');
        }
    }
}

module.exports = new MariaDBClient();
