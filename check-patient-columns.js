const { query, closeConnection } = require('./src/database');

async function checkPatientColumns() {
    try {
        console.log('Checking columns in cdc_patient_data table...\n');
        
        const columns = await query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'cdc_patient_data'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('Columns in cdc_patient_data:');
        columns.forEach(col => {
            console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
        
        // Also check if we have any data
        const sampleData = await query(`
            SELECT TOP 5 * FROM cdc_patient_data
        `);
        
        console.log('\nSample data (first 5 rows):');
        console.log(sampleData);
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await closeConnection();
    }
}

checkPatientColumns();