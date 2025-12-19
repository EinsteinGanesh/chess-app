import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convert Excel file to JSON format
 * Usage: node excel-to-json.js [path-to-excel-file]
 */

// Get Excel file path from command line argument
const excelFilePath = process.argv[2] || 'C:\\Users\\User\\Downloads\\chess puzzle.xlsx';

console.log('📖 Reading Excel file:', excelFilePath);

try {
    // Read the Excel file
    const workbook = XLSX.readFile(excelFilePath);

    // Get the first sheet name
    const sheetName = workbook.SheetNames[0];
    console.log('📄 Processing sheet:', sheetName);

    // Convert sheet to JSON
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`✅ Found ${rawData.length} puzzles`);

    // Transform data to match our schema
    const puzzles = rawData.map((row, index) => {
        try {
            // Handle different possible column names (case-insensitive)
            const getProp = (obj, possibleNames) => {
                for (const name of possibleNames) {
                    if (obj[name] !== undefined) return obj[name];
                    // Try case-insensitive match
                    const key = Object.keys(obj).find(k => k.toLowerCase() === name.toLowerCase());
                    if (key) return obj[key];
                }
                return null;
            };

            const puzzle = {
                PuzzleId: getProp(row, ['PuzzleId', 'Puzzle ID', 'ID', 'puzzleId']),
                FEN: getProp(row, ['FEN', 'fen']),
                Moves: getProp(row, ['Moves', 'moves', 'Solution']),
                Rating: parseInt(getProp(row, ['Rating', 'rating']) || 1500),
                RatingDev: parseInt(getProp(row, ['RatingDev', 'Rating Dev', 'ratingDev']) || 75),
                Popularity: parseInt(getProp(row, ['Popularity', 'popularity']) || 0),
                NbPlays: parseInt(getProp(row, ['NbPlays', 'Nb Plays', 'nbPlays', 'Plays']) || 0),
                Themes: getProp(row, ['Themes', 'themes', 'Tags', 'tags']) || '',
                GameUrl: getProp(row, ['GameUrl', 'Game URL', 'URL', 'gameUrl']) || ''
            };

            // Validate required fields
            if (!puzzle.PuzzleId || !puzzle.FEN || !puzzle.Moves) {
                console.warn(`⚠️  Row ${index + 1}: Missing required fields (PuzzleId, FEN, or Moves)`);
                return null;
            }

            // Convert themes to array if it's a string
            if (typeof puzzle.Themes === 'string') {
                puzzle.Themes = puzzle.Themes.split(/[\s,]+/).filter(t => t.length > 0);
            }

            return puzzle;
        } catch (error) {
            console.error(`❌ Error processing row ${index + 1}:`, error.message);
            return null;
        }
    }).filter(p => p !== null); // Remove null entries

    console.log(`✅ Successfully processed ${puzzles.length} valid puzzles`);

    // Save to JSON file
    const outputPath = join(__dirname, '..', 'src', 'data', 'puzzles-from-excel.json');
    writeFileSync(outputPath, JSON.stringify(puzzles, null, 2));

    console.log('💾 Saved to:', outputPath);

    // Display sample data
    console.log('\n📊 Sample puzzle:');
    console.log(JSON.stringify(puzzles[0], null, 2));

    // Display statistics
    console.log('\n📈 Statistics:');
    console.log(`   Total puzzles: ${puzzles.length}`);

    const ratings = puzzles.map(p => p.Rating).filter(r => !isNaN(r));
    if (ratings.length > 0) {
        console.log(`   Rating range: ${Math.min(...ratings)} - ${Math.max(...ratings)}`);
        console.log(`   Average rating: ${Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)}`);
    }

    // Count unique themes
    const allThemes = new Set();
    puzzles.forEach(p => {
        if (Array.isArray(p.Themes)) {
            p.Themes.forEach(t => allThemes.add(t));
        }
    });
    console.log(`   Unique themes: ${allThemes.size}`);
    if (allThemes.size > 0) {
        console.log(`   Themes: ${Array.from(allThemes).slice(0, 10).join(', ')}${allThemes.size > 10 ? '...' : ''}`);
    }

    console.log('\n✅ Conversion complete!');
    console.log('📝 Next step: Run "node scripts/upload-puzzles.js" to upload to Firebase');

} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nUsage: node excel-to-json.js [path-to-excel-file]');
    console.error('Example: node excel-to-json.js "C:\\Users\\User\\Downloads\\chess puzzle.xlsx"');
    process.exit(1);
}
