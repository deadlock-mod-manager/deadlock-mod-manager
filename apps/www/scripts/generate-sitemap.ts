import { writeFileSync } from "node:fs";
import { join } from "node:path";

interface Mod {
  remoteId: string;
  updatedAt: string | null;
  createdAt: string | null;
}

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

async function fetchAllMods(): Promise<Mod[]> {
  const apiUrl = "https://api.deadlockmods.app/mods";

  try {
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch mods: ${response.statusText}`);
    }

    const mods = await response.json();
    return mods as Mod[];
  } catch (error) {
    console.error("Error fetching mods:", error);
    return [];
  }
}

function generateSitemapXML(urls: SitemapUrl[]): string {
  const urlEntries = urls
    .map((url) => {
      const parts = [`    <loc>${url.loc}</loc>`];

      if (url.lastmod) {
        parts.push(`    <lastmod>${url.lastmod}</lastmod>`);
      }

      if (url.changefreq) {
        parts.push(`    <changefreq>${url.changefreq}</changefreq>`);
      }

      if (url.priority) {
        parts.push(`    <priority>${url.priority}</priority>`);
      }

      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

async function generateSitemap() {
  console.log("Fetching mods from API...");
  const mods = await fetchAllMods();
  console.log(`Found ${mods.length} mods`);

  const baseUrl = "https://deadlockmods.app";
  const staticUrls: SitemapUrl[] = [
    {
      loc: baseUrl,
      changefreq: "weekly",
      priority: "1.0",
    },
    {
      loc: `${baseUrl}/mods`,
      changefreq: "hourly",
      priority: "0.9",
    },
    {
      loc: `${baseUrl}/download`,
      changefreq: "weekly",
      priority: "0.9",
    },
    {
      loc: `${baseUrl}/download/windows`,
      changefreq: "weekly",
      priority: "0.8",
    },
    {
      loc: `${baseUrl}/download/linux`,
      changefreq: "weekly",
      priority: "0.8",
    },
    {
      loc: `${baseUrl}/vpk-analyzer`,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: `${baseUrl}/status`,
      changefreq: "daily",
      priority: "0.6",
    },
    {
      loc: `${baseUrl}/privacy`,
      changefreq: "monthly",
      priority: "0.5",
    },
    {
      loc: `${baseUrl}/terms`,
      changefreq: "monthly",
      priority: "0.5",
    },
    {
      loc: `${baseUrl}/discord`,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: `${baseUrl}/docs`,
      changefreq: "weekly",
      priority: "0.9",
    },
  ];

  const modUrls: SitemapUrl[] = mods.map((mod) => ({
    loc: `${baseUrl}/mod/${mod.remoteId}`,
    lastmod: mod.updatedAt || mod.createdAt || new Date().toISOString(),
    changefreq: "weekly",
    priority: "0.8",
  }));

  const allUrls = [...staticUrls, ...modUrls];
  const sitemapXML = generateSitemapXML(allUrls);

  const outputPath = join(process.cwd(), "dist", "sitemap-mods.xml");
  writeFileSync(outputPath, sitemapXML, "utf-8");

  console.log(`✅ Sitemap generated successfully at ${outputPath}`);
  console.log(`   Total URLs: ${allUrls.length}`);
  console.log(`   Static URLs: ${staticUrls.length}`);
  console.log(`   Mod URLs: ${modUrls.length}`);
}

generateSitemap().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exit(1);
});
