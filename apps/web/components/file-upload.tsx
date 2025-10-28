'use client';

import { useCallback, useState } from 'react';
import { Upload, FileJson, FolderOpen, X, Clipboard } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Badge } from '@workspace/ui/components/badge';
import { Textarea } from '@workspace/ui/components/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

interface UploadedFile {
  path: string;
  content: string;
}

interface FileUploadProps {
  onFilesUploaded: (packageJson: string, files: UploadedFile[]) => void;
  disabled?: boolean;
}

export function FileUpload({ onFilesUploaded, disabled = false }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [packageJson, setPackageJson] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [pastedContent, setPastedContent] = useState<string>('');
  const [pasteError, setPasteError] = useState<string>('');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFiles = useCallback(async (fileList: FileList) => {
    const uploadedFiles: UploadedFile[] = [];
    let rootPackageJson = '';

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file) continue;

      const content = await file.text();

      // Determine file path
      const path = (file as any).webkitRelativePath || file.name;

      if (path === 'package.json' || path.endsWith('/package.json')) {
        try {
          // Validate package.json content
          const parsed = JSON.parse(content);
          if (typeof parsed === 'object' && parsed !== null) {
            if (path === 'package.json') {
              rootPackageJson = content;
            }
            uploadedFiles.push({ path, content });
          } else {
            console.warn(`Invalid package.json at ${path}: Not a valid JSON object`);
          }
        } catch (error) {
          console.warn(`Invalid package.json at ${path}:`, error);
          if (path === 'package.json') {
            alert(`Invalid package.json file: ${error instanceof Error ? error.message : 'Invalid JSON format'}`);
            return;
          }
        }
      } else if (
        path === 'pnpm-workspace.yaml' ||
        path === 'pnpm-workspace.yml' ||
        path === 'lerna.json'
      ) {
        uploadedFiles.push({ path, content });
      }
    }

    if (!rootPackageJson) {
      // Try to find root package.json
      const rootFile = uploadedFiles.find(f => f.path === 'package.json');
      if (rootFile) {
        rootPackageJson = rootFile.content;
      } else {
        alert('No root package.json found. Please upload your project root package.json.');
        return;
      }
    }

    setPackageJson(rootPackageJson);
    setFiles(uploadedFiles);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const fileList = e.dataTransfer.files;
      await processFiles(fileList);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        await processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const handleFolderInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        await processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const handleGenerate = useCallback(() => {
    if (packageJson) {
      onFilesUploaded(packageJson, files);
    }
  }, [packageJson, files, onFilesUploaded]);

  const removeFile = useCallback((path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path));
    if (path === 'package.json') {
      setPackageJson('');
    }
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    setPackageJson('');
    setPastedContent('');
    setPasteError('');
  }, []);

  const handlePasteGenerate = useCallback(() => {
    setPasteError('');

    try {
      // Trim and validate input
      const trimmedContent = pastedContent.trim();
      if (!trimmedContent) {
        setPasteError('Please paste package.json content.');
        return;
      }

      // Validate JSON
      const parsed = JSON.parse(trimmedContent);

      if (!parsed.dependencies && !parsed.devDependencies) {
        setPasteError('Invalid package.json: No dependencies found');
        return;
      }

      // Additional validation for common issues
      if (typeof parsed !== 'object' || parsed === null) {
        setPasteError('Invalid package.json: Must be a valid JSON object');
        return;
      }

      // Generate with pasted content
      onFilesUploaded(trimmedContent, []);
    } catch (error) {
      if (error instanceof SyntaxError) {
        setPasteError('Invalid JSON format. Please check for syntax errors like missing quotes, commas, or brackets.');
      } else {
        setPasteError('Invalid package.json content. Please paste a valid package.json file.');
      }
    }
  }, [pastedContent, onFilesUploaded]);

  return (
    <Card className="p-6">
      <Tabs defaultValue="upload" className="w-full">
        <div className="flex justify-center mb-4">
          <TabsList>
            <TabsTrigger value="upload" className="gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload Files
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-2 cursor-pointer">
              <Clipboard className="w-4 h-4" />
              Paste package.json
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="upload" className="mt-0">
          <div className="space-y-4">
            <div
              className={`relative border-2 border-dashed rounded-lg p-8 md:p-12 text-center transition-colors ${disabled
                ? 'border-muted-foreground/10 bg-muted/20 opacity-60 cursor-not-allowed'
                : dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
              onDragEnter={disabled ? undefined : handleDrag}
              onDragLeave={disabled ? undefined : handleDrag}
              onDragOver={disabled ? undefined : handleDrag}
              onDrop={disabled ? undefined : handleDrop}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
              <h3 className="text-lg font-semibold mb-2">
                Upload your package.json or entire project
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {disabled ? 'Generating SBOM...' : 'Drag and drop your files here, or click to browse'}
              </p>

              <div className="flex gap-3 justify-center">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild disabled={disabled}>
                    <span className="cursor-pointer">
                      <FileJson className="w-4 h-4" />
                      Upload File
                    </span>
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".json,.yaml,.yml"
                    multiple
                    onChange={handleFileInput}
                    disabled={disabled}
                  />
                </label>

                <label htmlFor="folder-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild disabled={disabled}>
                    <span className="cursor-pointer">
                      <FolderOpen className="w-4 h-4" />
                      Upload Folder
                    </span>
                  </Button>
                  <input
                    id="folder-upload"
                    type="file"
                    className="hidden"
                    // @ts-ignore - webkitdirectory is not in the types but works
                    webkitdirectory=""
                    multiple
                    onChange={handleFolderInput}
                    disabled={disabled}
                  />
                </label>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Uploaded Files</h4>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Clear All
                  </Button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {files.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileJson className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-mono text-xs">{file.path}</span>
                        {file.path === 'package.json' && (
                          <Badge variant="secondary" className="shrink-0">
                            Root
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeFile(file.path)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={!packageJson || disabled}
                  className="w-full"
                >
                  {disabled ? 'Generating...' : 'Generate SBOM'}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="paste" className="mt-0">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Package.json Content</label>
                {pastedContent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPastedContent('');
                      setPasteError('');
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <Textarea
                placeholder='Paste your package.json content here... 
                  Example:
                  {
                    "name": "my-project",
                    "version": "1.0.0",
                    "dependencies": {
                      "react": "^18.0.0",
                      "next": "^14.0.0"
                    }
                  }'
                value={pastedContent}
                onChange={(e) => {
                  setPastedContent(e.target.value);
                  setPasteError('');
                }}
                className="font-mono text-xs min-h-[300px] resize-none"
                disabled={disabled}
              />
            </div>

            {pasteError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {pasteError}
              </div>
            )}

            <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Clipboard className="w-4 h-4" />
                Quick Start
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Simply copy your package.json content and paste it above. No file upload needed!
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Works with any Node.js project</li>
                <li>• Supports monorepo package.json files</li>
                <li>• No data leaves your browser</li>
              </ul>
            </div>

            <Button
              onClick={handlePasteGenerate}
              disabled={!pastedContent || disabled}
              className="w-full"
            >
              {disabled ? 'Generating...' : 'Generate SBOM from Pasted Content'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

