const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const dataSource = require('./dataSource');
const { connectToDatabase } = require('./database');
const emailService = require('./emailService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    if (!username.trim() || !password.trim()) {
        return res.status(400).json({
            success: false,
            message: 'Username and password cannot be empty'
        });
    }

    try {
        const loginResult = await dataSource.validateLogin(username, password);
        
        // The stored procedure returns { '': 'True' } or { '': 'False' }
        const isValid = loginResult && (
            loginResult[''] === 'True' || 
            loginResult[''] === true ||
            loginResult.isValid === true ||
            loginResult === true
        );

        if (isValid) {
            const userData = await dataSource.getUserByUsername(username);
            
            // Get user permissions
            let permissions = [];
            try {
                permissions = await dataSource.executeStoredProcedure('usp_get_user_permissions', {
                    Username: username
                });
            } catch (permError) {
                console.log('Could not load permissions for user:', username);
            }
            
            req.session.user = {
                username: username,
                userId: userData?.Userid,
                firstname: userData?.Firstname,
                lastname: userData?.Lastname,
                email: userData?.Email,
                status: userData?.Status,
                statusUDC: userData?.StatusUDC,
                isActive: userData?.StatusUDC === 'SUS10',
                isSuperAdmin: userData?.IsSuperAdmin,
                roleId: userData?.RoleID,
                roleName: userData?.RoleName,
                permissions: permissions.map(p => p.PermissionName) || []
            };

            return res.json({
                success: true,
                message: 'Login successful',
                redirectUrl: '/dashboard'
            });
        } else {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during login. Please try again.'
        });
    }
});

app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/api/dashboard-data', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const pharmacyCount = await dataSource.executeCustomQuery('SELECT COUNT(*) as count FROM pharmacy_master');
        const userCount = await dataSource.executeCustomQuery("SELECT COUNT(*) as count FROM sys_user_master WHERE StatusUDC = 'SUS10'");
        const configCount = await dataSource.executeCustomQuery('SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES');
        
        res.json({
            user: req.session.user,
            stats: {
                pharmacies: pharmacyCount[0]?.count || 0,
                users: userCount[0]?.count || 0,
                configs: configCount[0]?.count || 0
            }
        });
    } catch (error) {
        console.error('Dashboard data error:', error);
        res.json({
            user: req.session.user,
            stats: {
                pharmacies: 0,
                users: 0,
                configs: 0
            }
        });
    }
});

app.get('/pharmacies', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    res.sendFile(path.join(__dirname, '../public/pharmacies.html'));
});

app.get('/api/pharmacies', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const pharmacies = await dataSource.executeCustomQuery(`
            SELECT 
                PharmacyID,
                CommercialName as StoreName,
                TimeZoneState as State,
                CASE WHEN ExcludeHC = 1 THEN 0 ELSE 1 END as IsActive
            FROM pharmacy_master
            ORDER BY CommercialName
        `);
        
        res.json({
            user: req.session.user,
            pharmacies: pharmacies
        });
    } catch (error) {
        console.error('Error fetching pharmacies:', error);
        res.status(500).json({ 
            error: 'Failed to fetch pharmacies',
            user: req.session.user,
            pharmacies: []
        });
    }
});

app.get('/pharmacy/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    res.sendFile(path.join(__dirname, '../public/pharmacy-detail.html'));
});

app.get('/api/pharmacy/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const pharmacyId = req.params.id;
        const { sql } = require('./database');
        const pool = await dataSource.connectToDatabase();
        const request = pool.request();
        request.input('pharmacyId', sql.NVarChar(50), pharmacyId);
        
        const result = await request.query(`
            SELECT 
                PharmacyID,
                CommercialName as StoreName,
                TimeZoneState as State,
                ContactPerson1 as ContactPerson,
                ContactNumber,
                PharmacyGroupId,
                CommentsHC as Notes,
                CASE WHEN ExcludeHC = 1 THEN 0 ELSE 1 END as IsActive,
                UpdatedDate,
                IsActive as DatabaseIsActive,
                ContactPerson2,
                BestContactTime
            FROM pharmacy_master
            WHERE PharmacyID = @pharmacyId
        `);
        const pharmacy = result.recordset;
        
        if (pharmacy.length === 0) {
            return res.status(404).json({ error: 'Pharmacy not found' });
        }
        
        res.json({
            user: req.session.user,
            pharmacy: pharmacy[0]
        });
    } catch (error) {
        console.error('Error fetching pharmacy details:', error);
        res.status(500).json({ 
            error: 'Failed to fetch pharmacy details'
        });
    }
});

app.get('/analytics', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    res.sendFile(path.join(__dirname, '../public/analytics.html'));
});

app.get('/api/analytics', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const { dateRange = 'all', storeId, schedule } = req.query;
        
        // Build date filter
        let dateFilter = '';
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            dateFilter = `AND DispensedDate >= DATEADD(day, -${days}, GETDATE())`;
        }
        
        // Build additional filters
        let storeFilter = storeId ? `AND StoreId = ${storeId}` : '';
        let scheduleFilter = schedule ? `AND DrugSchedule = '${schedule}'` : '';
        
        // Summary statistics
        const summary = await dataSource.executeCustomQuery(`
            SELECT 
                COUNT(*) as totalDispenses,
                SUM(CAST(DrugVal as float)) as totalValue,
                COUNT(DISTINCT StoreId) as totalStores
            FROM cdc_dispense_data 
            WHERE 1=1 ${dateFilter} ${storeFilter} ${scheduleFilter}
        `);
        
        const patientCount = await dataSource.executeCustomQuery('SELECT COUNT(DISTINCT dispenseid) as totalPatients FROM cdc_patient_data');
        
        // Daily trends (last 30 days)
        const dailyTrends = await dataSource.executeCustomQuery(`
            SELECT 
                CAST(DispensedDate as date) as date,
                COUNT(*) as count
            FROM cdc_dispense_data 
            WHERE DispensedDate >= DATEADD(day, -30, GETDATE()) ${storeFilter} ${scheduleFilter}
            GROUP BY CAST(DispensedDate as date)
            ORDER BY date DESC
        `);
        
        // Top drugs
        const topDrugs = await dataSource.executeCustomQuery(`
            SELECT TOP 10
                Drugname as drugName,
                BrandName as brandName,
                COUNT(*) as totalDispensed,
                SUM(CAST(DrugVal as float)) as totalValue,
                AVG(CAST(PatientPrice as float)) as avgPrice
            FROM cdc_dispense_data 
            WHERE Drugname IS NOT NULL ${dateFilter} ${storeFilter} ${scheduleFilter}
            GROUP BY Drugname, BrandName
            ORDER BY totalDispensed DESC
        `);
        
        // Drug categories by schedule
        const drugCategories = await dataSource.executeCustomQuery(`
            SELECT 
                COALESCE(DrugSchedule, 'Unclassified') as category,
                COUNT(*) as count
            FROM cdc_dispense_data 
            WHERE 1=1 ${dateFilter} ${storeFilter} ${scheduleFilter}
            GROUP BY DrugSchedule
            ORDER BY count DESC
        `);
        
        // Store performance
        const storePerformance = await dataSource.executeCustomQuery(`
            SELECT TOP 10
                StoreId as storeId,
                COUNT(*) as count,
                SUM(CAST(DrugVal as float)) as totalValue
            FROM cdc_dispense_data 
            WHERE StoreId IS NOT NULL ${dateFilter} ${scheduleFilter}
            GROUP BY StoreId
            ORDER BY count DESC
        `);
        
        // Patient demographics
        const demographics = await dataSource.executeCustomQuery(`
            SELECT 
                gender,
                COUNT(*) as count
            FROM cdc_patient_data 
            WHERE gender IS NOT NULL
            GROUP BY gender
        `);
        
        // Get filter options
        const stores = await dataSource.executeCustomQuery(`
            SELECT DISTINCT d.StoreId as storeId, p.CommercialName as storeName
            FROM cdc_dispense_data d
            LEFT JOIN pharmacy_master p ON d.StoreId = p.PharmacyID
            WHERE d.StoreId IS NOT NULL 
            ORDER BY d.StoreId
        `);
        
        const schedules = await dataSource.executeCustomQuery(`
            SELECT DISTINCT DrugSchedule 
            FROM cdc_dispense_data 
            WHERE DrugSchedule IS NOT NULL AND DrugSchedule != ''
            ORDER BY DrugSchedule
        `);
        
        // Format demographics
        const demographicsFormatted = {};
        demographics.forEach(d => {
            if (d.gender.toLowerCase().includes('male') && !d.gender.toLowerCase().includes('female')) {
                demographicsFormatted.male = (demographicsFormatted.male || 0) + d.count;
            } else if (d.gender.toLowerCase().includes('female')) {
                demographicsFormatted.female = (demographicsFormatted.female || 0) + d.count;
            }
        });
        
        res.json({
            user: req.session.user,
            summary: {
                totalDispenses: summary[0]?.totalDispenses || 0,
                totalPatients: patientCount[0]?.totalPatients || 0,
                totalValue: summary[0]?.totalValue || 0,
                totalStores: summary[0]?.totalStores || 0
            },
            dailyTrends: dailyTrends,
            topDrugs: topDrugs.map(drug => ({
                drugName: drug.drugName,
                brandName: drug.brandName,
                totalDispensed: drug.totalDispensed,
                totalValue: drug.totalValue || 0,
                avgPrice: drug.avgPrice || 0
            })),
            drugCategories: drugCategories,
            storePerformance: storePerformance,
            demographics: demographicsFormatted,
            stores: stores,
            schedules: schedules.map(s => s.DrugSchedule)
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ 
            error: 'Failed to load analytics',
            user: req.session.user,
            summary: { totalDispenses: 0, totalPatients: 0, totalValue: 0, totalStores: 0 },
            dailyTrends: [],
            topDrugs: [],
            drugCategories: [],
            storePerformance: [],
            demographics: {},
            stores: [],
            schedules: []
        });
    }
});

app.get('/patient-adherence', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.sendFile(path.join(__dirname, '../public/patient-adherence.html'));
});

// Test route for patient adherence (bypasses authentication)
app.get('/test/patient-adherence', (req, res) => {
    // Set a test session
    req.session.user = { username: 'testuser', role: 'admin' };
    res.sendFile(path.join(__dirname, '../public/patient-adherence.html'));
});

app.get('/api/patient-adherence/stores', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        // Get list of stores with data
        const stores = await dataSource.executeCustomQuery(`
            SELECT DISTINCT 
                d.StoreId as storeId, 
                COALESCE(p.CommercialName, 'Store ' + CAST(d.StoreId as varchar)) as storeName,
                COUNT(*) as recordCount
            FROM cdc_dispense_data d
            LEFT JOIN pharmacy_master p ON d.StoreId = p.PharmacyID
            WHERE d.StoreId IS NOT NULL
            GROUP BY d.StoreId, p.CommercialName
            HAVING COUNT(*) > 100
            ORDER BY COUNT(*) DESC
        `);
        
        res.json({
            stores: stores.map(s => ({
                storeId: s.storeId,
                storeName: s.storeName.replace(/Chemist Discount Centre/gi, 'CDC'),
                recordCount: s.recordCount
            }))
        });
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});

app.get('/api/patient-adherence', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const { storeId, drugName, dateRange = 'all', minRepeats = 2 } = req.query;
        
        console.log(`Patient adherence request - Store: ${storeId}, DateRange: ${dateRange}, MinRepeats: ${minRepeats}`);
        
        // Require store selection for performance
        if (!storeId) {
            return res.json({
                user: req.session.user,
                requiresStoreSelection: true,
                summary: { totalScripts: 0, totalPatients: 0, fullyCompliantScripts: 0, highCompliantScripts: 0, lowCompliantScripts: 0, overallComplianceRate: 0 },
                medicationCompliance: [],
                complianceByRepeat: [],
                patientsWithGaps: [],
                chronicMedications: [],
                storeInfo: null
            });
        }
        
        // Build filters
        let dateFilter = '';
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            dateFilter = `AND DispensedDate >= DATEADD(day, -${days}, GETDATE())`;
        }
        
        let storeFilter = `AND StoreId = ${storeId}`;
        let drugFilter = drugName ? `AND Drugname LIKE '%${drugName}%'` : '';
        let repeatFilter = `AND TotalRepeats >= ${minRepeats}`;
        
        // Patient Adherence Summary
        console.log('Starting adherence summary query...');
        const startTime = Date.now();
        
        const adherenceSummary = await dataSource.executeCustomQuery(`
            WITH PatientScripts AS (
                SELECT 
                    PatPharmSysID,
                    OriginalScriptNumber,
                    Drugname,
                    StoreId,
                    TotalRepeats,
                    COUNT(*) as DispensedRepeats,
                    MIN(DispensedDate) as FirstDispense,
                    MAX(DispensedDate) as LastDispense,
                    DATEDIFF(day, MIN(DispensedDate), MAX(DispensedDate)) as DaysBetween
                FROM cdc_dispense_data 
                WHERE TotalRepeats IS NOT NULL 
                    AND PatPharmSysID IS NOT NULL 
                    AND OriginalScriptNumber IS NOT NULL
                    ${dateFilter} ${storeFilter} ${drugFilter} ${repeatFilter}
                GROUP BY PatPharmSysID, OriginalScriptNumber, Drugname, StoreId, TotalRepeats
            )
            SELECT 
                COUNT(*) as TotalScripts,
                COUNT(CASE WHEN DispensedRepeats = TotalRepeats + 1 THEN 1 END) as FullyCompliantScripts,
                COUNT(CASE WHEN DispensedRepeats > (TotalRepeats + 1) * 0.8 THEN 1 END) as HighCompliantScripts,
                COUNT(CASE WHEN DispensedRepeats < (TotalRepeats + 1) * 0.5 THEN 1 END) as LowCompliantScripts,
                COUNT(DISTINCT PatPharmSysID) as TotalPatients,
                AVG(CAST(DispensedRepeats as float) / (TotalRepeats + 1) * 100) as OverallComplianceRate
            FROM PatientScripts
        `);
        
        // Top Medications by Compliance Issues
        const medicationCompliance = await dataSource.executeCustomQuery(`
            WITH PatientScripts AS (
                SELECT 
                    Drugname,
                    PatPharmSysID,
                    OriginalScriptNumber,
                    TotalRepeats,
                    COUNT(*) as DispensedRepeats,
                    CAST(COUNT(*) as float) / (TotalRepeats + 1) * 100 as ComplianceRate
                FROM cdc_dispense_data 
                WHERE TotalRepeats IS NOT NULL 
                    AND PatPharmSysID IS NOT NULL 
                    AND OriginalScriptNumber IS NOT NULL
                    ${dateFilter} ${storeFilter} ${drugFilter} ${repeatFilter}
                GROUP BY PatPharmSysID, OriginalScriptNumber, Drugname, TotalRepeats
            )
            SELECT TOP 10
                Drugname,
                COUNT(*) as TotalScripts,
                COUNT(DISTINCT PatPharmSysID) as TotalPatients,
                AVG(ComplianceRate) as AvgComplianceRate,
                COUNT(CASE WHEN ComplianceRate >= 100 THEN 1 END) as FullyCompliant,
                COUNT(CASE WHEN ComplianceRate < 50 THEN 1 END) as LowCompliance
            FROM PatientScripts
            GROUP BY Drugname
            ORDER BY COUNT(*) DESC
        `);
        
        // Compliance by Repeat Number Analysis
        const complianceByRepeat = await dataSource.executeCustomQuery(`
            SELECT 
                CASE 
                    WHEN RepeatNo > 5 THEN '5+'
                    ELSE CAST(RepeatNo AS VARCHAR(10))
                END as RepeatNo,
                COUNT(*) as TotalDispenses,
                COUNT(DISTINCT PatPharmSysID) as UniquePatients,
                AVG(DATEDIFF(day, DatePrescribed, DispensedDate)) as AvgDaysFromPrescription
            FROM cdc_dispense_data 
            WHERE RepeatNo IS NOT NULL 
                AND TotalRepeats >= ${minRepeats}
                AND PatPharmSysID IS NOT NULL
                ${dateFilter} ${storeFilter} ${drugFilter}
            GROUP BY CASE 
                WHEN RepeatNo > 5 THEN '5+'
                ELSE CAST(RepeatNo AS VARCHAR(10))
            END
            ORDER BY CASE 
                WHEN RepeatNo > 5 THEN 999
                ELSE RepeatNo
            END
        `);
        
        // Patients with Gaps in Medication (Missing Repeats)
        const patientsWithGaps = await dataSource.executeCustomQuery(`
            WITH PatientRepeats AS (
                SELECT 
                    PatPharmSysID,
                    OriginalScriptNumber,
                    Drugname,
                    StoreId,
                    RepeatNo,
                    TotalRepeats,
                    DispensedDate,
                    ROW_NUMBER() OVER (PARTITION BY PatPharmSysID, OriginalScriptNumber ORDER BY RepeatNo) as ExpectedSequence
                FROM cdc_dispense_data 
                WHERE TotalRepeats >= ${minRepeats}
                    AND PatPharmSysID IS NOT NULL
                    AND OriginalScriptNumber IS NOT NULL
                    ${dateFilter} ${storeFilter} ${drugFilter}
            ),
            GapAnalysis AS (
                SELECT 
                    PatPharmSysID,
                    OriginalScriptNumber,
                    Drugname,
                    StoreId,
                    TotalRepeats,
                    COUNT(*) as ActualRepeats,
                    MAX(RepeatNo) as HighestRepeatNo,
                    CASE WHEN MAX(RepeatNo) < TotalRepeats THEN 1 ELSE 0 END as HasGaps
                FROM PatientRepeats
                GROUP BY PatPharmSysID, OriginalScriptNumber, Drugname, StoreId, TotalRepeats
            )
            SELECT TOP 20
                PatPharmSysID,
                Drugname,
                StoreId,
                TotalRepeats,
                ActualRepeats,
                HighestRepeatNo,
                (TotalRepeats + 1) - ActualRepeats as MissedRepeats
            FROM GapAnalysis
            WHERE HasGaps = 1
            ORDER BY (TotalRepeats + 1) - ActualRepeats DESC, TotalRepeats DESC
        `);
        
        // Chronic Medication Patterns (Long-term medications)
        const chronicMedications = await dataSource.executeCustomQuery(`
            SELECT TOP 15
                Drugname,
                COUNT(DISTINCT PatPharmSysID) as TotalPatients,
                COUNT(*) as TotalDispenses,
                AVG(CAST(TotalRepeats as float)) as AvgTotalRepeats,
                COUNT(CASE WHEN TotalRepeats >= 5 THEN 1 END) as LongTermScripts,
                CAST(COUNT(CASE WHEN TotalRepeats >= 5 THEN 1 END) as float) / COUNT(*) * 100 as ChronicMedicationRate
            FROM cdc_dispense_data 
            WHERE TotalRepeats >= ${minRepeats}
                AND PatPharmSysID IS NOT NULL
                ${dateFilter} ${storeFilter} ${drugFilter}
            GROUP BY Drugname
            HAVING COUNT(DISTINCT PatPharmSysID) >= 10
            ORDER BY ChronicMedicationRate DESC, TotalPatients DESC
        `);
        
        // Store-specific summary (since we're analyzing one store at a time)
        console.log('Starting store info query...');
        const storeInfoStart = Date.now();
        
        const storeInfo = await dataSource.executeCustomQuery(`
            SELECT 
                p.PharmacyID as StoreId,
                p.CommercialName as StoreName,
                p.TimeZoneState as State,
                COUNT(DISTINCT d.PatPharmSysID) as UniquePatients,
                COUNT(DISTINCT d.OriginalScriptNumber) as UniqueScripts
            FROM pharmacy_master p
            LEFT JOIN cdc_dispense_data d ON p.PharmacyID = d.StoreId
            WHERE p.PharmacyID = ${storeId}
            GROUP BY p.PharmacyID, p.CommercialName, p.TimeZoneState
        `);
        
        console.log(`Store info completed in ${Date.now() - storeInfoStart}ms`);
        console.log(`Total query time: ${Date.now() - startTime}ms`);
        
        res.json({
            user: req.session.user,
            summary: {
                totalScripts: adherenceSummary[0]?.TotalScripts || 0,
                totalPatients: adherenceSummary[0]?.TotalPatients || 0,
                fullyCompliantScripts: adherenceSummary[0]?.FullyCompliantScripts || 0,
                highCompliantScripts: adherenceSummary[0]?.HighCompliantScripts || 0,
                lowCompliantScripts: adherenceSummary[0]?.LowCompliantScripts || 0,
                overallComplianceRate: adherenceSummary[0]?.OverallComplianceRate || 0
            },
            medicationCompliance: medicationCompliance || [],
            complianceByRepeat: complianceByRepeat || [],
            patientsWithGaps: patientsWithGaps || [],
            chronicMedications: chronicMedications || [],
            storeInfo: storeInfo[0] || null
        });
    } catch (error) {
        console.error('Patient adherence error:', error);
        res.status(500).json({ 
            error: 'Failed to load patient adherence data',
            user: req.session.user,
            summary: { totalScripts: 0, totalPatients: 0, fullyCompliantScripts: 0, highCompliantScripts: 0, lowCompliantScripts: 0, overallComplianceRate: 0 },
            medicationCompliance: [],
            complianceByRepeat: [],
            patientsWithGaps: [],
            chronicMedications: [],
            storeInfo: null
        });
    }
});

app.get('/support-chat', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'support-chat.html'));
});

app.get('/refill-predictions', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'refill-predictions.html'));
});

app.get('/api/refill-predictions/stores', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        // Get list of stores with their configuration
        const stores = await dataSource.executeCustomQuery(`
            SELECT DISTINCT 
                dc.storeid,
                COALESCE(p.CommercialName, 'Store ' + CAST(dc.storeid as varchar)) as storeName,
                COUNT(DISTINCT dc.patientid) as patientCount
            FROM datax_configuration dc
            LEFT JOIN pharmacy_master p ON dc.storeid = p.PharmacyID
            GROUP BY dc.storeid, p.CommercialName
            ORDER BY patientCount DESC
        `);
        
        res.json({
            stores: stores.map(s => ({
                storeId: s.storeid,
                storeName: s.storeName.replace(/Chemist Discount Centre/gi, 'CDC'),
                patientCount: s.patientCount
            }))
        });
    } catch (error) {
        console.error('Error fetching stores for refill predictions:', error);
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});

app.get('/api/refill-predictions', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        const { storeId, days = 3 } = req.query;  // Default to 3 days
        
        if (!storeId) {
            return res.json({
                user: req.session.user,
                requiresStoreSelection: true,
                predictions: [],
                storeInfo: null
            });
        }
        
        console.log(`Generating refill predictions for store: ${storeId}, days: ${days}`);
        console.log(`Date filter: DispensedDate >= DATEADD(day, -44, GETDATE()) = ${new Date(Date.now() - 44 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`);
        
        // Get store information
        const storeInfo = await dataSource.executeCustomQuery(`
            SELECT 
                p.PharmacyID as StoreId,
                p.CommercialName as StoreName,
                p.TimeZoneState as State,
                COUNT(DISTINCT dc.patientid) as ConfiguredPatients
            FROM pharmacy_master p
            LEFT JOIN datax_configuration dc ON p.PharmacyID = dc.storeid
            WHERE p.PharmacyID = ${storeId}
            GROUP BY p.PharmacyID, p.CommercialName, p.TimeZoneState
        `);
        
        // Refill prediction logic based on user requirements:
        // - Use DispensedDate as last purchase
        // - Next purchase should be DispensedDate + 30 days
        // - Drug should have TotalRepeats > 1
        // - Last dispense should not have TotalRepeats = RepeatNo (meaning they have repeats left)
        const refillPredictions = await dataSource.executeCustomQuery(`
            WITH LastDispenses AS (
                SELECT 
                    d.PatPharmSysID,
                    d.Drugname,
                    d.BrandName,
                    d.StoreId,
                    d.TotalRepeats,
                    d.RepeatNo,
                    d.DispensedDate as LastDispenseDate,
                    DATEADD(day, 30, d.DispensedDate) as PredictedRefillDate,
                    dc.contactemail,
                    ROW_NUMBER() OVER (PARTITION BY d.PatPharmSysID, d.Drugname ORDER BY d.DispensedDate DESC) as rn
                FROM cdc_dispense_data d
                INNER JOIN datax_configuration dc ON d.PatPharmSysID = dc.patientid AND d.StoreId = dc.storeid
                WHERE d.StoreId = ${storeId}
                    AND d.TotalRepeats > 1
                    AND d.PatPharmSysID IS NOT NULL
                    AND d.Drugname IS NOT NULL
                    AND d.DispensedDate >= DATEADD(day, -44, GETDATE())  -- Filter old dispenses here
            ),
            ValidRefills AS (
                SELECT 
                    PatPharmSysID,
                    Drugname,
                    BrandName,
                    StoreId,
                    TotalRepeats,
                    RepeatNo,
                    LastDispenseDate,
                    PredictedRefillDate,
                    contactemail,
                    CASE 
                        WHEN PredictedRefillDate < CAST(GETDATE() as date) THEN 'Overdue'
                        WHEN CAST(PredictedRefillDate as date) = CAST(GETDATE() as date) THEN 'Due Today'
                        WHEN CAST(PredictedRefillDate as date) = CAST(DATEADD(day, 1, GETDATE()) as date) THEN 'Due Tomorrow'
                        WHEN PredictedRefillDate <= DATEADD(day, 7, GETDATE()) THEN 'Due This Week'
                        WHEN PredictedRefillDate <= DATEADD(day, 14, GETDATE()) THEN 'Due Next Week'
                        ELSE 'Due Later'
                    END as Urgency,
                    DATEDIFF(day, GETDATE(), PredictedRefillDate) as DaysUntilDue
                FROM LastDispenses
                WHERE rn = 1
                    AND RepeatNo < TotalRepeats  -- Patient has repeats remaining
                    AND PredictedRefillDate <= DATEADD(day, ${days}, GETDATE())  -- Dynamic days filter
            )
            SELECT 
                PatPharmSysID as PatientId,
                Drugname,
                BrandName,
                TotalRepeats,
                RepeatNo,
                TotalRepeats - RepeatNo as RepeatsRemaining,
                CONVERT(varchar, LastDispenseDate, 23) as LastDispenseDate,
                CONVERT(varchar, PredictedRefillDate, 23) as PredictedRefillDate,
                contactemail as ContactEmail,
                Urgency,
                DaysUntilDue
            FROM ValidRefills
            ORDER BY 
                CASE Urgency
                    WHEN 'Overdue' THEN 0
                    WHEN 'Due Today' THEN 1
                    WHEN 'Due Tomorrow' THEN 2
                    WHEN 'Due This Week' THEN 3
                    WHEN 'Due Next Week' THEN 4
                    ELSE 5
                END,
                PredictedRefillDate,
                PatPharmSysID
        `);
        
        // Get summary statistics
        const summary = await dataSource.executeCustomQuery(`
            WITH LastDispenses AS (
                SELECT 
                    d.PatPharmSysID,
                    d.Drugname,
                    d.TotalRepeats,
                    d.RepeatNo,
                    d.DispensedDate,
                    DATEADD(day, 30, d.DispensedDate) as PredictedRefillDate,
                    ROW_NUMBER() OVER (PARTITION BY d.PatPharmSysID, d.Drugname ORDER BY d.DispensedDate DESC) as rn
                FROM cdc_dispense_data d
                INNER JOIN datax_configuration dc ON d.PatPharmSysID = dc.patientid AND d.StoreId = dc.storeid
                WHERE d.StoreId = ${storeId}
                    AND d.TotalRepeats > 1
                    AND d.PatPharmSysID IS NOT NULL
                    AND d.DispensedDate >= DATEADD(day, -44, GETDATE())  -- Filter old dispenses here
            )
            SELECT 
                COUNT(*) as TotalPredictions,
                SUM(CASE WHEN PredictedRefillDate < CAST(GETDATE() as date) THEN 1 ELSE 0 END) as Overdue,
                SUM(CASE WHEN CAST(PredictedRefillDate as date) = CAST(GETDATE() as date) THEN 1 ELSE 0 END) as DueToday,
                SUM(CASE WHEN PredictedRefillDate <= DATEADD(day, 7, GETDATE()) THEN 1 ELSE 0 END) as DueThisWeek,
                SUM(CASE WHEN PredictedRefillDate <= DATEADD(day, ${days}, GETDATE()) THEN 1 ELSE 0 END) as DueInSelectedPeriod,
                COUNT(DISTINCT PatPharmSysID) as UniquePatients
            FROM LastDispenses
            WHERE rn = 1
                AND RepeatNo < TotalRepeats
                AND PredictedRefillDate <= DATEADD(day, ${days}, GETDATE())
        `);
        
        console.log(`Found ${refillPredictions.length} refill predictions for store ${storeId}`);
        
        res.json({
            user: req.session.user,
            predictions: refillPredictions || [],
            summary: {
                totalPredictions: summary[0]?.TotalPredictions || 0,
                overdue: summary[0]?.Overdue || 0,
                dueToday: summary[0]?.DueToday || 0,
                dueThisWeek: summary[0]?.DueThisWeek || 0,
                dueInSelectedPeriod: summary[0]?.DueInSelectedPeriod || 0,
                uniquePatients: summary[0]?.UniquePatients || 0,
                selectedDays: days
            },
            storeInfo: storeInfo[0] || null
        });
    } catch (error) {
        console.error('Refill predictions error:', error);
        res.status(500).json({ 
            error: 'Failed to load refill predictions',
            user: req.session.user,
            predictions: [],
            summary: { totalPredictions: 0, overdue: 0, dueToday: 0, dueThisWeek: 0, dueInSelectedPeriod: 0, uniquePatients: 0, selectedDays: 3 },
            storeInfo: null
        });
    }
});

app.post('/api/chat', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, response: 'Unauthorized' });
    }
    const { message } = req.body;
    
    if (!message) {
        return res.json({ success: false, response: 'No message provided' });
    }
    
    try {
        // Process the chat message and generate response
        const response = await processChatMessage(message);
        res.json({ success: true, ...response });
    } catch (error) {
        console.error('Chat processing error:', error);
        res.json({ 
            success: false, 
            response: 'Sorry, I encountered an error processing your request. Please try again.' 
        });
    }
});

async function processChatMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for "BIR StoreID" command for detailed BuyItRight heart beat analysis
    if (lowerMessage.startsWith('bir ') && /bir\s+\d+/i.test(message)) {
        const storeId = message.match(/bir\s+(\d+)/i)[1];
        try {
            // First check if store has BIR integration enabled
            const storeCheck = await dataSource.executeCustomQuery(`
                SELECT 
                    PharmacyID as StoreId,
                    CommercialName as StoreName,
                    BIRExtractionFlag,
                    CASE WHEN BIRExtractionFlag = 1 THEN 'Active' ELSE 'Inactive' END as BIRStatus
                FROM pharmacy_master 
                WHERE PharmacyID = ${storeId}
            `);
            
            if (!storeCheck || storeCheck.length === 0) {
                return { response: `Store ${storeId} not found in pharmacy master data.` };
            }
            
            const store = storeCheck[0];
            
            if (store.BIRExtractionFlag !== 1) {
                return {
                    response: `
                        <div class="info-card">
                            <h4>💓 BIR Heart Beat Analysis - Store ${storeId}</h4>
                            <div style="background: #f8d7da; padding: 1rem; border-radius: 5px; color: #721c24;">
                                <h5>❌ BIR Integration Inactive</h5>
                                <p><strong>Store:</strong> ${store.StoreName}</p>
                                <p><strong>Status:</strong> BuyItRight integration is not enabled for this store.</p>
                                <p>Contact the implementation team to enable BIR integration.</p>
                            </div>
                        </div>
                    `,
                    isHtml: true
                };
            }
            
            // Get detailed BIR heart beat information
            const birHeartBeats = await dataSource.executeCustomQuery(`
                EXEC datax_configuration.dbo.usp_bir_heart_beats_get @StoreId = ${storeId}
            `);
            
            if (!birHeartBeats || birHeartBeats.length === 0) {
                return {
                    response: `
                        <div class="info-card">
                            <h4>💓 BIR Heart Beat Analysis - Store ${storeId}</h4>
                            <p><strong>Store:</strong> ${store.StoreName}</p>
                            <div style="background: #fff3cd; padding: 1rem; border-radius: 5px; color: #664d03; margin-top: 1rem;">
                                <h5>⚠️ No Heart Beat Data</h5>
                                <p>No heart beat data found for this store. This could mean:</p>
                                <ul style="margin-left: 1.5rem;">
                                    <li>BIR application is not running on the store</li>
                                    <li>Network connectivity issues</li>
                                    <li>Application is not configured properly</li>
                                    <li>Store has just been set up and hasn't sent first ping</li>
                                </ul>
                                <p><strong>Expected Frequency:</strong> Every 30 minutes</p>
                            </div>
                        </div>
                    `,
                    isHtml: true
                };
            }
            
            // Build detailed heart beat analysis
            const heartBeat = birHeartBeats[0];
            const now = new Date();
            let lastBeatTime = null;
            let timeSinceLastBeat = null;
            let status = 'Unknown';
            let statusColor = '#6c757d';
            let statusIcon = '❓';
            
            if (heartBeat.lastping) {
                lastBeatTime = new Date(heartBeat.lastping);
                timeSinceLastBeat = Math.floor((now - lastBeatTime) / (1000 * 60)); // minutes
                
                if (timeSinceLastBeat <= 30) {
                    status = 'Healthy';
                    statusColor = '#198754';
                    statusIcon = '💚';
                } else if (timeSinceLastBeat <= 60) {
                    status = 'Warning';
                    statusColor = '#ffc107';
                    statusIcon = '⚠️';
                } else {
                    status = 'Critical';
                    statusColor = '#dc3545';
                    statusIcon = '🚨';
                }
            }
            
            return {
                response: `
                    <div class="info-card">
                        <h4>💓 BIR Heart Beat Analysis - Store ${storeId}</h4>
                        <p><strong>Store:</strong> ${store.StoreName}</p>
                        
                        <div style="background: ${status === 'Healthy' ? '#e8f5e8' : status === 'Warning' ? '#fff3cd' : '#f8d7da'}; padding: 1rem; border-radius: 5px; margin: 1rem 0; border-left: 4px solid ${statusColor};">
                            <h5 style="color: ${statusColor}; margin-bottom: 0.5rem;">${statusIcon} Status: ${status}</h5>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div>
                                    <p><strong>Last Heart Beat:</strong><br>${heartBeat.lastping ? new Date(heartBeat.lastping).toLocaleString() : 'N/A'}</p>
                                    <p><strong>Previous Heart Beat:</strong><br>${heartBeat.previousping ? new Date(heartBeat.previousping).toLocaleString() : 'N/A'}</p>
                                </div>
                                <div>
                                    <p><strong>Time Since Last Beat:</strong><br>${timeSinceLastBeat !== null ? timeSinceLastBeat + ' minutes' : 'N/A'}</p>
                                    <p><strong>Expected Frequency:</strong><br>Every 30 minutes</p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f8f9fa; padding: 1rem; border-radius: 5px;">
                            <h6 style="color: #666; margin-bottom: 0.5rem;">📋 Troubleshooting Guide</h6>
                            ${status === 'Healthy' ? `
                                <p style="color: #198754; margin: 0;">✅ BIR application is running normally. No action required.</p>
                            ` : status === 'Warning' ? `
                                <p style="color: #856404; margin: 0;">⚠️ Heart beat is delayed. Monitor for next 30 minutes.</p>
                                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">• Check store network connectivity<br>• Verify BIR application is running</p>
                            ` : `
                                <p style="color: #721c24; margin: 0;">🚨 Heart beat is missing. Immediate action required.</p>
                                <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">• Contact store to check BIR application<br>• Verify network connectivity<br>• Check if application needs restart</p>
                            `}
                        </div>
                    </div>
                `,
                isHtml: true
            };
            
        } catch (error) {
            console.error('BIR command error:', error);
            return { response: `Error retrieving BIR information for store ${storeId}: ${error.message}` };
        }
    }
    
    // Check for "Info StoreID" command
    if (lowerMessage.startsWith('info ') && /info\s+\d+/i.test(message)) {
        const storeId = message.match(/info\s+(\d+)/i)[1];
        try {
            // Get comprehensive store information including BIR status
            const storeInfo = await dataSource.executeCustomQuery(`
                SELECT 
                    p.PharmacyID as StoreId,
                    p.CommercialName as StoreName,
                    p.TimeZoneState as State,
                    p.ContactPerson1 as ContactPerson,
                    p.ContactNumber,
                    CASE WHEN p.ExcludeHC = 1 THEN 'Inactive' ELSE 'Active' END as Status,
                    CASE WHEN p.BIRExtractionFlag = 1 THEN 'Active' ELSE 'Inactive' END as BIRStatus
                FROM pharmacy_master p 
                WHERE p.PharmacyID = ${storeId}
            `);
            
            if (!storeInfo || storeInfo.length === 0) {
                return { response: `Store ${storeId} not found in pharmacy master data.` };
            }
            
            const store = storeInfo[0];
            
            // Get last sales transaction
            let lastSales = null;
            try {
                const salesData = await dataSource.executeTransactionQuery(`
                    SELECT TOP 1 
                        CONVERT(varchar, SalesDate, 120) as LastSalesDate,
                        COUNT(*) OVER() as TotalSalesToday
                    FROM dw_production.dbo.sales_transactions 
                    WHERE StoreId = '${storeId}'
                    ORDER BY SalesDate DESC
                `);
                lastSales = salesData[0];
            } catch (e) {
                console.log('Sales data not available for store:', storeId);
            }
            
            // Get stock counts
            let stockInfo = { StockCount: 0, UniqueBarcodes: 0, TotalLinks: 0 };
            try {
                const stockCount = await dataSource.executeTransactionQuery(`
                    SELECT COUNT(*) as StockCount
                    FROM store_stock 
                    WHERE StoreId = '${storeId}'
                `);
                
                const barcodeCount = await dataSource.executeTransactionQuery(`
                    SELECT 
                        COUNT(DISTINCT EAN) as UniqueBarcodes,
                        COUNT(*) as TotalLinks
                    FROM store_ean_lnk_stock 
                    WHERE StoreId = '${storeId}'
                `);
                
                stockInfo = {
                    StockCount: stockCount[0]?.StockCount || 0,
                    UniqueBarcodes: barcodeCount[0]?.UniqueBarcodes || 0,
                    TotalLinks: barcodeCount[0]?.TotalLinks || 0
                };
            } catch (e) {
                console.log('Stock data not available for store:', storeId);
            }
            
            
            // Get total patients count
            let patientCount = 0;
            try {
                const patientData = await dataSource.executeTransactionQuery(`
                    SELECT COUNT(DISTINCT PatientId) as TotalPatients
                    FROM dw_production.dbo.patient 
                    WHERE StoreId = '${storeId}'
                `);
                patientCount = patientData[0]?.TotalPatients || 0;
            } catch (e) {
                // Try alternative patient count from dispense data
                try {
                    const altPatientData = await dataSource.executeTransactionQuery(`
                        SELECT COUNT(DISTINCT PatPharmSysID) as TotalPatients
                        FROM dw_production.dbo.dispense_transactions 
                        WHERE StoreId = '${storeId}'
                    `);
                    patientCount = altPatientData[0]?.TotalPatients || 0;
                } catch (e2) {
                    console.log('Patient count not available for store:', storeId);
                }
            }
            
            // Get BIR Heart Beat information if store has BIR integration
            let birHeartBeat = null;
            if (store.BIRStatus === 'Active') {
                try {
                    const birData = await dataSource.executeCustomQuery(`
                        EXEC datax_configuration.dbo.usp_bir_heart_beats_get @StoreId = ${storeId}
                    `);
                    birHeartBeat = birData[0]; // Assuming stored proc returns recent heart beat info
                } catch (e) {
                    console.log('BIR heart beat data not available for store:', storeId);
                }
            }
            
            return {
                response: `
                    <div class="info-card">
                        <h4>📍 Store Information - ID: ${store.StoreId}</h4>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1rem 0;">
                            <div>
                                <h5 style="color: #667eea; margin-bottom: 0.5rem;">🏪 Store Details</h5>
                                <p><strong>Name:</strong> ${store.StoreName || 'N/A'}</p>
                                <p><strong>State:</strong> ${store.State || 'N/A'}</p>
                                <p><strong>Status:</strong> <span style="color: ${store.Status === 'Active' ? '#198754' : '#dc3545'}">${store.Status}</span></p>
                                <p><strong>BIR Integration:</strong> <span style="color: ${store.BIRStatus === 'Active' ? '#198754' : '#dc3545'}">${store.BIRStatus}</span></p>
                                <p><strong>Contact:</strong> ${store.ContactPerson || 'N/A'}</p>
                                <p><strong>Phone:</strong> ${store.ContactNumber || 'N/A'}</p>
                            </div>
                            
                            <div>
                                <h5 style="color: #667eea; margin-bottom: 0.5rem;">📊 Activity Summary</h5>
                                <p><strong>Last Sales:</strong> ${lastSales?.LastSalesDate || 'No data'}</p>
                                <p><strong>Total Patients:</strong> ${patientCount.toLocaleString()}</p>
                                <p><strong>Stock Records:</strong> ${stockInfo.StockCount.toLocaleString()}</p>
                                <p><strong>Unique Barcodes:</strong> ${stockInfo.UniqueBarcodes.toLocaleString()}</p>
                            </div>
                        </div>
                        
                        
                        ${store.BIRStatus === 'Active' ? `
                            <div style="background: ${birHeartBeat ? '#e8f5e8' : '#fff3cd'}; padding: 0.5rem; border-radius: 5px; margin-top: 1rem; border-left: 4px solid ${birHeartBeat ? '#198754' : '#ffc107'};">
                                <h6 style="margin: 0 0 0.5rem 0; color: #666;">💓 BIR Heart Beat Status</h6>
                                ${birHeartBeat ? `
                                    <p style="margin: 0; font-size: 0.9rem;"><strong>Status:</strong> <span style="color: #198754;">✓ Active</span> | <strong>Last Beat:</strong> ${birHeartBeat.lastping ? new Date(birHeartBeat.lastping).toLocaleString() : 'N/A'} | <strong>Previous Beat:</strong> ${birHeartBeat.previousping ? new Date(birHeartBeat.previousping).toLocaleString() : 'N/A'}</p>
                                ` : `
                                    <p style="margin: 0; font-size: 0.9rem; color: #856404;"><strong>Status:</strong> ⚠️ No recent heart beat data available</p>
                                `}
                            </div>
                        ` : ''}
                    </div>
                `,
                isHtml: true
            };
            
        } catch (error) {
            console.error('Info command error:', error);
            return { response: `Error retrieving information for store ${storeId}: ${error.message}` };
        }
    }
    
    // Check for pharmacy ID lookup (legacy support)
    if (lowerMessage.includes('pharmacy') && (lowerMessage.includes('id') || /\d+/.test(message))) {
        const pharmacyId = message.match(/\d+/);
        if (pharmacyId) {
            try {
                const result = await dataSource.executeCustomQuery(`
                    SELECT PharmacyID, CommercialName as StoreName, ContactPerson1, 
                           ContactNumber, TimeZoneState as State, 
                           CASE WHEN ExcludeHC = 'False' THEN 'Active' ELSE 'Inactive' END as Status
                    FROM pharmacy_master 
                    WHERE PharmacyID = ${pharmacyId[0]}
                `);
                
                if (result && result.length > 0) {
                    const pharmacy = result[0];
                    return {
                        response: `
                            <div class="info-card">
                                <h4>Pharmacy Information - ID: ${pharmacy.PharmacyID}</h4>
                                <p><strong>Store Name:</strong> ${pharmacy.StoreName || 'N/A'}</p>
                                <p><strong>Contact Person:</strong> ${pharmacy.ContactPerson1 || 'N/A'}</p>
                                <p><strong>Contact Number:</strong> ${pharmacy.ContactNumber || 'N/A'}</p>
                                <p><strong>State:</strong> ${pharmacy.State || 'N/A'}</p>
                                <p><strong>Status:</strong> ${pharmacy.Status}</p>
                            </div>
                        `,
                        isHtml: true
                    };
                } else {
                    return { response: `No pharmacy found with ID ${pharmacyId[0]}` };
                }
            } catch (error) {
                return { response: 'Error looking up pharmacy information. Please try again.' };
            }
        }
    }
    
    // Check for pharmacy status
    if (lowerMessage.includes('status') && lowerMessage.includes('pharmac')) {
        return { response: 'Please provide the pharmacy ID to check its status. For example: "Check status of pharmacy 1234"' };
    }
    
    // Check for patient medication history
    if (lowerMessage.includes('patient') && (lowerMessage.includes('medication') || lowerMessage.includes('history'))) {
        return { 
            response: 'To check patient medication history, please provide the patient ID. For example: "Patient 12345 medication history"' 
        };
    }
    
    // Check for dispensing statistics
    if (lowerMessage.includes('dispensing') || lowerMessage.includes('stats') || lowerMessage.includes('statistics')) {
        try {
            const todayStats = await dataSource.executeCustomQuery(`
                SELECT 
                    COUNT(DISTINCT PatPharmSysID) as UniquePatients,
                    COUNT(*) as TotalDispenses,
                    COUNT(DISTINCT StoreId) as ActiveStores
                FROM cdc_dispense_data 
                WHERE CAST(DispensedDate as DATE) = CAST(GETDATE() as DATE)
            `);
            
            if (todayStats && todayStats.length > 0) {
                const stats = todayStats[0];
                return {
                    response: `
                        <div class="info-card">
                            <h4>Today's Dispensing Statistics</h4>
                            <p><strong>Total Dispenses:</strong> ${stats.TotalDispenses || 0}</p>
                            <p><strong>Unique Patients:</strong> ${stats.UniquePatients || 0}</p>
                            <p><strong>Active Stores:</strong> ${stats.ActiveStores || 0}</p>
                        </div>
                    `,
                    isHtml: true
                };
            }
        } catch (error) {
            return { response: 'Unable to fetch dispensing statistics at this time.' };
        }
    }
    
    // Check for recent prescriptions
    if (lowerMessage.includes('recent') && (lowerMessage.includes('prescription') || lowerMessage.includes('script'))) {
        try {
            const recentScripts = await dataSource.executeCustomQuery(`
                SELECT TOP 10 
                    ScriptNo, 
                    PatPharmSysID,
                    Drugname,
                    StoreId,
                    CONVERT(varchar, DispensedDate, 120) as DispensedDate
                FROM cdc_dispense_data 
                ORDER BY DispensedDate DESC
            `);
            
            if (recentScripts && recentScripts.length > 0) {
                let tableHtml = `
                    <div class="info-card">
                        <h4>Recent Prescriptions</h4>
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Script#</th>
                                    <th>Patient ID</th>
                                    <th>Drug</th>
                                    <th>Store</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                recentScripts.forEach(script => {
                    tableHtml += `
                        <tr>
                            <td>${script.ScriptNo || 'N/A'}</td>
                            <td>${script.PatPharmSysID || 'N/A'}</td>
                            <td>${script.Drugname || 'N/A'}</td>
                            <td>${script.StoreId || 'N/A'}</td>
                            <td>${script.DispensedDate || 'N/A'}</td>
                        </tr>
                    `;
                });
                
                tableHtml += '</tbody></table></div>';
                return { response: tableHtml, isHtml: true };
            }
        } catch (error) {
            return { response: 'Unable to fetch recent prescriptions at this time.' };
        }
    }
    
    // Check for last transaction queries
    if ((lowerMessage.includes('last') || lowerMessage.includes('latest')) && 
        (lowerMessage.includes('transaction') || lowerMessage.includes('sale') || lowerMessage.includes('dispense'))) {
        
        const storeId = message.match(/\d+/);
        if (!storeId) {
            return { 
                response: 'Please provide a store ID to check the last transaction. For example: "Last sales transaction for store 1234"' 
            };
        }
        
        try {
            let queryResult = null;
            let tableType = '';
            
            // Check if it's for sales transactions
            if (lowerMessage.includes('sale')) {
                queryResult = await dataSource.executeTransactionQuery(`
                    SELECT TOP 1 
                        StoreId,
                        CONVERT(varchar, SalesDate, 120) as LastSalesDate,
                        COUNT(*) OVER() as TotalRecordsToday
                    FROM dw_production.dbo.sales_transactions 
                    WHERE StoreId = '${storeId[0]}'
                    ORDER BY SalesDate DESC
                `);
                tableType = 'Sales';
            }
            // Check if it's for dispense transactions
            else if (lowerMessage.includes('dispense')) {
                queryResult = await dataSource.executeTransactionQuery(`
                    SELECT TOP 1 
                        StoreId,
                        CONVERT(varchar, DispensedDate, 120) as LastDispenseDate,
                        ScriptNo,
                        Drugname,
                        PatPharmSysID,
                        COUNT(*) OVER() as TotalRecordsToday
                    FROM dispense_transactions 
                    WHERE StoreId = '${storeId[0]}'
                    ORDER BY DispensedDate DESC
                `);
                tableType = 'Dispense';
            }
            
            if (queryResult && queryResult.length > 0) {
                const data = queryResult[0];
                if (tableType === 'Sales') {
                    return {
                        response: `
                            <div class="info-card">
                                <h4>Last Sales Transaction - Store ${storeId[0]}</h4>
                                <p><strong>Last Sales Date:</strong> ${data.LastSalesDate || 'No records found'}</p>
                                <p><strong>Total Records:</strong> ${data.TotalRecordsToday || 0}</p>
                            </div>
                        `,
                        isHtml: true
                    };
                } else if (tableType === 'Dispense') {
                    return {
                        response: `
                            <div class="info-card">
                                <h4>Last Dispense Transaction - Store ${storeId[0]}</h4>
                                <p><strong>Last Dispensed Date:</strong> ${data.LastDispenseDate || 'No records found'}</p>
                                <p><strong>Script Number:</strong> ${data.ScriptNo || 'N/A'}</p>
                                <p><strong>Drug Name:</strong> ${data.Drugname || 'N/A'}</p>
                                <p><strong>Patient ID:</strong> ${data.PatPharmSysID || 'N/A'}</p>
                                <p><strong>Total Records:</strong> ${data.TotalRecordsToday || 0}</p>
                            </div>
                        `,
                        isHtml: true
                    };
                }
            } else {
                return { response: `No transaction records found for store ${storeId[0]}` };
            }
        } catch (error) {
            console.error('Transaction query error:', error);
            return { response: `Error checking transaction records: ${error.message}. Please verify the store ID and try again.` };
        }
    }
    
    // Check for stock count queries
    if ((lowerMessage.includes('stock') || lowerMessage.includes('barcode') || lowerMessage.includes('ean')) && 
        (lowerMessage.includes('count') || lowerMessage.includes('how many'))) {
        
        const storeId = message.match(/\d+/);
        if (!storeId) {
            return { 
                response: 'Please provide a store ID to check stock counts. For example: "Stock count for store 1234"' 
            };
        }
        
        try {
            // Get stock count
            const stockCount = await dataSource.executeTransactionQuery(`
                SELECT 
                    COUNT(*) as StockCount
                FROM store_stock 
                WHERE StoreId = '${storeId[0]}'
            `);
            
            // Get barcode count
            const barcodeCount = await dataSource.executeTransactionQuery(`
                SELECT 
                    COUNT(DISTINCT EAN) as UniqueBarcodes,
                    COUNT(*) as TotalLinks
                FROM store_ean_lnk_stock 
                WHERE StoreId = '${storeId[0]}'
            `);
            
            const stock = stockCount[0] || { StockCount: 0 };
            const barcode = barcodeCount[0] || { UniqueBarcodes: 0, TotalLinks: 0 };
            
            return {
                response: `
                    <div class="info-card">
                        <h4>Stock Information - Store ${storeId[0]}</h4>
                        <p><strong>Stock Records:</strong> ${stock.StockCount || 0}</p>
                        <p><strong>Unique Barcodes (EAN):</strong> ${barcode.UniqueBarcodes || 0}</p>
                        <p><strong>Total Barcode Links:</strong> ${barcode.TotalLinks || 0}</p>
                    </div>
                `,
                isHtml: true
            };
        } catch (error) {
            console.error('Stock query error:', error);
            return { response: `Error checking stock counts: ${error.message}. The tables might not exist or the store ID is invalid.` };
        }
    }
    
    // Check for "Error StoreID" command (standardized format)
    if (lowerMessage.startsWith('error ') && /error\s+\d+/i.test(message)) {
        const storeId = message.match(/error\s+(\d+)/i)[1];
        
        try {
            // Query system_error_table in DataX_Configuration for last 3 days
            const errorQuery = await dataSource.executeCustomQuery(`
                SELECT TOP 50
                    PharmacyId,
                    ErrorID,
                    ErrorIndicator,
                    ErrorTypeUDC,
                    ErrorSource,
                    ErrorMessage,
                    StepUDC,
                    TableName,
                    CONVERT(varchar, ErrorDate, 120) as ErrorDate
                FROM DataX_Configuration.dbo.system_error_table
                WHERE PharmacyId = '${storeId}'
                    AND ErrorDate >= DATEADD(day, -3, GETDATE())
                ORDER BY ErrorDate DESC
            `);
            
            if (errorQuery && errorQuery.length > 0) {
                // Group errors by type and source for summary
                const errorTypeSummary = {};
                const errorSourceSummary = {};
                
                errorQuery.forEach(error => {
                    const type = error.ErrorTypeUDC || 'Unknown';
                    if (!errorTypeSummary[type]) {
                        errorTypeSummary[type] = 0;
                    }
                    errorTypeSummary[type]++;
                    
                    const source = error.ErrorSource || 'Unknown';
                    if (!errorSourceSummary[source]) {
                        errorSourceSummary[source] = 0;
                    }
                    errorSourceSummary[source]++;
                });
                
                let summaryHtml = `
                    <div class="info-card">
                        <h4>🚨 Error Summary - Store ${storeId} (Last 3 Days)</h4>
                        <p><strong>Total Errors:</strong> ${errorQuery.length}</p>
                        <hr style="margin: 10px 0;">
                        <h5>Error Types:</h5>
                `;
                
                for (const [type, count] of Object.entries(errorTypeSummary)) {
                    summaryHtml += `<p style="margin-left: 1rem;">• ${type}: ${count}</p>`;
                }
                
                summaryHtml += `<hr style="margin: 10px 0;"><h5>Error Sources:</h5>`;
                for (const [source, count] of Object.entries(errorSourceSummary)) {
                    summaryHtml += `<p style="margin-left: 1rem;">• ${source}: ${count}</p>`;
                }
                
                // Show recent 5 errors in detail
                summaryHtml += `
                    <hr style="margin: 10px 0;">
                    <h5>Recent Errors (Latest 5):</h5>
                    <table class="data-table" style="font-size: 0.9em;">
                        <thead>
                            <tr>
                                <th>Date/Time</th>
                                <th>Type</th>
                                <th>Source</th>
                                <th>Table</th>
                                <th>Error Message</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                errorQuery.slice(0, 5).forEach(error => {
                    const errorDateTime = error.ErrorDate || 'N/A';
                    summaryHtml += `
                        <tr>
                            <td>${errorDateTime}</td>
                            <td>${error.ErrorTypeUDC || 'N/A'}</td>
                            <td>${error.ErrorSource || 'N/A'}</td>
                            <td>${error.TableName || 'N/A'}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${error.ErrorMessage || ''}">${(error.ErrorMessage || 'N/A').substring(0, 60)}${error.ErrorMessage && error.ErrorMessage.length > 60 ? '...' : ''}</td>
                        </tr>
                    `;
                });
                
                summaryHtml += '</tbody></table></div>';
                
                return {
                    response: summaryHtml,
                    isHtml: true
                };
            } else {
                return { 
                    response: `<div class="info-card">
                        <h4>✅ No Errors Found</h4>
                        <p>No errors found for store ${storeId} in the last 3 days. The system appears to be running smoothly!</p>
                    </div>`,
                    isHtml: true
                };
            }
        } catch (error) {
            console.error('Error command failed:', error);
            return { response: `Error checking system errors for store ${storeId}: ${error.message}` };
        }
    }
    
    // Check for store error queries (legacy support)
    if ((lowerMessage.includes('error') || lowerMessage.includes('issue') || lowerMessage.includes('problem')) && 
        (lowerMessage.includes('store') || /\d+/.test(message))) {
        
        const storeId = message.match(/\d+/);
        if (!storeId) {
            return { 
                response: 'Please provide a store ID to check errors. For example: "Error 1234" or legacy "Show errors for store 1234"' 
            };
        }
        
        try {
            // Query system_error_table in DataX_Configuration for last 3 days
            const errorQuery = await dataSource.executeCustomQuery(`
                SELECT TOP 50
                    PharmacyId,
                    ErrorID,
                    ErrorIndicator,
                    ErrorTypeUDC,
                    ErrorSource,
                    ErrorMessage,
                    StepUDC,
                    TableName,
                    CONVERT(varchar, ErrorDate, 120) as ErrorDate
                FROM DataX_Configuration.dbo.system_error_table
                WHERE PharmacyId = '${storeId[0]}'
                    AND ErrorDate >= DATEADD(day, -3, GETDATE())
                ORDER BY ErrorDate DESC
            `);
            
            if (errorQuery && errorQuery.length > 0) {
                // Group errors by type and source for summary
                const errorTypeSummary = {};
                const errorSourceSummary = {};
                
                errorQuery.forEach(error => {
                    const type = error.ErrorTypeUDC || 'Unknown';
                    if (!errorTypeSummary[type]) {
                        errorTypeSummary[type] = 0;
                    }
                    errorTypeSummary[type]++;
                    
                    const source = error.ErrorSource || 'Unknown';
                    if (!errorSourceSummary[source]) {
                        errorSourceSummary[source] = 0;
                    }
                    errorSourceSummary[source]++;
                });
                
                let summaryHtml = `
                    <div class="info-card">
                        <h4>Error Summary - Store ${storeId[0]} (Last 3 Days)</h4>
                        <p><strong>Total Errors:</strong> ${errorQuery.length}</p>
                        <hr style="margin: 10px 0;">
                        <h5>Error Types:</h5>
                `;
                
                for (const [type, count] of Object.entries(errorTypeSummary)) {
                    summaryHtml += `<p style="margin-left: 1rem;">• ${type}: ${count}</p>`;
                }
                
                summaryHtml += `<hr style="margin: 10px 0;"><h5>Error Sources:</h5>`;
                for (const [source, count] of Object.entries(errorSourceSummary)) {
                    summaryHtml += `<p style="margin-left: 1rem;">• ${source}: ${count}</p>`;
                }
                
                // Show recent 5 errors in detail
                summaryHtml += `
                    <hr style="margin: 10px 0;">
                    <h5>Recent Errors (Latest 5):</h5>
                    <table class="data-table" style="font-size: 0.9em;">
                        <thead>
                            <tr>
                                <th>Date/Time</th>
                                <th>Type</th>
                                <th>Source</th>
                                <th>Table</th>
                                <th>Error Message</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                errorQuery.slice(0, 5).forEach(error => {
                    const errorDateTime = error.ErrorDate || 'N/A';
                    summaryHtml += `
                        <tr>
                            <td>${errorDateTime}</td>
                            <td>${error.ErrorTypeUDC || 'N/A'}</td>
                            <td>${error.ErrorSource || 'N/A'}</td>
                            <td>${error.TableName || 'N/A'}</td>
                            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;" title="${error.ErrorMessage || ''}">${(error.ErrorMessage || 'N/A').substring(0, 60)}${error.ErrorMessage && error.ErrorMessage.length > 60 ? '...' : ''}</td>
                        </tr>
                    `;
                });
                
                summaryHtml += '</tbody></table></div>';
                
                return {
                    response: summaryHtml,
                    isHtml: true
                };
            } else {
                return { 
                    response: `<div class="info-card">
                        <h4>No Errors Found</h4>
                        <p>No errors found for store ${storeId[0]} in the last 3 days. The system appears to be running smoothly!</p>
                    </div>`,
                    isHtml: true
                };
            }
        } catch (error) {
            console.error('Error query failed:', error);
            return { response: `Error checking system errors: ${error.message}. Please verify the store ID and try again.` };
        }
    }
    
    // System troubleshooting help
    if (lowerMessage.includes('help') || lowerMessage.includes('troubleshoot') || lowerMessage.includes('issue')) {
        return {
            response: `
                <div class="info-card">
                    <h4>Common Troubleshooting Steps</h4>
                    <p><strong>Login Issues:</strong></p>
                    <ul style="margin-left: 1.5rem;">
                        <li>Verify username and password are correct</li>
                        <li>Check if user status is active (StatusUDC = 'SUS10')</li>
                        <li>Clear browser cache and cookies</li>
                    </ul>
                    <p style="margin-top: 0.5rem;"><strong>Data Not Loading:</strong></p>
                    <ul style="margin-left: 1.5rem;">
                        <li>Check database connectivity</li>
                        <li>Verify pharmacy ID exists in system</li>
                        <li>Ensure date filters are set correctly</li>
                    </ul>
                    <p style="margin-top: 0.5rem;"><strong>Performance Issues:</strong></p>
                    <ul style="margin-left: 1.5rem;">
                        <li>Select specific stores instead of "All Stores"</li>
                        <li>Use date filters to limit data range</li>
                        <li>Contact IT if issues persist</li>
                    </ul>
                </div>
            `,
            isHtml: true
        };
    }
    
    // Default response with suggestions
    return {
        response: `I'm not sure I understood your request. Here are the standardized commands I can help with:

🔧 **Quick Commands:**
• **Info 1234** - Complete store information (sales, stock, dispense data, patient count, BIR status)
• **Error 1234** - Recent errors for store (last 3 days)  
• **BIR 1234** - Detailed BuyItRight heart beat analysis and troubleshooting

📋 **Legacy Commands (still supported):**
• Find pharmacy by ID (e.g., "Show pharmacy 1234")
• Last sales transaction (e.g., "Last sales for store 245")
• Last dispense transaction (e.g., "Last dispense for store 245")
• Stock & barcode counts (e.g., "Stock count for store 245")
• Check dispensing statistics
• View recent prescriptions
• Patient medication history
• System troubleshooting
        
**Tip:** Use the new standardized commands for faster, comprehensive results!`
    };
}

// ================================
// USER MANAGEMENT ENDPOINTS
// ================================

// Get user management page
app.get('/user-management', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    // Check if user has permission to manage users
    if (!hasPermissionSync(req.session.user, 'MANAGE_USERS')) {
        return res.status(403).send('<h1>Access Denied</h1><p>You do not have permission to access user management.</p><a href="/dashboard">Return to Dashboard</a>');
    }
    
    res.sendFile(path.join(__dirname, '..', 'public', 'user-management.html'));
});

// Get all users with roles
app.get('/api/users', requirePermission('MANAGE_USERS'), async (req, res) => {
    
    try {
        const users = await dataSource.executeCustomQuery(`
            SELECT 
                u.Userid,
                u.Username,
                u.Email,
                u.Firstname,
                u.Lastname,
                u.Status,
                u.StatusUDC,
                u.IsSuperAdmin,
                u.CreatedDate,
                u.UpdatedDate,
                r.RoleName,
                r.RoleDescription
            FROM sys_user_master u
            LEFT JOIN user_roles r ON u.RoleID = r.RoleID
            ORDER BY u.CreatedDate DESC
        `);
        
        res.json({
            users: users || [],
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get all roles
app.get('/api/roles', requirePermission('MANAGE_USERS'), async (req, res) => {
    
    try {
        const roles = await dataSource.executeCustomQuery(`
            SELECT RoleID, RoleName, RoleDescription, IsActive
            FROM user_roles
            WHERE IsActive = 1
            ORDER BY RoleName
        `);
        
        res.json({ roles: roles || [] });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

// Create new user
app.post('/api/users', requirePermission('MANAGE_USERS'), async (req, res) => {
    
    const { username, password, email, firstname, lastname, roleId } = req.body;
    
    if (!username || !password || !email || !firstname || !lastname || !roleId) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    try {
        const result = await dataSource.executeStoredProcedure('usp_create_user', {
            Username: username,
            Password: password,
            Email: email,
            Firstname: firstname,
            Lastname: lastname,
            RoleID: roleId,
            CreatedBy: req.session.user.username
        });
        
        if (result[0]?.Result === 'ERROR') {
            return res.status(400).json({ error: result[0].Message });
        }
        
        res.json({
            success: true,
            message: 'User created successfully',
            userId: result[0]?.UserID
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user
app.put('/api/users/:id', requirePermission('MANAGE_USERS'), async (req, res) => {
    
    const userId = req.params.id;
    const { email, firstname, lastname, roleId, status } = req.body;
    
    if (!email || !firstname || !lastname || !roleId || !status) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    try {
        const result = await dataSource.executeStoredProcedure('usp_update_user', {
            UserID: userId,
            Email: email,
            Firstname: firstname,
            Lastname: lastname,
            RoleID: roleId,
            Status: status,
            ModifiedBy: req.session.user.username
        });
        
        if (result[0]?.Result === 'ERROR') {
            return res.status(400).json({ error: result[0].Message });
        }
        
        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Get user permissions
app.get('/api/users/:username/permissions', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const username = req.params.username;
    
    try {
        const permissions = await dataSource.executeStoredProcedure('usp_get_user_permissions', {
            Username: username
        });
        
        res.json({
            username: username,
            permissions: permissions || []
        });
    } catch (error) {
        console.error('Error fetching user permissions:', error);
        res.status(500).json({ error: 'Failed to fetch permissions' });
    }
});

// ================================
// EMAIL TEST ENDPOINTS
// ================================

// Email test page
app.get('/email-test', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'email-test.html'));
});

// Verify email connection
app.get('/api/email/verify', async (req, res) => {
    try {
        const result = await emailService.verifyConnection();
        res.json(result);
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify email connection',
            error: error.message 
        });
    }
});

// Send test email
app.post('/api/email/send-test', async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        
        if (!to) {
            return res.status(400).json({ 
                success: false, 
                message: 'Recipient email is required' 
            });
        }
        
        const result = await emailService.sendTestEmail(to, subject, message);
        res.json(result);
    } catch (error) {
        console.error('Send test email error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send test email',
            error: error.message 
        });
    }
});

// Get email configuration (without sensitive data)
app.get('/api/email/config', (req, res) => {
    res.json({
        host: emailService.emailConfig.host,
        port: emailService.emailConfig.port,
        secure: emailService.emailConfig.secure,
        user: emailService.emailConfig.auth.user,
        // Don't send password
        configured: true
    });
});

// Middleware to check permissions
function requirePermission(permissionName) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Super admin has all permissions
        if (req.session.user.isSuperAdmin) {
            return next();
        }
        
        // Check if user has the required permission
        if (req.session.user.permissions && req.session.user.permissions.includes(permissionName)) {
            return next();
        }
        
        return res.status(403).json({ error: 'Insufficient permissions' });
    };
}

// Helper function to check permissions
function hasPermissionSync(user, permissionName) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.permissions && user.permissions.includes(permissionName);
}

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

async function startServer() {
    try {
        await connectToDatabase();
        console.log('Database connected successfully');
        
        // Test dw_production connection
        try {
            console.log('Testing dw_production database connection...');
            await dataSource.executeTransactionQuery('SELECT 1 as test');
            console.log('dw_production database connection successful');
        } catch (dwError) {
            console.error('Warning: dw_production database connection failed:', dwError.message);
            console.error('Transaction queries may not work properly');
        }
        
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
            console.log(`Login page: http://localhost:${PORT}/login`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();