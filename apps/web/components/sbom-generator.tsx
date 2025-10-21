'use client';

import { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './file-upload';
import { SBOMResult } from './sbom-result';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Card } from '@workspace/ui/components/card';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Progress } from '@workspace/ui/components/progress';
import { Button } from '@workspace/ui/components/button';
import { Loader2, Shield, Package, Zap, Scale, ChevronRight, Sparkles } from 'lucide-react';

interface UploadedFile {
  path: string;
  content: string;
}

interface ProgressUpdate {
  message: string;
  current?: number;
  total?: number;
}

export function SBOMGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('upload');

  // Auto-switch to result tab when generation completes
  useEffect(() => {
    if (result && !isGenerating) {
      setActiveTab('result');
    }
  }, [result, isGenerating]);

  const handleGenerate = useCallback(
    async (packageJson: string, files: UploadedFile[]) => {
      setIsGenerating(true);
      setProgress({ message: 'Starting SBOM generation...' });
      setError(null);
      setResult(null);

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageJson,
            files,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate SBOM');
        }

        // Handle Server-Sent Events
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'progress') {
                setProgress({
                  message: data.message,
                  current: data.current,
                  total: data.total,
                });
              } else if (data.type === 'complete') {
                setResult(data.result);
                setIsGenerating(false);
                setProgress(null);
              } else if (data.type === 'error') {
                setError(data.error);
                setIsGenerating(false);
                setProgress(null);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error generating SBOM:', err);
        setError(err instanceof Error ? err.message : 'Failed to generate SBOM');
        setIsGenerating(false);
        setProgress(null);
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
    setActiveTab('upload');
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Sparkles className="w-4 h-4" />
          <span>Free • No Login Required</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
          Bill of Material Generator
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Generate comprehensive Software Bill of Materials with security analysis,
          risk assessment, and bundle size insights
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span>Security Scores</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
            <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Bundle Analysis</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
            <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span>Risk Assessment</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
            <Scale className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>License Check</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="upload" className="gap-2">
            <Package className="w-4 h-4" />
            Upload & Generate
          </TabsTrigger>
          <TabsTrigger value="result" disabled={!result && !isGenerating} className="gap-2">
            <Sparkles className="w-4 h-4" />
            {result ? 'View Results' : 'Result'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <FileUpload onFilesUploaded={handleGenerate} disabled={isGenerating} />

          {isGenerating && progress && (
            <Card className="p-6 border-primary/20 bg-primary/5">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{progress.message}</p>
                    {progress.current !== undefined && progress.total !== undefined && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.current} / {progress.total}
                      </p>
                    )}
                  </div>
                </div>

                {progress.current !== undefined && progress.total !== undefined && (
                  <Progress
                    value={(progress.current / progress.total) * 100}
                    className="h-2"
                  />
                )}
              </div>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Try Again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Security Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    Get security scores from Snyk for all dependencies
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Monorepo Support</h3>
                  <p className="text-sm text-muted-foreground">
                    Works with pnpm, yarn, npm workspaces, and Lerna
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Instant Results</h3>
                  <p className="text-sm text-muted-foreground">
                    Generate comprehensive SBOM in seconds
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="result" className="space-y-6">
          {result && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Analysis Complete</h2>
                  <p className="text-sm text-muted-foreground">
                    Generated {new Date(result.generatedAt).toLocaleString()}
                  </p>
                </div>
                <Button variant="outline" onClick={handleReset}>
                  Generate New SBOM
                </Button>
              </div>

              <SBOMResult result={result} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground space-y-2 py-8 border-t">
        <p>
          Supports single packages and monorepos • No data stored • 100% private
        </p>
        <p className="text-xs">
          Also available as CLI: <code className="px-2 py-1 bg-muted rounded">npx billofmaterial@latest generate</code>
        </p>
        <p className="text-xs mt-4 flex items-center justify-center gap-1">
          Made with <span className="text-red-500 animate-pulse">❤️</span> by{' '}
          <a
            href="https://github.com/marcelbaklouti"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:text-foreground transition-colors underline underline-offset-2"
          >
            Marcel Baklouti
          </a>
        </p>
      </div>
    </div>
  );
}

