# Database Configuration Guide

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   The `.env` file contains your database credentials. Never commit this file to version control.

3. **Connection Details**
   - Server: 10.128.8.11
   - Database: DataX_Configuration
   - Port: 1433 (SQL Server default)

## Usage Examples

### Basic Usage
```javascript
const dataSource = require('./src/dataSource');

// Get all users
const users = await dataSource.getUsers();

// Get specific user
const user = await dataSource.getUserById(123);

// Custom query
const result = await dataSource.executeCustomQuery(
    'SELECT * FROM YourTable WHERE condition = @value',
    { value: sql.NVarChar('someValue') }
);
```

### Direct Database Access
```javascript
const { query, sql } = require('./src/database');

const results = await query(
    'SELECT * FROM Products WHERE Price > @minPrice',
    { minPrice: sql.Decimal(100) }
);
```

## Available Methods

- `getUsers()` - Fetch all users
- `getUserById(id)` - Get specific user
- `createUser(userData)` - Create new user
- `updateUser(id, userData)` - Update user
- `deleteUser(id)` - Delete user
- `getConfigurations()` - Get all configurations
- `getConfigurationByKey(key)` - Get specific configuration
- `executeCustomQuery(query, params)` - Run custom SQL
- `callStoredProcedure(name, params)` - Execute stored procedure

## Security Notes

- Credentials are stored in `.env` file (excluded from git)
- All queries use parameterized inputs to prevent SQL injection
- Connection pool manages resources efficiently

## Testing Connection

Run the test script:
```bash
npm start
```

This will connect to the database and list available tables.