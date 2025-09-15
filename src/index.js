const dataSource = require('./dataSource');
const { connectToDatabase, closeConnection } = require('./database');

async function main() {
    try {
        console.log('Starting application...');
        
        await connectToDatabase();
        console.log('Database connection established successfully!\n');
        
        console.log('--- Database Information ---\n');
        
        console.log('Checking available tables in the database...');
        const tables = await dataSource.executeCustomQuery(`
            SELECT TABLE_SCHEMA, TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        `);
        
        if (tables.length > 0) {
            console.log(`Found ${tables.length} table(s):`);
            tables.forEach(t => {
                console.log(`  - ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
            });
        } else {
            console.log('No tables found in the database.');
        }
        
        console.log('\nChecking database version...');
        const version = await dataSource.executeCustomQuery('SELECT @@VERSION AS Version');
        console.log('SQL Server Version:', version[0].Version.split('\n')[0]);
        
    } catch (error) {
        console.error('Application error:', error.message);
    } finally {
        await closeConnection();
        console.log('\nApplication shutdown complete');
    }
}

if (require.main === module) {
    main();
}

module.exports = { dataSource };