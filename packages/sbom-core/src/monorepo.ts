import { PackageJson } from './types';
import { parse as parseYaml } from 'yaml';

export function detectMonorepo(packageJson: PackageJson, workspaceYaml?: string): boolean {
  // Check for workspaces in package.json
  if (packageJson.workspaces) {
    return true;
  }

  // Check for pnpm-workspace.yaml
  if (workspaceYaml) {
    try {
      const parsed = parseYaml(workspaceYaml);
      if (parsed && parsed.packages && Array.isArray(parsed.packages)) {
        return true;
      }
    } catch (error) {
      // Not a valid yaml or doesn't have packages
    }
  }

  // Check for lerna.json
  if (packageJson.private && (packageJson as any).lerna) {
    return true;
  }

  return false;
}

export function getWorkspacePatterns(
  packageJson: PackageJson,
  workspaceYaml?: string
): string[] {
  const patterns: string[] = [];

  // Get from package.json workspaces
  if (packageJson.workspaces) {
    if (Array.isArray(packageJson.workspaces)) {
      patterns.push(...packageJson.workspaces);
    } else if (packageJson.workspaces.packages) {
      patterns.push(...packageJson.workspaces.packages);
    }
  }

  // Get from pnpm-workspace.yaml
  if (workspaceYaml) {
    try {
      const parsed = parseYaml(workspaceYaml);
      if (parsed && parsed.packages && Array.isArray(parsed.packages)) {
        patterns.push(...parsed.packages);
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  // Get from lerna.json
  if ((packageJson as any).lerna?.packages) {
    patterns.push(...(packageJson as any).lerna.packages);
  }

  return [...new Set(patterns)]; // Remove duplicates
}

export interface PackageJsonFile {
  path: string;
  content: PackageJson;
}

export function findAllPackageJsons(
  files: Array<{ path: string; content: string }>,
  rootPackageJson: PackageJson,
  workspaceYaml?: string
): PackageJsonFile[] {
  const patterns = getWorkspacePatterns(rootPackageJson, workspaceYaml);
  
  if (patterns.length === 0) {
    return [];
  }

  const packageJsonFiles: PackageJsonFile[] = [];

  for (const file of files) {
    // Check if file is a package.json
    if (!file.path.endsWith('package.json') || file.path === 'package.json') {
      continue;
    }

    // Check if file matches any workspace pattern
    const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
    const matches = patterns.some(pattern => {
      const regexPattern = pattern
        .replace(/\*/g, '[^/]+')
        .replace(/\*\*/g, '.+');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(fileDir) || regex.test(file.path);
    });

    if (matches) {
      try {
        const content = JSON.parse(file.content);
        packageJsonFiles.push({
          path: file.path,
          content
        });
      } catch (error) {
        console.error(`Failed to parse ${file.path}:`, error);
      }
    }
  }

  return packageJsonFiles;
}

