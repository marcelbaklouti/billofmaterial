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
  includeVulnerabilities?: boolean;
  includeTransitiveDeps?: boolean;
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
  // P0: Cryptographic hashes (CISA 2025 mandatory)
  integrity?: string;         // SHA-512 integrity hash from npm
  shasum?: string;            // SHA-1 hash from npm
  // P0: Supplier/Producer (CISA 2025 mandatory)
  supplier?: SupplierInfo;
  // P1: Vulnerability data (ISO 27001 A.8.28)
  vulnerabilities?: VulnerabilityInfo[];
  // P1: Deprecated/EOL status
  deprecated?: string | false;
  // P2: Transitive dependencies
  transitiveDependencies?: string[];
}

export interface SupplierInfo {
  name: string;
  email?: string;
  url?: string;
}

export interface VulnerabilityInfo {
  id: string;               // e.g. "GHSA-xxxx" or "CVE-xxxx"
  aliases?: string[];        // e.g. ["CVE-2021-xxxx"]
  summary: string;
  severity: VulnSeverity;
  cvssScore?: number;
  cweIds?: string[];
  fixedIn?: string;          // version where fixed
  url?: string;
  // P2: VEX status
  vexStatus?: VEXStatus;
  vexJustification?: string;
}

export type VulnSeverity = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type VEXStatus = 'not_affected' | 'affected' | 'fixed' | 'under_investigation';

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

// P0: Known Unknowns tracking (CISA 2025 mandatory)
export interface KnownUnknown {
  name: string;
  version: string;
  reason: string;
  category: 'unknown' | 'redacted' | 'not_applicable' | 'fetch_failed';
}

// P0: SBOM Coverage declaration (CISA 2025 mandatory)
export interface SBOMCoverage {
  depth: 'top-level' | 'transitive' | 'full';
  coverageNote?: string;
  analysisTimestamp: string;
  toolName: string;
  toolVersion: string;
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
  cyclonedx?: CycloneDXDocument;
  // P0: Coverage declaration
  coverage?: SBOMCoverage;
  // P0: Known unknowns
  knownUnknowns?: KnownUnknown[];
  // P2: SBOM integrity
  integrityHash?: string;
  // P3: ISO 27001 compliance
  complianceReport?: ComplianceReport;
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
  deprecatedPackages: Array<{
    name: string;
    version: string;
    reason: string;
  }>;
  vulnerabilitySummary: {
    total: number;
    critical: number;
    high: number;
    moderate: number;
    low: number;
    packagesAffected: number;
  };
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

// CycloneDX 1.5 Types (ECMA-424)
export interface CycloneDXDocument {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  serialNumber: string;
  version: number;
  metadata: CycloneDXMetadata;
  components: CycloneDXComponent[];
  dependencies: CycloneDXDependency[];
  vulnerabilities?: CycloneDXVulnerability[];
}

export interface CycloneDXMetadata {
  timestamp: string;
  tools: Array<{
    vendor: string;
    name: string;
    version: string;
  }>;
  component?: {
    type: string;
    name: string;
    version: string;
    'bom-ref': string;
  };
  lifecycles?: Array<{
    phase: string;
  }>;
}

export interface CycloneDXComponent {
  type: 'library' | 'framework' | 'application';
  name: string;
  version: string;
  'bom-ref': string;
  purl?: string;
  description?: string;
  licenses?: Array<{
    license: {
      id?: string;
      name?: string;
    };
  }>;
  hashes?: Array<{
    alg: string;
    content: string;
  }>;
  supplier?: {
    name: string;
    url?: string[];
  };
  externalReferences?: Array<{
    type: string;
    url: string;
  }>;
  properties?: Array<{
    name: string;
    value: string;
  }>;
}

export interface CycloneDXDependency {
  ref: string;
  dependsOn?: string[];
}

export interface CycloneDXVulnerability {
  'bom-ref'?: string;
  id: string;
  source?: {
    name: string;
    url?: string;
  };
  ratings?: Array<{
    score?: number;
    severity?: string;
    method?: string;
    vector?: string;
  }>;
  cwes?: number[];
  description?: string;
  recommendation?: string;
  advisories?: Array<{
    url: string;
  }>;
  affects?: Array<{
    ref: string;
    versions?: Array<{
      version: string;
      status: string;
    }>;
  }>;
  analysis?: {
    state: VEXStatus;
    justification?: string;
    detail?: string;
  };
}

// P3: ISO 27001 Compliance Report
export interface ComplianceReport {
  standard: string;
  generatedAt: string;
  overallStatus: 'compliant' | 'partially_compliant' | 'non_compliant';
  controls: ComplianceControl[];
  summary: {
    totalControls: number;
    passed: number;
    warnings: number;
    failed: number;
  };
}

export interface ComplianceControl {
  id: string;
  name: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  findings: string[];
  recommendation?: string;
}
