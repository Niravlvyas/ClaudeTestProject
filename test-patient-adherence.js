const http = require('http');

// Test the patient adherence endpoints
async function testPatientAdherence() {
    console.log('Testing Patient Adherence Endpoints...\n');

    // First, get the list of stores
    console.log('1. Testing /api/patient-adherence/stores endpoint...');

    const storesOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/patient-adherence/stores',
        method: 'GET',
        headers: {
            'Cookie': 'connect.sid=test-session' // Simulating a session
        }
    };

    const storesReq = http.request(storesOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Status:', res.statusCode);

            if (res.statusCode === 401) {
                console.log('Response: Authentication required');
                console.log('\n2. Testing with a specific store ID (bypassing auth check for testing)...');
                testWithStore();
            } else {
                console.log('Response:', data.substring(0, 200));
                const parsed = JSON.parse(data);
                if (parsed.stores && parsed.stores.length > 0) {
                    const firstStore = parsed.stores[0];
                    console.log(`\nFound ${parsed.stores.length} stores`);
                    console.log(`First store: ${firstStore.storeName} (ID: ${firstStore.storeId})`);
                    testWithStore(firstStore.storeId);
                }
            }
        });
    });

    storesReq.on('error', (error) => {
        console.error('Error:', error);
    });

    storesReq.end();
}

function testWithStore(storeId = '1') {
    console.log(`\nTesting /api/patient-adherence with store ID: ${storeId}`);

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/patient-adherence?storeId=${storeId}&dateRange=30&minRepeats=2`,
        method: 'GET',
        headers: {
            'Cookie': 'connect.sid=test-session'
        }
    };

    const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Status:', res.statusCode);
            if (res.statusCode === 401) {
                console.log('Response: Authentication required');
                console.log('\nThe endpoints are working but require authentication.');
                console.log('To fix data loading issues, you need to:');
                console.log('1. Log in through /login first');
                console.log('2. Then access /patient-adherence with valid session');
            } else {
                console.log('Response preview:', data.substring(0, 300));
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.summary) {
                        console.log('\nData successfully retrieved!');
                        console.log('Summary:', {
                            totalScripts: parsed.summary.totalScripts,
                            totalPatients: parsed.summary.totalPatients,
                            overallComplianceRate: parsed.summary.overallComplianceRate
                        });
                    }
                } catch (e) {
                    console.log('Could not parse response as JSON');
                }
            }
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error);
    });

    req.end();
}

// Run the test
testPatientAdherence();