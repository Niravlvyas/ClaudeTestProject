const sql = require('mssql');
require('dotenv').config();
const errorFilter = require('./errorFilter');

const config = {
    server: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Configuration for dw_production database
const dwProductionConfig = {
    server: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'dw_production',
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;
let dwProductionPool = null;

async function connectToDatabase() {
    try {
        if (!pool) {
            pool = await sql.connect(config);
            console.log('Connected to SQL Server database');
        }
        return pool;
    } catch (error) {
        const handling = errorFilter.logError(error, 'Database Connection');
        if (handling.shouldThrow) {
            throw error;
        }
    }
}

async function connectToDwProduction() {
    try {
        if (!dwProductionPool) {
            dwProductionPool = new sql.ConnectionPool(dwProductionConfig);
            await dwProductionPool.connect();
            console.log('Connected to dw_production database');
        }
        return dwProductionPool;
    } catch (error) {
        const handling = errorFilter.logError(error, 'DW Production Connection');
        if (handling.shouldThrow) {
            throw error;
        }
    }
}

async function closeConnection() {
    try {
        if (pool) {
            await pool.close();
            pool = null;
            console.log('Database connection closed');
        }
        if (dwProductionPool) {
            await dwProductionPool.close();
            dwProductionPool = null;
            console.log('dw_production database connection closed');
        }
    } catch (error) {
        console.error('Error closing database connection:', error);
    }
}

async function query(queryString, params = {}) {
    try {
        const pool = await connectToDatabase();
        const request = pool.request();
        
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        
        const result = await request.query(queryString);
        return result.recordset;
    } catch (error) {
        const handling = errorFilter.logError(error, 'Query Execution');
        if (handling.shouldThrow) {
            throw error;
        }
        return [];
    }
}

async function queryDwProduction(queryString, params = {}) {
    try {
        const pool = await connectToDwProduction();
        const request = pool.request();
        
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        
        const result = await request.query(queryString);
        return result.recordset;
    } catch (error) {
        const handling = errorFilter.logError(error, 'DW Production Query');
        if (handling.shouldThrow) {
            throw error;
        }
        return [];
    }
}

async function executeStoredProcedure(procedureName, params = {}) {
    try {
        const pool = await connectToDatabase();
        const request = pool.request();
        
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }
        
        const result = await request.execute(procedureName);
        return result.recordset;
    } catch (error) {
        const handling = errorFilter.logError(error, 'Stored Procedure');
        if (handling.shouldThrow) {
            throw error;
        }
        return [];
    }
}

module.exports = {
    connectToDatabase,
    connectToDwProduction,
    closeConnection,
    query,
    queryDwProduction,
    executeStoredProcedure,
    sql
};