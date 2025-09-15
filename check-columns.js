const dataSource = require('./src/dataSource');
const { connectToDatabase, closeConnection } = require('./src/database');

async function checkColumns() {
    try {
        await connectToDatabase();
        console.log('Checking columns in sys_user_master table...\n');
        
        const columns = await dataSource.executeCustomQuery(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'sys_user_master'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('Columns in sys_user_master:');
        columns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await closeConnection();
    }
}

checkColumns();