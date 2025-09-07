#!/usr/bin/env bun

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Contributor {
  name: string;
  github?: string;
  discord?: string;
}

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  status: 'complete' | 'in-progress';
  isDefault: boolean;
  contributors: Contributor[];
}

interface LanguagesData {
  languages: Language[];
}

function generateLanguageTable(): string {
  try {
    // Read the languages JSON file
    const languagesPath = join(import.meta.dir, '..', 'languages.json');
    const languagesData: LanguagesData = JSON.parse(
      readFileSync(languagesPath, 'utf8')
    );

    // Generate table header
    let table = '| Language | Native Name | Status | Contributors |\n';
    table += '|----------|-------------|--------|-------------|\n';

    // Generate table rows
    languagesData.languages.forEach((lang) => {
      const name = lang.isDefault
        ? `${lang.flag} **${lang.name}** (Default)`
        : `${lang.flag} **${lang.name}**`;
      const nativeName = lang.nativeName;
      const status =
        lang.status === 'complete' ? '✅ Complete' : '🚧 In Progress';

      let contributors = '';
      if (lang.contributors && lang.contributors.length > 0) {
        contributors = lang.contributors
          .map((contributor) => {
            if (contributor.github) {
              return `[${contributor.name}](https://github.com/${contributor.github})`;
            }
            if (contributor.discord) {
              return `[${contributor.name}](https://discordapp.com/users/${contributor.discord}/)`;
            }
            return contributor.name;
          })
          .join(', ');
      } else if (lang.isDefault) {
        contributors = '-';
      } else {
        contributors = 'Help Wanted!';
      }

      table += `| ${name} | ${nativeName} | ${status} | ${contributors} |\n`;
    });

    return table;
  } catch (error) {
    console.error('Error generating language table:', error);
    process.exit(1);
  }
}

// Function to update README files with new table
function updateReadmeFiles(table: string): void {
  // Dynamically find all README*.md files
  const readmeFiles = readdirSync('.')
    .filter((file) => file.startsWith('README') && file.endsWith('.md'))
    .sort(); // Sort to ensure consistent order

  readmeFiles.forEach((file) => {
    try {
      const content = readFileSync(file, 'utf8');

      // Find and replace the language table section using markers
      const startMarker = '<!-- LANGUAGE_TABLE_START -->';
      const endMarker = '<!-- LANGUAGE_TABLE_END -->';

      const startIndex = content.indexOf(startMarker);
      const endIndex = content.indexOf(endMarker);

      if (startIndex !== -1 && endIndex !== -1) {
        const beforeTable = content.substring(
          0,
          startIndex + startMarker.length
        );
        const afterTable = content.substring(endIndex);

        const newContent = `${beforeTable}\n\n${table}\n${afterTable}`;
        writeFileSync(file, newContent);
        console.log(`✅ Updated ${file}`);
      } else {
        console.warn(`⚠️  Could not find language table markers in ${file}`);
        console.warn(`   Looking for: ${startMarker} ... ${endMarker}`);
      }
    } catch (error) {
      console.error(`❌ Error updating ${file}:`, error);
    }
  });
}

// Main execution
if (import.meta.main) {
  console.log('🌍 Generating language table...\n');

  const table = generateLanguageTable();
  console.log('Generated language table:');
  console.log('─'.repeat(80));
  console.log(table);
  console.log('─'.repeat(80));

  if (process.argv.includes('--update-readme')) {
    console.log('\n📝 Updating README files...\n');
    updateReadmeFiles(table);
    console.log('\n✨ Done!');
  } else {
    console.log('\n💡 Run with --update-readme to update README files');
  }
}

export { generateLanguageTable, updateReadmeFiles };
