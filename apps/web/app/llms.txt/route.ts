import { NextResponse } from 'next/server'

export async function GET() {
  const llmsTxt = `# LLMs.txt - AI/LLM Crawler Instructions

# This file provides instructions for AI language models and crawlers
# about how to interact with this website responsibly.

# WEBSITE INFORMATION
Name: Bill of Material - SBOM Generator
Description: Free online tool for generating Software Bill of Materials (SBOM) with security analysis and dependency management
URL: https://billofmaterial.dev
Purpose: Developer tool for software security and compliance

# CRAWLING POLICY
- This website is designed for developers and security professionals
- Content is technical and educational in nature
- Please respect rate limits and don't overload the server
- API endpoints are for legitimate use only

# CONTENT GUIDELINES
- Focus on technical documentation and tool functionality
- Avoid crawling user-generated content or private data
- Respect the terms of service and privacy policy
- Do not attempt to reverse engineer or exploit the application

# RATE LIMITING
- Maximum 1 request per second per IP
- Respect robots.txt directives
- Use appropriate User-Agent headers
- Implement exponential backoff on errors

# CONTACT
For questions about AI crawling or usage:
- Email: marcel+billofmaterial@baklouti.de
- Website: https://baklouti.de/contact/

# LAST UPDATED
${new Date().toISOString().split('T')[0]}

# VERSION
1.0
`

  return new NextResponse(llmsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400', // 24 hours
    },
  })
}
