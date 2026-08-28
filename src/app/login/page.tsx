'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { Compass, Loader2, Lock, User } from 'lucide-react'
import { Suspense } from 'react'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const [isLogin, setIsLogin] = useState(true)
  const [pseudo, setPseudo] = useState('')
  const [identifier, setIdentifier] = useState('') // Remplacement de 'email' pour accepter email ou pseudo
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isLogin) {
        let emailToLogin = identifier.trim()

        // Si l'utilisateur n'a pas tapé d'e-mail (pas de '@'), on cherche l'e-mail correspondant au pseudo
        if (!emailToLogin.includes('@')) {
          const { data: fetchedEmail, error: rpcError } = await supabase.rpc('get_email_by_username', {
            p_username: emailToLogin
          })

          if (rpcError || !fetchedEmail) {
            throw new Error("Aucun compte trouvé avec ce pseudo ou cet e-mail.")
          }
          emailToLogin = fetchedEmail
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: emailToLogin,
          password,
        })
        if (signInError) throw signInError
        router.push(returnTo)      
      } else {
        if (!pseudo.trim()) throw new Error("Le pseudo est obligatoire.")
        if (!identifier.trim()) throw new Error("L'adresse email est obligatoire.")

        // Vérifier si le pseudo existe déjà dans la base
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .ilike('name', pseudo.trim())
          .maybeSingle()

        if (existingUser) {
          throw new Error("Ce pseudo est déjà pris, choisis-en un autre !")
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email: identifier.trim(),
          password,
          options: {
            data: { pseudo: pseudo.trim() } // Envoie le pseudo à Supabase
          }
        })
        if (signUpError) throw signUpError
        router.push(returnTo)
      }
    } catch (err: any) {
      setError(err.message === "Invalid login credentials" ? "Identifiant ou mot de passe incorrect." : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-indigo-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Compass size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight mb-2">TripPlanner</h1>
          <p className="text-indigo-100 font-medium text-sm">
            {isLogin ? "Ravi de te revoir !" : "Rejoins l'aventure."}
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Pseudo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                    <User size={18} />
                  </div>
                  <input 
                    type="text" 
                    value={pseudo}
                    onChange={(e) => setPseudo(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none font-medium text-gray-900"
                    placeholder="Ton pseudo (unique)"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-2">
                {isLogin ? "Adresse Email ou Pseudo" : "Adresse Email"}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <User size={18} />
                </div>
                <input 
                  type="text" // Changé de 'email' à 'text' pour accepter les pseudos sans '@' lors du login
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none font-medium text-gray-900"
                  placeholder={isLogin ? "Ton email ou ton pseudo" : "toi@exemple.com"}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Mot de passe</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <Lock size={18} />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none font-medium text-gray-900"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-4"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {isLogin ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(null); }}
              className="text-sm font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
            >
              {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <LoginContent />
    </Suspense>
  )
}