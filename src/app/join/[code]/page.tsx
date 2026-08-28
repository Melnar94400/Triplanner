'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { Loader2, Users, ArrowRight } from 'lucide-react'

export default function JoinTripPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    async function handleJoin() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        setSession(currentSession)

        if (!currentSession) {
          setLoading(false)
          return
        }

        const { data: tripData, error: tripError } = await supabase
          .from('trips')
          .select('*')
          .eq('invite_code', code)
          .single()

        if (tripError || !tripData) {
          setError("Ce lien d'invitation est invalide ou le voyage n'existe plus.")
          setLoading(false)
          return
        }

        const { data: memberData } = await supabase
          .from('trip_members')
          .select('*')
          .eq('trip_id', tripData.id)
          .eq('user_id', currentSession.user.id)
          .single()

        if (!memberData) {
          await supabase.from('trip_members').insert({
            trip_id: tripData.id,
            user_id: currentSession.user.id,
            role: 'member'
          })
        }

        router.push(`/trip/${tripData.id}`)

      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    if (code) {
      handleJoin()
    }
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center justify-center gap-3 text-gray-600 font-sans">
        <Loader2 size={32} className="animate-spin text-[#9a3412]" />
        <p className="font-bold text-sm">Rejoindre le voyage en cours...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white border border-[#d2e4d8] w-full max-w-md p-8 rounded-3xl shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-[#a8d4b7] rounded-2xl mx-auto flex items-center justify-center text-[#16221a]">
            <Users size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#16221a] mb-2">Invitation à un voyage 🎒</h1>
            <p className="text-sm text-[#2c3d31]">Connectez-vous ou créez un compte pour rejoindre ce séjour entre amis.</p>
          </div>
          <button 
            onClick={() => router.push('/login')} 
            className="w-full bg-[#9a3412] text-white py-3.5 rounded-xl font-bold shadow-md hover:bg-[#7c2d12] transition-all flex items-center justify-center gap-2"
          >
            Se connecter pour rejoindre <ArrowRight size={18} />
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f0f5f2] flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white border border-red-200 w-full max-w-md p-8 rounded-3xl shadow-sm text-center space-y-4">
          <h1 className="text-xl font-black text-red-600">Oups !</h1>
          <p className="text-sm text-[#16221a]">{error}</p>
          <button 
            onClick={() => router.push('/')} 
            className="w-full bg-[#16221a] text-white py-3 rounded-xl font-bold shadow-md"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    )
  }

  return null
}