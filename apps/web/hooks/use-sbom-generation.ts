import { useState, useCallback, useRef } from 'react';

export interface UploadedFile {
  path: string;
  content: string;
}

export interface ProgressUpdate {
  message: string;
  current?: number;
  total?: number;
}

export interface SBOMGenerationState {
  isGenerating: boolean;
  progress: ProgressUpdate | null;
  result: any;
  error: string | null;
  startTime: number | null;
}

export function useSBOMGeneration() {
  const [state, setState] = useState<SBOMGenerationState>({
    isGenerating: false,
    progress: null,
    result: null,
    error: null,
    startTime: null,
  });

  // Use ref to avoid stale closure over startTime
  const startTimeRef = useRef<number | null>(null);

  const processSSELine = useCallback((line: string, timeoutId: ReturnType<typeof setTimeout>) => {
    if (!line.trim() || !line.startsWith('data: ')) return;

    try {
      const jsonString = line.slice(6).trim();
      if (!jsonString || jsonString.length === 0) return;

      const data = JSON.parse(jsonString);

      if (data.type === 'progress') {
        setState(prev => ({
          ...prev,
          progress: {
            message: data.message,
            current: data.current,
            total: data.total,
          },
        }));
      } else if (data.type === 'complete') {
        clearTimeout(timeoutId);
        setState(prev => ({
          ...prev,
          result: data.result,
          isGenerating: false,
          progress: null,
        }));

        // Show performance summary using ref (not stale state)
        const capturedStartTime = startTimeRef.current;
        if (capturedStartTime) {
          const duration = Math.round((Date.now() - capturedStartTime) / 1000);
          const depsCount = data.result?.totalDependencies || 0;
          const depsPerSecond = duration > 0 && depsCount > 0 ? Math.round(depsCount / duration) : 0;

          console.log(`SBOM Generation Complete!`);
          console.log(`Performance: ${depsCount} dependencies in ${duration}s (${depsPerSecond} deps/sec)`);
        }
      } else if (data.type === 'error') {
        clearTimeout(timeoutId);
        setState(prev => ({
          ...prev,
          error: data.error,
          isGenerating: false,
          progress: null,
        }));
      }
    } catch (parseError) {
      console.warn('Failed to parse SSE data:', parseError, 'Raw data:', line);
    }
  }, []);

  const generateSBOM = useCallback(async (packageJson: string, files: UploadedFile[]) => {
    const generationStartTime = Date.now();
    startTimeRef.current = generationStartTime;

    setState(prev => ({
      ...prev,
      isGenerating: true,
      progress: { message: 'Starting SBOM generation...' },
      error: null,
      result: null,
      startTime: generationStartTime,
    }));

    // Set up timeout
    const timeoutId = setTimeout(() => {
      setState(prev => ({
        ...prev,
        error: 'SBOM generation timed out. Please try again with fewer dependencies or check your internet connection.',
        isGenerating: false,
        progress: null,
      }));
    }, 4 * 60 * 1000); // 4 minutes timeout

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
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate SBOM');
        } catch (parseError) {
          throw new Error(`Failed to generate SBOM (${response.status})`);
        }
      }

      // Handle Server-Sent Events
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let receivedComplete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (separated by \n\n)
        const lines = buffer.split('\n\n');

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          processSSELine(line, timeoutId);
          if (line.includes('"type":"complete"') || line.includes('"type":"error"')) {
            receivedComplete = true;
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n\n');
        for (const line of lines) {
          processSSELine(line, timeoutId);
          if (line.includes('"type":"complete"') || line.includes('"type":"error"')) {
            receivedComplete = true;
          }
        }
      }

      // If stream ended without a complete/error event, clean up
      if (!receivedComplete) {
        clearTimeout(timeoutId);
        setState(prev => {
          // Only set error if we're still generating (no result yet)
          if (prev.isGenerating) {
            return {
              ...prev,
              error: 'Connection closed unexpectedly. Please try again.',
              isGenerating: false,
              progress: null,
            };
          }
          return prev;
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Error generating SBOM:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to generate SBOM',
        isGenerating: false,
        progress: null,
      }));
    }
  }, [processSSELine]);

  const reset = useCallback(() => {
    startTimeRef.current = null;
    setState({
      isGenerating: false,
      progress: null,
      result: null,
      error: null,
      startTime: null,
    });
  }, []);

  return {
    ...state,
    generateSBOM,
    reset,
  };
}
