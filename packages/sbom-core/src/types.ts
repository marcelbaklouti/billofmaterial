export interface SBOMConfig {
  includeDevDeps?: boolean;
  includeBundleSize?: boolean;
  securityScoreThreshold?: number;
  maxConcurrentRequests?: number;
  retryAttempts?: number;
  retryDelay?: number;
  includeAudit?: boolean;
  includeOutdated?: boolean;
  includeDependencyTree?: boolean;
  exportCsv?: boolean;
  exportJson?: boolean;
  cacheEnabled?: boolean;
  cacheDuration?: number;
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  [key: string]: any;
}

export interface DependencyInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  licenseProblematic: boolean;
  homepage: string;
  securityScore: string | number;
  maintenanceScore: number;
  popularityScore: number;
  daysSinceUpdate: number;
  lastPublishDate: string;
  weeklyDownloads: number;
  minifiedSize: number;
  gzipSize: number;
  hasVulnerabilities: boolean;
  dependencyCount: number;
  peerDependencies: Record<string, string>;
  risk?: RiskAssessment;
}

export interface RiskAssessment {
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  factors: string[];
}

export interface PackageData {
  packageName?: string;
  packagePath?: string;
  dependencies: DependencyInfo[];
  devDependencies: DependencyInfo[];
}

export interface SBOMResult {
  isMonorepo: boolean;
  packages: PackageData[];
  totalDependencies: number;
  markdown: string;
  generatedAt: string;
  insights?: SBOMInsights;
  auditData?: AuditData;
  outdatedPackages?: Record<string, OutdatedPackage>;
  dependencyTree?: DependencyTree;
  csv?: string;
  json?: string;
  spdx?: SPDXDocument;
}

export interface AuditData {
  advisories: Record<string, Advisory>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
  };
}

export interface Advisory {
  id: number;
  title: string;
  module_name: string;
  vulnerable_versions: string;
  patched_versions: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  overview: string;
  recommendation: string;
  url: string;
  cwe?: string[];
}

export interface OutdatedPackage {
  current: string;
  wanted: string;
  latest: string;
  location: string;
}

export interface DependencyTree {
  totalDependencies: number;
  uniqueDependencies: Set<string>;
  maxDepth: number;
  circularDependencies: string[][];
}

export interface SBOMInsights {
  topRisks: Array<{
    name: string;
    score: number;
    factors: string[];
  }>;
  heaviestDependencies: Array<{
    name: string;
    size: number;
    gzipSize: number;
  }>;
  quickWins: Array<{
    name: string;
    current: string;
    latest: string;
    securityScore: string | number;
  }>;
  totalBundleSize: number;
  licenseIssues: Array<{
    name: string;
    license: string;
  }>;
  abandonedPackages: Array<{
    name: string;
    lastUpdate: string;
    daysSince: number;
  }>;
  metrics: {
    totalDependencies: number;
    productionDependencies: number;
    devDependencies: number;
    averageSecurityScore: number;
    vulnerabilities?: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
  };
}

export interface GeneratorOptions {
  packageJsonContent?: string | PackageJson;
  packageJsonPath?: string;
  files?: Array<{ path: string; content: string }>;
  config?: SBOMConfig;
}

// SPDX 2.3 Types (ISO/IEC 5962:2021)
export interface SPDXDocument {
  spdxVersion: string;
  dataLicense: string;
  SPDXID: string;
  name: string;
  documentNamespace: string;
  creationInfo: SPDXCreationInfo;
  packages: SPDXPackage[];
  relationships: SPDXRelationship[];
}

export interface SPDXCreationInfo {
  created: string;
  creators: string[];
  licenseListVersion?: string;
}

export interface SPDXPackage {
  SPDXID: string;
  name: string;
  versionInfo: string;
  downloadLocation: string;
  filesAnalyzed: boolean;
  supplier?: string;
  homepage?: string;
  licenseConcluded: string;
  licenseDeclared: string;
  copyrightText: string;
  description?: string;
  externalRefs?: SPDXExternalRef[];
  checksums?: SPDXChecksum[];
}

export interface SPDXExternalRef {
  referenceCategory: string;
  referenceType: string;
  referenceLocator: string;
}

export interface SPDXChecksum {
  algorithm: string;
  checksumValue: string;
}

export interface SPDXRelationship {
  spdxElementId: string;
  relationshipType: string;
  relatedSpdxElement: string;
}

