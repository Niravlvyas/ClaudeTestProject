const errorFilter = require('./errorFilter');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function displayMenu() {
    console.log('\n=== Error Exception Manager ===');
    console.log('1. View current exceptions');
    console.log('2. Add new error pattern');
    console.log('3. Add new regex pattern');
    console.log('4. Toggle error pattern');
    console.log('5. Toggle regex pattern');
    console.log('6. Remove error pattern');
    console.log('7. Remove regex pattern');
    console.log('8. Toggle logging of ignored errors');
    console.log('9. Test error against filters');
    console.log('0. Exit');
    console.log('================================\n');
}

function viewExceptions() {
    const config = errorFilter.getConfig();
    
    console.log('\n--- Ignored Error Patterns ---');
    if (config.ignoredErrors.length === 0) {
        console.log('No error patterns configured');
    } else {
        config.ignoredErrors.forEach((err, index) => {
            const status = err.enabled ? '✓' : '✗';
            console.log(`${index + 1}. [${status}] "${err.pattern}"`);
            console.log(`   Description: ${err.description || 'N/A'}`);
        });
    }
    
    console.log('\n--- Ignored Regex Patterns ---');
    if (config.ignoredPatterns.length === 0) {
        console.log('No regex patterns configured');
    } else {
        config.ignoredPatterns.forEach((pattern, index) => {
            const status = pattern.enabled ? '✓' : '✗';
            console.log(`${index + 1}. [${status}] /${pattern.regex}/`);
            console.log(`   Description: ${pattern.description || 'N/A'}`);
        });
    }
    
    console.log(`\nLog Ignored Errors: ${config.logIgnoredErrors ? 'Yes' : 'No'}`);
    console.log(`Case Sensitive: ${config.settings.caseSensitive ? 'Yes' : 'No'}`);
    console.log(`Use Regex Matching: ${config.settings.useRegexMatching ? 'Yes' : 'No'}`);
}

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function addErrorPattern() {
    const pattern = await askQuestion('Enter error pattern to ignore: ');
    const description = await askQuestion('Enter description (optional): ');
    const enabled = await askQuestion('Enable immediately? (y/n): ');
    
    errorFilter.addIgnoredError(pattern, description, enabled.toLowerCase() === 'y');
    console.log('✓ Error pattern added successfully');
}

async function addRegexPattern() {
    const regex = await askQuestion('Enter regex pattern to ignore: ');
    const description = await askQuestion('Enter description (optional): ');
    const enabled = await askQuestion('Enable immediately? (y/n): ');
    
    errorFilter.addIgnoredPattern(regex, description, enabled.toLowerCase() === 'y');
    console.log('✓ Regex pattern added successfully');
}

async function toggleErrorPattern() {
    viewExceptions();
    const config = errorFilter.getConfig();
    if (config.ignoredErrors.length === 0) {
        console.log('No error patterns to toggle');
        return;
    }
    
    const index = await askQuestion('Enter pattern number to toggle: ');
    const patternIndex = parseInt(index) - 1;
    
    if (patternIndex >= 0 && patternIndex < config.ignoredErrors.length) {
        const pattern = config.ignoredErrors[patternIndex];
        errorFilter.toggleError(pattern.pattern, !pattern.enabled);
        console.log(`✓ Pattern toggled ${!pattern.enabled ? 'ON' : 'OFF'}`);
    } else {
        console.log('Invalid pattern number');
    }
}

async function toggleRegexPattern() {
    viewExceptions();
    const config = errorFilter.getConfig();
    if (config.ignoredPatterns.length === 0) {
        console.log('No regex patterns to toggle');
        return;
    }
    
    const index = await askQuestion('Enter pattern number to toggle: ');
    const patternIndex = parseInt(index) - 1;
    
    if (patternIndex >= 0 && patternIndex < config.ignoredPatterns.length) {
        const pattern = config.ignoredPatterns[patternIndex];
        errorFilter.togglePattern(pattern.regex, !pattern.enabled);
        console.log(`✓ Pattern toggled ${!pattern.enabled ? 'ON' : 'OFF'}`);
    } else {
        console.log('Invalid pattern number');
    }
}

async function removeErrorPattern() {
    viewExceptions();
    const config = errorFilter.getConfig();
    if (config.ignoredErrors.length === 0) {
        console.log('No error patterns to remove');
        return;
    }
    
    const index = await askQuestion('Enter pattern number to remove: ');
    const patternIndex = parseInt(index) - 1;
    
    if (patternIndex >= 0 && patternIndex < config.ignoredErrors.length) {
        const pattern = config.ignoredErrors[patternIndex];
        errorFilter.removeIgnoredError(pattern.pattern);
        console.log('✓ Pattern removed successfully');
    } else {
        console.log('Invalid pattern number');
    }
}

async function removeRegexPattern() {
    viewExceptions();
    const config = errorFilter.getConfig();
    if (config.ignoredPatterns.length === 0) {
        console.log('No regex patterns to remove');
        return;
    }
    
    const index = await askQuestion('Enter pattern number to remove: ');
    const patternIndex = parseInt(index) - 1;
    
    if (patternIndex >= 0 && patternIndex < config.ignoredPatterns.length) {
        const pattern = config.ignoredPatterns[patternIndex];
        errorFilter.removeIgnoredPattern(pattern.regex);
        console.log('✓ Pattern removed successfully');
    } else {
        console.log('Invalid pattern number');
    }
}

async function toggleLogging() {
    const config = errorFilter.getConfig();
    errorFilter.setLogIgnoredErrors(!config.logIgnoredErrors);
    console.log(`✓ Logging of ignored errors ${!config.logIgnoredErrors ? 'enabled' : 'disabled'}`);
}

async function testError() {
    const errorMessage = await askQuestion('Enter error message to test: ');
    const testError = new Error(errorMessage);
    
    if (errorFilter.isIgnoredError(testError)) {
        console.log('✓ This error would be IGNORED');
    } else {
        console.log('✗ This error would NOT be ignored');
    }
}

async function main() {
    console.log('Welcome to Error Exception Manager');
    console.log('This tool helps you manage error filtering for your application\n');
    
    let running = true;
    while (running) {
        displayMenu();
        const choice = await askQuestion('Enter your choice: ');
        
        switch (choice) {
            case '1':
                viewExceptions();
                break;
            case '2':
                await addErrorPattern();
                break;
            case '3':
                await addRegexPattern();
                break;
            case '4':
                await toggleErrorPattern();
                break;
            case '5':
                await toggleRegexPattern();
                break;
            case '6':
                await removeErrorPattern();
                break;
            case '7':
                await removeRegexPattern();
                break;
            case '8':
                await toggleLogging();
                break;
            case '9':
                await testError();
                break;
            case '0':
                running = false;
                break;
            default:
                console.log('Invalid choice, please try again');
        }
    }
    
    rl.close();
    console.log('Goodbye!');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { errorFilter };