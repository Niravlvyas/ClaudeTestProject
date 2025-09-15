const { query, queryDwProduction, executeStoredProcedure, sql, connectToDatabase } = require('./database');
const errorFilter = require('./errorFilter');

class DataSource {
    async getUsers() {
        try {
            const users = await query('SELECT * FROM Users');
            return users;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Fetching Users');
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }

    async getUserById(userId) {
        try {
            const user = await query(
                'SELECT * FROM Users WHERE UserId = @userId',
                { userId: sql.Int(userId) }
            );
            return user[0] || null;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Fetching User by ID');
            if (handling.shouldThrow) {
                throw error;
            }
            return null;
        }
    }

    async createUser(userData) {
        try {
            const result = await query(`
                INSERT INTO Users (Username, Email, CreatedAt)
                VALUES (@username, @email, GETDATE());
                SELECT SCOPE_IDENTITY() AS id;
            `, {
                username: sql.NVarChar(userData.username),
                email: sql.NVarChar(userData.email)
            });
            return result[0].id;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Creating User');
            if (handling.shouldThrow) {
                throw error;
            }
            return null;
        }
    }

    async updateUser(userId, userData) {
        try {
            await query(`
                UPDATE Users 
                SET Username = @username, 
                    Email = @email,
                    UpdatedAt = GETDATE()
                WHERE UserId = @userId
            `, {
                userId: sql.Int(userId),
                username: sql.NVarChar(userData.username),
                email: sql.NVarChar(userData.email)
            });
            return true;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Updating User');
            if (handling.shouldThrow) {
                throw error;
            }
            return false;
        }
    }

    async deleteUser(userId) {
        try {
            await query(
                'DELETE FROM Users WHERE UserId = @userId',
                { userId: sql.Int(userId) }
            );
            return true;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Deleting User');
            if (handling.shouldThrow) {
                throw error;
            }
            return false;
        }
    }

    async getConfigurations() {
        try {
            const configs = await query('SELECT * FROM Configurations');
            return configs;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Fetching Configurations');
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }

    async getConfigurationByKey(configKey) {
        try {
            const config = await query(
                'SELECT * FROM Configurations WHERE ConfigKey = @configKey',
                { configKey: sql.NVarChar(configKey) }
            );
            return config[0] || null;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Fetching Configuration');
            if (handling.shouldThrow) {
                throw error;
            }
            return null;
        }
    }

    async executeCustomQuery(queryString, parameters = {}) {
        try {
            const result = await query(queryString, parameters);
            return result;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Custom Query');
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }

    async executeTransactionQuery(queryString, parameters = {}) {
        try {
            const result = await queryDwProduction(queryString, parameters);
            return result;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Transaction Query');
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }

    async callStoredProcedure(procedureName, parameters = {}) {
        try {
            const result = await executeStoredProcedure(procedureName, parameters);
            return result;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Stored Procedure Call');
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }

    async validateLogin(username, password) {
        try {
            const pool = await connectToDatabase();
            const request = pool.request();
            
            request.input('username', sql.NVarChar(50), username);
            request.input('password', sql.NVarChar(50), password);
            
            const result = await request.execute('usp_sys_login_validation');
            
            if (result && result.recordset && result.recordset.length > 0) {
                return result.recordset[0];
            }
            return { isValid: false };
        } catch (error) {
            const handling = errorFilter.logError(error, 'Login Validation');
            if (handling.shouldThrow) {
                throw error;
            }
            return { isValid: false };
        }
    }

    async getUserByUsername(username) {
        try {
            const pool = await connectToDatabase();
            const request = pool.request();
            
            request.input('username', sql.NVarChar(50), username);
            
            const result = await request.query('SELECT Userid, Username, Email, Firstname, Lastname, Status, StatusUDC, IsSuperAdmin, RoleID FROM sys_user_master WHERE Username = @username');
            return result.recordset[0] || null;
        } catch (error) {
            const handling = errorFilter.logError(error, 'Fetching User by Username');
            if (handling.shouldThrow) {
                throw error;
            }
            return null;
        }
    }

    async executeStoredProcedure(procName, params = {}) {
        try {
            const pool = await connectToDatabase();
            const request = pool.request();
            
            // Add parameters to the request
            for (const [key, value] of Object.entries(params)) {
                // Handle GUID/UNIQUEIDENTIFIER for UserID
                if (key === 'UserID' || (typeof value === 'string' && value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))) {
                    request.input(key, sql.UniqueIdentifier, value);
                } else if (typeof value === 'string') {
                    request.input(key, sql.NVarChar, value);
                } else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        request.input(key, sql.Int, value);
                    } else {
                        request.input(key, sql.Float, value);
                    }
                } else if (typeof value === 'boolean') {
                    request.input(key, sql.Bit, value);
                } else if (value && typeof value.getTime === 'function') {
                    request.input(key, sql.DateTime, value);
                } else {
                    request.input(key, sql.NVarChar, value);
                }
            }
            
            const result = await request.execute(procName);
            return result.recordset || [];
        } catch (error) {
            const handling = errorFilter.logError(error, `Executing Stored Procedure: ${procName}`);
            if (handling.shouldThrow) {
                throw error;
            }
            return [];
        }
    }
    connectToDatabase() {
        return connectToDatabase();
    }
}

module.exports = new DataSource();