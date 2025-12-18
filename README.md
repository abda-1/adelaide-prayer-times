# Adelaide Prayer Times

A clean, privacy-focused web app displaying athan and iqamah times for Adelaide masajid.

## Features

- 🕌 Regional athan times via [Aladhan API](https://aladhan.com)
- 📿 Iqamah times for 5 local mosques
- ⏱️ Live countdown to next prayer
- 🎨 Clean, Pillars-inspired UI
- 🔒 Privacy-focused (no tracking, no analytics)
- 📱 Fully responsive

## Included Mosques

1. **Wandana (Avenue) Mosque** - Gilles Plains
2. **Maryam Mosque** - Wayville
3. **Adelaide City Mosque** - CBD
4. **Al-Khalil Mosque** - Woodville North
5. **The Centre Mosque** - Kilburn

## Quick Start

### Option 1: Just Open the HTML File
Simply open `index.html` in your browser. The app will fetch athan times from the Aladhan API.

### Option 2: Host Locally
```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve .
```
Then visit `http://localhost:8000`

### Option 3: Deploy to GitHub Pages / Netlify
1. Push the folder to a GitHub repository
2. Enable GitHub Pages in repository settings, OR
3. Connect to Netlify for automatic deployments

## Updating Iqamah Times

The mosque iqamah times are stored in the `MOSQUES_CONFIG` array in `index.html`. 

### Manual Update

Edit the `times` object for each mosque:

```javascript
{
    id: 'maryam',
    name: 'Maryam Mosque',
    // ...
    times: {
        fajr: '04:50',      // Fixed time (24h format)
        dhuhr: '13:22',
        asr: '17:15',
        maghrib: '+10',     // Minutes after athan
        isha: '22:17',
        jummah: '13:30'
    }
}
```

### Time Formats

- **Fixed time**: `'13:30'` - Always at this time
- **Relative to athan**: `'+10'` - 10 minutes after the athan time

## Adding the Scraper (Optional)

If you want to automatically fetch times from Masjidbox, you can run the included scraper:

```bash
cd scraper
npm install
node scrape.js
```

This will output updated times that you can copy into the config.

## Data Sources

| Mosque | Source | Reliability |
|--------|--------|-------------|
| Wandana | Manual | ⚠️ Needs updates |
| Maryam | Masjidbox | ✅ Live |
| Adelaide City | Masjidbox | ✅ Live |
| Al-Khalil | Manual | ⚠️ Needs updates |
| The Centre | Manual | ⚠️ Needs updates |

## Customisation

### Calculation Method

The athan times use the Muslim World League method by default. Change `CALCULATION_METHOD` in the JavaScript:

- `1` - University of Islamic Sciences, Karachi
- `2` - Islamic Society of North America (ISNA)
- `3` - Muslim World League (default)
- `4` - Umm Al-Qura University, Makkah
- `5` - Egyptian General Authority of Survey

### Adding a New Mosque

Add a new object to `MOSQUES_CONFIG`:

```javascript
{
    id: 'new-mosque',
    name: 'New Mosque Name',
    shortName: 'New',
    address: '123 Street, Suburb',
    source: 'Manual',
    sourceUrl: null,
    times: {
        fajr: '05:00',
        dhuhr: '13:00',
        asr: '16:30',
        maghrib: '+5',
        isha: '20:30',
        jummah: '13:30'
    }
}
```

### Changing the Theme

The colour scheme uses CSS variables. Edit the `:root` block in the `<style>` section:

```css
:root {
    --bg-primary: #0f1419;        /* Main background */
    --accent-primary: #5eb88a;    /* Accent colour */
    /* ... etc */
}
```

## Privacy

This app:
- ✅ Uses no cookies
- ✅ Has no analytics or tracking
- ✅ Makes no requests to third-party servers (except Aladhan API)
- ✅ Works offline after initial load (times cached in memory)
- ✅ Uses [Bunny Fonts](https://fonts.bunny.net) instead of Google Fonts for privacy

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Mobile browsers (iOS Safari, Chrome for Android)

## Future Improvements

- [ ] Add scraper for automatic Masjidbox updates
- [ ] PWA support for offline use
- [ ] Push notifications
- [ ] Dark/light mode toggle
- [ ] Hijri date display

## Contributing

Feel free to submit PRs for:
- Updated iqamah times
- New mosque additions
- UI improvements
- Bug fixes

## License

MIT - Use freely for the Muslim community 🤲
