import * as cheerio from 'cheerio';
import {
  GeneratorOptions,
  SBOMResult,
  PackageJson,
  DependencyInfo,
  PackageData,
  SBOMConfig,
  RiskAssessment,
  SBOMInsights,
  SPDXDocument,
  SPDXPackage,
  SPDXRelationship
} from './types';
import { detectMonorepo, findAllPackageJsons } from './monorepo';

const DEFAULT_CONFIG: SBOMConfig = {
  includeDevDeps: true,
  includeBundleSize: true,
  securityScoreThreshold: 70,
  maxConcurrentRequests: 5,
  retryAttempts: 3,
  retryDelay: 1000,
};

const problematicLicenses = [
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'CC-BY-SA-4.0',
  'CC-BY-NC-4.0',
];

class RateLimiter {
  private maxConcurrent: number;
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.current >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.current++;
    try {
      return await fn();
    } finally {
      this.current--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }
}

async function fetchWithRetry(
  url: string,
  rateLimiter: RateLimiter,
  retries: number = 3,
  delay: number = 1000
): Promise<Response | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await rateLimiter.execute(async () => {
        const res = await fetch(url);
        if (!res.ok && attempt < retries) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res;
      });
    } catch (error) {
      if (attempt === retries) {
        console.error(`Failed to fetch ${url} after ${retries} attempts`);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
  return null;
}

async function getNpmData(
  packageName: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<any> {
  const url = `https://registry.npmjs.org/${packageName}`;
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!);
  
  if (!response) return null;
  
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getNpmSecurityScore(
  packageName: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<string | number> {
  const url = `https://snyk.io/advisor/npm-package/${packageName}`;
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!);
  
  if (!response) return 'N/A';
  
  try {
    const html = await response.text();
    const $ = cheerio.load(html);
    const score = $('.number span').first().text().trim() || 'N/A';
    return score;
  } catch {
    return 'N/A';
  }
}

async function getBundleSize(
  packageName: string,
  version: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<{ size: number; gzip: number } | null> {
  if (!config.includeBundleSize) {
    return null;
  }

  const url = `https://bundlephobia.com/api/size?package=${packageName}@${version}`;
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!);
  
  if (!response) return null;
  
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getPopularityScore(
  packageName: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<number> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!);
  
  if (!response) return 0;
  
  try {
    const data = await response.json();
    const downloads = data.downloads || 0;

    if (downloads > 1000000) return 100;
    if (downloads > 100000) return 90;
    if (downloads > 10000) return 70;
    if (downloads > 1000) return 50;
    if (downloads > 100) return 30;
    return 10;
  } catch {
    return 0;
  }
}

function calculateMaintenanceScore(npmData: any): number {
  if (!npmData) return 0;

  const lastPublish = new Date(npmData.time?.modified || npmData.time?.created);
  const daysSinceUpdate = (Date.now() - lastPublish.getTime()) / (1000 * 60 * 60 * 24);

  let score = 100;

  if (daysSinceUpdate > 365) score -= 20;
  else if (daysSinceUpdate > 180) score -= 10;
  else if (daysSinceUpdate > 90) score -= 5;

  const versions = Object.keys(npmData.versions || {}).length;
  if (versions > 50) score += 10;
  else if (versions > 20) score += 5;

  return Math.max(0, Math.min(100, score));
}

function calculateRiskScore(packageData: DependencyInfo): RiskAssessment {
  const factors: string[] = [];
  let totalScore = 0;

  const riskWeights = {
    security: 0.4,
    maintenance: 0.3,
    popularity: 0.2,
    license: 0.1,
  };

  // Security score
  const securityScore = typeof packageData.securityScore === 'number' 
    ? packageData.securityScore 
    : parseInt(String(packageData.securityScore)) || 0;
  
  if (securityScore < 70) {
    factors.push(`Low security score: ${securityScore}/100`);
  }
  totalScore += (securityScore / 100) * riskWeights.security;

  // Maintenance score
  const maintenanceScore = packageData.maintenanceScore / 100;
  if (packageData.daysSinceUpdate > 365) {
    factors.push(`Not updated in ${Math.round(packageData.daysSinceUpdate / 30)} months`);
  }
  totalScore += maintenanceScore * riskWeights.maintenance;

  // Popularity score
  const popularityScore = packageData.popularityScore / 100;
  if (popularityScore < 0.3) {
    factors.push('Low popularity/downloads');
  }
  totalScore += popularityScore * riskWeights.popularity;

  // License score
  let licenseScore = 1;
  if (problematicLicenses.includes(packageData.license)) {
    factors.push(`Restrictive license: ${packageData.license}`);
    licenseScore = 0.5;
  }
  totalScore += licenseScore * riskWeights.license;

  if (packageData.hasVulnerabilities) {
    factors.push('Has known vulnerabilities');
    totalScore *= 0.5;
  }

  return {
    score: Math.round(totalScore * 100),
    riskLevel: totalScore > 0.7 ? 'Low' : totalScore > 0.4 ? 'Medium' : 'High',
    factors,
  };
}

async function analyzeDependencies(
  deps: Record<string, string>,
  config: SBOMConfig,
  onProgress?: (current: number, total: number) => void
): Promise<{ dependencies: DependencyInfo[]; outdatedPackages: Record<string, any> }> {
  const rateLimiter = new RateLimiter(config.maxConcurrentRequests!);
  const convertToKb = (bytes: number) => Math.round(bytes / 1024);
  
  const total = Object.keys(deps).length;
  let current = 0;
  const outdatedPackages: Record<string, any> = {};

  const depsPromises = Object.entries(deps).map(async ([name, version]) => {
    try {
      const [npmData, securityScore, bundleSize, popularityScore] = await Promise.all([
        getNpmData(name, rateLimiter, config),
        getNpmSecurityScore(name, rateLimiter, config),
        getBundleSize(name, version, rateLimiter, config),
        getPopularityScore(name, rateLimiter, config),
      ]);

      const lastPublish = npmData?.time?.modified || npmData?.time?.created;
      const daysSinceUpdate = lastPublish
        ? (Date.now() - new Date(lastPublish).getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      const maintenanceScore = calculateMaintenanceScore(npmData);
      const license = npmData?.license || 'Unknown';
      const homepage = npmData?.homepage || npmData?.repository?.url || '';

      const latestVersion = npmData?.['dist-tags']?.latest || version;
      const currentVersion = version.replace(/^[\^~>=<]/, ''); // Remove version prefix
      const versionData = npmData?.versions?.[latestVersion];

      // Check if package is outdated
      if (latestVersion !== currentVersion && npmData?.['dist-tags']?.latest) {
        outdatedPackages[name] = {
          current: currentVersion,
          wanted: currentVersion,
          latest: latestVersion,
          location: name
        };
      }

      const packageData: DependencyInfo = {
        name,
        description: npmData?.description || 'N/A',
        version: currentVersion, // Use current version from package.json
        license,
        licenseProblematic: problematicLicenses.includes(license),
        homepage,
        securityScore,
        maintenanceScore,
        popularityScore,
        daysSinceUpdate: Math.round(daysSinceUpdate),
        lastPublishDate: lastPublish
          ? new Date(lastPublish).toLocaleDateString()
          : 'Unknown',
        weeklyDownloads: 0,
        minifiedSize: convertToKb(bundleSize?.size && !name.startsWith('@types') ? bundleSize.size : 0),
        gzipSize: convertToKb(bundleSize?.gzip && !name.startsWith('@types') ? bundleSize.gzip : 0),
        hasVulnerabilities: false,
        dependencyCount: Object.keys(versionData?.dependencies || {}).length,
        peerDependencies: versionData?.peerDependencies || {},
      };

      packageData.risk = calculateRiskScore(packageData);

      current++;
      if (onProgress) {
        onProgress(current, total);
      }

      return packageData;
    } catch (error) {
      console.error(`Error processing ${name}:`, error);
      current++;
      if (onProgress) {
        onProgress(current, total);
      }
      return null;
    }
  });

  const results = await Promise.all(depsPromises);
  const filtered = results.filter((r: DependencyInfo | null): r is DependencyInfo => r !== null);
  
  // Sort by risk score (highest risk first)
  filtered.sort((a: DependencyInfo, b: DependencyInfo) => (a.risk?.score || 100) - (b.risk?.score || 100));

  return { dependencies: filtered, outdatedPackages };
}

function generateInsights(
  packages: PackageData[],
  outdatedPackages?: Record<string, any>,
  auditData?: any
): SBOMInsights {
  const allDeps: DependencyInfo[] = [];
  
  for (const pkg of packages) {
    allDeps.push(...pkg.dependencies, ...pkg.devDependencies);
  }

  // Sort top risks by score (lowest score = highest risk)
  const topRisks = [...allDeps]
    .filter((d) => d.risk && d.risk.score < 70) // Score below 70 is high risk
    .sort((a, b) => (a.risk?.score || 100) - (b.risk?.score || 100))
    .slice(0, 10)
    .map((d) => ({
      name: d.name,
      score: d.risk!.score,
      factors: d.risk!.factors,
    }));

  const insights: SBOMInsights = {
    topRisks,
    heaviestDependencies: [...allDeps]
      .sort((a, b) => b.minifiedSize - a.minifiedSize)
      .filter((d) => d.minifiedSize > 0)
      .slice(0, 10)
      .map((d) => ({
        name: d.name,
        size: d.minifiedSize,
        gzipSize: d.gzipSize,
      })),
    quickWins: [],
    totalBundleSize: allDeps.reduce((sum, d) => sum + (d.minifiedSize || 0), 0),
    licenseIssues: allDeps
      .filter((d) => d.licenseProblematic)
      .map((d) => ({
        name: d.name,
        license: d.license,
      })),
    abandonedPackages: allDeps
      .filter((d) => d.daysSinceUpdate > 730)
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 10)
      .map((d) => ({
        name: d.name,
        lastUpdate: d.lastPublishDate,
        daysSince: d.daysSinceUpdate,
      })),
    metrics: {
      totalDependencies: allDeps.length,
      productionDependencies: packages.reduce((sum, p) => sum + p.dependencies.length, 0),
      devDependencies: packages.reduce((sum, p) => sum + p.devDependencies.length, 0),
      averageSecurityScore: Math.round(
        allDeps.reduce((sum, d) => {
          const score = typeof d.securityScore === 'number' 
            ? d.securityScore 
            : parseInt(String(d.securityScore)) || 0;
          return sum + score;
        }, 0) / (allDeps.length || 1)
      ),
    },
  };

  // Quick wins (easy updates with security improvements or packages with low security scores)
  if (outdatedPackages && Object.keys(outdatedPackages).length > 0) {
    const quickWinCandidates = Object.entries(outdatedPackages)
      .map(([name, info]: [string, any]) => {
        const dep = allDeps.find((d) => d.name === name);
        if (!dep) return null;
        
        const secScore = typeof dep.securityScore === 'number' 
          ? dep.securityScore 
          : parseInt(String(dep.securityScore)) || 0;
        
        return {
          name,
          current: info.current,
          latest: info.latest,
          securityScore: dep.securityScore,
          numericScore: secScore,
          risk: dep.risk?.score || 0
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        // Prioritize by security score (lower is worse)
        if (a.numericScore !== b.numericScore) {
          return a.numericScore - b.numericScore;
        }
        // Then by risk score (lower is worse)
        return a.risk - b.risk;
      })
      .slice(0, 10)
      .map(({ name, current, latest, securityScore }) => ({
        name,
        current,
        latest,
        securityScore,
      }));

    insights.quickWins = quickWinCandidates;
  }

  // Add vulnerability counts from audit data
  if (auditData?.metadata?.vulnerabilities) {
    insights.metrics.vulnerabilities = auditData.metadata.vulnerabilities;
  }

  return insights;
}

function generateMarkdown(result: SBOMResult): string {
  const { packages, isMonorepo, insights } = result;
  
  // Escape HTML entities to prevent MDX parsing issues
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\//g, '&#x2F;') // Escape forward slashes that can cause issues
      .replace(/\\/g, '&#x5C;'); // Escape backslashes
  };
  
  const riskBadge = (riskLevel: string) => {
    const colors = { Low: 'green', Medium: 'yellow', High: 'red' };
    return `![Risk: ${escapeHtml(riskLevel)}](https://img.shields.io/badge/Risk-${escapeHtml(riskLevel)}-${colors[riskLevel as keyof typeof colors]})`;
  };

  const formatDependencyTable = (deps: DependencyInfo[]) => {
    if (deps.length === 0) return 'No dependencies found.';

    return deps
      .map((d) => {
        const riskBadgeStr = d.risk ? riskBadge(d.risk.riskLevel) : '';
        const licenseBadge = d.licenseProblematic ? `⚠️ ${d.license}` : d.license;

        return `| [${escapeHtml(d.name)}](https://www.npmjs.com/package/${d.name}) | ${escapeHtml(d.version)} | ${escapeHtml(d.description)} | ${escapeHtml(licenseBadge)} | [${d.securityScore}](https://snyk.io/advisor/npm-package/${d.name}) | ${riskBadgeStr} | [${d.minifiedSize} KB](https://bundlephobia.com/package/${d.name}@${d.version}) | ${escapeHtml(d.lastPublishDate)} |`;
      })
      .join('\n');
  };

  const formatInsights = () => {
    if (!insights) return '';
    
    let insightsText = '';

    if (insights.topRisks.length > 0) {
      insightsText += `### 🚨 Top Security Risks\n\n`;
      insightsText += `| Package | Risk Score | Factors |\n`;
      insightsText += `| ------- | --------- | ------- |\n`;
      insights.topRisks.forEach((risk: { name: string; score: number; factors: string[] }) => {
        insightsText += `| ${escapeHtml(risk.name)} | ${risk.score}/100 | ${risk.factors.map((f: string) => escapeHtml(f)).join(' • ')} |\n`;
      });
      insightsText += `\n`;
    }

    if (insights.heaviestDependencies.length > 0) {
      insightsText += `### 📦 Largest Dependencies\n\n`;
      insightsText += `| Package | Size | Gzipped |\n`;
      insightsText += `| ------- | ---- | ------- |\n`;
      insights.heaviestDependencies.forEach((dep: { name: string; size: number; gzipSize: number }) => {
        insightsText += `| ${escapeHtml(dep.name)} | ${dep.size} KB | ${dep.gzipSize} KB |\n`;
      });
      insightsText += `\n**Total Bundle Size:** ${Math.round(insights.totalBundleSize / 1024)} MB\n\n`;
    }

    if (insights.quickWins && insights.quickWins.length > 0) {
      insightsText += `### ✅ Quick Wins (Easy Updates)\n\n`;
      insightsText += `These packages can be easily updated to improve security:\n\n`;
      insightsText += `| Package | Current | Latest | Security Score |\n`;
      insightsText += `| ------- | ------- | ------ | -------------- |\n`;
      insights.quickWins.forEach((win: { name: string; current: string; latest: string; securityScore: string | number }) => {
        insightsText += `| ${escapeHtml(win.name)} | ${escapeHtml(win.current)} | ${escapeHtml(win.latest)} | ${win.securityScore} |\n`;
      });
      insightsText += '\n';
    }

    if (insights.licenseIssues.length > 0) {
      insightsText += `### ⚖️ License Concerns\n\n`;
      insightsText += `The following packages use licenses that may require special attention:\n\n`;
      insights.licenseIssues.forEach((issue: { name: string; license: string }) => {
        insightsText += `- **${escapeHtml(issue.name)}**: ${escapeHtml(issue.license)}\n`;
      });
      insightsText += '\n';
    }

    if (insights.abandonedPackages.length > 0) {
      insightsText += `### 🏚️ Potentially Abandoned Packages\n\n`;
      insightsText += `These packages haven't been updated in over 2 years:\n\n`;
      insights.abandonedPackages.forEach((pkg: { name: string; lastUpdate: string; daysSince: number }) => {
        insightsText += `- **${escapeHtml(pkg.name)}**: Last updated ${escapeHtml(pkg.lastUpdate)} (${pkg.daysSince} days ago)\n`;
      });
      insightsText += '\n';
    }

    return insightsText;
  };

  let markdown = `# Software Bill of Materials (SBOM)\n\n`;
  markdown += `Last updated: ${new Date().toLocaleString()}\n\n`;
  markdown += `${isMonorepo ? '📦 **Monorepo Project**' : '📦 **Single Package Project**'}\n\n`;
  markdown += `> 🤖 This documentation is auto-generated by [Bill of Material](https://billofmaterial.dev)\n\n`;

  if (insights) {
    markdown += `## 📊 Executive Summary\n\n`;
    markdown += `- **Total Dependencies:** ${insights.metrics.totalDependencies} (${insights.metrics.productionDependencies} production, ${insights.metrics.devDependencies} dev)\n`;
    markdown += `- **Average Security Score:** ${insights.metrics.averageSecurityScore}/100\n`;
    markdown += `- **Total Bundle Size:** ${Math.round(insights.totalBundleSize / 1024)} MB\n`;
    markdown += `- **High Risk Packages:** ${insights.topRisks.length}\n`;
    markdown += `- **License Issues:** ${insights.licenseIssues.length}\n`;
    if (insights.metrics.vulnerabilities) {
      const vulns = insights.metrics.vulnerabilities;
      const totalVulns = vulns.info + vulns.low + vulns.moderate + vulns.high + vulns.critical;
      markdown += `- **Vulnerabilities:** ${totalVulns} total (${vulns.critical} critical, ${vulns.high} high, ${vulns.moderate} moderate)\n`;
    }
    markdown += `\n`;
    
    markdown += `## 🎯 Key Insights & Actions\n\n`;
    markdown += formatInsights();
  }

  // Security Audit Section
  if (result.auditData && result.auditData.advisories) {
    const advisoriesCount = Object.keys(result.auditData.advisories).length;
    if (advisoriesCount > 0) {
      markdown += `\n## 🔒 Security Audit\n\n`;
      markdown += `### Summary\n\n`;
      markdown += `| Severity  | Count |\n`;
      markdown += `| --------- | ----- |\n`;
      if (result.auditData.metadata?.vulnerabilities) {
        const vuln = result.auditData.metadata.vulnerabilities;
        markdown += `| Info      | ${vuln.info || 0} |\n`;
        markdown += `| Low       | ${vuln.low || 0} |\n`;
        markdown += `| Moderate  | ${vuln.moderate || 0} |\n`;
        markdown += `| High      | ${vuln.high || 0} |\n`;
        markdown += `| Critical  | ${vuln.critical || 0} |\n`;
      }
      markdown += `\n### Vulnerabilities\n\n`;
      
      const advisories = Object.values(result.auditData.advisories).slice(0, 10);
      advisories.forEach((adv: any) => {
        markdown += `#### ${adv.module_name}\n\n`;
        markdown += `**Severity:** ${adv.severity.toUpperCase()}\n\n`;
        if (adv.title) markdown += `**${adv.title}**\n\n`;
        if (adv.overview) markdown += `${adv.overview}\n\n`;
        markdown += `| Range | Patched Version | Recommendation |\n`;
        markdown += `| ----- | --------------- | -------------- |\n`;
        markdown += `| ${adv.vulnerable_versions} | ${adv.patched_versions || 'N/A'} | ${adv.recommendation || 'Update to latest version'} |\n\n`;
        if (adv.url) markdown += `[View Advisory](${adv.url})\n\n`;
        markdown += `---\n\n`;
      });
    }
  }

  // Outdated Packages Section
  if (result.outdatedPackages && Object.keys(result.outdatedPackages).length > 0) {
    markdown += `\n## 📅 Outdated Packages\n\n`;
    markdown += `The following packages have newer versions available:\n\n`;
    markdown += `| Package | Current | Wanted | Latest |\n`;
    markdown += `| ------- | ------- | ------ | ------ |\n`;
    Object.entries(result.outdatedPackages).slice(0, 20).forEach(([name, info]: [string, any]) => {
      markdown += `| ${escapeHtml(name)} | ${escapeHtml(info.current)} | ${escapeHtml(info.wanted)} | ${escapeHtml(info.latest)} |\n`;
    });
    markdown += `\n`;
  }

  for (const pkg of packages) {
    if (isMonorepo) {
      markdown += `\n---\n\n## Package: ${escapeHtml(pkg.packageName || 'Root')}\n\n`;
      markdown += `**Path:** \`${escapeHtml(pkg.packagePath || '/')}\`\n\n`;
    }

    markdown += `### Production Dependencies\n\n`;
    markdown += `| Name | Version | Description | License | Security | Risk | Size | Last Update |\n`;
    markdown += `| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ----------- |\n`;
    markdown += formatDependencyTable(pkg.dependencies);
    markdown += `\n\n`;

    if (pkg.devDependencies.length > 0) {
      markdown += `### Development Dependencies\n\n`;
      markdown += `| Name | Version | Description | License | Security | Risk | Size | Last Update |\n`;
      markdown += `| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ----------- |\n`;
      markdown += formatDependencyTable(pkg.devDependencies);
      markdown += `\n\n`;
    }
  }

  markdown += `\n---\n\n`;
  markdown += `*Generated by [Bill of Material](https://billofmaterial.dev)*\n`;

  return markdown;
}

function generateSPDX(result: SBOMResult, rootPackageJson: PackageJson): SPDXDocument {
  const timestamp = new Date().toISOString();
  const projectName = rootPackageJson.name || 'project';
  const projectVersion = rootPackageJson.version || '1.0.0';
  
  // Helper to create SPDX ID from package name
  const toSPDXID = (name: string) => {
    return `SPDXRef-Package-${name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
  };

  const spdxPackages: SPDXPackage[] = [];
  const relationships: SPDXRelationship[] = [];

  // Root package
  const rootSPDXID = 'SPDXRef-Package-Root';
  spdxPackages.push({
    SPDXID: rootSPDXID,
    name: projectName,
    versionInfo: projectVersion,
    downloadLocation: rootPackageJson.homepage || rootPackageJson.repository?.url || 'NOASSERTION',
    filesAnalyzed: false,
    supplier: 'NOASSERTION',
    homepage: rootPackageJson.homepage || 'NOASSERTION',
    licenseConcluded: rootPackageJson.license || 'NOASSERTION',
    licenseDeclared: rootPackageJson.license || 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    description: rootPackageJson.description || '',
  });

  // Add all dependencies as SPDX packages
  for (const pkg of result.packages) {
    const allDeps = [...pkg.dependencies, ...pkg.devDependencies];
    
    for (const dep of allDeps) {
      const spdxId = toSPDXID(dep.name);
      
      // Avoid duplicates
      if (spdxPackages.some(p => p.SPDXID === spdxId)) {
        continue;
      }

      const downloadUrl = `https://registry.npmjs.org/${dep.name}/-/${dep.name}-${dep.version}.tgz`;
      
      spdxPackages.push({
        SPDXID: spdxId,
        name: dep.name,
        versionInfo: dep.version,
        downloadLocation: downloadUrl,
        filesAnalyzed: false,
        supplier: 'NOASSERTION',
        homepage: dep.homepage || 'NOASSERTION',
        licenseConcluded: dep.license || 'NOASSERTION',
        licenseDeclared: dep.license || 'NOASSERTION',
        copyrightText: 'NOASSERTION',
        description: dep.description || '',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: `pkg:npm/${dep.name}@${dep.version}`,
          },
        ],
      });

      // Create relationship: root DEPENDS_ON dependency
      relationships.push({
        spdxElementId: rootSPDXID,
        relationshipType: 'DEPENDS_ON',
        relatedSpdxElement: spdxId,
      });
    }
  }

  const spdxDoc: SPDXDocument = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${projectName}-${projectVersion}`,
    documentNamespace: `https://sbom.billofmaterial.dev/${projectName}/${projectVersion}/${timestamp}`,
    creationInfo: {
      created: timestamp,
      creators: [
        'Tool: billofmaterial',
        'Organization: Bill of Material (https://billofmaterial.dev)',
      ],
      licenseListVersion: '3.21',
    },
    packages: spdxPackages,
    relationships: [
      {
        spdxElementId: 'SPDXRef-DOCUMENT',
        relationshipType: 'DESCRIBES',
        relatedSpdxElement: rootSPDXID,
      },
      ...relationships,
    ],
  };

  return spdxDoc;
}

export async function generateSBOM(
  options: GeneratorOptions,
  onProgress?: (message: string, current?: number, total?: number) => void
): Promise<SBOMResult> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const startTime = Date.now();

  let rootPackageJson: PackageJson;
  let workspaceYaml: string | undefined;
  let files: Array<{ path: string; content: string }> = options.files || [];

  // Parse root package.json
  if (typeof options.packageJsonContent === 'string') {
    rootPackageJson = JSON.parse(options.packageJsonContent);
  } else if (options.packageJsonContent) {
    rootPackageJson = options.packageJsonContent;
  } else {
    throw new Error('No package.json provided');
  }

  // Check for workspace yaml
  const workspaceFile = files.find(
    (f) => f.path === 'pnpm-workspace.yaml' || f.path === 'pnpm-workspace.yml'
  );
  if (workspaceFile) {
    workspaceYaml = workspaceFile.content;
  }

  onProgress?.('Detecting project structure...');

  // Detect if monorepo
  const isMonorepo = detectMonorepo(rootPackageJson, workspaceYaml);

  const packages: PackageData[] = [];

  const allOutdatedPackages: Record<string, any> = {};

  if (isMonorepo) {
    onProgress?.('Analyzing monorepo structure...');
    
    // Find all package.json files in workspace
    const packageJsonFiles = findAllPackageJsons(files, rootPackageJson, workspaceYaml);
    
    onProgress?.(`Found ${packageJsonFiles.length} packages in monorepo`);

    // Analyze each package
    for (let i = 0; i < packageJsonFiles.length; i++) {
      const pkgFile = packageJsonFiles[i];
      if (!pkgFile || !pkgFile.content) {
        throw new Error(`Invalid package file at index ${i}`);
      }
      const pkgJson = pkgFile.content;

      onProgress?.(
        `Analyzing package ${i + 1}/${packageJsonFiles.length}: ${pkgJson.name || pkgFile.path}`
      );

      const depsResult = await analyzeDependencies(
        pkgJson.dependencies || {},
        config,
        (current, total) => {
          onProgress?.(
            `Analyzing dependencies for ${pkgJson.name || pkgFile.path}`,
            current,
            total
          );
        }
      );

      const devDepsResult = config.includeDevDeps
        ? await analyzeDependencies(
            pkgJson.devDependencies || {},
            config,
            (current, total) => {
              onProgress?.(
                `Analyzing dev dependencies for ${pkgJson.name || pkgFile.path}`,
                current,
                total
              );
            }
          )
        : { dependencies: [], outdatedPackages: {} };

      // Merge outdated packages
      Object.assign(allOutdatedPackages, depsResult.outdatedPackages, devDepsResult.outdatedPackages);

      packages.push({
        packageName: pkgJson.name,
        packagePath: pkgFile.path,
        dependencies: depsResult.dependencies,
        devDependencies: devDepsResult.dependencies,
      });
    }
  } else {
    onProgress?.('Analyzing single package project...');

    const depsResult = await analyzeDependencies(
      rootPackageJson.dependencies || {},
      config,
      (current, total) => {
        onProgress?.('Analyzing production dependencies', current, total);
      }
    );

    const devDepsResult = config.includeDevDeps
      ? await analyzeDependencies(
          rootPackageJson.devDependencies || {},
          config,
          (current, total) => {
            onProgress?.('Analyzing development dependencies', current, total);
          }
        )
      : { dependencies: [], outdatedPackages: {} };

    // Merge outdated packages
    Object.assign(allOutdatedPackages, depsResult.outdatedPackages, devDepsResult.outdatedPackages);

    packages.push({
      packageName: rootPackageJson.name,
      dependencies: depsResult.dependencies,
      devDependencies: devDepsResult.dependencies,
    });
  }

  onProgress?.('Generating insights...');
  
  // Generate insights with outdated packages
  const insights = generateInsights(packages, allOutdatedPackages, undefined);

  onProgress?.('Generating markdown...');
  
  const result: SBOMResult = {
    isMonorepo,
    packages,
    totalDependencies: packages.reduce(
      (sum, p) => sum + p.dependencies.length + p.devDependencies.length,
      0
    ),
    markdown: '',
    generatedAt: new Date().toISOString(),
    insights,
    // Outdated packages are now detected from npm
    outdatedPackages: Object.keys(allOutdatedPackages).length > 0 ? allOutdatedPackages : undefined,
    // Audit data still requires CLI
    auditData: undefined,
  };

  result.markdown = generateMarkdown(result);
  
  // Generate SPDX format (ISO/IEC 5962:2021)
  onProgress?.('Generating SPDX format...');
  result.spdx = generateSPDX(result, rootPackageJson);

  const duration = Math.round((Date.now() - startTime) / 1000);
  onProgress?.(`✅ Completed in ${duration}s`);

  return result;
}

// Export a version that can accept audit/outdated data (for CLI use)
export async function generateSBOMWithExtras(
  options: GeneratorOptions,
  auditData?: any,
  outdatedPackages?: Record<string, any>,
  onProgress?: (message: string, current?: number, total?: number) => void
): Promise<SBOMResult> {
  const result = await generateSBOM(options, onProgress);
  
  if (auditData) {
    result.auditData = auditData;
  }
  
  if (outdatedPackages) {
    result.outdatedPackages = outdatedPackages;
  }
  
  // Regenerate insights with audit and outdated data
  if (auditData || outdatedPackages) {
    result.insights = generateInsights(result.packages, outdatedPackages, auditData);
    result.markdown = generateMarkdown(result);
  }
  
  return result;
}

