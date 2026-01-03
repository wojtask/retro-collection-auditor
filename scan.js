import { existsSync,statSync,readdirSync,readFileSync } from 'fs';
import { resolve,join,dirname,basename,parse } from 'path';
import { XMLParser } from 'fast-xml-parser';

// Configuration
const ARGS = process.argv.slice(2);
const ROMS_DIR_ARG = ARGS[0];
const ES_DE_DIR_ARG = ARGS[1];

if (!ROMS_DIR_ARG) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: No ROMs directory specified.');
  console.error('Usage: node scan.js <path-to-roms> [path-to-es-de] > report.csv');
  console.error('Example 1 (Combined): node scan.js "D:/Games/Roms" > my_collection.csv');
  console.error('Example 2 (Split):    node scan.js "D:/Games/Roms" "C:/Users/Me/.emulationstation" > my_collection.csv');
  process.exit(1);
}

const ROMS_ROOT = resolve(ROMS_DIR_ARG);

if (!existsSync(ROMS_ROOT) || !statSync(ROMS_ROOT).isDirectory()) {
  console.error('\x1b[31m%s\x1b[0m', `Error: ROMs directory not found: ${ROMS_ROOT}`);
  process.exit(1);
}

let GAMELISTS_ROOT = null;
let DOWNLOADED_MEDIA_ROOT = null;

if (ES_DE_DIR_ARG) {
    const esRoot = resolve(ES_DE_DIR_ARG);
    GAMELISTS_ROOT = resolve(esRoot, "gamelists");
    if (!existsSync(GAMELISTS_ROOT) || !statSync(GAMELISTS_ROOT).isDirectory()) {
        console.error('\x1b[31m%s\x1b[0m', `Error: Gamelists directory not found: ${GAMELISTS_ROOT}`);
        process.exit(1);
    }
    
    DOWNLOADED_MEDIA_ROOT = resolve(esRoot, "downloaded_media");
    if (!existsSync(DOWNLOADED_MEDIA_ROOT)) {
        console.error('\x1b[33m%s\x1b[0m', `Warning: downloaded_media directory not found: ${DOWNLOADED_MEDIA_ROOT}. Media sizes will be 0.`);
        DOWNLOADED_MEDIA_ROOT = null;
    }
}

// Helpers
const detectRegion = (filename) => {
  const regions = {
    'USA': /\(U\)|\(USA\)|\(US\)|\(North America\)/i,
    'Europe': /\(E\)|\(Europe\)|\(EUR\)/i,
    'Japan': /\(J\)|\(Japan\)|\(JP\)/i,
    'World': /\(W\)|\(World\)/i,
    'France': /\(F\)|\(France\)/i,
    'Germany': /\(G\)|\(Germany\)/i,
    'Spain': /\(S\)|\(Spain\)/i,
    'Italy': /\(I\)|\(Italy\)/i,
  };
  for (const [region, regex] of Object.entries(regions)) {
    if (regex.test(filename)) return region;
  }
  return 'Unknown';
};

const formatESDate = (dateStr) => {
  if (!dateStr || dateStr.length < 8) return '';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
};

const resolveXmlPath = (baseDir, xmlPath) => {
  if (!xmlPath) return null;
  // XML paths often start with ./
  const cleanRel = xmlPath.replace(/^\.\\/, '').replace(/^\.\//, '');
  return resolve(baseDir, cleanRel);
};

const getFileSize = (filePath) => {
  try {
    const stats = statSync(filePath);
    return stats.size;
  } catch (e) {
    return 0;
  }
};

const getDirectorySize = (dirPath) => {
    let total = 0;
    try {
        const files = readdirSync(dirPath);
        for (const file of files) {
            const filePath = join(dirPath, file);
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                total += getDirectorySize(filePath);
            } else {
                total += stat.size;
            }
        }
    } catch (e) { return 0; }
    return total;
};

const escapeCSV = (str) => {
  if (!str) return '';
  const stringVal = String(str);
  // If contains quotes, comma or newline, wrap in quotes and escape internal quotes
  if (stringVal.includes('"') || stringVal.includes(',') || stringVal.includes('\n')) {
    return `"${stringVal.replace(/"/g, '""')}"`;
  }
  return stringVal;
};

// Recursive directory walker to find gamelist.xml
const findGamelists = (dir, fileList = []) => {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch (e) { continue; }

    if (stat.isDirectory()) {
      findGamelists(fullPath, fileList);
    } else if (file.toLowerCase() === 'gamelist.xml') {
      fileList.push(fullPath);
    }
  }
  return fileList;
};

// Media size cache: { system: { romBasename: { size: number, hasManual: boolean } } }
const systemMediaCache = {};

const scanSystemMedia = (system) => {
    if (systemMediaCache[system]) return;
    systemMediaCache[system] = {};

    if (!DOWNLOADED_MEDIA_ROOT) return;
    const systemDir = join(DOWNLOADED_MEDIA_ROOT, system);
    if (!existsSync(systemDir)) return;

    try {
        const types = readdirSync(systemDir);
        for (const type of types) {
             const typePath = join(systemDir, type);
             try {
                if (statSync(typePath).isDirectory()) {
                    const files = readdirSync(typePath);
                    for (const file of files) {
                        const filePath = join(typePath, file);
                        const size = getFileSize(filePath);
                        const stem = parse(file).name; // 'Game.png' -> 'Game'; 'Game.m3u.png' -> 'Game.m3u'
                        
                        if (!systemMediaCache[system][stem]) {
                            systemMediaCache[system][stem] = { size: 0, hasManual: false };
                        }
                        systemMediaCache[system][stem].size += size;
                        
                        if (type.toLowerCase() === 'manuals') {
                            systemMediaCache[system][stem].hasManual = true;
                        }
                    }
                }
             } catch(e) {}
        }
    } catch (e) {
        console.error(`Error scanning media for ${system}:`, e.message);
    }
};

// Main Scanning Logic
const scan = () => {
  console.error('\x1b[36m%s\x1b[0m', `Starting scan...`);
  const startTime = performance.now();

  const xmlParser = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => name === 'game',
  });

  let gamelistsToProcess = [];

  if (GAMELISTS_ROOT) {
      console.error(`Mode: Split (ROMS: ${ROMS_ROOT}, XML: ${GAMELISTS_ROOT})`);
      const xmlFiles = findGamelists(GAMELISTS_ROOT);
      
      gamelistsToProcess = xmlFiles.map(xmlPath => {
          const system = basename(dirname(xmlPath));
          // In split mode, the path in XML (e.g. ./rom.zip) is relative to the ROM directory for that system
          const baseResolutionDir = join(ROMS_ROOT, system);
          return { xmlPath, system, baseResolutionDir };
      });
  } else {
      console.error(`Mode: Combined (Scanning ${ROMS_ROOT})`);
      const xmlFiles = findGamelists(ROMS_ROOT);
      
      gamelistsToProcess = xmlFiles.map(xmlPath => {
          const system = basename(dirname(xmlPath));
          // In combined mode, the path in XML is relative to the directory containing the XML
          const baseResolutionDir = dirname(xmlPath);
          return { xmlPath, system, baseResolutionDir };
      });
  }

  console.error(`Found ${gamelistsToProcess.length} gamelist.xml files.`);

  const allGames = [];

  for (const { xmlPath, system, baseResolutionDir } of gamelistsToProcess) {
    console.error(`Processing system: ${system}`);
    
    // Pre-scan media for this system if in Split mode
    if (DOWNLOADED_MEDIA_ROOT) {
        scanSystemMedia(system);
    }

    try {
      const xmlContent = readFileSync(xmlPath, 'utf8');
      const parsed = xmlParser.parse(xmlContent);

      if (!parsed.gameList || !parsed.gameList.game) {
        continue;
      }

      const games = Array.isArray(parsed.gameList.game) ? parsed.gameList.game : [parsed.gameList.game];

      for (const game of games) {
        if (!game.path) continue;

        let fullRomPath = resolveXmlPath(baseResolutionDir, game.path);
        let romFilename = basename(fullRomPath);
        
        let romSize = 0;
        
        if (existsSync(fullRomPath)) {
             try {
                 const stat = statSync(fullRomPath);
                 if (stat.isDirectory()) {
                     // If it's a directory (e.g. Game.m3u directory or Game.scummvm directory), get recursive size
                     romSize = getDirectorySize(fullRomPath);
                 } else {
                     romSize = stat.size;
                 }
             } catch(e) {
                 console.error(`  Error accessing ${romFilename}: ${e.message}`);
             }
        }

        // Calculate Media Size and Check for Manual
        let mediaSize = 0;
        let hasManual = false;

        if (DOWNLOADED_MEDIA_ROOT) {
            // New logic: Use cache derived from downloaded_media
            const stem = parse(romFilename).name;
            let totalSize = 0;
            let manualFound = false;

            // Check standard stem (e.g. "Game" from "Game.zip" or "Game.m3u")
            if (systemMediaCache[system] && systemMediaCache[system][stem]) {
                totalSize += systemMediaCache[system][stem].size;
                if (systemMediaCache[system][stem].hasManual) manualFound = true;
            }

            // Check full filename as stem (e.g. "Game.m3u" from "Game.m3u")
            // This handles cases where media is named "Game.m3u.png"
            if (stem !== romFilename && systemMediaCache[system] && systemMediaCache[system][romFilename]) {
                totalSize += systemMediaCache[system][romFilename].size;
                if (systemMediaCache[system][romFilename].hasManual) manualFound = true;
            }

            mediaSize = totalSize;
            hasManual = manualFound;
        } else {
            // Legacy logic: Use paths in XML (Standard/Combined mode)
            const mediaTags = ['image', 'thumbnail', 'video', 'manual', 'marquee'];
            for (const tag of mediaTags) {
                if (game[tag]) {
                    const mediaPath = resolveXmlPath(baseResolutionDir, game[tag]);
                    const size = getFileSize(mediaPath);
                    mediaSize += size;
                    if (tag === 'manual' && size > 0) {
                        hasManual = true;
                    }
                }
            }
        }

        allGames.push({
            system,
            title: game.name || 'Unknown',
            romFilename: romFilename,
            region: detectRegion(romFilename) || detectRegion(game.name || ''),
            developer: game.developer || '',
            publisher: game.publisher || '',
            genre: game.genre || '',
            releaseDate: formatESDate(game.releasedate),
            rating: game.rating ? parseFloat(game.rating).toFixed(2) : '',
            playCount: game.playcount || 0,
            romSize,
            mediaSize,
            hasManual
        });
      }

    } catch (err) {
      console.error(`  Failed to parse ${xmlPath}: ${err.message}`);
    }
  }

  // Generate CSV
  const headers = [
    'System', 'Title', 'ROM Filename', 'Region', 
    'Developer', 'Publisher', 'Genre', 'Release Date', 
    'Rating', 'Play Count', 'ROM Size (Bytes)', 'Media Size (Bytes)', 'Has Manual'
  ];

  console.log(headers.join(','));

  for (const g of allGames) {
    const row = [
        escapeCSV(g.system),
        escapeCSV(g.title),
        escapeCSV(g.romFilename),
        escapeCSV(g.region),
        escapeCSV(g.developer),
        escapeCSV(g.publisher),
        escapeCSV(g.genre),
        escapeCSV(g.releaseDate),
        g.rating,
        g.playCount,
        g.romSize,
        g.mediaSize,
        g.hasManual ? 'TRUE' : 'FALSE'
    ];
    console.log(row.join(','));
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);
  console.error('\x1b[32m%s\x1b[0m', `\nScan complete! Processed ${allGames.length} games in ${duration}s.`);
};

scan();
