/**
 * Sanitizes markdown content to prevent MDX parsing issues
 */
export function sanitizeMarkdown(markdown: string): string {
  return markdown
    // Remove non-printable characters except newlines and tabs
    .replace(/[^\x20-\x7E\n\r\t]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove any potential JSX-like syntax that could confuse MDX
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Escape any remaining problematic characters
    .replace(/[{}]/g, (match) => `\\${match}`)
    // Ensure proper table formatting
    .replace(/\|\s*\|\s*\|\s*\|/g, '| | |')
    // Remove empty table rows
    .replace(/\|\s*\|\s*\|\s*\|\s*\|\s*\|\s*\|\s*\|\s*\|/g, '')
    // Clean up multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
}

/**
 * Validates if markdown content is safe for MDX parsing
 */
export function validateMarkdown(markdown: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for problematic patterns
  if (markdown.includes('<script')) {
    errors.push('Contains script tags');
  }
  
  if (markdown.includes('<style')) {
    errors.push('Contains style tags');
  }
  
  if (markdown.includes('export ')) {
    errors.push('Contains export statements');
  }
  
  if (markdown.includes('import ')) {
    errors.push('Contains import statements');
  }
  
  // Check for unclosed JSX-like tags
  const openTags = markdown.match(/<[^\/][^>]*>/g) || [];
  const closeTags = markdown.match(/<\/[^>]*>/g) || [];
  
  if (openTags.length !== closeTags.length) {
    errors.push('Unmatched HTML tags');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
