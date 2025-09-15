const fs = require('fs');
const path = require('path');

class ErrorFilter {
    constructor() {
        this.config = null;
        this.configPath = path.join(__dirname, 'errorFilterConfig.json');
        this.loadConfig();
        this.watchConfigFile();
    }

    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            console.warn('Error filter config not found or invalid, using defaults');
            this.config = {
                ignoredErrors: [],
                ignoredPatterns: [],
                logIgnoredErrors: false,
                settings: {
                    useRegexMatching: true,
                    caseSensitive: false,
                    logLevel: 'warn'
                }
            };
        }
    }

    watchConfigFile() {
        fs.watchFile(this.configPath, (curr, prev) => {
            if (curr.mtime !== prev.mtime) {
                console.log('Error filter config updated, reloading...');
                this.loadConfig();
            }
        });
    }

    isIgnoredError(error) {
        if (!error || !this.config) return false;

        const errorMessage = error.message || error.toString();
        const compareMessage = this.config.settings.caseSensitive ? 
            errorMessage : errorMessage.toLowerCase();

        // Check exact pattern matches
        for (const ignoredError of this.config.ignoredErrors) {
            if (!ignoredError.enabled) continue;
            
            const pattern = this.config.settings.caseSensitive ? 
                ignoredError.pattern : ignoredError.pattern.toLowerCase();
            
            if (compareMessage.includes(pattern)) {
                if (this.config.logIgnoredErrors) {
                    console.log(`[ErrorFilter] Ignored error: ${ignoredError.description}`);
                }
                return true;
            }
        }

        // Check regex patterns
        if (this.config.settings.useRegexMatching) {
            for (const patternConfig of this.config.ignoredPatterns) {
                if (!patternConfig.enabled) continue;
                
                try {
                    const flags = this.config.settings.caseSensitive ? '' : 'i';
                    const regex = new RegExp(patternConfig.regex, flags);
                    
                    if (regex.test(errorMessage)) {
                        if (this.config.logIgnoredErrors) {
                            console.log(`[ErrorFilter] Ignored by regex: ${patternConfig.description}`);
                        }
                        return true;
                    }
                } catch (regexError) {
                    console.error(`Invalid regex pattern: ${patternConfig.regex}`);
                }
            }
        }

        return false;
    }

    handleError(error, context = '') {
        if (this.isIgnoredError(error)) {
            return {
                shouldLog: false,
                shouldThrow: false,
                filtered: true
            };
        }

        return {
            shouldLog: true,
            shouldThrow: true,
            filtered: false
        };
    }

    logError(error, context = '') {
        const handling = this.handleError(error, context);
        
        if (handling.shouldLog) {
            const logMethod = this.config.settings.logLevel === 'error' ? 
                console.error : console.warn;
            
            const contextStr = context ? `[${context}] ` : '';
            logMethod(`${contextStr}Error:`, error.message || error);
            
            if (process.env.NODE_ENV === 'development') {
                console.error('Stack trace:', error.stack);
            }
        }
        
        return handling;
    }

    addIgnoredError(pattern, description = '', enabled = true) {
        if (!this.config.ignoredErrors.find(e => e.pattern === pattern)) {
            this.config.ignoredErrors.push({
                pattern,
                description,
                enabled
            });
            this.saveConfig();
        }
    }

    addIgnoredPattern(regex, description = '', enabled = true) {
        if (!this.config.ignoredPatterns.find(p => p.regex === regex)) {
            this.config.ignoredPatterns.push({
                regex,
                description,
                enabled
            });
            this.saveConfig();
        }
    }

    removeIgnoredError(pattern) {
        this.config.ignoredErrors = this.config.ignoredErrors.filter(
            e => e.pattern !== pattern
        );
        this.saveConfig();
    }

    removeIgnoredPattern(regex) {
        this.config.ignoredPatterns = this.config.ignoredPatterns.filter(
            p => p.regex !== regex
        );
        this.saveConfig();
    }

    toggleError(pattern, enabled) {
        const error = this.config.ignoredErrors.find(e => e.pattern === pattern);
        if (error) {
            error.enabled = enabled;
            this.saveConfig();
        }
    }

    togglePattern(regex, enabled) {
        const pattern = this.config.ignoredPatterns.find(p => p.regex === regex);
        if (pattern) {
            pattern.enabled = enabled;
            this.saveConfig();
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(
                this.configPath, 
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('Failed to save error filter config:', error);
        }
    }

    getConfig() {
        return this.config;
    }

    setLogIgnoredErrors(enabled) {
        this.config.logIgnoredErrors = enabled;
        this.saveConfig();
    }
}

module.exports = new ErrorFilter();