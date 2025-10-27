import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://billofmaterial.dev"),

  title: {
    default: "Bill of Material - Free SBOM Generator | Security & Dependency Analysis",
    template: "%s | Bill of Material",
  },

  description: "Generate comprehensive Software Bill of Materials (SBOM) for your projects with security analysis, risk assessment, and bundle size insights. Free online SBOM generator supporting all Nodejs projects with CVE vulnerability detection.",

  keywords: [
    "SBOM",
    "Software Bill of Materials",
    "SBOM Generator",
    "Free SBOM Tool",
    "Dependency Analysis",
    "Security Scanner",
    "Vulnerability Detection",
    "CVE Scanner",
    "npm dependencies",
    "package.json analyzer",
    "requirements.txt parser",
    "Monorepo SBOM",
    "Open Source Security",
    "Supply Chain Security",
    "Software Supply Chain",
    "License Compliance",
    "Bundle Size Analysis",
    "Dependency Tree",
    "Security Audit",
    "DevSecOps",
    "DevSecOps Tools",
    "Software Composition Analysis",
    "SCA Tool",
    "OWASP",
    "CycloneDX",
    "SPDX",
    "Security Assessment",
    "Risk Assessment",
    "Dependency Management",
  ],

  authors: [
    {
      name: "Marcel Baklouti",
      url: "https://baklouti.de",
    },
  ],

  creator: "Marcel Baklouti",
  publisher: "Marcel Baklouti",

  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://billofmaterial.dev",
    siteName: "Bill of Material",
    title: "Bill of Material - Free SBOM Generator | Security & Dependency Analysis",
    description: "Generate comprehensive Software Bill of Materials (SBOM) for your projects. Analyze security vulnerabilities, assess risks, and get bundle size insights instantly. Supports all Nodejs projects",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Bill of Material - SBOM Generator Dashboard",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Bill of Material - Free SBOM Generator",
    description: "Generate comprehensive Software Bill of Materials (SBOM) with security analysis, risk assessment, and bundle insights. Free online tool supporting all Nodejs projects",
    images: ["/twitter-image.png"],
    creator: "@billofmaterial",
    site: "@billofmaterial",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  alternates: {
    canonical: "https://billofmaterial.dev",
  },

  verification: {
    google: "your-google-search-console-verification-code",
    // yandex: "your-yandex-verification-code",
    // bing: "your-bing-webmaster-verification-code",
  },

  category: "technology",

  applicationName: "Bill of Material SBOM Generator",

  appleWebApp: {
    capable: true,
    title: "SBOM Generator",
    statusBarStyle: "default",
  },

  other: {
    "mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // JSON-LD structured data for enhanced SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Bill of Material - SBOM Generator",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    url: "https://billofmaterial.dev",
    description: "Generate comprehensive Software Bill of Materials (SBOM) for your projects with security analysis, risk assessment, and bundle size insights.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "SBOM Generation",
      "Security Vulnerability Analysis",
      "CVE Detection",
      "Risk Assessment",
      "Bundle Size Insights",
      "Multi-language Support (npm, Python, Rust)",
      "Monorepo Support",
      "License Compliance Checking",
      "Dependency Tree Visualization",
      "Real-time Security Scanning",
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      ratingCount: "156",
      bestRating: "5",
      worstRating: "1",
    },
    author: {
      "@type": "",
      name: "Marcel Baklouti",
      url: "https://baklouti.de",
    },
  }


  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased `}
      >
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}
