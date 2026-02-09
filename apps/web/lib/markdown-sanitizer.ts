/**
 * Sanitizes markdown content to prevent MDX parsing issues
 */
export function sanitizeMarkdown(markdown: string): string {
  return markdown
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove any potential script/style tags that could cause issues
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Escape curly braces only in text content (not in URLs or code blocks)
    // MDX interprets {} as JSX expressions, so we need to escape them
    .replace(/(?<!`[^`]*){(?![^`]*`)/g, '\\{')
    .replace(/(?<!`[^`]*)}(?![^`]*`)/g, '\\}')
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
  if (/<script/i.test(markdown)) {
    errors.push('Contains script tags');
  }

  if (/<style/i.test(markdown)) {
    errors.push('Contains style tags');
  }

  // Only flag actual JS export/import statements (start of line), not mentions in text
  if (/^export\s+(default\s+)?/m.test(markdown)) {
    errors.push('Contains export statements');
  }

  if (/^import\s+/m.test(markdown)) {
    errors.push('Contains import statements');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
