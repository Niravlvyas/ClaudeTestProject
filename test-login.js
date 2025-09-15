const dataSource = require('./src/dataSource');
const { connectToDatabase, closeConnection } = require('./src/database');

async function testLogin() {
    try {
        console.log('Testing login with credentials...');
        console.log('Username: admin');
        console.log('Password: James:Bond$007');
        console.log('');
        
        await connectToDatabase();
        console.log('Database connected\n');
        
        console.log('Calling stored procedure [usp_sys_login_validation]...');
        const result = await dataSource.validateLogin('admin', 'James:Bond$007');
        
        console.log('Stored procedure result:', result);
        console.log('Type of result:', typeof result);
        console.log('Result keys:', Object.keys(result));
        
        // Also check the user details
        console.log('\nFetching user details from sys_user_master...');
        const userDetails = await dataSource.getUserByUsername('admin');
        console.log('User details:', userDetails);
        
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error('Full error:', error);
    } finally {
        await closeConnection();
        console.log('\nConnection closed');
    }
}

testLogin();