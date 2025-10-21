'use client';

import { useState, useCallback } from 'react';
import { Card } from '@workspace/ui/components/card';
import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';
import { Badge } from '@workspace/ui/components/badge';
import { Download, Copy, CheckCheck, Package, AlertTriangle, Scale, Archive } from 'lucide-react';

interface SBOMResultProps {
  result: any;
}

export function SBOMResult({ result }: SBOMResultProps) {
  const [copied, setCopied] = useState(false);

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

  const insights = result.insights;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {insights && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dependencies</p>
                <p className="text-2xl font-bold">{insights.metrics.totalDependencies}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {insights.metrics.productionDependencies} prod • {insights.metrics.devDependencies} dev
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
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

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
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

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
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

          <Card className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Archive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bundle Size</p>
                <p className="text-2xl font-bold">
                  {Math.round(insights.totalBundleSize / 1024)} MB
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[120px]">
                  {insights.heaviestDependencies[0]?.name || 'N/A'}
                </p>
              </div>
            </div>
          </Card>
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
              <div className="space-y-3 max-h-96 overflow-y-auto">
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
              <div className="space-y-3 max-h-96 overflow-y-auto">
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                🏚️ Potentially Abandoned ({insights.abandonedPackages.length})
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Not updated in over 2 years
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
        </div>
      )}

      {/* Project Type Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={result.isMonorepo ? 'default' : 'secondary'}>
          {result.isMonorepo ? '📦 Monorepo' : '📦 Single Package'}
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

        <Textarea
          value={result.markdown}
          readOnly
          className="font-mono text-xs min-h-[400px] resize-none"
        />
      </Card>
    </div>
  );
}

