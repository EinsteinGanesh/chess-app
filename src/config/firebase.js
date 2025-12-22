// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, query, where, orderBy, limit } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCvNxhPpJuET5YG6OH_i-VBxF9X5dZCofw",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studio-9805492877-a9de0.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studio-9805492877-a9de0",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studio-9805492877-a9de0.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "608453936301",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:608453936301:web:ed3b86f12864818b7d7224"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
import { getAuth, GoogleAuthProvider } from "firebase/auth";
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Collection reference
export const puzzlesCollection = collection(db, 'puzzles');

/**
 * Fetch all puzzles from Firestore
 * @returns {Promise<Array>} Array of puzzle objects
 */
export async function getAllPuzzles() {
    try {
        const querySnapshot = await getDocs(puzzlesCollection);
        const puzzles = [];
        querySnapshot.forEach((doc) => {
            puzzles.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return puzzles;
    } catch (error) {
        console.error("Error fetching puzzles:", error);
        throw error;
    }
}

/**
 * Fetch a single puzzle by ID
 * @param {string} puzzleId - The puzzle ID
 * @returns {Promise<Object>} Puzzle object
 */
export async function getPuzzleById(puzzleId) {
    try {
        const docRef = doc(db, 'puzzles', puzzleId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        } else {
            throw new Error("Puzzle not found");
        }
    } catch (error) {
        console.error("Error fetching puzzle:", error);
        throw error;
    }
}

/**
 * Fetch puzzles filtered by rating range
 * @param {number} minRating - Minimum rating
 * @param {number} maxRating - Maximum rating
 * @param {number} limitCount - Maximum number of puzzles to return
 * @returns {Promise<Array>} Array of puzzle objects
 */
export async function getPuzzlesByRating(minRating, maxRating, limitCount = 50) {
    try {
        const q = query(
            puzzlesCollection,
            where('rating', '>=', minRating),
            where('rating', '<=', maxRating),
            orderBy('rating'),
            limit(limitCount)
        );

        const querySnapshot = await getDocs(q);
        const puzzles = [];
        querySnapshot.forEach((doc) => {
            puzzles.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return puzzles;
    } catch (error) {
        console.error("Error fetching puzzles by rating:", error);
        throw error;
    }
}

/**
 * Fetch puzzles filtered by theme
 * @param {string} theme - Theme to filter by (e.g., "mate", "endgame")
 * @param {number} limitCount - Maximum number of puzzles to return
 * @returns {Promise<Array>} Array of puzzle objects
 */
export async function getPuzzlesByTheme(theme, limitCount = 50) {
    try {
        // Note: This requires array-contains query
        const q = query(
            puzzlesCollection,
            where('themes', 'array-contains', theme),
            limit(limitCount)
        );

        const querySnapshot = await getDocs(q);
        const puzzles = [];
        querySnapshot.forEach((doc) => {
            puzzles.push({
                id: doc.id,
                ...doc.data()
            });
        });
        return puzzles;
    } catch (error) {
        console.error("Error fetching puzzles by theme:", error);
        throw error;
    }
}

/**
 * Get a random puzzle from a set
 * @param {number} minRating - Minimum rating (optional)
 * @param {number} maxRating - Maximum rating (optional)
 * @returns {Promise<Object>} Random puzzle object
 */
export async function getRandomPuzzle(minRating = 0, maxRating = 3000) {
    try {
        const puzzles = await getPuzzlesByRating(minRating, maxRating, 100);
        if (puzzles.length === 0) {
            throw new Error("No puzzles found in the specified rating range");
        }
        const randomIndex = Math.floor(Math.random() * puzzles.length);
        return puzzles[randomIndex];
    } catch (error) {
        console.error("Error fetching random puzzle:", error);
        throw error;
    }
}

export default app;
