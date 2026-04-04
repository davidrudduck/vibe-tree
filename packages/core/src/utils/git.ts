import { spawn } from 'child_process';
import * as path from 'path';
import { Worktree, GitStatus, WorktreeAddResult, WorktreeRemoveResult, ProjectValidationResult } from '../types';
import { parseWorktrees, parseGitStatus } from './git-parser';

/**
 * Execute a git command and return the output
 * @param args - Git command arguments
 * @param cwd - Working directory for the command
 * @returns Promise with command output
 */
export function executeGitCommand(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const envPath = process.env.PATH || '/usr/bin:/bin:/usr/local/bin';
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env, PATH: envPath }
    });

    let stdout = '';
    let stderr = '';

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed: git ${args.join(' ')}`));
      }
    });
  });
}

/**
 * List all git worktrees for a project
 * @param projectPath - Path to the main git repository
 * @returns Array of worktree information
 */
export async function listWorktrees(projectPath: string): Promise<Worktree[]> {
  const output = await executeGitCommand(['worktree', 'list', '--porcelain'], projectPath);
  return parseWorktrees(output);
}

/**
 * Get git status for a worktree
 * @param worktreePath - Path to the git worktree
 * @returns Array of file status information
 */
export async function getGitStatus(worktreePath: string): Promise<GitStatus[]> {
  const output = await executeGitCommand(['status', '--porcelain=v1'], worktreePath);
  return parseGitStatus(output);
}

/**
 * Get git diff for unstaged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Diff output as string
 */
export async function getGitDiff(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * Get git diff for staged changes
 * @param worktreePath - Path to the git worktree
 * @param filePath - Optional specific file to diff
 * @returns Staged diff output as string
 */
export async function getGitDiffStaged(worktreePath: string, filePath?: string): Promise<string> {
  const args = ['diff', '--staged'];
  if (filePath) {
    args.push(filePath);
  }
  return executeGitCommand(args, worktreePath);
}

/**
 * List all branches in a git repository
 * @param projectPath - Path to the git repository
 * @returns Array of branch information
 */
export async function listBranches(projectPath: string): Promise<{ name: string; current: boolean; remote: boolean }[]> {
  const output = await executeGitCommand(['branch', '-a', '--format=%(refname:short)|%(HEAD)'], projectPath);
  const lines = output.trim().split('\n').filter(line => line.trim());
  const results: { name: string; current: boolean; remote: boolean }[] = [];

  for (const line of lines) {
    const [name, head] = line.split('|');
    if (!name) continue;
    // Filter out HEAD -> origin/main style entries
    if (name.includes('HEAD')) continue;
    const remote = name.startsWith('origin/') || name.includes('remotes/');
    results.push({
      name: name.trim(),
      current: head === '*',
      remote
    });
  }

  return results;
}

/**
 * Create a new git worktree with a new branch
 * @param projectPath - Path to the main git repository
 * @param branchName - Name for the new branch
 * @param basePath - Optional base directory for the worktree
 * @param startPoint - Optional base branch/commit to create the new branch from
 * @returns Result with new worktree path and branch name
 */
export async function addWorktree(projectPath: string, branchName: string, basePath?: string, startPoint?: string): Promise<WorktreeAddResult> {
  const worktreePath = basePath
    ? path.join(basePath, `${path.basename(projectPath)}-${branchName}`)
    : path.join(projectPath, '..', `${path.basename(projectPath)}-${branchName}`);

  const args = ['worktree', 'add', '-b', branchName, worktreePath];
  if (startPoint) args.push(startPoint);
  await executeGitCommand(args, projectPath);

  return { path: worktreePath, branch: branchName };
}

/**
 * Remove a git worktree and optionally its branch
 * @param projectPath - Path to the main git repository
 * @param worktreePath - Path to the worktree to remove
 * @param branchName - Name of the branch to delete
 * @returns Result indicating success and any warnings
 */
export async function removeWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string,
  force: boolean = false
): Promise<WorktreeRemoveResult> {
  // Check for uncommitted changes before removing
  if (!force) {
    try {
      const status = await getGitStatus(worktreePath);
      if (status.length > 0) {
        return {
          success: false,
          warning: `Worktree has ${status.length} uncommitted change(s). Use force to remove anyway.`
        };
      }
    } catch {
      // If status check fails, proceed with removal
    }
  }

  try {
    // Remove the worktree (use --force only when explicitly requested)
    const removeArgs = ['worktree', 'remove', worktreePath];
    if (force) removeArgs.push('--force');
    await executeGitCommand(removeArgs, projectPath);

    try {
      // Then try to delete the branch
      await executeGitCommand(['branch', '-D', branchName], projectPath);
      return { success: true };
    } catch (branchError) {
      console.warn('Failed to delete branch but worktree was removed:', branchError);
      return {
        success: true,
        warning: `Worktree removed but failed to delete branch: ${branchError}`
      };
    }
  } catch (error) {
    throw new Error(`Failed to remove worktree: ${error}`);
  }
}

/**
 * Check if a path is a git repository
 * @param path - Path to check
 * @returns True if path is a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  try {
    await executeGitCommand(['rev-parse', '--git-dir'], path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 * @param worktreePath - Path to the git worktree
 * @returns Current branch name
 */
export async function getCurrentBranch(worktreePath: string): Promise<string> {
  const output = await executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
  return output.trim();
}

/**
 * Get the main branch name for a repository
 * @param projectPath - Path to the git repository
 * @returns The detected main branch name ('main', 'master', or first available)
 */
export async function getMainBranchName(projectPath: string): Promise<string> {
  // Try symbolic-ref for origin/HEAD first
  try {
    const output = await executeGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'], projectPath);
    const ref = output.trim();
    // refs/remotes/origin/main -> main
    const match = ref.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match) {
      return match[1];
    }
  } catch {
    // Fall through to branch existence checks
  }

  // Try 'main' then 'master'
  for (const candidate of ['main', 'master']) {
    try {
      await executeGitCommand(['rev-parse', '--verify', candidate], projectPath);
      return candidate;
    } catch {
      // Not found, try next
    }
  }

  // Fall back to the first branch listed
  try {
    const output = await executeGitCommand(['branch', '--format=%(refname:short)'], projectPath);
    const first = output.trim().split('\n')[0];
    if (first) {
      return first;
    }
  } catch {
    // Ignore
  }

  return 'main';
}

/**
 * Get ahead/behind commit counts relative to a base branch
 * @param worktreePath - Path to the git worktree
 * @param baseBranch - Base branch to compare against (default: 'main')
 * @returns Object with ahead and behind counts
 */
export async function getAheadBehind(
  worktreePath: string,
  baseBranch: string = 'main'
): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await executeGitCommand(
      ['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`],
      worktreePath
    );
    // Output format: "behind\tahead" (left is baseBranch, right is HEAD)
    const parts = output.trim().split('\t');
    if (parts.length === 2) {
      const behind = parseInt(parts[0], 10);
      const ahead = parseInt(parts[1], 10);
      return {
        ahead: isNaN(ahead) ? 0 : ahead,
        behind: isNaN(behind) ? 0 : behind
      };
    }
    return { ahead: 0, behind: 0 };
  } catch {
    // Base branch doesn't exist or other error
    return { ahead: 0, behind: 0 };
  }
}

/**
 * Get diff of current branch vs a base branch
 * @param worktreePath - Path to the git worktree
 * @param baseBranch - Base branch to compare against (default: 'main')
 * @returns Diff output as string
 */
export async function getDiffVsMain(
  worktreePath: string,
  baseBranch: string = 'main'
): Promise<string> {
  try {
    return await executeGitCommand(['diff', `${baseBranch}...HEAD`], worktreePath);
  } catch {
    // Base branch doesn't exist or other error
    return '';
  }
}

/**
 * Get the remote URL for a git repository
 * @param projectPath - Path to the git repository
 * @returns The remote URL or null if not configured
 */
export async function getRemoteUrl(projectPath: string): Promise<string | null> {
  try {
    const output = await executeGitCommand(['remote', 'get-url', 'origin'], projectPath);
    return output.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Parse a GitHub remote URL into owner and repo components
 * @param remoteUrl - The git remote URL (HTTPS or SSH)
 * @returns Object with owner and repo, or null if not a GitHub URL
 */
export async function parseGitHubRepo(remoteUrl: string): Promise<{ owner: string; repo: string } | null> {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = remoteUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

/**
 * Validate multiple project paths
 * @param projectPaths - Array of project paths to validate
 * @returns Array of validation results
 */
export async function validateProjects(projectPaths: string[]): Promise<ProjectValidationResult[]> {
  const results = await Promise.allSettled(
    projectPaths.map(async (projectPath) => {
      try {
        // Check if directory exists by trying to access it
        const isGitRepo = await isGitRepository(projectPath);
        if (!isGitRepo) {
          return {
            path: projectPath,
            valid: false,
            error: 'Not a git repository'
          } as ProjectValidationResult;
        }

        // Get repository name from path
        const name = path.basename(projectPath);
        
        return {
          path: projectPath,
          name,
          valid: true
        } as ProjectValidationResult;
      } catch (error) {
        return {
          path: projectPath,
          valid: false,
          error: `Directory not accessible: ${(error as Error).message}`
        } as ProjectValidationResult;
      }
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        path: projectPaths[index],
        valid: false,
        error: `Validation failed: ${result.reason}`
      };
    }
  });
}