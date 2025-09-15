const { query, closeConnection } = require('./src/database');

async function checkDispenseColumns() {
    try {
        console.log('Checking dispense-related tables...\n');
        
        // Check all tables that might contain dispense data
        const tables = await query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            AND (TABLE_NAME LIKE '%dispense%' OR TABLE_NAME LIKE '%cdc%')
            ORDER BY TABLE_NAME
        `);
        
        console.log('Tables found:');
        tables.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
        
        // Check for a specific dispense table
        const dispenseColumns = await query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME LIKE '%dispense%' AND TABLE_NAME NOT LIKE '%patient%'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        
        if (dispenseColumns.length > 0) {
            console.log('\nColumns in dispense tables:');
            dispenseColumns.forEach(col => {
                console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
            });
        }
        
        // Check if there's a cdc_dispense_data or similar table
        const cdcDispenseColumns = await query(`
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'cdc_dispense_data' OR TABLE_NAME = 'cdc_dispense'
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);
        
        if (cdcDispenseColumns.length > 0) {
            console.log('\nColumns in CDC dispense table:');
            cdcDispenseColumns.forEach(col => {
                console.log(`  - ${col.TABLE_NAME}.${col.COLUMN_NAME} (${col.DATA_TYPE})`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await closeConnection();
    }
}

checkDispenseColumns();