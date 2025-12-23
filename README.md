# AI Chess Analyzer

A powerful chess analysis tool with Stockfish engine integration, AI coaching (Gemini), and interactive puzzles.

## 🚀 Recent Features

- **Guest Mode**: Access the app without needing a Google account.
- **Feedback System**: Send bugs, feature requests, or general feedback directly to the developers (stored in Firestore).
- **AI Coach**: Interactive analysis powered by Google Gemini.
- **Interactive Puzzles**: Solve puzzles from Firebase with a gamified rating system.

## 🛠️ Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

## 🌐 Deployment (Free Hosting)

### Option 1: Firebase Hosting (Recommended)
This project is already pre-configured for your Firebase project `studio-9805492877-a9de0`.

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Login to Firebase:
   ```bash
   firebase login
   ```
3. Build and Deploy:
   ```bash
   npm run build
   && firebase deploy
   ```

### Option 2: Vercel / Netlify
1. Connect your GitHub repository to [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
2. Set the build command to `npm run build` and the output directory to `dist`.
3. Add your environment variables (VITE_FIREBASE_*) if needed.

## ⚙️ Configuration
- **Firebase**: Configured in `src/config/firebase.js`.
- **AI Coach**: Enter your Gemini API key in the app settings (top right).
