#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { generateSBOM } from '@billofmaterial/sbom-core';

const program = new Command();

program
  .name('billofmaterial')
  .description('Generate comprehensive Software Bill of Materials (SBOM) for your projects')
  .version('0.3.0');

program
  .command('generate')
  .description('Generate SBOM for the current project')
  .option('-p, --path <path>', 'Path to project directory', process.cwd())
  .option('-o, --output <file>', 'Output file path', 'SBOM.md')
  .option('--json', 'Also output JSON format')
  .option('--no-dev', 'Exclude dev dependencies')
  .option('--no-bundle-size', 'Skip bundle size analysis')
  .action(async (options) => {
    const spinner = ora('Initializing SBOM generation...').start();

    try {
      const projectPath = options.path;

      // Read package.json
      spinner.text = 'Reading package.json...';
      const packageJsonPath = join(projectPath, 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      // Collect all relevant files
      const files: Array<{ path: string; content: string }> = [
        { path: 'package.json', content: packageJsonContent },
      ];

      // Check for workspace configuration files
      const workspaceFiles = [
        'pnpm-workspace.yaml',
        'pnpm-workspace.yml',
        'lerna.json',
      ];

      for (const filename of workspaceFiles) {
        const filePath = join(projectPath, filename);
        try {
          const content = readFileSync(filePath, 'utf-8');
          files.push({ path: filename, content });
          spinner.text = `Found ${filename}...`;
        } catch {
          // File doesn't exist, skip
        }
      }

      // If workspaces are detected, find all package.json files
      if (packageJson.workspaces || files.some(f => f.path.includes('workspace'))) {
        spinner.text = 'Detecting monorepo structure...';
        
        // Scan for package.json files in workspace directories
        const workspacePatterns = Array.isArray(packageJson.workspaces)
          ? packageJson.workspaces
          : packageJson.workspaces?.packages || [];

        if (workspacePatterns.length > 0) {
          for (const pattern of workspacePatterns) {
            const basePath = pattern.replace('/*', '');
            const searchPath = join(projectPath, basePath);
            
            try {
              const dirs = readdirSync(searchPath);
              for (const dir of dirs) {
                const pkgPath = join(searchPath, dir, 'package.json');
                try {
                  const content = readFileSync(pkgPath, 'utf-8');
                  const relativePath = relative(projectPath, pkgPath);
                  files.push({ path: relativePath, content });
                } catch {
                  // No package.json in this directory
                }
              }
            } catch {
              // Directory doesn't exist
            }
          }
        }
      }

      spinner.text = `Found ${files.length} file(s). Generating SBOM...`;

      // Generate SBOM
      const result = await generateSBOM(
        {
          packageJsonContent: packageJsonContent,
          files,
          config: {
            includeDevDeps: options.dev !== false,
            includeBundleSize: options.bundleSize !== false,
          },
        },
        (message: string, current?: number, total?: number) => {
          if (current && total) {
            spinner.text = `${message} [${current}/${total}]`;
          } else {
            spinner.text = message;
          }
        }
      );

      spinner.succeed('SBOM generated successfully!');

      // Write markdown file
      const outputPath = join(projectPath, options.output);
      writeFileSync(outputPath, result.markdown, 'utf-8');
      console.log(chalk.green(`\nSBOM written to: ${outputPath}`));

      // Write SPDX JSON
      if (result.spdx) {
        const spdxPath = outputPath.replace(/\.md$/, '-spdx.json');
        writeFileSync(spdxPath, JSON.stringify(result.spdx, null, 2), 'utf-8');
        console.log(chalk.green(`SPDX 2.3 written to: ${spdxPath}`));
      }

      // Write CycloneDX JSON
      if (result.cyclonedx) {
        const cdxPath = outputPath.replace(/\.md$/, '-cyclonedx.json');
        writeFileSync(cdxPath, JSON.stringify(result.cyclonedx, null, 2), 'utf-8');
        console.log(chalk.green(`CycloneDX 1.5 written to: ${cdxPath}`));
      }

      // Write full JSON if requested
      if (options.json) {
        const jsonPath = outputPath.replace(/\.md$/, '.json');
        writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(chalk.green(`JSON data written to: ${jsonPath}`));
      }

      // Display summary
      console.log(chalk.cyan('\nSummary:'));
      console.log(`   Total Dependencies: ${result.totalDependencies}`);
      if (result.insights) {
        console.log(`   Average Security Score: ${result.insights.metrics.averageSecurityScore}/100`);
        console.log(`   High Risk Packages: ${result.insights.topRisks.length}`);
        const totalMB = result.insights.totalBundleSize / 1024;
        console.log(`   Total Bundle Size: ${totalMB >= 1 ? `${totalMB.toFixed(1)} MB` : `${result.insights.totalBundleSize} KB`}`);

        if (result.insights.vulnerabilitySummary && result.insights.vulnerabilitySummary.total > 0) {
          const vs = result.insights.vulnerabilitySummary;
          console.log(chalk.red(`   Vulnerabilities: ${vs.total} total (${vs.critical} critical, ${vs.high} high)`));
        } else {
          console.log(chalk.green('   Vulnerabilities: None detected'));
        }

        if (result.insights.deprecatedPackages && result.insights.deprecatedPackages.length > 0) {
          console.log(chalk.yellow(`   Deprecated Packages: ${result.insights.deprecatedPackages.length}`));
        }

        if (result.insights.topRisks.length > 0) {
          console.log(chalk.yellow('\n   Top Security Risks:'));
          result.insights.topRisks.slice(0, 3).forEach((risk: { name: string; score: number }) => {
            console.log(chalk.yellow(`   - ${risk.name} (${risk.score}/100)`));
          });
        }
      }

      // Compliance summary
      if (result.complianceReport) {
        const cr = result.complianceReport;
        const statusColor = cr.overallStatus === 'compliant' ? chalk.green : cr.overallStatus === 'partial' ? chalk.yellow : chalk.red;
        console.log(statusColor(`\n   ISO 27001 Compliance: ${cr.overallStatus.toUpperCase()}`));
        console.log(`   Controls: ${cr.summary.passed} passed, ${cr.summary.warnings} warnings, ${cr.summary.failed} failed`);
      }

      if (result.integrityHash) {
        console.log(chalk.dim(`\n   SBOM Integrity: ${result.integrityHash}`));
      }

      console.log(chalk.dim('\nTip: Use --json flag to also generate a JSON file with detailed data\n'));
    } catch (error) {
      spinner.fail('Failed to generate SBOM');
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('version')
  .description('Display version information')
  .action(() => {
    console.log(chalk.cyan('billofmaterial v0.3.0'));
    console.log(chalk.dim('Generate comprehensive SBOM for your projects'));
  });

program.parse();

