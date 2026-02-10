import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
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
  SPDXRelationship,
  VulnerabilityInfo,
  VulnSeverity,
  KnownUnknown,
  SBOMCoverage,
  CycloneDXDocument,
  CycloneDXComponent,
  CycloneDXDependency,
  CycloneDXVulnerability,
  ComplianceReport,
  ComplianceControl,
  SupplierInfo,
} from './types';
import { detectMonorepo, findAllPackageJsons } from './monorepo';

const TOOL_VERSION = '0.3.0';

const DEFAULT_CONFIG: SBOMConfig = {
  includeDevDeps: true,
  includeBundleSize: true,
  includeVulnerabilities: true,
  includeTransitiveDeps: false,
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
  delay: number = 1000,
  options?: RequestInit
): Promise<Response | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await rateLimiter.execute(async () => {
        const res = await fetch(url, options);
        if (!res.ok) {
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
    // Snyk redesigned their page - score is now in span.score-number (e.g. "95/100")
    const scoreText = $('span.score-number').first().text().trim();
    const match = scoreText.match(/(\d+)/);
    return match && match[1] ? parseInt(match[1], 10) : 'N/A';
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

async function getPopularityData(
  packageName: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<{ score: number; downloads: number }> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!);

  if (!response) return { score: 0, downloads: 0 };

  try {
    const data = await response.json();
    const downloads = data.downloads || 0;

    let score: number;
    if (downloads > 1000000) score = 100;
    else if (downloads > 100000) score = 90;
    else if (downloads > 10000) score = 70;
    else if (downloads > 1000) score = 50;
    else if (downloads > 100) score = 30;
    else score = 10;

    return { score, downloads };
  } catch {
    return { score: 0, downloads: 0 };
  }
}

// P1: Vulnerability detection via OSV.dev API
async function getVulnerabilities(
  packageName: string,
  version: string,
  rateLimiter: RateLimiter,
  config: SBOMConfig
): Promise<VulnerabilityInfo[]> {
  if (!config.includeVulnerabilities) return [];

  const url = 'https://api.osv.dev/v1/query';
  const response = await fetchWithRetry(url, rateLimiter, config.retryAttempts!, config.retryDelay!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package: { name: packageName, ecosystem: 'npm' },
      version,
    }),
  });

  if (!response) return [];

  try {
    const data = await response.json();
    if (!data.vulns || !Array.isArray(data.vulns)) return [];

    return data.vulns.map((vuln: any): VulnerabilityInfo => {
      // Extract severity from database_specific or severity field
      let severity: VulnSeverity = 'UNKNOWN';
      let cvssScore: number | undefined;

      if (vuln.severity && vuln.severity.length > 0) {
        const sev = vuln.severity[0];
        cvssScore = sev.score;
        if (sev.type === 'CVSS_V3' && sev.score !== undefined) {
          if (sev.score >= 9.0) severity = 'CRITICAL';
          else if (sev.score >= 7.0) severity = 'HIGH';
          else if (sev.score >= 4.0) severity = 'MODERATE';
          else if (sev.score > 0) severity = 'LOW';
          else severity = 'NONE';
        }
      } else if (vuln.database_specific?.severity) {
        severity = vuln.database_specific.severity.toUpperCase() as VulnSeverity;
      }

      // Extract fixed version
      let fixedIn: string | undefined;
      const affected = vuln.affected?.[0];
      if (affected?.ranges) {
        for (const range of affected.ranges) {
          for (const event of range.events || []) {
            if (event.fixed) {
              fixedIn = event.fixed;
              break;
            }
          }
        }
      }

      // Extract CWE IDs
      const cweIds = vuln.database_specific?.cwe_ids || [];

      // Find advisory URL
      const advisoryRef = vuln.references?.find((r: any) => r.type === 'ADVISORY');

      return {
        id: vuln.id,
        aliases: vuln.aliases || [],
        summary: vuln.summary || vuln.details?.substring(0, 200) || 'No description',
        severity,
        cvssScore,
        cweIds,
        fixedIn,
        url: advisoryRef?.url || vuln.references?.[0]?.url,
        vexStatus: fixedIn ? 'affected' : 'under_investigation',
      };
    });
  } catch {
    return [];
  }
}

// P0: Extract supplier/producer info from npm data
function extractSupplier(npmData: any): SupplierInfo | undefined {
  if (!npmData) return undefined;

  // Prefer author, then first maintainer
  if (npmData.author) {
    if (typeof npmData.author === 'string') {
      return { name: npmData.author };
    }
    return {
      name: npmData.author.name || 'Unknown',
      email: npmData.author.email,
      url: npmData.author.url,
    };
  }

  if (npmData.maintainers && npmData.maintainers.length > 0) {
    const m = npmData.maintainers[0];
    return {
      name: m.name || 'Unknown',
      email: m.email,
    };
  }

  return undefined;
}

// P0: Extract cryptographic hashes from npm version data
function extractHashes(versionData: any): { integrity?: string; shasum?: string } {
  if (!versionData?.dist) return {};
  return {
    integrity: versionData.dist.integrity,
    shasum: versionData.dist.shasum,
  };
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
    security: 0.35,
    maintenance: 0.25,
    popularity: 0.15,
    license: 0.1,
    vulnerability: 0.15,
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

  // Vulnerability score (new)
  const vulns = packageData.vulnerabilities || [];
  if (vulns.length > 0) {
    const criticalCount = vulns.filter(v => v.severity === 'CRITICAL').length;
    const highCount = vulns.filter(v => v.severity === 'HIGH').length;

    if (criticalCount > 0) {
      factors.push(`${criticalCount} critical vulnerabilit${criticalCount > 1 ? 'ies' : 'y'}`);
      totalScore += 0 * riskWeights.vulnerability; // 0 score for critical vulns
    } else if (highCount > 0) {
      factors.push(`${highCount} high-severity vulnerabilit${highCount > 1 ? 'ies' : 'y'}`);
      totalScore += 0.3 * riskWeights.vulnerability;
    } else {
      factors.push(`${vulns.length} known vulnerabilit${vulns.length > 1 ? 'ies' : 'y'}`);
      totalScore += 0.6 * riskWeights.vulnerability;
    }
    packageData.hasVulnerabilities = true;
  } else {
    totalScore += 1 * riskWeights.vulnerability;
  }

  // Deprecated penalty
  if (packageData.deprecated) {
    factors.push('Package is deprecated');
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
  knownUnknowns: KnownUnknown[],
  onProgress?: (current: number, total: number) => void
): Promise<{ dependencies: DependencyInfo[]; outdatedPackages: Record<string, any> }> {
  const rateLimiter = new RateLimiter(config.maxConcurrentRequests!);
  const convertToKb = (bytes: number) => Math.round(bytes / 1024);

  const total = Object.keys(deps).length;
  let current = 0;
  const outdatedPackages: Record<string, any> = {};

  const depsPromises = Object.entries(deps).map(async ([name, version]) => {
    try {
      const [npmData, securityScore, bundleSize, popularityData] = await Promise.all([
        getNpmData(name, rateLimiter, config),
        getNpmSecurityScore(name, rateLimiter, config),
        getBundleSize(name, version, rateLimiter, config),
        getPopularityData(name, rateLimiter, config),
      ]);
      const popularityScore = popularityData.score;

      // P0: Track known unknowns for failed fetches
      if (!npmData) {
        knownUnknowns.push({
          name,
          version: version.replace(/^[\^~>=<\s]+/, ''),
          reason: 'Failed to fetch package data from npm registry',
          category: 'fetch_failed',
        });
        current++;
        if (onProgress) onProgress(current, total);
        return null;
      }

      const lastPublish = npmData?.time?.modified || npmData?.time?.created;
      const daysSinceUpdate = lastPublish
        ? (Date.now() - new Date(lastPublish).getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      const maintenanceScore = calculateMaintenanceScore(npmData);
      const license = npmData?.license || 'Unknown';
      const homepage = npmData?.homepage || npmData?.repository?.url || '';

      const latestVersion = npmData?.['dist-tags']?.latest || version;
      const currentVersion = version.replace(/^[\^~>=<\s]+/, ''); // Remove version prefix chars
      const currentVersionData = npmData?.versions?.[currentVersion];
      const latestVersionData = npmData?.versions?.[latestVersion];

      // Check if package is outdated
      if (latestVersion !== currentVersion && npmData?.['dist-tags']?.latest) {
        outdatedPackages[name] = {
          current: currentVersion,
          wanted: currentVersion,
          latest: latestVersion,
          location: name
        };
      }

      // P0: Extract cryptographic hashes
      const hashes = extractHashes(currentVersionData);

      // P0: Extract supplier info
      const supplier = extractSupplier(npmData);

      // P1: Detect deprecated status
      const deprecated = currentVersionData?.deprecated || false;

      // P1: Fetch vulnerabilities from OSV.dev
      const vulnerabilities = await getVulnerabilities(name, currentVersion, rateLimiter, config);

      // P2: Transitive dependencies
      const transitiveDeps = config.includeTransitiveDeps
        ? Object.keys(currentVersionData?.dependencies || {})
        : undefined;

      const packageData: DependencyInfo = {
        name,
        description: npmData?.description || 'N/A',
        version: currentVersion,
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
        weeklyDownloads: popularityData.downloads,
        minifiedSize: convertToKb(bundleSize?.size && !name.startsWith('@types') ? bundleSize.size : 0),
        gzipSize: convertToKb(bundleSize?.gzip && !name.startsWith('@types') ? bundleSize.gzip : 0),
        hasVulnerabilities: vulnerabilities.length > 0,
        dependencyCount: Object.keys(latestVersionData?.dependencies || {}).length,
        peerDependencies: latestVersionData?.peerDependencies || {},
        integrity: hashes.integrity,
        shasum: hashes.shasum,
        supplier,
        vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : undefined,
        deprecated: deprecated || undefined,
        transitiveDependencies: transitiveDeps,
      };

      packageData.risk = calculateRiskScore(packageData);

      current++;
      if (onProgress) {
        onProgress(current, total);
      }

      return packageData;
    } catch (error) {
      console.error(`Error processing ${name}:`, error);
      knownUnknowns.push({
        name,
        version: version.replace(/^[\^~>=<\s]+/, ''),
        reason: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        category: 'fetch_failed',
      });
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
    .filter((d) => d.risk && d.risk.score < 70)
    .sort((a, b) => (a.risk?.score || 100) - (b.risk?.score || 100))
    .slice(0, 10)
    .map((d) => ({
      name: d.name,
      score: d.risk!.score,
      factors: d.risk!.factors,
    }));

  // Vulnerability summary
  const allVulns = allDeps.flatMap(d => d.vulnerabilities || []);
  const vulnerabilitySummary = {
    total: allVulns.length,
    critical: allVulns.filter(v => v.severity === 'CRITICAL').length,
    high: allVulns.filter(v => v.severity === 'HIGH').length,
    moderate: allVulns.filter(v => v.severity === 'MODERATE').length,
    low: allVulns.filter(v => v.severity === 'LOW').length,
    packagesAffected: allDeps.filter(d => (d.vulnerabilities?.length || 0) > 0).length,
  };

  // Deprecated packages
  const deprecatedPackages = allDeps
    .filter(d => d.deprecated)
    .map(d => ({
      name: d.name,
      version: d.version,
      reason: typeof d.deprecated === 'string' ? d.deprecated : 'Package is deprecated',
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
    deprecatedPackages,
    vulnerabilitySummary,
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

  // Quick wins
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
        if (a.numericScore !== b.numericScore) return a.numericScore - b.numericScore;
        return a.risk - b.risk;
      })
      .slice(0, 10)
      .map(({ name, current, latest, securityScore }) => ({
        name, current, latest, securityScore,
      }));

    insights.quickWins = quickWinCandidates;
  }

  if (auditData?.metadata?.vulnerabilities) {
    insights.metrics.vulnerabilities = auditData.metadata.vulnerabilities;
  }

  return insights;
}

function generateMarkdown(result: SBOMResult): string {
  const { packages, isMonorepo, insights } = result;

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
        const licenseBadge = d.licenseProblematic ? `[!] ${d.license}` : d.license;
        const vulnBadge = d.vulnerabilities && d.vulnerabilities.length > 0
          ? `[!] ${d.vulnerabilities.length}`
          : 'None';
        const deprecatedBadge = d.deprecated ? ' [DEPRECATED]' : '';

        return `| [${escapeHtml(d.name)}](https://www.npmjs.com/package/${d.name})${deprecatedBadge} | ${escapeHtml(d.version)} | ${escapeHtml(d.description)} | ${escapeHtml(licenseBadge)} | [${d.securityScore}](https://snyk.io/advisor/npm-package/${d.name}) | ${vulnBadge} | ${riskBadgeStr} | [${d.minifiedSize} KB](https://bundlephobia.com/package/${d.name}@${d.version}) | ${escapeHtml(d.lastPublishDate)} |`;
      })
      .join('\n');
  };

  const formatInsights = () => {
    if (!insights) return '';

    let insightsText = '';

    // Vulnerability summary
    if (insights.vulnerabilitySummary.total > 0) {
      insightsText += `### Vulnerability Summary\n\n`;
      insightsText += `| Severity | Count |\n`;
      insightsText += `| -------- | ----- |\n`;
      insightsText += `| Critical | ${insights.vulnerabilitySummary.critical} |\n`;
      insightsText += `| High | ${insights.vulnerabilitySummary.high} |\n`;
      insightsText += `| Moderate | ${insights.vulnerabilitySummary.moderate} |\n`;
      insightsText += `| Low | ${insights.vulnerabilitySummary.low} |\n`;
      insightsText += `\n**${insights.vulnerabilitySummary.packagesAffected}** packages affected out of ${insights.metrics.totalDependencies} total.\n\n`;
    }

    if (insights.topRisks.length > 0) {
      insightsText += `### Top Security Risks\n\n`;
      insightsText += `| Package | Risk Score | Factors |\n`;
      insightsText += `| ------- | --------- | ------- |\n`;
      insights.topRisks.forEach((risk: { name: string; score: number; factors: string[] }) => {
        insightsText += `| ${escapeHtml(risk.name)} | ${risk.score}/100 | ${risk.factors.map((f: string) => escapeHtml(f)).join(' / ')} |\n`;
      });
      insightsText += `\n`;
    }

    if (insights.heaviestDependencies.length > 0) {
      insightsText += `### Largest Dependencies\n\n`;
      insightsText += `| Package | Size | Gzipped |\n`;
      insightsText += `| ------- | ---- | ------- |\n`;
      insights.heaviestDependencies.forEach((dep: { name: string; size: number; gzipSize: number }) => {
        insightsText += `| ${escapeHtml(dep.name)} | ${dep.size} KB | ${dep.gzipSize} KB |\n`;
      });
      const totalMB = insights.totalBundleSize / 1024;
      insightsText += `\n**Total Bundle Size:** ${totalMB >= 1 ? `${totalMB.toFixed(1)} MB` : `${insights.totalBundleSize} KB`}\n\n`;
    }

    if (insights.quickWins && insights.quickWins.length > 0) {
      insightsText += `### Quick Wins (Easy Updates)\n\n`;
      insightsText += `These packages can be easily updated to improve security:\n\n`;
      insightsText += `| Package | Current | Latest | Security Score |\n`;
      insightsText += `| ------- | ------- | ------ | -------------- |\n`;
      insights.quickWins.forEach((win: { name: string; current: string; latest: string; securityScore: string | number }) => {
        insightsText += `| ${escapeHtml(win.name)} | ${escapeHtml(win.current)} | ${escapeHtml(win.latest)} | ${win.securityScore} |\n`;
      });
      insightsText += '\n';
    }

    if (insights.licenseIssues.length > 0) {
      insightsText += `### License Concerns\n\n`;
      insightsText += `The following packages use licenses that may require special attention:\n\n`;
      insights.licenseIssues.forEach((issue: { name: string; license: string }) => {
        insightsText += `- **${escapeHtml(issue.name)}**: ${escapeHtml(issue.license)}\n`;
      });
      insightsText += '\n';
    }

    if (insights.deprecatedPackages.length > 0) {
      insightsText += `### Deprecated Packages\n\n`;
      insightsText += `The following packages are deprecated and should be replaced:\n\n`;
      insights.deprecatedPackages.forEach((pkg) => {
        insightsText += `- **${escapeHtml(pkg.name)}** (${escapeHtml(pkg.version)}): ${escapeHtml(pkg.reason)}\n`;
      });
      insightsText += '\n';
    }

    if (insights.abandonedPackages.length > 0) {
      insightsText += `### Potentially Abandoned Packages\n\n`;
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
  markdown += `${isMonorepo ? '**Monorepo Project**' : '**Single Package Project**'}\n\n`;
  markdown += `> This documentation is auto-generated by [Bill of Material](https://billofmaterial.dev)\n\n`;

  // Coverage declaration
  if (result.coverage) {
    markdown += `> **SBOM Coverage:** ${result.coverage.depth} dependencies | Tool: ${result.coverage.toolName} v${result.coverage.toolVersion}\n\n`;
  }

  if (insights) {
    markdown += `## Executive Summary\n\n`;
    markdown += `- **Total Dependencies:** ${insights.metrics.totalDependencies} (${insights.metrics.productionDependencies} production, ${insights.metrics.devDependencies} dev)\n`;
    markdown += `- **Average Security Score:** ${insights.metrics.averageSecurityScore}/100\n`;
    const totalMB = insights.totalBundleSize / 1024;
    markdown += `- **Total Bundle Size:** ${totalMB >= 1 ? `${totalMB.toFixed(1)} MB` : `${insights.totalBundleSize} KB`}\n`;
    markdown += `- **High Risk Packages:** ${insights.topRisks.length}\n`;
    markdown += `- **License Issues:** ${insights.licenseIssues.length}\n`;
    if (insights.vulnerabilitySummary.total > 0) {
      const vs = insights.vulnerabilitySummary;
      markdown += `- **Vulnerabilities:** ${vs.total} total (${vs.critical} critical, ${vs.high} high, ${vs.moderate} moderate, ${vs.low} low) in ${vs.packagesAffected} packages\n`;
    } else {
      markdown += `- **Vulnerabilities:** None detected\n`;
    }
    if (insights.deprecatedPackages.length > 0) {
      markdown += `- **Deprecated Packages:** ${insights.deprecatedPackages.length}\n`;
    }
    if (insights.metrics.vulnerabilities) {
      const vulns = insights.metrics.vulnerabilities;
      const totalVulns = vulns.info + vulns.low + vulns.moderate + vulns.high + vulns.critical;
      markdown += `- **Audit Vulnerabilities:** ${totalVulns} total (${vulns.critical} critical, ${vulns.high} high, ${vulns.moderate} moderate)\n`;
    }
    markdown += `\n`;

    markdown += `## Key Insights & Actions\n\n`;
    markdown += formatInsights();
  }

  // Known Unknowns section
  if (result.knownUnknowns && result.knownUnknowns.length > 0) {
    markdown += `\n## Known Unknowns\n\n`;
    markdown += `The following components could not be fully analyzed:\n\n`;
    markdown += `| Package | Version | Reason | Category |\n`;
    markdown += `| ------- | ------- | ------ | -------- |\n`;
    result.knownUnknowns.forEach((ku) => {
      markdown += `| ${escapeHtml(ku.name)} | ${escapeHtml(ku.version)} | ${escapeHtml(ku.reason)} | ${ku.category} |\n`;
    });
    markdown += `\n`;
  }

  // Security Audit Section
  if (result.auditData && result.auditData.advisories) {
    const advisoriesCount = Object.keys(result.auditData.advisories).length;
    if (advisoriesCount > 0) {
      markdown += `\n## Security Audit\n\n`;
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
    markdown += `\n## Outdated Packages\n\n`;
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
    markdown += `| Name | Version | Description | License | Security | CVEs | Risk | Size | Last Update |\n`;
    markdown += `| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ---- | ----------- |\n`;
    markdown += formatDependencyTable(pkg.dependencies);
    markdown += `\n\n`;

    if (pkg.devDependencies.length > 0) {
      markdown += `### Development Dependencies\n\n`;
      markdown += `| Name | Version | Description | License | Security | CVEs | Risk | Size | Last Update |\n`;
      markdown += `| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ---- | ----------- |\n`;
      markdown += formatDependencyTable(pkg.devDependencies);
      markdown += `\n\n`;
    }
  }

  // Compliance Report
  if (result.complianceReport) {
    markdown += `\n## ISO 27001 Compliance Report\n\n`;
    markdown += `**Standard:** ${result.complianceReport.standard}\n`;
    markdown += `**Status:** ${result.complianceReport.overallStatus.replace('_', ' ').toUpperCase()}\n`;
    markdown += `**Assessment:** ${result.complianceReport.summary.passed} passed, ${result.complianceReport.summary.warnings} warnings, ${result.complianceReport.summary.failed} failed\n\n`;

    markdown += `| Control | Status | Description | Findings |\n`;
    markdown += `| ------- | ------ | ----------- | -------- |\n`;
    result.complianceReport.controls.forEach((ctrl) => {
      const statusIcon = ctrl.status === 'pass' ? 'PASS' : ctrl.status === 'warning' ? 'WARN' : 'FAIL';
      markdown += `| ${ctrl.id} | ${statusIcon} ${ctrl.status.toUpperCase()} | ${escapeHtml(ctrl.name)} | ${ctrl.findings.map(f => escapeHtml(f)).join('; ')} |\n`;
    });
    markdown += `\n`;
  }

  markdown += `\n---\n\n`;
  markdown += `*Generated by [Bill of Material](https://billofmaterial.dev) v${TOOL_VERSION}*\n`;

  return markdown;
}

function generateSPDX(result: SBOMResult, rootPackageJson: PackageJson): SPDXDocument {
  const timestamp = new Date().toISOString();
  const projectName = rootPackageJson.name || 'project';
  const projectVersion = rootPackageJson.version || '1.0.0';

  const toSPDXID = (name: string) => {
    return `SPDXRef-Package-${name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
  };

  const spdxPackages: SPDXPackage[] = [];
  const relationships: SPDXRelationship[] = [];

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

  for (const pkg of result.packages) {
    const allDeps = [...pkg.dependencies, ...pkg.devDependencies];

    for (const dep of allDeps) {
      const spdxId = toSPDXID(dep.name);

      if (spdxPackages.some(p => p.SPDXID === spdxId)) {
        continue;
      }

      const tgzName = dep.name.startsWith('@') ? dep.name.split('/')[1] : dep.name;
      const downloadUrl = `https://registry.npmjs.org/${dep.name}/-/${tgzName}-${dep.version}.tgz`;

      // P0: Add checksums from npm registry
      const checksums: Array<{ algorithm: string; checksumValue: string }> = [];
      if (dep.integrity) {
        // Parse integrity hash (format: "sha512-base64...")
        const match = dep.integrity.match(/^(sha\d+)-(.+)$/);
        if (match) {
          const algo = match[1]!.toUpperCase().replace('SHA', 'SHA');
          const hashBase64 = match[2]!;
          const hashHex = Buffer.from(hashBase64, 'base64').toString('hex');
          checksums.push({ algorithm: algo, checksumValue: hashHex });
        }
      }
      if (dep.shasum) {
        checksums.push({ algorithm: 'SHA1', checksumValue: dep.shasum });
      }

      // P0: Supplier info
      const supplierStr = dep.supplier
        ? `Organization: ${dep.supplier.name}${dep.supplier.email ? ` (${dep.supplier.email})` : ''}`
        : 'NOASSERTION';

      spdxPackages.push({
        SPDXID: spdxId,
        name: dep.name,
        versionInfo: dep.version,
        downloadLocation: downloadUrl,
        filesAnalyzed: false,
        supplier: supplierStr,
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
        checksums: checksums.length > 0 ? checksums : undefined,
      });

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
        `Tool: billofmaterial-${TOOL_VERSION}`,
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

// P1: Generate CycloneDX 1.5 format (ECMA-424)
function generateCycloneDX(result: SBOMResult, rootPackageJson: PackageJson): CycloneDXDocument {
  const timestamp = new Date().toISOString();
  const projectName = rootPackageJson.name || 'project';
  const projectVersion = rootPackageJson.version || '1.0.0';

  const components: CycloneDXComponent[] = [];
  const dependencies: CycloneDXDependency[] = [];
  const vulnerabilities: CycloneDXVulnerability[] = [];

  const rootRef = `pkg:npm/${projectName}@${projectVersion}`;
  const rootDependsOn: string[] = [];

  for (const pkg of result.packages) {
    const allDeps = [...pkg.dependencies, ...pkg.devDependencies];

    for (const dep of allDeps) {
      const bomRef = `pkg:npm/${dep.name}@${dep.version}`;

      if (components.some(c => c['bom-ref'] === bomRef)) continue;

      rootDependsOn.push(bomRef);

      // Hashes
      const hashes: Array<{ alg: string; content: string }> = [];
      if (dep.integrity) {
        const match = dep.integrity.match(/^(sha\d+)-(.+)$/);
        if (match) {
          const alg = match[1]!.toUpperCase().replace('SHA', 'SHA-');
          hashes.push({ alg, content: Buffer.from(match[2]!, 'base64').toString('hex') });
        }
      }
      if (dep.shasum) {
        hashes.push({ alg: 'SHA-1', content: dep.shasum });
      }

      const component: CycloneDXComponent = {
        type: 'library',
        name: dep.name,
        version: dep.version,
        'bom-ref': bomRef,
        purl: bomRef,
        description: dep.description !== 'N/A' ? dep.description : undefined,
        licenses: dep.license && dep.license !== 'Unknown'
          ? [{ license: { id: dep.license } }]
          : undefined,
        hashes: hashes.length > 0 ? hashes : undefined,
        supplier: dep.supplier ? {
          name: dep.supplier.name,
          url: dep.supplier.url ? [dep.supplier.url] : undefined,
        } : undefined,
        externalReferences: dep.homepage ? [{
          type: 'website',
          url: dep.homepage,
        }] : undefined,
        properties: [
          ...(dep.deprecated ? [{ name: 'cdx:npm:deprecated', value: typeof dep.deprecated === 'string' ? dep.deprecated : 'true' }] : []),
          { name: 'cdx:npm:weekly-downloads', value: String(dep.weeklyDownloads) },
        ],
      };
      components.push(component);

      // Dependency graph
      const depDependsOn = dep.transitiveDependencies?.map(t => `pkg:npm/${t}`) || [];
      dependencies.push({ ref: bomRef, dependsOn: depDependsOn.length > 0 ? depDependsOn : undefined });

      // Vulnerabilities
      if (dep.vulnerabilities) {
        for (const vuln of dep.vulnerabilities) {
          if (vulnerabilities.some(v => v.id === vuln.id)) continue;

          const cdxVuln: CycloneDXVulnerability = {
            id: vuln.id,
            source: {
              name: 'OSV',
              url: 'https://osv.dev',
            },
            ratings: vuln.cvssScore !== undefined ? [{
              score: vuln.cvssScore,
              severity: vuln.severity.toLowerCase(),
              method: 'CVSSv3',
            }] : [{
              severity: vuln.severity.toLowerCase(),
            }],
            cwes: vuln.cweIds?.map(c => parseInt(c.replace('CWE-', ''), 10)).filter(n => !isNaN(n)),
            description: vuln.summary,
            recommendation: vuln.fixedIn ? `Update to version ${vuln.fixedIn} or later` : undefined,
            advisories: vuln.url ? [{ url: vuln.url }] : undefined,
            affects: [{
              ref: bomRef,
              versions: [{
                version: dep.version,
                status: 'affected',
              }],
            }],
            analysis: vuln.vexStatus ? {
              state: vuln.vexStatus,
              justification: vuln.vexJustification,
            } : undefined,
          };
          vulnerabilities.push(cdxVuln);
        }
      }
    }
  }

  // Root dependency entry
  dependencies.unshift({ ref: rootRef, dependsOn: rootDependsOn });

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp,
      tools: [{
        vendor: 'billofmaterial',
        name: 'billofmaterial',
        version: TOOL_VERSION,
      }],
      component: {
        type: 'application',
        name: projectName,
        version: projectVersion,
        'bom-ref': rootRef,
      },
      lifecycles: [{ phase: 'build' }],
    },
    components,
    dependencies,
    vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : undefined,
  };
}

// P3: Generate ISO 27001 Compliance Report
function generateComplianceReport(result: SBOMResult): ComplianceReport {
  const controls: ComplianceControl[] = [];
  const allDeps: DependencyInfo[] = [];
  for (const pkg of result.packages) {
    allDeps.push(...pkg.dependencies, ...pkg.devDependencies);
  }

  const insights = result.insights!;
  const vulnSummary = insights.vulnerabilitySummary;

  // A.8.28 - Secure Coding (Software Component Management)
  {
    const findings: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    if (allDeps.length === 0) {
      findings.push('No dependencies analyzed');
      status = 'warning';
    } else {
      findings.push(`${allDeps.length} components inventoried with version, license, and supplier data`);
    }

    const withHashes = allDeps.filter(d => d.integrity || d.shasum).length;
    if (withHashes < allDeps.length) {
      findings.push(`${allDeps.length - withHashes} components missing cryptographic hashes`);
      if (withHashes < allDeps.length * 0.5) status = 'fail';
      else status = 'warning';
    } else {
      findings.push('All components have cryptographic hashes');
    }

    controls.push({
      id: 'A.8.28',
      name: 'Secure Coding - Component Inventory',
      status,
      description: 'Software components must be inventoried and managed with integrity verification',
      findings,
      recommendation: status !== 'pass' ? 'Ensure all components have verifiable integrity hashes' : undefined,
    });
  }

  // A.8.28 - Vulnerability Management
  {
    const findings: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    if (vulnSummary.critical > 0) {
      findings.push(`${vulnSummary.critical} CRITICAL vulnerabilities detected - immediate action required`);
      status = 'fail';
    }
    if (vulnSummary.high > 0) {
      findings.push(`${vulnSummary.high} HIGH severity vulnerabilities detected`);
      if (status === 'pass') status = 'warning';
    }
    if (vulnSummary.total === 0) {
      findings.push('No known vulnerabilities detected');
    } else {
      findings.push(`${vulnSummary.total} total vulnerabilities in ${vulnSummary.packagesAffected} packages`);
    }

    controls.push({
      id: 'A.8.28-VULN',
      name: 'Secure Coding - Vulnerability Management',
      status,
      description: 'Known vulnerabilities in third-party components must be identified and addressed',
      findings,
      recommendation: status !== 'pass' ? 'Remediate critical and high vulnerabilities immediately. Review moderate vulnerabilities within 30 days.' : undefined,
    });
  }

  // A.5.19 - Supplier Relationships (Information Security)
  {
    const findings: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    const withSupplier = allDeps.filter(d => d.supplier).length;
    findings.push(`${withSupplier}/${allDeps.length} components have identified suppliers`);

    if (withSupplier < allDeps.length * 0.8) {
      status = 'warning';
    }

    const deprecated = insights.deprecatedPackages.length;
    if (deprecated > 0) {
      findings.push(`${deprecated} deprecated packages in use - supplier support ended`);
      status = 'warning';
    }

    const abandoned = insights.abandonedPackages.length;
    if (abandoned > 0) {
      findings.push(`${abandoned} potentially abandoned packages (no update >2 years)`);
      status = 'warning';
    }

    controls.push({
      id: 'A.5.19',
      name: 'Information Security in Supplier Relationships',
      status,
      description: 'Processes for managing information security risks in supplier relationships',
      findings,
      recommendation: status !== 'pass' ? 'Replace deprecated packages. Evaluate alternatives for abandoned packages. Document risk acceptance for unresolved items.' : undefined,
    });
  }

  // A.5.20 - Addressing Information Security within Supplier Agreements
  {
    const findings: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    const licenseIssues = insights.licenseIssues.length;
    if (licenseIssues > 0) {
      findings.push(`${licenseIssues} packages with restrictive licenses (GPL/AGPL/LGPL/CC-BY-NC)`);
      status = 'warning';
    } else {
      findings.push('No restrictive license issues detected');
    }

    const unknownLicense = allDeps.filter(d => d.license === 'Unknown').length;
    if (unknownLicense > 0) {
      findings.push(`${unknownLicense} packages with unknown licenses`);
      status = 'warning';
    }

    controls.push({
      id: 'A.5.20',
      name: 'Addressing Information Security within Supplier Agreements',
      status,
      description: 'License compliance and intellectual property management of third-party components',
      findings,
      recommendation: status !== 'pass' ? 'Review restrictive licenses for compliance. Identify licenses for unknown packages.' : undefined,
    });
  }

  // SBOM Completeness
  {
    const findings: string[] = [];
    let status: 'pass' | 'warning' | 'fail' = 'pass';

    const knownUnknowns = result.knownUnknowns || [];
    if (knownUnknowns.length > 0) {
      findings.push(`${knownUnknowns.length} components could not be fully analyzed`);
      status = 'warning';
    } else {
      findings.push('All components successfully analyzed');
    }

    const coverage = result.coverage;
    if (coverage) {
      findings.push(`Coverage depth: ${coverage.depth}`);
      if (coverage.depth === 'top-level') {
        findings.push('Only direct dependencies analyzed - transitive dependencies not included');
        status = 'warning';
      }
    }

    controls.push({
      id: 'SBOM-COMPLETE',
      name: 'SBOM Completeness & Coverage',
      status,
      description: 'SBOM must provide comprehensive coverage of all software components (CISA 2025)',
      findings,
      recommendation: status !== 'pass' ? 'Enable transitive dependency analysis for full coverage. Investigate fetch failures.' : undefined,
    });
  }

  const summary = {
    totalControls: controls.length,
    passed: controls.filter(c => c.status === 'pass').length,
    warnings: controls.filter(c => c.status === 'warning').length,
    failed: controls.filter(c => c.status === 'fail').length,
  };

  const overallStatus = summary.failed > 0
    ? 'non_compliant' as const
    : summary.warnings > 0
      ? 'partially_compliant' as const
      : 'compliant' as const;

  return {
    standard: 'ISO/IEC 27001:2022',
    generatedAt: new Date().toISOString(),
    overallStatus,
    controls,
    summary,
  };
}

// P2: Generate SBOM integrity hash
function generateIntegrityHash(result: SBOMResult): string {
  const content = JSON.stringify({
    packages: result.packages,
    generatedAt: result.generatedAt,
    totalDependencies: result.totalDependencies,
  });
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
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

  const isMonorepo = detectMonorepo(rootPackageJson, workspaceYaml);
  const packages: PackageData[] = [];
  const allOutdatedPackages: Record<string, any> = {};
  const knownUnknowns: KnownUnknown[] = [];

  if (isMonorepo) {
    onProgress?.('Analyzing monorepo structure...');

    const packageJsonFiles = findAllPackageJsons(files, rootPackageJson, workspaceYaml);
    onProgress?.(`Found ${packageJsonFiles.length} packages in monorepo`);

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
        knownUnknowns,
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
            knownUnknowns,
            (current, total) => {
              onProgress?.(
                `Analyzing dev dependencies for ${pkgJson.name || pkgFile.path}`,
                current,
                total
              );
            }
          )
        : { dependencies: [], outdatedPackages: {} };

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
      knownUnknowns,
      (current, total) => {
        onProgress?.('Analyzing production dependencies', current, total);
      }
    );

    const devDepsResult = config.includeDevDeps
      ? await analyzeDependencies(
          rootPackageJson.devDependencies || {},
          config,
          knownUnknowns,
          (current, total) => {
            onProgress?.('Analyzing development dependencies', current, total);
          }
        )
      : { dependencies: [], outdatedPackages: {} };

    Object.assign(allOutdatedPackages, depsResult.outdatedPackages, devDepsResult.outdatedPackages);

    packages.push({
      packageName: rootPackageJson.name,
      dependencies: depsResult.dependencies,
      devDependencies: devDepsResult.dependencies,
    });
  }

  // P0: Coverage declaration
  const coverage: SBOMCoverage = {
    depth: config.includeTransitiveDeps ? 'transitive' : 'top-level',
    analysisTimestamp: new Date().toISOString(),
    toolName: 'billofmaterial',
    toolVersion: TOOL_VERSION,
    coverageNote: config.includeTransitiveDeps
      ? 'Includes direct and first-level transitive dependencies'
      : 'Top-level dependencies only. Enable includeTransitiveDeps for deeper analysis.',
  };

  onProgress?.('Generating insights...');
  const insights = generateInsights(packages, allOutdatedPackages, undefined);

  onProgress?.('Generating reports...');

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
    outdatedPackages: Object.keys(allOutdatedPackages).length > 0 ? allOutdatedPackages : undefined,
    auditData: undefined,
    coverage,
    knownUnknowns: knownUnknowns.length > 0 ? knownUnknowns : undefined,
  };

  // P3: Compliance report
  onProgress?.('Generating ISO 27001 compliance report...');
  result.complianceReport = generateComplianceReport(result);

  // Generate markdown
  result.markdown = generateMarkdown(result);

  // SPDX format (ISO/IEC 5962:2021)
  onProgress?.('Generating SPDX format...');
  result.spdx = generateSPDX(result, rootPackageJson);

  // CycloneDX format (ECMA-424)
  onProgress?.('Generating CycloneDX format...');
  result.cyclonedx = generateCycloneDX(result, rootPackageJson);

  // P2: SBOM integrity hash
  result.integrityHash = generateIntegrityHash(result);

  const duration = Math.round((Date.now() - startTime) / 1000);
  onProgress?.(`Completed in ${duration}s`);

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
    result.complianceReport = generateComplianceReport(result);
    result.markdown = generateMarkdown(result);
  }

  return result;
}
