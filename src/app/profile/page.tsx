'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Cropper from 'react-easy-crop'
import { ChevronLeft, Camera, Loader2, Save, LogOut, Lock, Trash2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

// --- UTILITAIRE DE RECADRAGE (CANVAS OPTIMISÉ) ---
async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  
  const TARGET_SIZE = 250;
  canvas.width = TARGET_SIZE; 
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D manquant');
  
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, TARGET_SIZE, TARGET_SIZE);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => { if (!blob) reject(new Error('Canvas vide')); else resolve(blob); }, 'image/jpeg', 0.7);
  });
}

export default function ProfilePage() {
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // États pour le recadrage
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  // États pour le changement de mot de passe
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    async function fetchProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return router.push('/login')
      setUser(session.user)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (profile) {
        setName(profile.name || '')
        setAvatar(profile.avatar || '👤')
      }
      setLoading(false)
    }
    fetchProfile()
  }, [])

  // 1. L'utilisateur sélectionne un fichier
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null))
      reader.readAsDataURL(file)
    }
  }

  // 2. Le module met à jour les coordonnées du crop
  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  // 3. Validation du crop et Upload
  const handleCropSave = async () => {
    if (!imageSrc || !croppedAreaPixels || !user) return
    setSaving(true)
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      
      const filePath = `${user.id}/avatar.jpg`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, croppedBlob, { upsert: true })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const finalUrl = `${data.publicUrl}?t=${Date.now()}`
      
      setAvatar(finalUrl)
      setImageSrc(null)

      await supabase.from('profiles').update({ avatar: finalUrl }).eq('id', user.id)

    } catch (e: any) {
      alert("Erreur lors de l'envoi : " + e.message)
    } finally {
      setSaving(false)
    }
  }

  // Gestion du changement de mot de passe sécurisé
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage({ text: "Le mot de passe doit contenir au moins 6 caractères.", type: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: "Les mots de passe ne correspondent pas.", type: 'error' })
      return
    }

    setPasswordLoading(true)
    setPasswordMessage(null)

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordMessage({ text: "Mot de passe mis à jour avec succès !", type: 'success' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPasswordMessage({ text: err.message, type: 'error' })
    } finally {
      setPasswordLoading(false)
    }
  }

  // Sauvegarde globale du profil
  const handleSaveProfile = async () => {
    if (!name.trim()) return alert("Le nom est obligatoire")
    setSaving(true)
    try {
      await supabase.from('profiles').upsert({ id: user.id, name: name.trim(), avatar: avatar })
      alert("Profil mis à jour !")
      router.push('/')
    } catch (err: any) {
      alert("Erreur : " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Suppression du compte
  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm("🚨 Attention ! Es-tu sûr de vouloir supprimer définitivement ton compte ? Cette action est irréversible.")
    if (!confirmDelete) return

    setSaving(true)
    try {
      const { error } = await supabase.rpc('delete_own_account')
      if (error) throw error

      await supabase.auth.signOut()
      router.push('/login')
    } catch (err: any) {
      alert("Erreur lors de la suppression : " + err.message)
      setSaving(false)
    }
  }

  if (loading) return <div className="h-screen flex justify-center items-center"><Loader2 className="animate-spin text-gray-400" /></div>

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6 my-8">
        <div className="flex justify-between items-center mb-2">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-indigo-600 flex items-center gap-1 text-sm font-bold transition-colors">
            <ChevronLeft size={16} /> Retour
          </button>
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
            className="text-gray-400 hover:text-indigo-600 flex items-center gap-1 text-sm font-bold transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} Thème
          </button>
          <button onClick={handleLogout} className="text-gray-400 hover:text-gray-800 text-sm font-bold flex items-center gap-1 transition-colors">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>

        <h1 className="text-2xl font-black text-gray-800 text-center">Mon Profil</h1>

        <div className="flex flex-col items-center relative">
          <div className="w-24 h-24 rounded-full bg-indigo-50 border-4 border-white shadow-md flex items-center justify-center text-4xl overflow-hidden relative group">
            {avatar.startsWith('http') ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span>{avatar}</span>
            )}
            
            <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-sm">
              <Camera size={24} />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Modifier</span>
              <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Mon prénom / Pseudo</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={handleSaveProfile} disabled={saving} className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Enregistrer le profil
          </button>
        </div>

        <hr className="border-gray-100 my-4" />

        {/* SECTION SÉCURITÉ / MOT DE PASSE */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Lock size={16} className="text-indigo-600" /> Sécurité
          </h3>

          {passwordMessage && (
            <div className={`p-3 rounded-xl text-xs font-medium ${passwordMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {passwordMessage.text}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Nouveau mot de passe</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Confirmer le mot de passe</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
                minLength={6}
              />
            </div>
            <button 
              type="submit" 
              disabled={passwordLoading}
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {passwordLoading && <Loader2 size={16} className="animate-spin" />}
              Modifier le mot de passe
            </button>
          </form>
        </div>

        <hr className="border-gray-100 my-4" />

        {/* SECTION ZONE DE DANGER */}
        <div className="space-y-4">
          <h3 className="font-bold text-red-600 flex items-center gap-2">
            <Trash2 size={16} /> Zone de danger
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            La suppression de ton compte est immédiate et irréversible. Toutes tes données et tes participations aux voyages seront perdues.
          </p>
          <button 
            onClick={handleDeleteAccount}
            disabled={saving}
            className="w-full bg-red-50 text-red-600 border border-red-100 py-3 rounded-xl font-bold text-sm hover:bg-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Supprimer mon compte définitivement
          </button>
        </div>

      </div>

      {/* --- MODALE DE RECADRAGE --- */}
      {imageSrc && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex-1 relative">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>
          <div className="bg-white p-6 pb-safe rounded-t-3xl flex flex-col items-center gap-4">
            <h3 className="font-bold text-gray-800">Ajuster la photo</h3>
            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full max-w-xs accent-indigo-600" />
            <div className="flex gap-3 w-full max-w-xs mt-2">
              <button onClick={() => setImageSrc(null)} className="flex-1 py-3 font-bold text-gray-500 bg-gray-100 rounded-xl">Annuler</button>
              <button onClick={handleCropSave} disabled={saving} className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl shadow-md">{saving ? '...' : 'Valider'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}