'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { Compass, Plus, Key, Users, Loader2, ChevronRight, X, MapPin, Archive, ArchiveRestore, Moon, Sun } from 'lucide-react'
import Link from 'next/link'

type Trip = {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  role?: string;
  is_archived?: boolean;
}

export default function Dashboard() {
  const router = useRouter()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  // États pour les modales
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)

  // États pour les formulaires
  const [newTripName, setNewTripName] = useState('')
  const [newTripDesc, setNewTripDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUserAndTrips()
  }, [])

  async function fetchUserAndTrips() {
    try {
      setLoading(true)
      const { data: { session }, error: authError } = await supabase.auth.getSession()

      if (authError || !session) {
        router.push('/login')
        return
      }
      
      setUser(session.user)

      // Récupérer les voyages et le statut d'archivage personnel
      const { data: memberData, error: tripsError } = await supabase
        .from('trip_members')
        .select(`role, is_archived, trips ( id, name, description, invite_code, created_at )`)
        .eq('user_id', session.user.id)

      if (tripsError) throw tripsError

      if (memberData) {
        const loadedTrips = memberData.map((m: any) => ({ 
          ...m.trips, 
          role: m.role,
          is_archived: m.is_archived 
        }))
        loadedTrips.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setTrips(loadedTrips)
      }

    } catch (err: any) {
      setError("Impossible de charger les voyages.")
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTripName.trim() || !user) return

    try {
      setActionLoading(true)
      setError(null)

      // 1. Créer le voyage
      const { data: trip, error: createError } = await supabase
        .from('trips')
        .insert([{ name: newTripName.trim(), description: newTripDesc.trim() || null }])
        .select()
        .single()

      if (createError) throw createError

      // 2. S'ajouter en tant qu'admin
      const { error: memberError } = await supabase
        .from('trip_members')
        .insert([{ trip_id: trip.id, user_id: user.id, role: 'admin' }])

      if (memberError) throw memberError
      
      router.push(`/trip/${trip.id}`)

    } catch (err: any) {
      setError(err.message)
      setActionLoading(false)
    }
  }

  const handleJoinTrip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim() || !user) return

    try {
      setActionLoading(true)
      setError(null)

      // 1. Chercher le voyage avec le code d'invitation
      const { data: trip, error: searchError } = await supabase
        .from('trips')
        .select('id, name')
        .eq('invite_code', joinCode.trim())
        .single()

      if (searchError || !trip) throw new Error("Code invalide ou voyage introuvable.")

      // 2. Vérifier si on est déjà membre
      const { data: existingMember } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', trip.id)
        .eq('user_id', user.id)
        .single()

      if (existingMember) {
        router.push(`/trip/${trip.id}`)
        return
      }

      // 3. Rejoindre le voyage
      const { error: joinError } = await supabase
        .from('trip_members')
        .insert([{ trip_id: trip.id, user_id: user.id, role: 'member' }])

      if (joinError) throw joinError
      
      router.push(`/trip/${trip.id}`)

    } catch (err: any) {
      setError(err.message)
      setActionLoading(false)
    }
  }

  const toggleArchive = async (tripId: string, currentStatus: boolean | undefined, e: React.MouseEvent) => {
    e.preventDefault(); // Empêche le clic de déclencher le <Link> vers le voyage
    e.stopPropagation();
    
    const newStatus = !currentStatus;
    
    try {
      const { error } = await supabase
        .from('trip_members')
        .update({ is_archived: newStatus })
        .eq('trip_id', tripId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Met à jour l'interface instantanément sans recharger la base
      setTrips(trips.map(t => t.id === tripId ? { ...t, is_archived: newStatus } : t));
    } catch (err: any) {
      alert("Erreur lors de l'archivage : " + err.message);
    }
  }

  const activeTrips = trips.filter(t => !t.is_archived);
  const archivedTrips = trips.filter(t => t.is_archived);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 gap-2"><Loader2 size={24} className="animate-spin" /> Chargement du tableau de bord...</div>

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary-600 mb-1">
              <Compass size={24} />
              <span className="font-black text-xl tracking-tight">TripPlanner</span>
            </div>
            <p className="text-sm text-gray-500">Organise tes séjours entre amis sans prise de tête.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 transition-colors flex items-center gap-2">
              <Users size={14} /> Mon Profil
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <button onClick={() => { setShowCreateModal(true); setError(null); }} className="flex flex-col items-center justify-center gap-3 bg-primary-600 text-white p-8 rounded-3xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 group">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Plus size={24} /></div>
            <span className="font-black text-lg">Créer un nouveau voyage</span>
          </button>
          
          <button onClick={() => { setShowJoinModal(true); setError(null); }} className="flex flex-col items-center justify-center gap-3 bg-white border border-gray-200 text-gray-800 p-8 rounded-3xl hover:border-primary-300 hover:shadow-md transition-all group">
            <div className="w-12 h-12 bg-gray-50 text-primary-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Key size={24} /></div>
            <span className="font-black text-lg">Rejoindre avec un code</span>
          </button>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><MapPin size={20} className="text-primary-600" /> Mes voyages en cours</h2>
          
          {activeTrips.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-100 shadow-sm">
              <Compass size={48} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-bold text-gray-800 mb-1">Aucun voyage à l'horizon</h3>
              <p className="text-gray-500 text-sm">Crée ton premier voyage ou rejoins celui de tes amis !</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {activeTrips.map(trip => (
                <Link key={trip.id} href={`/trip/${trip.id}`} className="block group">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all h-full flex flex-col relative">
                    
                    <button 
                      onClick={(e) => toggleArchive(trip.id, trip.is_archived, e)}
                      className="absolute top-4 right-4 p-2 bg-gray-50 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      title="Archiver ce voyage"
                    >
                      <Archive size={16} />
                    </button>

                    <div className="flex-1 pr-8">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-black text-xl text-gray-800 group-hover:text-primary-600 transition-colors line-clamp-1">{trip.name}</h3>
                        {trip.role === 'admin' && <span className="bg-orange-50 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider">Admin</span>}
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2 mb-4">{trip.description || "Aucune description"}</p>
                    </div>
                    <div className="pt-4 border-t border-gray-50 flex items-center justify-between mt-auto">
                      <div className="text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-1 rounded-md">Code: {trip.invite_code}</div>
                      <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 group-hover:bg-primary-600 group-hover:text-white transition-colors"><ChevronRight size={16} /></div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {archivedTrips.length > 0 && (
          <div className="mt-16 space-y-4">
            <h2 className="text-xl font-bold text-gray-400 flex items-center gap-2"><Archive size={20} /> Voyages archivés</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 opacity-70 hover:opacity-100 transition-opacity">
              {archivedTrips.map(trip => (
                <Link key={trip.id} href={`/trip/${trip.id}`} className="block group">
                  <div className="bg-gray-50 p-5 rounded-3xl border border-gray-200 hover:shadow-md transition-all h-full flex flex-col relative">
                    
                    <button 
                      onClick={(e) => toggleArchive(trip.id, trip.is_archived, e)}
                      className="absolute top-4 right-4 p-2 bg-white text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl shadow-sm transition-all"
                      title="Désarchiver (remettre en cours)"
                    >
                      <ArchiveRestore size={16} />
                    </button>

                    <div className="flex-1 pr-8">
                      <h3 className="font-bold text-gray-600 group-hover:text-primary-600 transition-colors line-clamp-1 mb-1">{trip.name}</h3>
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                        Code: {trip.invite_code}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL CREER UN VOYAGE */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-xl text-gray-800">Nouveau voyage</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 bg-white rounded-xl text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100"><X size={18}/></button>
            </div>
            <form onSubmit={handleCreateTrip} className="p-6 space-y-5">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">{error}</div>}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Où allez-vous ?</label>
                <input type="text" value={newTripName} onChange={e => setNewTripName(e.target.value)} placeholder="Ex: Week-end Ardèche 🏕️" required autoFocus className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none font-semibold text-gray-800" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Description (Optionnel)</label>
                <textarea value={newTripDesc} onChange={e => setNewTripDesc(e.target.value)} placeholder="Ex: Du 12 au 15 Août." className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none h-24" />
              </div>
              <button type="submit" disabled={actionLoading || !newTripName.trim()} className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-primary-700 shadow-md shadow-primary-200 transition-all disabled:opacity-50 flex justify-center items-center gap-2">
                {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Créer le voyage
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REJOINDRE UN VOYAGE */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-xl text-gray-800">Rejoindre les copains</h3>
              <button onClick={() => setShowJoinModal(false)} className="p-2 bg-white rounded-xl text-gray-400 hover:text-gray-600 shadow-sm border border-gray-100"><X size={18}/></button>
            </div>
            <form onSubmit={handleJoinTrip} className="p-6 space-y-5">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">{error}</div>}
              <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Code d'invitation</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400"><Key size={18} /></div>
                  <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Ex: a1b2c3d4" required autoFocus maxLength={8} className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg tracking-widest focus:ring-2 focus:ring-primary-500 outline-none font-black text-gray-800" />
                </div>
              </div>
              <button type="submit" disabled={actionLoading || joinCode.length < 4} className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-primary-700 shadow-md shadow-primary-200 transition-all disabled:opacity-50 flex justify-center items-center gap-2 mt-4">
                {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />} C'est parti !
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}