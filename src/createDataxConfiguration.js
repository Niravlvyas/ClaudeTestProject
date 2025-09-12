const { query, sql } = require('./database');

async function createDataxConfigurationTable() {
    try {
        // Drop table if exists and recreate to fix data type issues
        const dropTableQuery = `
            IF EXISTS (SELECT * FROM sysobjects WHERE name='datax_configuration' AND xtype='U')
            BEGIN
                DROP TABLE datax_configuration;
            END
        `;
        
        await query(dropTableQuery);
        
        // Create the datax_configuration table
        const createTableQuery = `
            CREATE TABLE datax_configuration (
                id INT IDENTITY(1,1) PRIMARY KEY,
                patientid VARCHAR(255) NOT NULL,  -- Using varchar to match dispenseid
                storeid BIGINT NOT NULL,          -- Using BIGINT to handle large storeid values
                contactemail VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE()
            );
            
            -- Create indexes for better query performance
            CREATE INDEX IX_datax_configuration_patientid ON datax_configuration(patientid);
            CREATE INDEX IX_datax_configuration_storeid ON datax_configuration(storeid);
        `;
        
        await query(createTableQuery);
        console.log('datax_configuration table created successfully');
        
        // Insert dummy records for each patient in cdc_patient_data
        const insertDummyDataQuery = `
            -- Insert dummy records for each unique patient (dispenseid)
            INSERT INTO datax_configuration (patientid, storeid, contactemail)
            SELECT DISTINCT 
                p.dispenseid as patientid,
                p.storeid,  -- Use actual storeid from patient data
                -- Generate dummy email addresses
                'patient' + p.dispenseid + '@example.com' as contactemail
            FROM cdc_patient_data p
            WHERE p.dispenseid IS NOT NULL;
        `;
        
        const result = await query(insertDummyDataQuery);
        console.log('Dummy data insertion attempted');
        
        // Get count of inserted records
        const countResult = await query('SELECT COUNT(*) as count FROM datax_configuration');
        console.log(`Total records in datax_configuration: ${countResult[0]?.count || 0}`);
        
        return { success: true, recordCount: countResult[0]?.count || 0 };
    } catch (error) {
        console.error('Error creating datax_configuration table:', error);
        throw error;
    }
}

// Run the function if this file is executed directly
if (require.main === module) {
    createDataxConfigurationTable()
        .then(result => {
            console.log('Table creation and data insertion completed:', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('Failed to create table:', error);
            process.exit(1);
        });
}

module.exports = { createDataxConfigurationTable };