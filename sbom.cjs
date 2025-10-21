const fs = require("fs");
const path = require("path");
const jsdom = require("jsdom");
const { exec } = require("child_process");
const { JSDOM } = jsdom;
const crypto = require("crypto");

/**
 * ------------------- CONFIGURATION -------------------
 */

/**
 * Configuration options for SBOM generation
 * @type {object}
 */
const config = {
  packageJsonPath: "./package.json",
  dependencyDocPath: "./SBOM.md",
  exportJsonPath: "./sbom-data.json",
  exportCsvPath: "./sbom-summary.csv",
  includeDevDeps: true,
  includeBundleSize: true,
  securityScoreThreshold: 70,
  cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
  cacheDir: "./.sbom-cache",
  maxConcurrentRequests: 5,
  retryAttempts: 3,
  retryDelay: 1000,
  historicalDir: "./.sbom-history",
  maxHistoricalEntries: 10,
  // Risk scoring weights
  riskWeights: {
    security: 0.4,
    maintenance: 0.3,
    popularity: 0.2,
    license: 0.1,
  },
};

/**
 *  -------------------- START OF THE SCRIPT ----------------------
 * ---------------------- DO NOT EDIT BELOW -----------------------
 * -------------- UNLESS YOU KNOW WHAT YOU ARE DOING -------------
 */

console.log("Initializing enhanced SBOM generator...");

// Ensure cache and history directories exist
[config.cacheDir, config.historicalDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Cache management
 */
class CacheManager {
  constructor(cacheDir, duration) {
    this.cacheDir = cacheDir;
    this.duration = duration;
  }

  getCacheKey(packageName, version) {
    return crypto
      .createHash("md5")
      .update(`${packageName}@${version}`)
      .digest("hex");
  }

  get(packageName, version) {
    const key = this.getCacheKey(packageName, version);
    const cachePath = path.join(this.cacheDir, `${key}.json`);

    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (Date.now() - cache.timestamp < this.duration) {
        return cache.data;
      }
    }
    return null;
  }

  set(packageName, version, data) {
    const key = this.getCacheKey(packageName, version);
    const cachePath = path.join(this.cacheDir, `${key}.json`);

    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
      "utf8"
    );
  }

  clear() {
    if (fs.existsSync(this.cacheDir)) {
      fs.readdirSync(this.cacheDir).forEach((file) => {
        fs.unlinkSync(path.join(this.cacheDir, file));
      });
    }
  }
}

const cache = new CacheManager(config.cacheDir, config.cacheDuration);

/**
 * Rate limiter for API requests
 */
class RateLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  async execute(fn) {
    while (this.current >= this.maxConcurrent) {
      await new Promise((resolve) => this.queue.push(resolve));
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

const rateLimiter = new RateLimiter(config.maxConcurrentRequests);

/**
 * Progress tracker
 */
class ProgressTracker {
  constructor(total, description) {
    this.total = total;
    this.current = 0;
    this.description = description;
    this.startTime = Date.now();
  }

  increment() {
    this.current++;
    const percentage = Math.round((this.current / this.total) * 100);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const rate = this.current / elapsed || 0;
    const remaining = Math.round((this.total - this.current) / rate) || 0;

    console.log(
      `${this.description}: [${this.current}/${this.total}] ${percentage}% | ` +
      `Elapsed: ${elapsed}s | ETA: ${remaining}s`
    );
  }
}

/**
 * Calculate the relative path from dependencyDocPath to packageJsonPath
 * @returns {string} Relative path from dependencyDocPath to packageJsonPath
 */
const calculatedRelativePackageJsonPath = () => {
  const from = path.resolve(process.cwd(), config.dependencyDocPath);
  const to = path.resolve(process.cwd(), config.packageJsonPath);
  return path.relative(path.dirname(from), to);
};

/**
 * exec command with retry logic
 * @param {string} command
 * @returns {Promise<object>}
 */
const execPromise = async (command, retries = config.retryAttempts) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve) => {
        exec(
          command,
          { maxBuffer: 10 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error && !stdout) {
              resolve({ success: false, output: stdout || stderr, stderr });
            } else {
              resolve({ success: true, output: stdout, stderr });
            }
          }
        );
      });
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, config.retryDelay * attempt)
      );
    }
  }
};

/**
 * Load package.json
 */
const packageJson = require(config.packageJsonPath);
const { dependencies, devDependencies } = packageJson;

/**
 * Problematic licenses that might require attention
 */
const problematicLicenses = [
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-3.0",
  "LGPL-2.1",
  "LGPL-3.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-4.0",
];

/**
 * Fetch package data from npm registry with caching
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<object>}
 */
const getNpmData = async (packageName, version) => {
  // Check cache first
  const cached = cache.get(packageName, version);
  if (cached?.npm) return cached.npm;

  const url = `https://registry.npmjs.org/${packageName}`;

  try {
    const response = await rateLimiter.execute(async () => {
      const res = await fetch(url);
      return res.json();
    });

    return response;
  } catch (error) {
    console.error(`Failed to fetch npm data for ${packageName}`);
    return null;
  }
};

/**
 * Fetch package security score from snyk.io
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<number>}
 */
const getNpmSecurityScore = async (packageName, version) => {
  // Check cache first
  const cached = cache.get(packageName, version);
  if (cached?.securityScore !== undefined) return cached.securityScore;

  const url = `https://snyk.io/advisor/npm-package/${packageName}`;

  try {
    const response = await rateLimiter.execute(async () => {
      const res = await fetch(url);
      return res.text();
    });

    const dom = new JSDOM(response);
    const score =
      dom.window.document.querySelector(".number")?.querySelector("span")
        ?.textContent || "N/A";

    return score;
  } catch (error) {
    console.error(`Failed to fetch security score for ${packageName}`);
    return "N/A";
  }
};

/**
 * Fetch bundle size and peer dependencies
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<object>}
 */
const getBundleSizeAndPeerDependencies = async (packageName, version) => {
  // Check cache first
  const cached = cache.get(packageName, version);
  if (cached?.bundleSize) return cached.bundleSize;

  const url = `https://bundlephobia.com/api/size?package=${packageName}@${version}`;

  try {
    const response = await rateLimiter.execute(async () => {
      const res = await fetch(url);
      return res.json();
    });

    return response;
  } catch (error) {
    console.error(`Failed to fetch bundle size for ${packageName}`);
    return null;
  }
};

/**
 * Calculate maintenance score based on last publish date and other factors
 * @param {object} npmData
 * @returns {number}
 */
const calculateMaintenanceScore = (npmData) => {
  if (!npmData) return 0;

  const lastPublish = new Date(npmData.time?.modified || npmData.time?.created);
  const daysSinceUpdate = (Date.now() - lastPublish) / (1000 * 60 * 60 * 24);

  let score = 100;

  // Penalize based on age
  if (daysSinceUpdate > 365) score -= 20;
  else if (daysSinceUpdate > 180) score -= 10;
  else if (daysSinceUpdate > 90) score -= 5;

  // Bonus for frequent updates
  const versions = Object.keys(npmData.versions || {}).length;
  if (versions > 50) score += 10;
  else if (versions > 20) score += 5;

  return Math.max(0, Math.min(100, score));
};

/**
 * Calculate popularity score based on downloads
 * @param {string} packageName
 * @returns {Promise<number>}
 */
const getPopularityScore = async (packageName) => {
  try {
    const url = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
    const response = await rateLimiter.execute(async () => {
      const res = await fetch(url);
      return res.json();
    });

    const downloads = response.downloads || 0;

    // Score based on download ranges
    if (downloads > 1000000) return 100;
    if (downloads > 100000) return 90;
    if (downloads > 10000) return 70;
    if (downloads > 1000) return 50;
    if (downloads > 100) return 30;
    return 10;
  } catch (error) {
    return 0;
  }
};

/**
 * Calculate risk score for a package
 * @param {object} packageData
 * @returns {object}
 */
const calculateRiskScore = (packageData) => {
  const factors = [];
  let totalScore = 0;

  // Security score (0-100, higher is better)
  const securityScore = parseInt(packageData.securityScore) || 0;
  if (securityScore < config.securityScoreThreshold) {
    factors.push(`Low security score: ${securityScore}/100`);
  }
  totalScore += (securityScore / 100) * config.riskWeights.security;

  // Maintenance score
  const maintenanceScore = packageData.maintenanceScore / 100;
  if (packageData.daysSinceUpdate > 365) {
    factors.push(
      `Not updated in ${Math.round(packageData.daysSinceUpdate / 30)} months`
    );
  }
  totalScore += maintenanceScore * config.riskWeights.maintenance;

  // Popularity score
  const popularityScore = packageData.popularityScore / 100;
  if (popularityScore < 0.3) {
    factors.push("Low popularity/downloads");
  }
  totalScore += popularityScore * config.riskWeights.popularity;

  // License score
  let licenseScore = 1;
  if (problematicLicenses.includes(packageData.license)) {
    factors.push(`Restrictive license: ${packageData.license}`);
    licenseScore = 0.5;
  }
  totalScore += licenseScore * config.riskWeights.license;

  // Vulnerabilities
  if (packageData.hasVulnerabilities) {
    factors.push("Has known vulnerabilities");
    totalScore *= 0.5; // Significant penalty
  }

  return {
    score: Math.round(totalScore * 100),
    riskLevel: totalScore > 0.7 ? "Low" : totalScore > 0.4 ? "Medium" : "High",
    factors,
  };
};

/**
 * Analyze dependency tree
 * @param {object} deps
 * @returns {Promise<object>}
 */
const analyzeDependencyTree = async (deps) => {
  const analysis = {
    totalDependencies: 0,
    uniqueDependencies: new Set(),
    maxDepth: 0,
    duplicates: {},
    circularDependencies: [],
  };

  const visited = new Set();
  const visiting = new Set();

  const analyzeDep = async (packageName, depth = 0, path = []) => {
    if (visiting.has(packageName)) {
      analysis.circularDependencies.push([...path, packageName]);
      return;
    }

    if (visited.has(packageName)) {
      return;
    }

    visiting.add(packageName);
    path.push(packageName);

    analysis.totalDependencies++;
    analysis.uniqueDependencies.add(packageName);
    analysis.maxDepth = Math.max(analysis.maxDepth, depth);

    // Get sub-dependencies
    const npmData = await getNpmData(packageName, "latest");
    if (npmData?.versions) {
      const latestVersion = npmData["dist-tags"]?.latest;
      const versionData = npmData.versions[latestVersion];
      const subDeps = versionData?.dependencies || {};

      for (const [subDep, version] of Object.entries(subDeps)) {
        await analyzeDep(subDep, depth + 1, [...path]);
      }
    }

    path.pop();
    visiting.delete(packageName);
    visited.add(packageName);
  };

  // Analyze each direct dependency
  for (const dep of Object.keys(deps)) {
    await analyzeDep(dep);
  }

  return analysis;
};

/**
 * Generate dependency list with enhanced data
 * @param {object} deps
 * @param {string} type
 * @returns {Promise<Array>}
 */
const generateDependencyList = async (deps, type = "production") => {
  const list = [];
  const convertToKb = (bytes) => Math.round(bytes / 1024);

  const progress = new ProgressTracker(
    Object.keys(deps).length,
    `Analyzing ${type} dependencies`
  );

  const depsPromises = Object.entries(deps).map(async ([name, version]) => {
    try {
      // Fetch all data in parallel for this package
      const [npmData, securityScore, bundleSize, popularityScore] =
        await Promise.all([
          getNpmData(name, version),
          getNpmSecurityScore(name, version),
          getBundleSizeAndPeerDependencies(name, version),
          getPopularityScore(name),
        ]);

      const lastPublish = npmData?.time?.modified || npmData?.time?.created;
      const daysSinceUpdate = lastPublish
        ? (Date.now() - new Date(lastPublish)) / (1000 * 60 * 60 * 24)
        : Infinity;

      const maintenanceScore = calculateMaintenanceScore(npmData);
      const weeklyDownloads = npmData?.downloads?.weekly || 0;
      const license = npmData?.license || "Unknown";
      const homepage = npmData?.homepage || npmData?.repository?.url || "";

      const packageData = {
        name,
        description: npmData?.description || "N/A",
        version,
        license,
        licenseProblematic: problematicLicenses.includes(license),
        homepage,
        securityScore,
        maintenanceScore,
        popularityScore,
        daysSinceUpdate: Math.round(daysSinceUpdate),
        lastPublishDate: lastPublish
          ? new Date(lastPublish).toLocaleDateString()
          : "Unknown",
        weeklyDownloads,
        minifiedSize: convertToKb(
          bundleSize?.size && !name.startsWith("@types") ? bundleSize.size : 0
        ),
        gzipSize: convertToKb(
          bundleSize?.gzip && !name.startsWith("@types") ? bundleSize.gzip : 0
        ),
        hasVulnerabilities: false, // Will be updated from audit data
        dependencyCount: Object.keys(
          npmData?.versions?.[version]?.dependencies || {}
        ).length,
        peerDependencies: npmData?.versions?.[version]?.peerDependencies || {},
      };

      // Cache the combined data
      cache.set(name, version, {
        npm: npmData,
        securityScore,
        bundleSize,
        popularityScore,
        ...packageData,
      });

      packageData.risk = calculateRiskScore(packageData);

      progress.increment();
      return packageData;
    } catch (error) {
      console.error(`Error processing ${name}:`, error);
      progress.increment();
      return {
        name,
        version,
        description: "Error fetching data",
        error: true,
      };
    }
  });

  const results = await Promise.all(depsPromises);
  list.push(...results.filter((r) => !r.error));

  // Sort by risk score (highest risk first)
  list.sort((a, b) => (a.risk?.score || 100) - (b.risk?.score || 100));

  return list;
};

/**
 * Generate audit data
 * @returns {Promise<object>}
 */
const getAuditData = async () => {
  console.log("Running security audit...");
  const { success, output } = await execPromise("pnpm audit --json");
  if (success || output) {
    try {
      return JSON.parse(output);
    } catch (e) {
      console.error("Failed to parse audit data");
      return null;
    }
  }
  return null;
};

/**
 * Generate outdated data
 * @returns {Promise<object>}
 */
const getOutdatedData = async () => {
  console.log("Checking for outdated packages...");
  const { success, output } = await execPromise("pnpm outdated --json");
  if (success || output) {
    try {
      return JSON.parse(output);
    } catch (e) {
      console.error("Failed to parse outdated data");
      return null;
    }
  }
  return null;
};

/**
 * Generate actionable insights
 * @param {object} data
 * @returns {object}
 */
const generateInsights = (data) => {
  const insights = {
    topRisks: [],
    heaviestDependencies: [],
    quickWins: [],
    licenseIssues: [],
    abandonedPackages: [],
    totalBundleSize: 0,
    metrics: {},
  };

  // Combine all dependencies
  const allDeps = [...data.dependencies, ...data.devDependencies];

  // Top risks
  insights.topRisks = allDeps
    .filter((d) => d.risk?.riskLevel === "High")
    .slice(0, 5)
    .map((d) => ({
      name: d.name,
      score: d.risk.score,
      factors: d.risk.factors,
    }));

  // Heaviest dependencies
  insights.heaviestDependencies = [...allDeps]
    .sort((a, b) => b.minifiedSize - a.minifiedSize)
    .slice(0, 5)
    .map((d) => ({
      name: d.name,
      size: d.minifiedSize,
      gzipSize: d.gzipSize,
    }));

  // Calculate total bundle size
  insights.totalBundleSize = allDeps.reduce(
    (sum, d) => sum + (d.minifiedSize || 0),
    0
  );

  // Quick wins (easy updates with security improvements)
  if (data.outdatedPackages) {
    insights.quickWins = Object.entries(data.outdatedPackages)
      .filter(([name, info]) => {
        const dep = allDeps.find((d) => d.name === name);
        return (
          dep && dep.securityScore !== "N/A" && parseInt(dep.securityScore) < 80
        );
      })
      .slice(0, 5)
      .map(([name, info]) => ({
        name,
        current: info.current,
        latest: info.latest,
        securityScore: allDeps.find((d) => d.name === name).securityScore,
      }));
  }

  // License issues
  insights.licenseIssues = allDeps
    .filter((d) => d.licenseProblematic)
    .map((d) => ({
      name: d.name,
      license: d.license,
    }));

  // Abandoned packages (not updated in over 2 years)
  insights.abandonedPackages = allDeps
    .filter((d) => d.daysSinceUpdate > 730)
    .map((d) => ({
      name: d.name,
      lastUpdate: d.lastPublishDate,
      daysSince: d.daysSinceUpdate,
    }));

  // Overall metrics
  insights.metrics = {
    totalDependencies: allDeps.length,
    productionDependencies: data.dependencies.length,
    devDependencies: data.devDependencies.length,
    averageSecurityScore: Math.round(
      allDeps.reduce((sum, d) => sum + (parseInt(d.securityScore) || 0), 0) /
      allDeps.length
    ),
    vulnerabilities: data.auditSummary,
  };

  return insights;
};

/**
 * Export data to JSON
 * @param {object} data
 */
const exportToJson = (data) => {
  fs.writeFileSync(config.exportJsonPath, JSON.stringify(data, null, 2));
  console.log(`Exported detailed data to ${config.exportJsonPath}`);
};

/**
 * Export summary to CSV
 * @param {object} data
 */
const exportToCsv = (data) => {
  const allDeps = [...data.dependencies, ...data.devDependencies];

  const csv = [
    "Name,Version,Type,License,Security Score,Risk Level,Bundle Size (KB),Last Update,Weekly Downloads",
    ...allDeps.map(
      (d) =>
        `"${d.name}","${d.version}","${data.dependencies.includes(d) ? "production" : "dev"}","${d.license}","${d.securityScore}","${d.risk?.riskLevel || "N/A"}","${d.minifiedSize}","${d.lastPublishDate}","${d.weeklyDownloads}"`
    ),
  ].join("\n");

  fs.writeFileSync(config.exportCsvPath, csv);
  console.log(`Exported summary to ${config.exportCsvPath}`);
};

/**
 * Save historical data
 * @param {object} data
 */
const saveHistoricalData = (data) => {
  const timestamp = new Date().toISOString().split("T")[0];
  const historyPath = path.join(config.historicalDir, `sbom-${timestamp}.json`);

  fs.writeFileSync(
    historyPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        data,
      },
      null,
      2
    )
  );

  // Clean up old historical entries
  const files = fs
    .readdirSync(config.historicalDir)
    .filter((f) => f.startsWith("sbom-"))
    .sort()
    .reverse();

  if (files.length > config.maxHistoricalEntries) {
    files.slice(config.maxHistoricalEntries).forEach((f) => {
      fs.unlinkSync(path.join(config.historicalDir, f));
    });
  }

  console.log(`Saved historical data to ${historyPath}`);
};

/**
 * Generate dependency documentation
 * @returns {Promise<void>}
 */
const generateDependencyDoc = async () => {
  const startTime = Date.now();

  try {
    // Analyze dependencies in parallel
    const [dependencyData, devDependencyData] = await Promise.all([
      generateDependencyList(dependencies, "production"),
      config.includeDevDeps
        ? generateDependencyList(devDependencies, "dev")
        : [],
    ]);

    // Get audit and outdated data
    const [auditData, outdatedData] = await Promise.all([
      getAuditData(),
      getOutdatedData(),
    ]);

    // Analyze dependency tree (sample on production deps only for performance)
    console.log("Analyzing dependency tree...");
    const treeAnalysis = await analyzeDependencyTree(
      Object.fromEntries(Object.entries(dependencies).slice(0, 10)) // Sample for performance
    );

    // Mark packages with vulnerabilities
    if (auditData?.advisories) {
      Object.values(auditData.advisories).forEach((advisory) => {
        const dep = [...dependencyData, ...devDependencyData].find(
          (d) => d.name === advisory.module_name
        );
        if (dep) {
          dep.hasVulnerabilities = true;
          dep.risk = calculateRiskScore(dep); // Recalculate risk
        }
      });
    }

    // Prepare data object
    const fullData = {
      dependencies: dependencyData,
      devDependencies: devDependencyData,
      auditData,
      auditSummary: auditData?.metadata?.vulnerabilities || {},
      outdatedPackages: outdatedData,
      treeAnalysis,
      generatedAt: new Date().toISOString(),
      generationTime: Math.round((Date.now() - startTime) / 1000),
    };

    // Generate insights
    const insights = generateInsights(fullData);

    // Export data
    exportToJson({ ...fullData, insights });
    exportToCsv(fullData);
    saveHistoricalData(fullData);

    // Generate markdown documentation
    generateMarkdownDoc(fullData, insights);

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✅ SBOM generation completed in ${totalTime} seconds!`);
    console.log(
      `📊 Generated: ${config.dependencyDocPath}, ${config.exportJsonPath}, ${config.exportCsvPath}`
    );
  } catch (error) {
    console.error("Error generating SBOM:", error);
    throw error;
  }
};

/**
 * Generate markdown documentation
 * @param {object} data
 * @param {object} insights
 */
const generateMarkdownDoc = (data, insights) => {
  const lastUpdated = () => {
    const date = new Date();
    return `${date.toLocaleDateString()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  const shieldIOBadge = (severity) => {
    const colors = {
      info: "blue",
      low: "lightblue",
      moderate: "yellow",
      high: "orange",
      critical: "red",
    };
    return `![${severity}](https://img.shields.io/badge/-${severity}-${colors[severity] || "green"})`;
  };

  // Generate risk badge
  const riskBadge = (riskLevel) => {
    const colors = { Low: "green", Medium: "yellow", High: "red" };
    return `![Risk: ${riskLevel}](https://img.shields.io/badge/Risk-${riskLevel}-${colors[riskLevel]})`;
  };

  // Format dependency table
  const formatDependencyTable = (deps) => {
    if (deps.length === 0) return "No dependencies found.";

    return deps
      .map((d) => {
        const riskBadgeStr = d.risk ? riskBadge(d.risk.riskLevel) : "";
        const licenseBadge = d.licenseProblematic
          ? `⚠️ ${d.license}`
          : d.license;

        return `| [${d.name}](https://www.npmjs.com/package/${d.name}) | ${d.version} | ${d.description} | ${licenseBadge} | [${d.securityScore}](https://snyk.io/advisor/npm-package/${d.name}) | ${riskBadgeStr} | [${d.minifiedSize} KB](https://bundlephobia.com/package/${d.name}@${d.version}) | ${d.lastPublishDate} |`;
      })
      .join("\n");
  };

  // Format vulnerabilities
  let vulnerabilityList = "No vulnerabilities found.\n";
  if (
    data.auditData?.advisories &&
    Object.keys(data.auditData.advisories).length > 0
  ) {
    const vulnerabilitycount = Object.keys(data.auditData.advisories).length;
    vulnerabilityList = Object.entries(data.auditData.advisories)
      .map(([_, vulnerability], index, array) => {
        const CWEList = vulnerability.cwe
          ? vulnerability.cwe.map((cwe) => {
            const cweID = cwe.split("-")[1];
            return `[${cwe}](https://cwe.mitre.org/data/definitions/${cweID}.html)`;
          })
          : ["N/A"];

        return `#### [${vulnerability.module_name}](https://www.npmjs.com/package/${vulnerability.module_name})

${shieldIOBadge(vulnerability.severity)}

${vulnerability.title ? `##### ${vulnerability.title}` : "No Description Available"}

${vulnerability.overview ? vulnerability.overview.replace(/###/g, "#####") : "No Description Available"}

| Range | Patched Version | CWE | Recommendation | Advisory |
| ----- | ----------------| --- | -------------- | -------- |
| ${vulnerability.vulnerable_versions} | ${vulnerability.patched_versions || "N/A"} | ${CWEList.join(", ")} | ${vulnerability.recommendation} | ${vulnerability.url ? `[See Advisory](${vulnerability.url})` : "N/A"} |
${vulnerabilitycount > 1 && index < array.length - 1 ? "\n---\n" : ""}`;
      })
      .join("\n");
  }

  // Format outdated packages
  let outdatedList = "No outdated packages found.\n";
  if (data.outdatedPackages && Object.keys(data.outdatedPackages).length > 0) {
    const outdatedCount = Object.keys(data.outdatedPackages).length;
    outdatedList = Object.entries(data.outdatedPackages)
      .map(([name, details], index, array) => {
        return `#### [${name}](https://www.npmjs.com/package/${name})

| Current | Wanted | Latest |
| ------- | ------ | ------ |
| ${details.current} | ${details.wanted} | ${details.latest} |
${outdatedCount > 1 && index < array.length - 1 ? "\n---\n" : ""}`;
      })
      .join("\n");
  }

  // Format insights section
  const formatInsights = () => {
    let insightsText = "";

    // Top risks
    if (insights.topRisks.length > 0) {
      insightsText += `### 🚨 Top Security Risks\n\n`;
      insightsText += `| Package | Risk Score | Factors |\n`;
      insightsText += `| ------- | --------- | ------- |\n`;
      insights.topRisks.forEach((risk) => {
        insightsText += `| ${risk.name} | ${risk.score}/100 | ${risk.factors.map((f) => `- ${f}`).join("\n")} |\n`;
      });
      insightsText += `\n`;
    }

    // Heaviest dependencies
    if (insights.heaviestDependencies.length > 0) {
      insightsText += `### 📦 Largest Dependencies\n\n`;
      insightsText += `| Package | Size | Gzipped |\n`;
      insightsText += `| ------- | ---- | ------- |\n`;
      insights.heaviestDependencies.forEach((dep) => {
        insightsText += `| ${dep.name} | ${dep.size} KB | ${dep.gzipSize} KB |\n`;
      });
      insightsText += `\n**Total Bundle Size:** ${Math.round(insights.totalBundleSize / 1024)} MB\n\n`;
    }

    // Quick wins
    if (insights.quickWins.length > 0) {
      insightsText += `### ✅ Quick Wins (Easy Updates)\n\n`;
      insightsText += `| Package | Current | Latest | Security Score |\n`;
      insightsText += `| ------- | ------- | ------ | -------------- |\n`;
      insights.quickWins.forEach((win) => {
        insightsText += `| ${win.name} | ${win.current} | ${win.latest} | ${win.securityScore} |\n`;
      });
      insightsText += "\n";
    }

    // License issues
    if (insights.licenseIssues.length > 0) {
      insightsText += `### ⚖️ License Concerns\n\n`;
      insightsText += `The following packages use licenses that may require special attention:\n\n`;
      insights.licenseIssues.forEach((issue) => {
        insightsText += `- **${issue.name}**: ${issue.license}\n`;
      });
      insightsText += "\n";
    }

    // Abandoned packages
    if (insights.abandonedPackages.length > 0) {
      insightsText += `### 🏚️ Potentially Abandoned Packages\n\n`;
      insightsText += `These packages haven't been updated in over 2 years:\n\n`;
      insights.abandonedPackages.forEach((pkg) => {
        insightsText += `- **${pkg.name}**: Last updated ${pkg.lastUpdate} (${pkg.daysSince} days ago)\n`;
      });
      insightsText += "\n";
    }

    return insightsText;
  };

  const dependencyDoc = `# Application Software Bill of Materials (SBOM)

Last updated: ${lastUpdated()} | Generated in: ${data.generationTime}s

This document provides a comprehensive analysis of all dependencies with security scores, bundle sizes, licenses, and risk assessments.

> 🤖 This documentation is auto-generated. Do not edit directly.

## 📊 Executive Summary

- **Total Dependencies:** ${insights.metrics.totalDependencies} (${insights.metrics.productionDependencies} production, ${insights.metrics.devDependencies} dev)
- **Average Security Score:** ${insights.metrics.averageSecurityScore}/100
- **Total Bundle Size:** ${Math.round(insights.totalBundleSize / 1024)} MB
- **High Risk Packages:** ${insights.topRisks.length}
- **License Issues:** ${insights.licenseIssues.length}
- **Outdated Packages:** ${Object.keys(data.outdatedPackages || {}).length}

## Table of Contents

- [Executive Summary](#-executive-summary)
- [Key Insights & Actions](#-key-insights--actions)
- [Dependencies](#dependencies)
  - [Production Dependencies](#production-dependencies)
  - [Development Dependencies](#development-dependencies)
- [Security Audit](#security-audit)
- [Outdated Packages](#outdated-packages)
- [Dependency Tree Analysis](#dependency-tree-analysis)
- [Data Exports](#data-exports)

## 🎯 Key Insights & Actions

${formatInsights()}

## Dependencies

### Production Dependencies

| Name | Version | Description | License | Security | Risk | Size | Last Update |
| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ----------- |
${formatDependencyTable(data.dependencies)}

### Development Dependencies

| Name | Version | Description | License | Security | Risk | Size | Last Update |
| ---- | ------- | ----------- | ------- | -------- | ---- | ---- | ----------- |
${formatDependencyTable(data.devDependencies)}

## Security Audit

### Summary

| Severity  | Count |
| --------- | ----- |
| Info      | ${data.auditSummary.info || 0} |
| Low       | ${data.auditSummary.low || 0} |
| Moderate  | ${data.auditSummary.moderate || 0} |
| High      | ${data.auditSummary.high || 0} |
| Critical  | ${data.auditSummary.critical || 0} |

### Vulnerabilities

${vulnerabilityList}

## Outdated Packages

${outdatedList}

## Dependency Tree Analysis

- **Unique Dependencies:** ${data.treeAnalysis.uniqueDependencies.size}
- **Max Dependency Depth:** ${data.treeAnalysis.maxDepth}
- **Circular Dependencies:** ${data.treeAnalysis.circularDependencies.length}

## Data Exports

Additional data has been exported to:
- 📄 **JSON:** \`${config.exportJsonPath}\` - Complete data with all metrics
- 📊 **CSV:** \`${config.exportCsvPath}\` - Summary for spreadsheet analysis
- 📁 **History:** \`${config.historicalDir}/\` - Historical snapshots for trend analysis

---

*Generated by [Enhanced SBOM Generator](${calculatedRelativePackageJsonPath()}) | [Configure](${config.packageJsonPath})*`;

  fs.writeFileSync(config.dependencyDocPath, dependencyDoc);
  console.log(
    `Generated enhanced SBOM documentation at ${config.dependencyDocPath}`
  );
};

// Run the generator
generateDependencyDoc().catch((error) => {
  console.error("Failed to generate SBOM:", error);
  process.exit(1);
});
