import * as fs from 'fs';
import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

/**
 * Validate that a file exists and is readable
 */
export function validateFilePath(filePath: string): ValidationResult {
  try {
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      return {
        valid: false,
        error: `File not found: ${resolved}`,
      };
    }

    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      return {
        valid: false,
        error: `Not a file: ${resolved}`,
      };
    }

    // Check readability
    try {
      fs.accessSync(resolved, fs.constants.R_OK);
    } catch {
      return {
        valid: false,
        error: `File not readable: ${resolved}`,
      };
    }

    return { valid: true, resolvedPath: resolved };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Validate that a directory exists and is accessible
 */
export function validateDirectoryPath(dirPath: string): ValidationResult {
  try {
    const resolved = path.resolve(dirPath);

    if (!fs.existsSync(resolved)) {
      return {
        valid: false,
        error: `Directory not found: ${resolved}`,
      };
    }

    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: `Not a directory: ${resolved}`,
      };
    }

    // Check accessibility (read + execute)
    try {
      fs.accessSync(resolved, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      return {
        valid: false,
        error: `Directory not accessible: ${resolved}`,
      };
    }

    return { valid: true, resolvedPath: resolved };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Validate worker script with detailed error reporting
 */
export function validateWorkerScript(scriptPath: string): ValidationResult {
  const fileResult = validateFilePath(scriptPath);
  if (!fileResult.valid) {
    return fileResult;
  }

  // Additional worker-specific validation
  try {
    const content = fs.readFileSync(fileResult.resolvedPath!, 'utf-8');
    if (content.length === 0) {
      return {
        valid: false,
        error: `Worker script is empty: ${fileResult.resolvedPath}`,
      };
    }

    // Optionally check for Node.js script markers
    // This is a basic check - could be enhanced
    if (!content.includes('process') && !content.includes('module')) {
      console.warn(
        `[Validation] Worker script may not be a valid Node.js script: ${fileResult.resolvedPath}`
      );
    }

    return fileResult;
  } catch (error) {
    return {
      valid: false,
      error: `Cannot read worker script: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    };
  }
}

/**
 * Validate multiple paths and return results for all
 */
export function validatePaths(
  paths: string[],
  validator: (path: string) => ValidationResult
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();

  for (const p of paths) {
    results.set(p, validator(p));
  }

  return results;
}

/**
 * Check if all validation results are valid
 */
export function allValid(results: Map<string, ValidationResult> | ValidationResult[]): boolean {
  const resultsArray = results instanceof Map ? Array.from(results.values()) : results;
  return resultsArray.every((r) => r.valid);
}

/**
 * Get first invalid result
 */
export function getFirstInvalid(
  results: Map<string, ValidationResult> | ValidationResult[]
): ValidationResult | undefined {
  const resultsArray = results instanceof Map ? Array.from(results.values()) : results;
  return resultsArray.find((r) => !r.valid);
}
