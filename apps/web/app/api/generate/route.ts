import { NextRequest, NextResponse } from 'next/server';
import { generateSBOM } from '@billofmaterial/sbom-core';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

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
                maxConcurrentRequests: 10,
              },
            },
            (message, current, total) => {
              // Send progress updates
              const progress = {
                type: 'progress',
                message,
                current,
                total,
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
              );
            }
          );

          // Send final result
          const finalData = {
            type: 'complete',
            result,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`)
          );
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorData = {
            type: 'error',
            error: errorMessage,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
          );
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

