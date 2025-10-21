export { generateSBOM, generateSBOMWithExtras } from './generator';
export { detectMonorepo, findAllPackageJsons } from './monorepo';
export type {
  SBOMConfig,
  PackageData,
  DependencyInfo,
  SBOMResult,
  GeneratorOptions,
  AuditData,
  Advisory,
  OutdatedPackage,
  DependencyTree,
  SBOMInsights
} from './types';

