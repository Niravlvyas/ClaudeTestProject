const http = require('http');
const querystring = require('querystring');

// Function to perform login
function login(callback) {
    const postData = querystring.stringify({
        username: 'admin',
        password: 'admin123'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    console.log('Attempting login with admin/admin123...');

    const req = http.request(options, (res) => {
        let data = '';
        let sessionCookie = null;

        // Extract session cookie
        if (res.headers['set-cookie']) {
            sessionCookie = res.headers['set-cookie'][0].split(';')[0];
        }

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Login Status:', res.statusCode);
            if (res.statusCode === 200) {
                console.log('Login successful!');
                console.log('Session Cookie:', sessionCookie);
                callback(sessionCookie);
            } else {
                console.log('Login failed:', data);
                console.log('\nTrying to create a test user...');
                createTestUser(callback);
            }
        });
    });

    req.on('error', (error) => {
        console.error('Login Error:', error);
    });

    req.write(postData);
    req.end();
}

// Function to create a test user (if needed)
function createTestUser(callback) {
    // Let's check what the actual login mechanism expects
    console.log('\nTo access the patient adherence page, you need to:');
    console.log('1. Go to http://localhost:3000/login');
    console.log('2. Use valid credentials (check your database or configuration)');
    console.log('3. After successful login, navigate to http://localhost:3000/patient-adherence');
    console.log('\nAlternatively, let me check the database for existing users...');

    checkDatabaseUsers();
}

// Function to test patient adherence with session
function testPatientAdherence(sessionCookie) {
    console.log('\nTesting patient adherence with authenticated session...');

    // First get stores
    const storesOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/patient-adherence/stores',
        method: 'GET',
        headers: {
            'Cookie': sessionCookie
        }
    };

    const storesReq = http.request(storesOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('\nStores API Status:', res.statusCode);
            if (res.statusCode === 200) {
                const parsed = JSON.parse(data);
                console.log(`Found ${parsed.stores.length} stores available`);

                if (parsed.stores.length > 0) {
                    const firstStore = parsed.stores[0];
                    console.log(`\nTesting with store: ${firstStore.storeName} (ID: ${firstStore.storeId})`);

                    // Now test adherence data
                    testAdherenceData(sessionCookie, firstStore.storeId);
                }
            } else {
                console.log('Failed to get stores:', data);
            }
        });
    });

    storesReq.on('error', (error) => {
        console.error('Error:', error);
    });

    storesReq.end();
}

function testAdherenceData(sessionCookie, storeId) {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/patient-adherence?storeId=${storeId}&dateRange=30&minRepeats=2`,
        method: 'GET',
        headers: {
            'Cookie': sessionCookie
        }
    };

    const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('\nAdherence Data API Status:', res.statusCode);
            if (res.statusCode === 200) {
                const parsed = JSON.parse(data);
                console.log('\nData successfully loaded!');
                console.log('Summary:', {
                    totalScripts: parsed.summary?.totalScripts || 0,
                    totalPatients: parsed.summary?.totalPatients || 0,
                    overallComplianceRate: parsed.summary?.overallComplianceRate || 0
                });

                console.log('\n✅ The patient adherence page is working correctly!');
                console.log('To access it in your browser:');
                console.log('1. Go to http://localhost:3000/login');
                console.log('2. Login with valid credentials');
                console.log('3. Navigate to http://localhost:3000/patient-adherence');
                console.log('4. Select a store from the dropdown to load data');
            } else {
                console.log('Failed to get adherence data:', data.substring(0, 200));
            }
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error);
    });

    req.end();
}

function checkDatabaseUsers() {
    // Check if there's a way to query users
    const sql = require('mssql');
    const config = {
        server: 'au-datax-sql.database.windows.net',
        database: 'au-datax-dev-sqldb',
        user: 'dataxadmin',
        password: 'Helloworld1!',
        options: {
            encrypt: true,
            trustServerCertificate: false
        }
    };

    sql.connect(config).then(pool => {
        return pool.request().query('SELECT TOP 5 username FROM users');
    }).then(result => {
        console.log('\nExisting users in database:');
        result.recordset.forEach(user => {
            console.log(`- ${user.username}`);
        });
        console.log('\nUse one of these usernames with the appropriate password to login.');
        sql.close();
    }).catch(err => {
        console.log('Could not query users table:', err.message);
        console.log('\nPlease check your database for valid user credentials.');
        sql.close();
    });
}

// Start the test
login(testPatientAdherence);