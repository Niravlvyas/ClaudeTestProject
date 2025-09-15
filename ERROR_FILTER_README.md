# Error Filter System

## Overview
This error filtering system allows you to manage and suppress false alarm errors in your application. It provides a flexible configuration-based approach to ignore specific error patterns while maintaining visibility of real issues.

## Features
- **Pattern-based filtering**: Ignore errors containing specific text patterns
- **Regex filtering**: Use regular expressions for complex error matching
- **Hot-reload configuration**: Changes to the config file are automatically loaded
- **Interactive management tool**: CLI interface for managing error exceptions
- **Graceful degradation**: Filtered errors return safe default values instead of throwing

## Configuration

The error filter configuration is stored in `src/errorFilterConfig.json`:

```json
{
  "ignoredErrors": [
    {
      "pattern": "SQLite error no such table: Department_POS",
      "description": "Department_POS table is not used in current implementation",
      "enabled": true
    }
  ],
  "ignoredPatterns": [
    {
      "regex": "^.*no such table: Department_.*$",
      "description": "Ignore all Department-related table errors",
      "enabled": false
    }
  ],
  "logIgnoredErrors": false,
  "settings": {
    "useRegexMatching": true,
    "caseSensitive": false,
    "logLevel": "warn"
  }
}
```

## Usage

### Adding Error Exceptions

#### Method 1: Edit Configuration File
Directly edit `src/errorFilterConfig.json` to add new patterns:

```json
{
  "pattern": "Your error message pattern here",
  "description": "Why this error should be ignored",
  "enabled": true
}
```

#### Method 2: Use Management Tool
Run the interactive management tool:

```bash
node src/manageErrorExceptions.js
```

This provides options to:
- View current exceptions
- Add/remove error patterns
- Toggle patterns on/off
- Test error messages against filters

#### Method 3: Programmatically
```javascript
const errorFilter = require('./errorFilter');

// Add a simple pattern
errorFilter.addIgnoredError(
  "Connection timeout", 
  "Known intermittent issue",
  true
);

// Add a regex pattern
errorFilter.addIgnoredPattern(
  "^.*timeout after \\d+ ms.*$",
  "All timeout errors",
  true
);
```

## How It Works

1. **Error Interception**: When an error occurs in database operations or data source methods, it's passed through the error filter
2. **Pattern Matching**: The error message is checked against all enabled patterns (both exact and regex)
3. **Decision Making**: If the error matches an ignored pattern:
   - It won't be logged (unless `logIgnoredErrors` is true)
   - It won't be thrown
   - A safe default value is returned (empty array, null, false, etc.)
4. **Real Errors**: Unmatched errors are logged and thrown as normal

## Examples

### Example 1: SQLite Table Errors
Already configured to ignore "SQLite error no such table: Department_POS"

### Example 2: Adding Timeout Errors
```bash
node src/manageErrorExceptions.js
# Choose option 2 (Add new error pattern)
# Enter: "Request timeout after"
# Description: "Network timeouts are handled by retry logic"
# Enable: y
```

### Example 3: Ignore All Missing Table Errors
Add to configuration:
```json
{
  "regex": "no such table:",
  "description": "Ignore all missing table errors",
  "enabled": true
}
```

## Testing Error Filters

Use the management tool to test if an error would be filtered:

```bash
node src/manageErrorExceptions.js
# Choose option 9 (Test error against filters)
# Enter your error message
```

## Best Practices

1. **Be Specific**: Use specific patterns to avoid hiding real issues
2. **Document Reasons**: Always include descriptions explaining why errors are ignored
3. **Review Regularly**: Periodically review ignored errors to ensure they're still valid
4. **Use Regex Carefully**: Test regex patterns to ensure they don't match unintended errors
5. **Monitor Initially**: Set `logIgnoredErrors: true` initially to verify correct filtering

## Troubleshooting

- **Errors still appearing**: Check if the pattern is enabled and matches exactly
- **Too many errors filtered**: Review patterns for being too broad
- **Config not loading**: Ensure `errorFilterConfig.json` is valid JSON

## Integration Points

The error filter is integrated into:
- `src/database.js`: All database query operations
- `src/dataSource.js`: All data access methods

Each filtered error includes context information (e.g., "Query Execution", "Login Validation") to help identify where errors are occurring.