import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { Cpu } from 'lucide-react';

export default function LoginPage({ onLogin }) {
    const [error, setError] = useState(null);

    const handleGoogleLogin = async () => {
        try {
            setError(null);
            await signInWithPopup(auth, googleProvider);
            // Auth state change will be picked up by App.jsx listener
        } catch (err) {
            console.error("Login failed", err);
            setError(`Failed to sign in: ${err.code} - ${err.message}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 text-center">
            <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700 flex flex-col items-center gap-6">

                {/* Logo / Branding */}
                <div className="flex flex-col items-center gap-2">
                    <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mb-2">
                        <Cpu size={40} />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">AI Chess Analyzer</h1>
                    <p className="text-gray-400">Master your game with advanced AI analysis</p>
                </div>

                {/* Login Button */}
                <button
                    onClick={handleGoogleLogin}
                    className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 px-4 rounded flex items-center justify-center gap-3 transition-colors shadow-lg"
                >
                    {/* Google Icon SVG */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Sign in with Google
                </button>

                <div className="flex items-center w-full gap-4">
                    <div className="flex-1 h-px bg-gray-700"></div>
                    <span className="text-gray-500 text-sm">OR</span>
                    <div className="flex-1 h-px bg-gray-700"></div>
                </div>

                <button
                    onClick={() => onLogin({ isGuest: true, displayName: 'Guest User' })}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded transition-colors"
                >
                    Continue as Guest
                </button>

                {error && (
                    <div className="text-red-400 text-sm bg-red-900/30 p-2 rounded w-full">
                        {error}
                    </div>
                )}

                <div className="text-xs text-gray-500 mt-4">
                    By signing in, you agree to our Terms of Service and Privacy Policy.
                </div>
            </div>
        </div>
    );
}
