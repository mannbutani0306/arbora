import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';
import { ArboraLogo } from '../components/ArboraLogo';

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle, user, isConfigured } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // If already signed in, navigate to history or playground
  if (user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-[#1C1917] mb-2">Signed in</h1>
        <p className="text-xs text-[#78716C] mb-4">Signed in as {user.email}</p>
        <button
          onClick={() => navigate('/history')}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
        >
          View history
        </button>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm bg-white border border-[#E7E5E4] rounded-xl p-6 shadow-2xs">
          <h1 className="text-lg font-semibold text-[#1C1917] mb-2">Backend not configured</h1>
          <p className="text-xs text-[#78716C] mb-4">
            Configure Supabase to enable sign-in and cloud storage.
          </p>
          <Link
            to="/playground"
            className="inline-flex px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
          >
            Open playground
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Fill all fields');
      return;
    }
    if (isSignUp && password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUpWithEmail(email, password);
        if (error) {
          toast.error(error.message || 'Sign up failed');
        } else {
          toast.success('Account created');
          navigate('/history');
        }
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          toast.error(error.message || 'Sign in failed');
        } else {
          toast.success('Signed in');
          navigate('/history');
        }
      }
    } catch {
      toast.error('Authentication error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error.message || 'Google sign in failed');
      }
    } catch {
      toast.error('Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-[#E7E5E4] rounded-xl p-6 shadow-2xs">
        <div className="flex justify-center mb-4">
          <ArboraLogo size={36} showWordmark={false} />
        </div>

        <h1 className="text-lg font-semibold text-[#1C1917] text-center mb-1">
          {isSignUp ? 'Create account' : 'Sign in'}
        </h1>
        <p className="text-xs text-[#78716C] text-center mb-6">
          {isSignUp ? 'Save trees and runs.' : 'Access your saved ASTs.'}
        </p>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full mb-3 py-2 px-3 rounded-xl border border-[#E7E5E4] bg-white hover:bg-stone-50 text-xs font-medium text-[#1C1917] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Google
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E7E5E4]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-white px-2 text-[#78716C]">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-[#1C1917] mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="w-full px-3 py-1.5 text-xs bg-white border border-[#E7E5E4] rounded-lg text-[#1C1917] placeholder:text-[#78716C]/60 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-[#1C1917] mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={isSignUp ? 8 : undefined}
              required
              className="w-full px-3 py-1.5 text-xs bg-white border border-[#E7E5E4] rounded-lg text-[#1C1917] placeholder:text-[#78716C]/60 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-3 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-[#78716C]">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="hover:text-[#1C1917] transition-colors"
          >
            {isSignUp ? 'Have an account? Sign in' : 'Need an account? Sign up'}
          </button>
          <Link to="/playground" className="hover:text-[#1C1917] transition-colors">
            Guest playground
          </Link>
        </div>
      </div>
    </div>
  );
}
