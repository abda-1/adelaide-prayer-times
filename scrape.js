/**
 * Adelaide Prayer Times Scraper
 * 
 * Fetches iqamah times from Masjidbox and updates mosques.json
 * Run: node scrape.js
 * 
 * Used by GitHub Actions to auto-update mosque times daily
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to mosques.json
const MOSQUES_JSON_PATH = join(__dirname, 'mosques.json');

// Mosque sources that can be scraped
const SCRAPABLE_SOURCES = [
    {
        id: 'maryam',
        url: 'https://masjidbox.com/prayer-times/maryam-masjid-1705746728563',
        type: 'masjidbox'
    },
    {
        id: 'adelaide-city',
        url: 'https://masjidbox.com/prayer-times/adelaide-city-mosque',
        type: 'masjidbox'
    }
];

/**
 * Parse time from Masjidbox format (e.g., "410AM" or "1:12PM")
 */
function parseMasjidboxTime(timeStr) {
    if (!timeStr || timeStr === 'NA') return null;
    
    timeStr = timeStr.trim().toUpperCase();
    
    // Try format with colon: "4:10 AM"
    const colonMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (colonMatch) {
        let hours = parseInt(colonMatch[1], 10);
        const minutes = colonMatch[2];
        const period = colonMatch[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
    
    // Try format without colon: "410AM"
    const noColonMatch = timeStr.match(/^(\d{1,2})(\d{2})(AM|PM)$/i);
    if (noColonMatch) {
        let hours = parseInt(noColonMatch[1], 10);
        const minutes = noColonMatch[2];
        const period = noColonMatch[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
    
    return null;
}

/**
 * Scrape Masjidbox page for iqamah times
 */
async function scrapeMasjidbox(url) {
    try {
        console.log(`  Fetching: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AdelaidePrayerTimes/1.0)'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        const bodyText = $('body').text();
        
        // Regex patterns to extract iqamah times
        const patterns = {
            fajrIqamah: /Fajr.*?Iqamah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
            dhuhrIqamah: /Dhuhr.*?Iqamah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
            asrIqamah: /Asr.*?Iqamah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
            maghribIqamah: /Maghrib.*?Iqamah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
            ishaIqamah: /Isha.*?Iqamah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
            jummah: /Jum(?:u)?ah\s*(\d{1,2}:?\d{2}\s*[AP]M)/i,
        };
        
        const fajrMatch = bodyText.match(patterns.fajrIqamah);
        const dhuhrMatch = bodyText.match(patterns.dhuhrIqamah);
        const asrMatch = bodyText.match(patterns.asrIqamah);
        const maghribMatch = bodyText.match(patterns.maghribIqamah);
        const ishaMatch = bodyText.match(patterns.ishaIqamah);
        const jummahMatch = bodyText.match(patterns.jummah);
        
        return {
            fajr: fajrMatch ? parseMasjidboxTime(fajrMatch[1]) : null,
            dhuhr: dhuhrMatch ? parseMasjidboxTime(dhuhrMatch[1]) : null,
            asr: asrMatch ? parseMasjidboxTime(asrMatch[1]) : null,
            maghrib: maghribMatch ? parseMasjidboxTime(maghribMatch[1]) : '+10',
            isha: ishaMatch ? parseMasjidboxTime(ishaMatch[1]) : null,
            jummah: jummahMatch ? parseMasjidboxTime(jummahMatch[1]) : null
        };
        
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

/**
 * Load existing mosques.json
 */
function loadMosquesJson() {
    try {
        const data = readFileSync(MOSQUES_JSON_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load mosques.json:', error.message);
        return null;
    }
}

/**
 * Save updated mosques.json
 */
function saveMosquesJson(data) {
    try {
        writeFileSync(MOSQUES_JSON_PATH, JSON.stringify(data, null, 2) + '\n');
        console.log(`\n✅ Saved to ${MOSQUES_JSON_PATH}`);
        return true;
    } catch (error) {
        console.error('Failed to save mosques.json:', error.message);
        return false;
    }
}

/**
 * Main scraper function
 */
async function scrapeAndUpdate() {
    console.log('═'.repeat(50));
    console.log('Adelaide Prayer Times - Auto Updater');
    console.log('═'.repeat(50));
    console.log(`\nStarted: ${new Date().toISOString()}\n`);
    
    // Load existing data
    const mosquesData = loadMosquesJson();
    if (!mosquesData) {
        console.error('Cannot proceed without mosques.json');
        process.exit(1);
    }
    
    let updatedCount = 0;
    let failedCount = 0;
    
    // Scrape each source
    for (const source of SCRAPABLE_SOURCES) {
        console.log(`\n📍 Scraping: ${source.id}`);
        
        let scrapedTimes = null;
        
        if (source.type === 'masjidbox') {
            scrapedTimes = await scrapeMasjidbox(source.url);
        }
        
        if (scrapedTimes) {
            // Find mosque in data and update times
            const mosque = mosquesData.mosques.find(m => m.id === source.id);
            
            if (mosque) {
                // Only update non-null scraped values
                let hasChanges = false;
                
                for (const [prayer, time] of Object.entries(scrapedTimes)) {
                    if (time !== null && mosque.times[prayer] !== time) {
                        console.log(`  ${prayer}: ${mosque.times[prayer]} → ${time}`);
                        mosque.times[prayer] = time;
                        hasChanges = true;
                    }
                }
                
                if (hasChanges) {
                    mosque.source = 'Masjidbox';
                    mosque.sourceUrl = source.url;
                    updatedCount++;
                    console.log('  ✅ Updated');
                } else {
                    console.log('  ℹ️  No changes');
                }
            } else {
                console.log(`  ⚠️  Mosque ID "${source.id}" not found in mosques.json`);
            }
        } else {
            failedCount++;
        }
    }
    
    // Update timestamp
    mosquesData.lastUpdated = new Date().toISOString();
    mosquesData.source = 'scraper';
    
    // Save updated data
    saveMosquesJson(mosquesData);
    
    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('Summary');
    console.log('═'.repeat(50));
    console.log(`Updated: ${updatedCount}`);
    console.log(`Failed:  ${failedCount}`);
    console.log(`Total:   ${mosquesData.mosques.length} mosques`);
    
    // Exit with error if all scrapes failed
    if (failedCount === SCRAPABLE_SOURCES.length) {
        console.error('\n❌ All scrapes failed');
        process.exit(1);
    }
    
    console.log('\n✅ Done');
}

// Run the scraper
scrapeAndUpdate().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
