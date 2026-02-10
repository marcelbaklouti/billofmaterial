'use client';

import { useState, useCallback, useEffect } from 'react';
import { MDXRemote } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import remarkGfm from 'remark-gfm';
import { Card } from '@workspace/ui/components/card';
import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';
import { Badge } from '@workspace/ui/components/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Download, Copy, CheckCheck, Package, AlertTriangle, Scale, Archive, Eye, Code2, Ghost, FileJson, Shield, ShieldAlert, ShieldCheck, CircleSlash, FileWarning } from 'lucide-react';
import { sanitizeMarkdown, validateMarkdown } from '../lib/markdown-sanitizer';

interface SBOMResultProps {
  result: any;
}

export function SBOMResult({ result }: SBOMResultProps) {
  const [copied, setCopied] = useState(false);
  const [mdxSource, setMdxSource] = useState<any>(null);

  // Serialize markdown to MDX on component mount
  useEffect(() => {
    if (result.markdown) {
      // Validate and sanitize the markdown content
      const validation = validateMarkdown(result.markdown);
      const cleanMarkdown = sanitizeMarkdown(result.markdown);

      console.log('Markdown validation:', validation);

      serialize(cleanMarkdown, {
        mdxOptions: {
          development: false,
          remarkPlugins: [remarkGfm],
        }
      })
        .then(setMdxSource)
        .catch((error) => {
          console.error('Failed to serialize markdown to MDX:', error);
          console.error('Validation errors:', validation.errors);
          // Set a fallback MDX source with error message
          setMdxSource({
            compiledSource: `export default function MDXContent() { return <div className="p-4 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-800">Error rendering markdown: ${error.message}</p><details className="mt-2"><summary className="cursor-pointer text-sm">Show validation errors</summary><ul className="mt-2 text-sm">${validation.errors.map(err => '<li>' + err + '</li>').join('')}</ul></details><details className="mt-2"><summary className="cursor-pointer text-sm">Show raw markdown</summary><pre className="mt-2 p-2 bg-gray-100 text-xs overflow-auto max-h-40">${result.markdown.substring(0, 1000)}${result.markdown.length > 1000 ? '...' : ''}</pre></details></div>; }`,
            scope: {},
          });
        });
    }
  }, [result.markdown]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result.markdown]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SBOM.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result.markdown]);

  const handleDownloadSPDX = useCallback(() => {
    if (result.spdx) {
      const spdxJson = JSON.stringify(result.spdx, null, 2);
      const blob = new Blob([spdxJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sbom-spdx.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [result.spdx]);

  const handleCopySPDX = useCallback(() => {
    if (result.spdx) {
      navigator.clipboard.writeText(JSON.stringify(result.spdx, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result.spdx]);

  const handleDownloadCycloneDX = useCallback(() => {
    if (result.cyclonedx) {
      const cdxJson = JSON.stringify(result.cyclonedx, null, 2);
      const blob = new Blob([cdxJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sbom-cyclonedx.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [result.cyclonedx]);

  const handleCopyCycloneDX = useCallback(() => {
    if (result.cyclonedx) {
      navigator.clipboard.writeText(JSON.stringify(result.cyclonedx, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result.cyclonedx]);

  const insights = result.insights;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {insights && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Dependencies</p>
                <p className="text-2xl font-bold">{insights.metrics.totalDependencies}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {insights.metrics.productionDependencies} prod • {insights.metrics.devDependencies} dev
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Security Score</p>
                <p className="text-2xl font-bold">{insights.metrics.averageSecurityScore}/100</p>
                {insights.quickWins && insights.quickWins.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {insights.quickWins.length} quick wins
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">High Risk</p>
                <p className="text-2xl font-bold">{insights.topRisks.length}</p>
                {insights.licenseIssues.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {insights.licenseIssues.length} license issues
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Outdated</p>
                <p className="text-2xl font-bold">
                  {result.outdatedPackages ? Object.keys(result.outdatedPackages).length : 0}
                </p>
                {result.outdatedPackages && Object.keys(result.outdatedPackages).length > 0 && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                    updates available
                  </p>
                )}
              </div>
            </div>
          </Card>

          {insights.vulnerabilitySummary && insights.vulnerabilitySummary.total > 0 && (
            <Card className="p-5 hover:shadow-md transition-shadow border-red-500/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/10 rounded-lg">
                  <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Vulnerabilities</p>
                  <p className="text-2xl font-bold">{insights.vulnerabilitySummary.total}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {insights.vulnerabilitySummary.critical > 0 && <span className="text-red-600 dark:text-red-400">{insights.vulnerabilitySummary.critical} critical </span>}
                    {insights.vulnerabilitySummary.high > 0 && <span className="text-orange-600 dark:text-orange-400">{insights.vulnerabilitySummary.high} high</span>}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Risks */}
          {insights.topRisks.length > 0 && (
            <Card className="p-6 border-destructive/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                Top Security Risks ({insights.topRisks.length})
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {insights.topRisks.map((risk: any) => (
                  <div key={risk.name} className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm truncate flex-1 mr-2">{risk.name}</span>
                      <Badge variant="destructive">{risk.score}/100</Badge>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {risk.factors.map((factor: string, i: number) => (
                        <li key={i}>• {factor}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Quick Wins */}
          {insights.quickWins && insights.quickWins.length > 0 && (
            <Card className="p-6 border-green-500/20 bg-green-500/5">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                Quick Wins ({insights.quickWins.length})
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Easy updates that improve security
              </p>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {insights.quickWins.map((win: any) => (
                  <div key={win.name} className="p-3 bg-background rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm truncate flex-1 mr-2">{win.name}</span>
                      <Badge variant="secondary">{win.securityScore}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{win.current}</span>
                      <span>→</span>
                      <span className="text-green-600 dark:text-green-400 font-medium">{win.latest}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Heaviest Dependencies */}
          {insights.heaviestDependencies.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Archive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Largest Dependencies ({insights.heaviestDependencies.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {insights.heaviestDependencies.map((dep: any) => (
                  <div key={dep.name} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{dep.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary">{dep.size} KB</Badge>
                      <span className="text-xs text-muted-foreground">({dep.gzipSize} KB gz)</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Outdated Packages */}
          {result.outdatedPackages && Object.keys(result.outdatedPackages).length > 0 && (
            <Card className="p-6 border-orange-500/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                Outdated Packages ({Object.keys(result.outdatedPackages).length})
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Packages with newer versions available
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {Object.entries(result.outdatedPackages).map(([name, info]: [string, any]) => (
                  <div key={name} className="p-2 bg-orange-500/5 border border-orange-500/20 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate flex-1 mr-2">{name}</span>
                      <Badge variant="outline" className="border-orange-500/50 shrink-0">{info.latest}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Current: {info.current}</span>
                      <span>→</span>
                      <span className="text-orange-600 dark:text-orange-400">Latest: {info.latest}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* License Issues */}
          {insights.licenseIssues.length > 0 && (
            <Card className="p-6 border-yellow-500/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Scale className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                License Concerns ({insights.licenseIssues.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {insights.licenseIssues.map((issue: any) => (
                  <div key={issue.name} className="flex items-center justify-between p-2 bg-yellow-500/5 border border-yellow-500/20 rounded">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{issue.name}</span>
                    <Badge variant="outline" className="border-yellow-500/50 shrink-0">{issue.license}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Abandoned Packages */}
          {insights.abandonedPackages.length > 0 && (
            <Card className="p-6 border-purple-500/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Ghost className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Potentially Abandoned ({insights.abandonedPackages.length})
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Not updated in over 2 years
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {insights.abandonedPackages.map((pkg: any) => (
                  <div key={pkg.name} className="p-2 bg-purple-500/5 border border-purple-500/20 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate flex-1 mr-2">{pkg.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{Math.round(pkg.daysSince / 365)} years</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last update: {pkg.lastUpdate}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Deprecated Packages */}
          {insights.deprecatedPackages && insights.deprecatedPackages.length > 0 && (
            <Card className="p-6 border-red-500/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CircleSlash className="w-5 h-5 text-red-600 dark:text-red-400" />
                Deprecated ({insights.deprecatedPackages.length})
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Packages marked as deprecated by maintainers
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {insights.deprecatedPackages.map((pkg: any) => (
                  <div key={pkg.name} className="p-2 bg-red-500/5 border border-red-500/20 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate flex-1 mr-2">{pkg.name}</span>
                    </div>
                    {pkg.reason && (
                      <p className="text-xs text-muted-foreground">{pkg.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Compliance Report */}
      {result.complianceReport && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ISO 27001 Compliance Report
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <Badge variant={result.complianceReport.overallStatus === 'compliant' ? 'default' : result.complianceReport.overallStatus === 'partially_compliant' ? 'secondary' : 'destructive'}>
              {result.complianceReport.overallStatus === 'compliant' ? 'Compliant' : result.complianceReport.overallStatus === 'partially_compliant' ? 'Partially Compliant' : 'Non-Compliant'}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Generated: {new Date(result.complianceReport.timestamp).toLocaleDateString()}
            </span>
          </div>
          <div className="space-y-3">
            {result.complianceReport.controls.map((control: any) => (
              <div key={control.id} className={`p-4 rounded-lg border ${
                control.status === 'pass' ? 'border-green-500/20 bg-green-500/5' :
                control.status === 'warning' ? 'border-yellow-500/20 bg-yellow-500/5' :
                'border-red-500/20 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {control.status === 'pass' ? (
                      <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    ) : control.status === 'warning' ? (
                      <FileWarning className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className="font-medium text-sm">{control.id}: {control.name}</span>
                  </div>
                  <Badge variant={control.status === 'pass' ? 'default' : control.status === 'warning' ? 'secondary' : 'destructive'}>
                    {control.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{control.description}</p>
                <ul className="text-xs space-y-1">
                  {control.findings.map((finding: string, i: number) => (
                    <li key={i} className="text-muted-foreground">- {finding}</li>
                  ))}
                </ul>
                {control.recommendation && (
                  <p className="text-xs mt-2 text-yellow-700 dark:text-yellow-300">
                    Recommendation: {control.recommendation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Project Type Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={result.isMonorepo ? 'default' : 'secondary'}>
          {result.isMonorepo ? 'Monorepo' : 'Single Package'}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {result.packages.length} package{result.packages.length !== 1 ? 's' : ''} analyzed
        </span>
      </div>

      {/* Markdown Preview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Generated SBOM</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={copied}
            >
              {copied ? (
                <>
                  <CheckCheck className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </Button>
            <Button variant="default" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>

        <Tabs defaultValue="preview" className="w-full">
          <div className="flex justify-start">
            <TabsList>
              <TabsTrigger value="preview" className="gap-2 cursor-pointer">
                <Eye className="w-4 h-4" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="raw" className="gap-2 cursor-pointer">
                <Code2 className="w-4 h-4" />
                Raw Markdown
              </TabsTrigger>
              <TabsTrigger value="spdx" className="gap-2 cursor-pointer">
                <FileJson className="w-4 h-4" />
                SPDX 2.3
              </TabsTrigger>
              <TabsTrigger value="cyclonedx" className="gap-2 cursor-pointer" disabled={!result.cyclonedx}>
                <Shield className="w-4 h-4" />
                CycloneDX 1.5
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="preview" className="mt-4">
            <div className="markdown-preview min-h-[300px] max-h-[500px] overflow-y-auto p-6 bg-muted/30 rounded-lg border">
              {mdxSource ? (
                <MDXRemote {...mdxSource} />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Loading preview...</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <style jsx global>{`
            .markdown-preview {
              color: hsl(var(--foreground));
              font-size: 14px;
              line-height: 1.7;
            }
            
            .markdown-preview h1 {
              font-size: 2em;
              font-weight: 700;
              margin-top: 0;
              margin-bottom: 1rem;
              padding-bottom: 0.3em;
              border-bottom: 1px solid hsl(var(--border));
            }
            
            .markdown-preview h2 {
              font-size: 1.5em;
              font-weight: 600;
              margin-top: 1.5em;
              margin-bottom: 0.75rem;
              padding-bottom: 0.2em;
              border-bottom: 1px solid hsl(var(--border));
            }
            
            .markdown-preview h3 {
              font-size: 1.25em;
              font-weight: 600;
              margin-top: 1.25em;
              margin-bottom: 0.5rem;
            }
            
            .markdown-preview h4, 
            .markdown-preview h5, 
            .markdown-preview h6 {
              font-size: 1em;
              font-weight: 600;
              margin-top: 1em;
              margin-bottom: 0.5rem;
            }
            
            .markdown-preview p {
              margin-top: 0;
              margin-bottom: 1em;
            }
            
            .markdown-preview ul, 
            .markdown-preview ol {
              margin-top: 0;
              margin-bottom: 1em;
              padding-left: 2em;
            }
            
            .markdown-preview li {
              margin-top: 0.25em;
            }
            
            .markdown-preview table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 1em;
              margin-bottom: 1em;
              border: 1px solid hsl(var(--border));
            }
            
            .markdown-preview thead {
              background-color: hsl(var(--muted));
            }
            
            .markdown-preview th {
              padding: 0.75rem;
              text-align: left;
              font-weight: 600;
              border: 1px solid hsl(var(--border));
            }
            
            .markdown-preview td {
              padding: 0.75rem;
              border: 1px solid hsl(var(--border));
            }
            
            .markdown-preview tbody tr:nth-child(even) {
              background-color: hsl(var(--muted) / 0.3);
            }
            
            .markdown-preview code {
              background-color: hsl(var(--muted));
              padding: 0.2em 0.4em;
              border-radius: 3px;
              font-size: 0.875em;
              font-family: var(--font-mono);
            }
            
            .markdown-preview pre {
              background-color: hsl(var(--muted));
              padding: 1em;
              border-radius: 6px;
              overflow-x: auto;
              margin-top: 1em;
              margin-bottom: 1em;
            }
            
            .markdown-preview pre code {
              background-color: transparent;
              padding: 0;
            }
            
            .markdown-preview blockquote {
              border-left: 4px solid hsl(var(--primary));
              padding-left: 1em;
              margin-left: 0;
              margin-right: 0;
              color: hsl(var(--muted-foreground));
              font-style: italic;
            }
            
            .markdown-preview a {
              color: hsl(var(--primary));
              text-decoration: underline;
            }
            
            .markdown-preview a:hover {
              opacity: 0.8;
            }
            
            .markdown-preview hr {
              border: none;
              border-top: 1px solid hsl(var(--border));
              margin: 2em 0;
            }
            
            .markdown-preview img {
              max-width: 100%;
              height: auto;
            }
          `}</style>

          <TabsContent value="raw" className="mt-4">
            <Textarea
              value={result.markdown}
              readOnly
              className="font-mono text-xs min-h-[300px] max-h-[500px] resize-none"
            />
          </TabsContent>

          <TabsContent value="spdx" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded">
                    <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">ISO/IEC 5962:2021 Compliant</h4>
                    <p className="text-xs text-muted-foreground">
                      SPDX 2.3 format - Industry standard for Software Bill of Materials
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopySPDX}
                    disabled={copied || !result.spdx}
                  >
                    {copied ? (
                      <>
                        <CheckCheck className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleDownloadSPDX}
                    disabled={!result.spdx}
                  >
                    <Download className="w-4 h-4" />
                    Download SPDX
                  </Button>
                </div>
              </div>
              <Textarea
                value={result.spdx ? JSON.stringify(result.spdx, null, 2) : 'SPDX data not available'}
                readOnly
                className="font-mono text-xs min-h-[300px] max-h-[500px] resize-none"
              />
            </div>
          </TabsContent>

          <TabsContent value="cyclonedx" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded">
                    <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">ECMA-424 Compliant</h4>
                    <p className="text-xs text-muted-foreground">
                      CycloneDX 1.5 format - OWASP standard with vulnerability and VEX support
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCycloneDX}
                    disabled={copied || !result.cyclonedx}
                  >
                    {copied ? (
                      <>
                        <CheckCheck className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleDownloadCycloneDX}
                    disabled={!result.cyclonedx}
                  >
                    <Download className="w-4 h-4" />
                    Download CycloneDX
                  </Button>
                </div>
              </div>
              <Textarea
                value={result.cyclonedx ? JSON.stringify(result.cyclonedx, null, 2) : 'CycloneDX data not available'}
                readOnly
                className="font-mono text-xs min-h-[300px] max-h-[500px] resize-none"
              />
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* SBOM Integrity */}
      {result.integrityHash && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div>
              <p className="text-sm font-medium">SBOM Integrity Hash</p>
              <p className="text-xs font-mono text-muted-foreground break-all">{result.integrityHash}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

