/**
 * Adelaide Prayer Times Scraper
 * 
 * Fetches iqamah times from multiple sources and updates mosques.json
 * Run: node scrape.js
 * 
 * Sources:
 * - Masjidbox (maryam, adelaide-city) - parses REDUX_STATE JSON
 * - GoPray (kilburn-centre) - parses HTML table
 * - Awqat (al-khalil) - parses iqamafixed.js
 * - ISSA (wandana) - relative times (hardcoded)
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
    },
    {
        id: 'al-khalil',
        url: 'https://awqat.com.au/sa/akm/iqamafixed.js',
        type: 'awqat'
    },
    {
        id: 'kilburn-centre',
        url: 'https://gopray.com.au/place/kilburn-musallah/',
        type: 'gopray'
    },
    {
        id: 'wandana',
        url: 'https://islamicsocietysa.org.au/mosque/wandana-mosque/',
        type: 'issa'
    }
];

/**
 * Parse time from various formats to 24h "HH:MM" format
 */
function parseTime(timeStr) {
    if (!timeStr || timeStr === 'NA') return null;
    
    timeStr = timeStr.trim();
    
    // Already in 24h format like "04:40" or "13:15"
    const h24Match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
        const hours = parseInt(h24Match[1], 10);
        const mins = h24Match[2];
        return `${hours.toString().padStart(2, '0')}:${mins}`;
    }
    
    // 12h format with colon: "4:40 am" or "1:30 pm"
    const h12ColonMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (h12ColonMatch) {
        let hours = parseInt(h12ColonMatch[1], 10);
        const mins = h12ColonMatch[2];
        const period = h12ColonMatch[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${mins}`;
    }
    
    // Format without colon: "410AM" or "130PM"
    const noColonMatch = timeStr.match(/^(\d{1,2})(\d{2})\s*(AM|PM)$/i);
    if (noColonMatch) {
        let hours = parseInt(noColonMatch[1], 10);
        const mins = noColonMatch[2];
        const period = noColonMatch[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${mins}`;
    }
    
    return null;
}

/**
 * Parse time from ISO date string like "2025-12-18T04:50:00+10:30"
 */
function parseISOTime(isoStr) {
    if (!isoStr) return null;
    
    const match = isoStr.match(/T(\d{2}):(\d{2})/);
    if (match) {
        return `${match[1]}:${match[2]}`;
    }
    return null;
}

/**
 * Parse time from awqat.com.au format
 * Index: 1=Fajr, 2=Dhuhr, 3=Asr, 4=Maghrib, 5=Isha
 */
function parseAwqatTime(timeStr, prayerIndex) {
    if (!timeStr || timeStr === '') return null;
    
    const match = timeStr.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    
    let hours = parseInt(match[1], 10);
    const mins = match[2];
    
    // Awqat uses 24h-ish format but stores Dhuhr/Jummah as "01:45" meaning 13:45
    // Prayer index context:
    // 1 = Fajr (always AM, 04:xx - 05:xx)
    // 2 = Dhuhr (always PM, needs +12 if < 12)
    // 3 = Asr (PM, usually 16:xx-18:xx)
    // 4 = Maghrib (PM, usually 17:xx-21:xx)
    // 5 = Isha (PM, usually 19:xx-23:xx)
    
    if (prayerIndex === 2 && hours < 12) {
        hours += 12;
    }
    
    return `${hours.toString().padStart(2, '0')}:${mins}`;
}

/**
 * Scrape Masjidbox page for iqamah times by parsing REDUX_STATE JSON
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
        
        // Extract REDUX_STATE JSON from the page
        const reduxMatch = html.match(/window\.REDUX_STATE\s*=\s*'([^']+)'/);
        if (!reduxMatch) {
            throw new Error('Could not find REDUX_STATE');
        }
        
        // Decode URL-encoded JSON
        let jsonStr = reduxMatch[1];
        
        // First, handle encoded unicode escapes (%5Cu0627 or %u0627)
        jsonStr = jsonStr.replace(/%5Cu([0-9a-fA-F]{4})/gi, (_, hex) => 
            String.fromCharCode(parseInt(hex, 16))
        );
        jsonStr = jsonStr.replace(/%u([0-9a-fA-F]{4})/gi, (_, hex) => 
            String.fromCharCode(parseInt(hex, 16))
        );
        
        // Then decode standard URL encoding
        try {
            jsonStr = decodeURIComponent(jsonStr);
        } catch (e) {
            // If decoding fails, try replacing problematic sequences
            jsonStr = jsonStr.replace(/%([0-9A-F]{2})/gi, (_, hex) => 
                String.fromCharCode(parseInt(hex, 16))
            );
        }
        
        // Handle JavaScript unicode escapes (\u0627)
        jsonStr = jsonStr.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => 
            String.fromCharCode(parseInt(hex, 16))
        );
        
        const state = JSON.parse(jsonStr);
        
        // Navigate to today's timetable data
        const timetable = state?.masjidbox?.masjidboxAthany?.timetable;
        if (!timetable || !timetable[0]) {
            throw new Error('Could not find timetable data');
        }
        
        const today = timetable[0];
        const iqamah = today.iqamah;
        
        if (!iqamah) {
            throw new Error('Could not find iqamah data');
        }
        
        // Parse jumuah from Friday's data
        // Note: day.jumuah = Khutbah start time, day.iqamah.jumuah = Iqamah time
        // We want the Khutbah start time (day.jumuah), not the iqamah
        let jummah = null;
        for (const day of timetable) {
            if (day.jumuah && day.jumuah[0]) {
                // Get Khutbah time, NOT iqamah time
                jummah = parseISOTime(day.jumuah[0]);
                break;
            }
        }
        
        return {
            fajr: parseISOTime(iqamah.fajr),
            dhuhr: parseISOTime(iqamah.dhuhr),
            asr: parseISOTime(iqamah.asr),
            maghrib: parseISOTime(iqamah.maghrib),
            isha: parseISOTime(iqamah.isha),
            jummah: jummah
        };
        
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

/**
 * Scrape awqat.com.au iqamafixed.js for times
 */
async function scrapeAwqat(url) {
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
        
        const jsContent = await response.text();
        
        // Parse FIXED_IQAMA_TIMES array: ['','04:40','01:45','17:15','20:45','22:20']
        // Index: 0=empty, 1=Fajr, 2=Dhuhr, 3=Asr, 4=Maghrib, 5=Isha
        const timesMatch = jsContent.match(/FIXED_IQAMA_TIMES\s*=\s*\[(.*?)\]/);
        if (!timesMatch) {
            throw new Error('Could not find FIXED_IQAMA_TIMES');
        }
        
        // Extract times from the array
        const timesStr = timesMatch[1];
        const times = timesStr.split(',').map(t => t.trim().replace(/['"]/g, ''));
        
        // Parse Jummah time from announcement: "JUMU'AH @ 01:15 PM"
        const jummahMatch = jsContent.match(/JUMU['']AH\s*@\s*(\d{1,2}:\d{2})\s*(AM|PM)?/i);
        let jummah = null;
        if (jummahMatch) {
            const jummahTime = jummahMatch[1];
            const period = jummahMatch[2] || 'PM'; // Default to PM for Jummah
            jummah = parseTime(`${jummahTime} ${period}`);
        }
        
        return {
            fajr: parseAwqatTime(times[1], 1),
            dhuhr: parseAwqatTime(times[2], 2),
            asr: parseAwqatTime(times[3], 3),
            maghrib: parseAwqatTime(times[4], 4),
            isha: parseAwqatTime(times[5], 5),
            jummah: jummah
        };
        
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

/**
 * Scrape gopray.com.au for prayer times
 */
async function scrapeGoPray(url) {
    try {
        console.log(`  Fetching: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-AU,en;q=0.9'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Find prayer times table
        const times = {};
        
        // Check if we found the prayer times div
        const prayerDiv = $('div.place-prayer-times');
        
        if (prayerDiv.length === 0) {
            throw new Error('Could not find place-prayer-times div');
        }
        
        // Parse table rows: <tr><th>Fajr</th><td>4:40 am</td></tr>
        $('div.place-prayer-times table tr').each((i, row) => {
            const label = $(row).find('th').text().trim().toLowerCase();
            const time = $(row).find('td').first().text().trim();
            
            if (label.includes('fajr')) {
                times.fajr = parseTime(time);
            } else if (label.includes('zuhr') || label.includes('dhuhr')) {
                times.dhuhr = parseTime(time);
            } else if (label.includes('asr')) {
                times.asr = parseTime(time);
            } else if (label.includes('maghrib')) {
                times.maghrib = parseTime(time);
            } else if (label.includes('isha') || label.includes('esha')) {
                times.isha = parseTime(time);
            } else if (label.includes('jummah') || label.includes('jumu')) {
                times.jummah = parseTime(time);
            }
        });
        
        return {
            fajr: times.fajr || null,
            dhuhr: times.dhuhr || null,
            asr: times.asr || null,
            maghrib: times.maghrib || null,
            isha: times.isha || null,
            jummah: times.jummah || null
        };
        
    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return null;
    }
}

/**
 * Scrape ISSA website for Wandana Mosque
 * Note: ISSA uses relative times (e.g., "30 mins after Adhan")
 * We store these as "+30", "+15", "+10" formats
 */
async function scrapeISSA(url) {
    try {
        console.log(`  Fetching: ${url}`);
        
        // ISSA Wandana uses relative times (stated on their website):
        // "Fajr: Iqamah 30 mins after Adhan"
        // "Zuhr & Asr: Iqamah 15 mins after Adhan"
        // "Maghrib & Isha: Iqamah 10 mins after Adhan"
        // "Friday: Khutbah 1:30 PM | Iqamah 2:00 PM"
        
        // Since these are fixed rules, we return hardcoded values
        // The scraper runs daily but these rarely change
        
        console.log('  ℹ️  Using relative times for ISSA mosque (per website)');
        
        return {
            fajr: '+30',      // 30 mins after Adhan
            dhuhr: '+15',     // 15 mins after Adhan
            asr: '+15',       // 15 mins after Adhan
            maghrib: '+10',   // 10 mins after Adhan
            isha: '+10',      // 10 mins after Adhan
            jummah: '14:00'   // 2:00 PM
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
        console.log(`\n📍 Scraping: ${source.id} (${source.type})`);
        
        let scrapedTimes = null;
        
        switch (source.type) {
            case 'masjidbox':
                scrapedTimes = await scrapeMasjidbox(source.url);
                break;
            case 'awqat':
                scrapedTimes = await scrapeAwqat(source.url);
                break;
            case 'gopray':
                scrapedTimes = await scrapeGoPray(source.url);
                break;
            case 'issa':
                scrapedTimes = await scrapeISSA(source.url);
                break;
            default:
                console.log(`  ⚠️  Unknown source type: ${source.type}`);
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
                    // Update source info
                    const sourceNames = {
                        'masjidbox': 'Masjidbox',
                        'awqat': 'Awqat',
                        'gopray': 'GoPray',
                        'issa': 'ISSA'
                    };
                    mosque.source = sourceNames[source.type] || source.type;
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
