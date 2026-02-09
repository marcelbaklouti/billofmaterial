import { NextRequest, NextResponse } from 'next/server';
import { generateSBOM } from '@billofmaterial/sbom-core';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

// Simple in-memory cache for API responses
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

function getCached(key: string): any | null {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > cached.ttl) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

const MAX_CACHE_SIZE = 50;

function setCache(key: string, data: any, ttl: number = 300000): void {
  // Evict expired entries and enforce size limit before adding
  if (cache.size >= MAX_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, cached] of cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        cache.delete(k);
      }
    }
    // If still over limit, remove oldest entries
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldest = [...cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, cache.size - MAX_CACHE_SIZE + 1);
      for (const [k] of oldest) {
        cache.delete(k);
      }
    }
  }

  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
}

interface UploadedFile {
  path: string;
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageJson, files = [] } = body as {
      packageJson: string;
      files?: UploadedFile[];
    };

    if (!packageJson) {
      return NextResponse.json(
        { error: 'No package.json provided' },
        { status: 400 }
      );
    }

    // Create cache key based on package.json content and uploaded files
    const { createHash } = await import('crypto');
    const hashInput = packageJson + JSON.stringify(files.map(f => f.path).sort());
    const cacheKey = `sbom_${createHash('sha256').update(hashInput).digest('hex').slice(0, 48)}`;
    
    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('Returning cached SBOM result');
      return new Response(JSON.stringify({
        type: 'complete',
        result: cached
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // 5 minutes
        },
      });
    }

    // Create a stream for progress updates
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await generateSBOM(
            {
              packageJsonContent: packageJson,
              files: [
                { path: 'package.json', content: packageJson },
                ...files,
              ],
              config: {
                includeDevDeps: true,
                includeBundleSize: true,
                maxConcurrentRequests: 50, // Always use high concurrency
                retryAttempts: 1, // Fast retries
                retryDelay: 200, // Fast retry delay
                cacheEnabled: true, // Enable caching
                cacheDuration: 300000, // 5 minutes cache
              },
            },
            (message, current, total) => {
              // Throttle progress updates to avoid overwhelming the client
              const now = Date.now();
              if (now - (controller as any).lastProgressUpdate < 100) {
                return; // Skip if less than 100ms since last update
              }
              (controller as any).lastProgressUpdate = now;

              // Send progress updates
              const progress = {
                type: 'progress',
                message: String(message || ''),
                current: typeof current === 'number' ? current : undefined,
                total: typeof total === 'number' ? total : undefined,
              };
              
              try {
                const jsonString = JSON.stringify(progress);
                controller.enqueue(
                  encoder.encode(`data: ${jsonString}\n\n`)
                );
              } catch (error) {
                console.error('Failed to stringify progress data:', error);
                // Send a safe fallback
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'progress', message: 'Processing...' })}\n\n`)
                );
              }
            }
          );

          // Cache the result
          setCache(cacheKey, result, 300000); // 5 minutes cache
          
          // Send final result
          const finalData = {
            type: 'complete',
            result,
          };
          
          try {
            const jsonString = JSON.stringify(finalData);
            controller.enqueue(
              encoder.encode(`data: ${jsonString}\n\n`)
            );
          } catch (error) {
            console.error('Failed to stringify final result:', error);
            // Send error instead
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Failed to serialize result' })}\n\n`)
            );
          }
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorData = {
            type: 'error',
            error: String(errorMessage),
          };
          
          try {
            const jsonString = JSON.stringify(errorData);
            controller.enqueue(
              encoder.encode(`data: ${jsonString}\n\n`)
            );
          } catch (stringifyError) {
            console.error('Failed to stringify error data:', stringifyError);
            // Send a safe fallback error
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'An error occurred' })}\n\n`)
            );
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error generating SBOM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate SBOM' },
      { status: 500 }
    );
  }
}

