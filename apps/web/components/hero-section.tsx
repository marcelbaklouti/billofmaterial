import { Shield, Package, Zap, Scale, Sparkles } from 'lucide-react';

export function HeroSection() {
  return (
    <div className="text-center space-y-4 py-8">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
        <Sparkles className="w-4 h-4" />
        <span>Free • No Login Required</span>
      </div>

      <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
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
  );
}
