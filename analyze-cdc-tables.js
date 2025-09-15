const dataSource = require('./src/dataSource');
const { connectToDatabase, closeConnection } = require('./src/database');

async function analyzeTransactionalData() {
    try {
        await connectToDatabase();
        console.log('=== ANALYZING TRANSACTIONAL DATA TABLES ===\n');
        
        // Analyze cdc_dispense_data structure
        console.log('📊 CDC_DISPENSE_DATA Table Structure:');
        console.log('=====================================');
        const dispenseColumns = await dataSource.executeCustomQuery(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'cdc_dispense_data'
            ORDER BY ORDINAL_POSITION
        `);
        
        dispenseColumns.forEach(col => {
            const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Get sample data counts
        const dispenseCount = await dataSource.executeCustomQuery('SELECT COUNT(*) as total FROM cdc_dispense_data');
        console.log(`\n📈 Total Records: ${dispenseCount[0]?.total || 0}`);
        
        // Sample records
        const dispenseSample = await dataSource.executeCustomQuery('SELECT TOP 3 * FROM cdc_dispense_data');
        console.log(`\n🔍 Sample Records (showing first 3):`);
        if (dispenseSample.length > 0) {
            console.log(JSON.stringify(dispenseSample, null, 2));
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Analyze cdc_patient_data structure
        console.log('👥 CDC_PATIENT_DATA Table Structure:');
        console.log('====================================');
        const patientColumns = await dataSource.executeCustomQuery(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'cdc_patient_data'
            ORDER BY ORDINAL_POSITION
        `);
        
        patientColumns.forEach(col => {
            const length = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : '';
            console.log(`  - ${col.COLUMN_NAME}: ${col.DATA_TYPE}${length} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });
        
        // Get sample data counts
        const patientCount = await dataSource.executeCustomQuery('SELECT COUNT(*) as total FROM cdc_patient_data');
        console.log(`\n📈 Total Records: ${patientCount[0]?.total || 0}`);
        
        // Sample records
        const patientSample = await dataSource.executeCustomQuery('SELECT TOP 3 * FROM cdc_patient_data');
        console.log(`\n🔍 Sample Records (showing first 3):`);
        if (patientSample.length > 0) {
            console.log(JSON.stringify(patientSample, null, 2));
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Basic analytics queries
        console.log('📊 BASIC ANALYTICS INSIGHTS:');
        console.log('============================');
        
        try {
            // Date range analysis
            const dateRange = await dataSource.executeCustomQuery(`
                SELECT 
                    MIN(DispenseDate) as EarliestDate,
                    MAX(DispenseDate) as LatestDate,
                    COUNT(DISTINCT DispenseDate) as UniqueDays
                FROM cdc_dispense_data 
                WHERE DispenseDate IS NOT NULL
            `);
            
            if (dateRange.length > 0) {
                console.log('📅 Date Range Analysis:');
                console.log(`   Earliest: ${dateRange[0].EarliestDate}`);
                console.log(`   Latest: ${dateRange[0].LatestDate}`);
                console.log(`   Unique Days: ${dateRange[0].UniqueDays}`);
            }
        } catch (e) {
            console.log('⚠️  Date analysis failed (DispenseDate column may not exist)');
        }
        
        try {
            // Pharmacy distribution
            const pharmacyStats = await dataSource.executeCustomQuery(`
                SELECT 
                    PharmacyID,
                    COUNT(*) as TotalDispenses
                FROM cdc_dispense_data 
                WHERE PharmacyID IS NOT NULL
                GROUP BY PharmacyID
                ORDER BY TotalDispenses DESC
            `);
            
            if (pharmacyStats.length > 0) {
                console.log('\n🏪 Top Pharmacies by Dispenses:');
                pharmacyStats.slice(0, 5).forEach((p, i) => {
                    console.log(`   ${i+1}. ${p.PharmacyID}: ${p.TotalDispenses} dispenses`);
                });
            }
        } catch (e) {
            console.log('⚠️  Pharmacy analysis failed (PharmacyID column may not exist)');
        }
        
    } catch (error) {
        console.error('❌ Analysis Error:', error.message);
    } finally {
        await closeConnection();
    }
}

analyzeTransactionalData();