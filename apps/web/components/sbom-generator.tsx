'use client';

import { useState, useEffect } from 'react';
import { FileUpload } from './file-upload';
import { SBOMResult } from './sbom-result';
import { HeroSection } from './hero-section';
import { ProgressDisplay } from './progress-display';
import { ErrorDisplay } from './error-display';
import { InfoCards } from './info-cards';
import { ProgressModal } from './progress-modal';
import { FooterSection } from './footer-section';
import { ResultHeader } from './result-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Package, Sparkles } from 'lucide-react';
import { useSBOMGeneration } from '../hooks/use-sbom-generation';

export function SBOMGenerator() {
  const [activeTab, setActiveTab] = useState('upload');
  const { isGenerating, progress, result, error, startTime, generateSBOM, reset } = useSBOMGeneration();

  // Auto-switch to result tab when generation completes
  useEffect(() => {
    if (result && !isGenerating) {
      setActiveTab('result');
    }
  }, [result, isGenerating]);

  const handleReset = () => {
    reset();
    setActiveTab('upload');
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      {/* Hero Section */}
      <HeroSection />

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="upload" className="gap-2 cursor-pointer">
              <Package className="w-4 h-4" />
              Upload & Generate
            </TabsTrigger>
            <TabsTrigger value="result" disabled={!result && !isGenerating} className="gap-2 cursor-pointer">
              <Sparkles className="w-4 h-4" />
              {result ? 'View Results' : 'Result'}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="upload" className="space-y-6 mt-6">
          <FileUpload onFilesUploaded={generateSBOM} disabled={isGenerating} />

          {isGenerating && progress && (
            <ProgressDisplay progress={progress} startTime={startTime} />
          )}

          {error && <ErrorDisplay error={error} onRetry={handleReset} />}

          <InfoCards />
        </TabsContent>

        <TabsContent value="result" className="space-y-6 mt-6">
          {result && (
            <>
              <ResultHeader result={result} onReset={handleReset} />
              <SBOMResult result={result} />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <FooterSection />

      {/* Progress Modal */}
      <ProgressModal isOpen={isGenerating} progress={progress} />
    </div>
  );
}