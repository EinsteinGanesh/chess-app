import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Upload puzzles from JSON to Firebase Firestore
 * Usage: node upload-puzzles.js [--limit N]
 */

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCvNxhPpJuET5YG6OH_i-VBxF9X5dZCofw",
    authDomain: "studio-9805492877-a9de0.firebaseapp.com",
    projectId: "studio-9805492877-a9de0",
    storageBucket: "studio-9805492877-a9de0.firebasestorage.app",
    messagingSenderId: "608453936301",
    appId: "1:608453936301:web:ed3b86f12864818b7d7224"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Parse command line arguments
const args = process.argv.slice(2);
let limitCount = null;
let jsonFilePath = join(__dirname, '..', 'src', 'data', 'puzzles-from-excel.json');

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
        limitCount = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--file' && args[i + 1]) {
        jsonFilePath = args[i + 1];
        i++;
    }
}

console.log('🚀 Starting Firebase upload...\n');

async function uploadPuzzles() {
    try {
        // Read JSON file
        console.log('📖 Reading JSON file:', jsonFilePath);
        const jsonData = readFileSync(jsonFilePath, 'utf-8');
        let puzzles = JSON.parse(jsonData);

        // Apply limit if specified
        if (limitCount) {
            puzzles = puzzles.slice(0, limitCount);
            console.log(`⚠️  Limiting upload to ${limitCount} puzzles for testing\n`);
        }

        console.log(`📊 Total puzzles to upload: ${puzzles.length}\n`);

        // Firestore has a limit of 500 operations per batch
        const BATCH_SIZE = 500;
        const batches = [];

        for (let i = 0; i < puzzles.length; i += BATCH_SIZE) {
            batches.push(puzzles.slice(i, i + BATCH_SIZE));
        }

        console.log(`📦 Split into ${batches.length} batch(es)\n`);

        let totalUploaded = 0;
        let totalErrors = 0;

        // Process each batch
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = writeBatch(db);
            const currentBatch = batches[batchIndex];

            console.log(`📤 Processing batch ${batchIndex + 1}/${batches.length} (${currentBatch.length} puzzles)...`);

            for (const puzzle of currentBatch) {
                try {
                    // Convert PuzzleId to string (in case it's a number)
                    const puzzleId = String(puzzle.PuzzleId);

                    // Use PuzzleId as document ID
                    const docRef = doc(db, 'puzzles', puzzleId);

                    // Prepare data (remove PuzzleId from data since it's the document ID)
                    const { PuzzleId, ...puzzleData } = puzzle;

                    // Ensure all fields are the correct type
                    const cleanData = {
                        ...puzzleData,
                        Rating: Number(puzzleData.Rating) || 1500,
                        RatingDev: Number(puzzleData.RatingDev) || 75,
                        Popularity: Number(puzzleData.Popularity) || 0,
                        NbPlays: Number(puzzleData.NbPlays) || 0,
                        FEN: String(puzzleData.FEN || ''),
                        Moves: String(puzzleData.Moves || ''),
                        GameUrl: String(puzzleData.GameUrl || ''),
                        Themes: Array.isArray(puzzleData.Themes) ? puzzleData.Themes : []
                    };

                    // Add to batch
                    batch.set(docRef, cleanData);

                } catch (error) {
                    console.error(`   ❌ Error preparing puzzle ${puzzle.PuzzleId}:`, error.message);
                    totalErrors++;
                }
            }

            // Commit the batch
            try {
                await batch.commit();
                totalUploaded += currentBatch.length;
                console.log(`   ✅ Batch ${batchIndex + 1} uploaded successfully (${totalUploaded}/${puzzles.length})\n`);
            } catch (error) {
                console.error(`   ❌ Error committing batch ${batchIndex + 1}:`, error.message);

                if (error.message.includes('PERMISSION_DENIED')) {
                    console.error(`\n   🔒 PERMISSION ERROR DETECTED!`);
                    console.error(`   Fix: Update Firestore security rules to allow writes`);
                    console.error(`   Go to: https://console.firebase.google.com/project/studio-9805492877-a9de0/firestore/rules`);
                    console.error(`   Change "allow write: if request.auth != null;" to "allow write: if true;"\n`);
                }

                totalErrors += currentBatch.length;
            }

            // Add a small delay between batches to avoid rate limiting
            if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Upload Summary:');
        console.log('='.repeat(50));
        console.log(`✅ Successfully uploaded: ${totalUploaded} puzzles`);
        if (totalErrors > 0) {
            console.log(`❌ Errors: ${totalErrors}`);
        }
        console.log('='.repeat(50));

        console.log('\n🎉 Upload complete!');
        console.log('🔍 Check your Firebase Console: https://console.firebase.google.com/');
        console.log(`📍 Project: ${firebaseConfig.projectId}`);
        console.log('📂 Collection: puzzles\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        console.error('\nMake sure:');
        console.error('1. You have run "node scripts/excel-to-json.js" first');
        console.error('2. Firestore is enabled in your Firebase Console');
        console.error('3. You have internet connection\n');
        process.exit(1);
    }
}

// Run the upload
uploadPuzzles();
