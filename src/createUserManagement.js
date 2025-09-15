const { query, sql } = require('./database');

async function createUserManagementSystem() {
    try {
        console.log('Creating User Management System...');

        // 1. Create user_roles table
        const createRolesTable = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_roles' AND xtype='U')
            BEGIN
                CREATE TABLE user_roles (
                    RoleID INT IDENTITY(1,1) PRIMARY KEY,
                    RoleName NVARCHAR(50) NOT NULL UNIQUE,
                    RoleDescription NVARCHAR(255),
                    IsActive BIT DEFAULT 1,
                    CreatedBy NVARCHAR(50),
                    CreatedDate DATETIME DEFAULT GETDATE(),
                    ModifiedBy NVARCHAR(50),
                    ModifiedDate DATETIME DEFAULT GETDATE()
                );
            END
        `;

        await query(createRolesTable);
        console.log('✓ user_roles table created');

        // 2. Create permissions table
        const createPermissionsTable = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='permissions' AND xtype='U')
            BEGIN
                CREATE TABLE permissions (
                    PermissionID INT IDENTITY(1,1) PRIMARY KEY,
                    PermissionName NVARCHAR(100) NOT NULL UNIQUE,
                    PermissionDescription NVARCHAR(255),
                    Module NVARCHAR(50),
                    IsActive BIT DEFAULT 1,
                    CreatedDate DATETIME DEFAULT GETDATE()
                );
            END
        `;

        await query(createPermissionsTable);
        console.log('✓ permissions table created');

        // 3. Create role_permissions table
        const createRolePermissionsTable = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='role_permissions' AND xtype='U')
            BEGIN
                CREATE TABLE role_permissions (
                    RolePermissionID INT IDENTITY(1,1) PRIMARY KEY,
                    RoleID INT NOT NULL,
                    PermissionID INT NOT NULL,
                    IsActive BIT DEFAULT 1,
                    CreatedDate DATETIME DEFAULT GETDATE(),
                    FOREIGN KEY (RoleID) REFERENCES user_roles(RoleID),
                    FOREIGN KEY (PermissionID) REFERENCES permissions(PermissionID),
                    UNIQUE(RoleID, PermissionID)
                );
            END
        `;

        await query(createRolePermissionsTable);
        console.log('✓ role_permissions table created');

        // 4. Add RoleID column to sys_user_master if not exists
        const addRoleColumn = `
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sys_user_master') AND name = 'RoleID')
            BEGIN
                ALTER TABLE sys_user_master ADD RoleID INT;
                ALTER TABLE sys_user_master ADD CONSTRAINT FK_UserRole 
                    FOREIGN KEY (RoleID) REFERENCES user_roles(RoleID);
            END
        `;

        await query(addRoleColumn);
        console.log('✓ RoleID column added to sys_user_master');

        // 5. Insert default permissions
        const insertPermissions = `
            IF NOT EXISTS (SELECT 1 FROM permissions WHERE PermissionName = 'VIEW_DASHBOARD')
            BEGIN
                INSERT INTO permissions (PermissionName, PermissionDescription, Module) VALUES
                ('VIEW_DASHBOARD', 'Access to main dashboard', 'Dashboard'),
                ('VIEW_PHARMACIES', 'View pharmacy information', 'Pharmacies'),
                ('EDIT_PHARMACIES', 'Edit pharmacy information', 'Pharmacies'),
                ('VIEW_ANALYTICS', 'Access analytics and reports', 'Analytics'),
                ('VIEW_PATIENT_ADHERENCE', 'View patient adherence data', 'Patient Care'),
                ('VIEW_REFILL_PREDICTIONS', 'View refill predictions', 'Patient Care'),
                ('USE_SUPPORT_CHAT', 'Access support chat assistant', 'Support'),
                ('MANAGE_USERS', 'Create, edit, disable users', 'User Management'),
                ('MANAGE_ROLES', 'Create and manage user roles', 'User Management'),
                ('SYSTEM_ADMIN', 'Full system administration access', 'Administration'),
                ('VIEW_REPORTS', 'Access to all reporting features', 'Reports'),
                ('EXPORT_DATA', 'Export data to various formats', 'Data'),
                ('VIEW_BIR_MONITORING', 'Access BIR integration monitoring', 'Integration');
            END
        `;

        await query(insertPermissions);
        console.log('✓ Default permissions inserted');

        // 6. Insert default roles
        const insertRoles = `
            IF NOT EXISTS (SELECT 1 FROM user_roles WHERE RoleName = 'Super Admin')
            BEGIN
                INSERT INTO user_roles (RoleName, RoleDescription, CreatedBy) VALUES
                ('Super Admin', 'Full system access with all permissions', 'SYSTEM'),
                ('Pharmacy Manager', 'Manage pharmacy operations and view reports', 'SYSTEM'),
                ('Data Analyst', 'Access to analytics and reporting features', 'SYSTEM'),
                ('Support Staff', 'Basic access with support chat capabilities', 'SYSTEM'),
                ('Viewer', 'Read-only access to dashboard and basic features', 'SYSTEM');
            END
        `;

        await query(insertRoles);
        console.log('✓ Default roles inserted');

        // 7. Assign permissions to roles
        const assignRolePermissions = `
            -- Super Admin gets all permissions
            IF NOT EXISTS (SELECT 1 FROM role_permissions rp 
                          JOIN user_roles ur ON rp.RoleID = ur.RoleID 
                          WHERE ur.RoleName = 'Super Admin')
            BEGIN
                INSERT INTO role_permissions (RoleID, PermissionID)
                SELECT ur.RoleID, p.PermissionID
                FROM user_roles ur
                CROSS JOIN permissions p
                WHERE ur.RoleName = 'Super Admin' AND p.IsActive = 1;
            END

            -- Pharmacy Manager permissions
            IF NOT EXISTS (SELECT 1 FROM role_permissions rp 
                          JOIN user_roles ur ON rp.RoleID = ur.RoleID 
                          WHERE ur.RoleName = 'Pharmacy Manager')
            BEGIN
                INSERT INTO role_permissions (RoleID, PermissionID)
                SELECT ur.RoleID, p.PermissionID
                FROM user_roles ur, permissions p
                WHERE ur.RoleName = 'Pharmacy Manager' 
                AND p.PermissionName IN ('VIEW_DASHBOARD', 'VIEW_PHARMACIES', 'EDIT_PHARMACIES', 'VIEW_ANALYTICS', 
                                       'VIEW_PATIENT_ADHERENCE', 'VIEW_REFILL_PREDICTIONS', 'USE_SUPPORT_CHAT', 
                                       'VIEW_REPORTS', 'EXPORT_DATA', 'VIEW_BIR_MONITORING');
            END

            -- Data Analyst permissions
            IF NOT EXISTS (SELECT 1 FROM role_permissions rp 
                          JOIN user_roles ur ON rp.RoleID = ur.RoleID 
                          WHERE ur.RoleName = 'Data Analyst')
            BEGIN
                INSERT INTO role_permissions (RoleID, PermissionID)
                SELECT ur.RoleID, p.PermissionID
                FROM user_roles ur, permissions p
                WHERE ur.RoleName = 'Data Analyst' 
                AND p.PermissionName IN ('VIEW_DASHBOARD', 'VIEW_PHARMACIES', 'VIEW_ANALYTICS', 
                                       'VIEW_PATIENT_ADHERENCE', 'VIEW_REFILL_PREDICTIONS', 
                                       'VIEW_REPORTS', 'EXPORT_DATA', 'USE_SUPPORT_CHAT');
            END

            -- Support Staff permissions
            IF NOT EXISTS (SELECT 1 FROM role_permissions rp 
                          JOIN user_roles ur ON rp.RoleID = ur.RoleID 
                          WHERE ur.RoleName = 'Support Staff')
            BEGIN
                INSERT INTO role_permissions (RoleID, PermissionID)
                SELECT ur.RoleID, p.PermissionID
                FROM user_roles ur, permissions p
                WHERE ur.RoleName = 'Support Staff' 
                AND p.PermissionName IN ('VIEW_DASHBOARD', 'VIEW_PHARMACIES', 'USE_SUPPORT_CHAT', 'VIEW_BIR_MONITORING');
            END

            -- Viewer permissions
            IF NOT EXISTS (SELECT 1 FROM role_permissions rp 
                          JOIN user_roles ur ON rp.RoleID = ur.RoleID 
                          WHERE ur.RoleName = 'Viewer')
            BEGIN
                INSERT INTO role_permissions (RoleID, PermissionID)
                SELECT ur.RoleID, p.PermissionID
                FROM user_roles ur, permissions p
                WHERE ur.RoleName = 'Viewer' 
                AND p.PermissionName IN ('VIEW_DASHBOARD', 'VIEW_PHARMACIES');
            END
        `;

        await query(assignRolePermissions);
        console.log('✓ Role permissions assigned');

        // 8. Create stored procedures for user management (separate queries)
        const dropCreateUserProc = `
            IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'usp_create_user')
                DROP PROCEDURE usp_create_user;
        `;
        
        await query(dropCreateUserProc);

        const createUserProc = `
            CREATE PROCEDURE usp_create_user
                @Username NVARCHAR(50),
                @Password NVARCHAR(255),
                @Email NVARCHAR(100),
                @Firstname NVARCHAR(50),
                @Lastname NVARCHAR(50),
                @RoleID INT,
                @CreatedBy NVARCHAR(50)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                DECLARE @NewUserID UNIQUEIDENTIFIER = NEWID();
                
                -- Check if username already exists
                IF EXISTS (SELECT 1 FROM sys_user_master WHERE Username = @Username)
                BEGIN
                    SELECT 'ERROR' as Result, 'Username already exists' as Message;
                    RETURN;
                END
                
                -- Insert new user with proper data types matching existing table
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    @NewUserID, @Username, @Password, @Email, @Firstname, @Lastname, @RoleID,
                    1, 'SUS10', 
                    CASE WHEN @RoleID = (SELECT RoleID FROM user_roles WHERE RoleName = 'Super Admin') THEN 1 ELSE 0 END,
                    GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
                
                SELECT 'SUCCESS' as Result, 'User created successfully' as Message, @NewUserID as UserID;
            END;
        `;

        await query(createUserProc);

        const dropUpdateUserProc = `
            IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'usp_update_user')
                DROP PROCEDURE usp_update_user;
        `;
        
        await query(dropUpdateUserProc);

        const createUpdateUserProc = `
            CREATE PROCEDURE usp_update_user
                @UserID UNIQUEIDENTIFIER,
                @Email NVARCHAR(100),
                @Firstname NVARCHAR(50),
                @Lastname NVARCHAR(50),
                @RoleID INT,
                @Status NVARCHAR(20),
                @ModifiedBy NVARCHAR(50)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Userid = @UserID)
                BEGIN
                    SELECT 'ERROR' as Result, 'User not found' as Message;
                    RETURN;
                END
                
                UPDATE sys_user_master 
                SET Email = @Email,
                    Firstname = @Firstname,
                    Lastname = @Lastname,
                    RoleID = @RoleID,
                    Status = CASE WHEN @Status = 'Active' THEN 1 ELSE 0 END,
                    StatusUDC = CASE WHEN @Status = 'Active' THEN 'SUS10' ELSE 'SUS20' END,
                    IsSuperAdmin = CASE WHEN @RoleID = (SELECT RoleID FROM user_roles WHERE RoleName = 'Super Admin') THEN 1 ELSE 0 END,
                    UpdatedDate = GETDATE()
                WHERE Userid = @UserID;
                
                SELECT 'SUCCESS' as Result, 'User updated successfully' as Message;
            END;
        `;

        await query(createUpdateUserProc);

        const dropPermissionsProc = `
            IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'usp_get_user_permissions')
                DROP PROCEDURE usp_get_user_permissions;
        `;
        
        await query(dropPermissionsProc);

        const createPermissionsProc = `
            CREATE PROCEDURE usp_get_user_permissions
                @Username NVARCHAR(50)
            AS
            BEGIN
                SET NOCOUNT ON;
                
                SELECT DISTINCT p.PermissionName, p.PermissionDescription, p.Module
                FROM sys_user_master u
                JOIN user_roles r ON u.RoleID = r.RoleID
                JOIN role_permissions rp ON r.RoleID = rp.RoleID
                JOIN permissions p ON rp.PermissionID = p.PermissionID
                WHERE u.Username = @Username 
                AND u.StatusUDC = 'SUS10' 
                AND r.IsActive = 1 
                AND rp.IsActive = 1 
                AND p.IsActive = 1;
            END;
        `;

        await query(createPermissionsProc);
        console.log('✓ User management stored procedures created');

        // 9. Create test users with different roles
        const createTestUsers = `
            -- Create test users with same password for each role
            DECLARE @SuperAdminRoleID INT = (SELECT RoleID FROM user_roles WHERE RoleName = 'Super Admin');
            DECLARE @ManagerRoleID INT = (SELECT RoleID FROM user_roles WHERE RoleName = 'Pharmacy Manager');
            DECLARE @AnalystRoleID INT = (SELECT RoleID FROM user_roles WHERE RoleName = 'Data Analyst');
            DECLARE @SupportRoleID INT = (SELECT RoleID FROM user_roles WHERE RoleName = 'Support Staff');
            DECLARE @ViewerRoleID INT = (SELECT RoleID FROM user_roles WHERE RoleName = 'Viewer');

            -- Super Admin user
            IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Username = 'superadmin')
            BEGIN
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    NEWID(), 'superadmin', 'admin123', 'superadmin@datax.com', 'Super', 'Administrator', @SuperAdminRoleID,
                    1, 'SUS10', 1, GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
            END

            -- Pharmacy Manager user
            IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Username = 'manager')
            BEGIN
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    NEWID(), 'manager', 'manager123', 'manager@datax.com', 'Pharmacy', 'Manager', @ManagerRoleID,
                    1, 'SUS10', 0, GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
            END

            -- Data Analyst user
            IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Username = 'analyst')
            BEGIN
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    NEWID(), 'analyst', 'analyst123', 'analyst@datax.com', 'Data', 'Analyst', @AnalystRoleID,
                    1, 'SUS10', 0, GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
            END

            -- Support Staff user
            IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Username = 'support')
            BEGIN
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    NEWID(), 'support', 'support123', 'support@datax.com', 'Support', 'Staff', @SupportRoleID,
                    1, 'SUS10', 0, GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
            END

            -- Viewer user
            IF NOT EXISTS (SELECT 1 FROM sys_user_master WHERE Username = 'viewer')
            BEGIN
                INSERT INTO sys_user_master (
                    Userid, Username, Password, Email, Firstname, Lastname, RoleID, 
                    Status, StatusUDC, IsSuperAdmin, CreatedDate, UpdatedDate,
                    PharmacyGroupId, GroupDataAccess, AttemptCount
                )
                VALUES (
                    NEWID(), 'viewer', 'viewer123', 'viewer@datax.com', 'Read Only', 'Viewer', @ViewerRoleID,
                    1, 'SUS10', 0, GETDATE(), GETDATE(), 'KIA00000', 1, 0
                );
            END
        `;

        await query(createTestUsers);
        console.log('✓ Test users created');

        console.log('\n🎉 User Management System Setup Complete!');
        console.log('\n📋 Test Users Created:');
        console.log('• superadmin / admin123 (Super Admin - Full Access)');
        console.log('• manager / manager123 (Pharmacy Manager - Pharmacy & Reports)'); 
        console.log('• analyst / analyst123 (Data Analyst - Analytics & Reports)');
        console.log('• support / support123 (Support Staff - Basic + Support Chat)');
        console.log('• viewer / viewer123 (Viewer - Read-only Dashboard & Pharmacies)');

        return { success: true, message: 'User management system created successfully' };

    } catch (error) {
        console.error('Error creating user management system:', error);
        throw error;
    }
}

// Run the function if this file is executed directly
if (require.main === module) {
    createUserManagementSystem()
        .then(result => {
            console.log('Setup completed:', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('Setup failed:', error);
            process.exit(1);
        });
}

module.exports = { createUserManagementSystem };