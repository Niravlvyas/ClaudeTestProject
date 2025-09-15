const dataSource = require('./src/dataSource');
const { connectToDatabase, closeConnection } = require('./src/database');

async function checkPharmacyColumns() {
    try {
        await connectToDatabase();
        console.log('Checking columns in pharmacy_master table...\n');
        
        const columns = await dataSource.executeCustomQuery(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'pharmacy_master'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('Columns in pharmacy_master:');
        columns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await closeConnection();
    }
}

checkPharmacyColumns();