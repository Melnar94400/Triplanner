'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import dynamic from 'next/dynamic'
import JSZip from 'jszip'
import {
  Calendar, MapPin, Users, Utensils, ShoppingBag, PieChart,
  Plus, Check, X, Pencil, Trash2, ArrowRight, Compass, Loader2, ChevronLeft,
  Star, ExternalLink, CalendarDays, Camera, ChevronRight, Play, Copy,
  Home, Lock, Unlock, Map as MapIcon, Car, CloudSun, Target, Train, Plane, Backpack, Download, LogIn, LogOut, Bell, MessageCircle
} from 'lucide-react'
import EXIF from 'exif-js'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

// --- TYPES ---
type Meal = { id: string | number; day: string; type: string; name: string; starter?: string; dessert?: string; drinks?: string; recipeLink?: string; cooks: string[]; ingredients: { name: string; qty: string }[]; };
type Member = { id: string; name: string; avatar: string; role: string; };
type ActivityVote = 'yes' | 'maybe' | 'no';
type Activity = { id: string | number; title: string; description: string; price: number | string; link: string; address?: string; durationFromAcc?: string; proposedBy: string; day?: string; timeSlot?: string; lat?: number; lng?: number; votes: Record<string, ActivityVote>; }
type MediaItem = { id: string; file_path: string; media_type: string; uploader_id: string; day?: string; time_slot?: string; };
type PendingMedia = { id: string; file: File; preview: string; day: string; time_slot: string; };
type Transport = { id: string; user_id: string; mode: string; coming_from: string; arrival_day: string; arrival_slot: string; arrival_time: string; departure_day: string; departure_slot: string; departure_time: string; seats_available: number; };
type Equipment = { id: string; name: string; assignee_id: string | null; };
type TripEvent = { id: string; user_id: string; action: string; details: string; created_at: string; };
type Comment = { id: string; item_id: string; item_type: string; user_id: string; content: string; created_at: string; };

// --- CONSTANTES GLOBALES ---
const DAY_COLORS: Record<string, string> = { 'Lundi': 'bg-blue-100 text-blue-700', 'Mardi': 'bg-emerald-100 text-emerald-700', 'Mercredi': 'bg-yellow-100 text-yellow-700', 'Jeudi': 'bg-purple-100 text-purple-700', 'Vendredi': 'bg-pink-100 text-pink-700', 'Samedi (Arrivée)': 'bg-orange-100 text-orange-700', 'Samedi (Départ)': 'bg-orange-100 text-orange-700', 'Dimanche': 'bg-red-100 text-red-700' };
const WEEK_DAYS = ['Samedi (Arrivée)', 'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi (Départ)'];
const DAY_ORDER: Record<string, number> = { 'Samedi (Arrivée)': 1, 'Dimanche': 2, 'Lundi': 3, 'Mardi': 4, 'Mercredi': 5, 'Jeudi': 6, 'Vendredi': 7, 'Samedi (Départ)': 8 };
const SLOT_ORDER: Record<string, number> = { 'Matin': 1, 'Déjeuner': 2, 'Après-midi': 3, 'Dîner': 4, 'Soirée': 5 };
const SHOPPING_CATEGORIES = ['Fruits & Légumes', 'Viandes & Poissons', 'Frais & Laitier', 'Épicerie', 'Boissons', 'Divers'];

// --- UTILITAIRES ---
const guessCategory = (name: string, globalDict: Record<string, string> = {}) => {
  const key = name.toLowerCase().trim();
  if (globalDict[key]) return globalDict[key]; 
  if (key.match(/pomme|banane|salade|tomate|carotte|oignon|ail|poivron|courgette|citron|fruit|légume|patate|pommes de terre/)) return 'Fruits & Légumes';
  if (key.match(/poulet|boeuf|viande|poisson|saumon|porc|saucisse|lardons|jambon|dinde/)) return 'Viandes & Poissons';
  if (key.match(/lait|beurre|crème|fromage|oeuf|yaourt|mozzarella|feta|gruyère/)) return 'Frais & Laitier';
  if (key.match(/eau|vin|bière|jus|coca|soda|café|thé/)) return 'Boissons';
  if (key.match(/pâte|riz|farine|sucre|sel|poivre|huile|vinaigre|moutarde|épice|chocolat|pain/)) return 'Épicerie';
  return 'Divers';
}

const timeAgo = (dateStr: string) => {
  const diff = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return `À l'instant`;
  if (diff < 60) return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.floor(diff/60)}h`;
  return `Il y a ${Math.floor(diff/1440)}j`;
}

const getWeatherIcon = (code: number) => {
  if (code === 0) return '☀️';
  if ([1, 2, 3].includes(code)) return '🌤️';
  if ([45, 48].includes(code)) return '🌫️';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 95) return '⛈️';
  return '☁️';
};

export default function TripPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params.id as string

  // --- ÉTATS GLOBAUX ---
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [trip, setTrip] = useState<any>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [activeTab, setActiveTab] = useState('destination')
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [weather, setWeather] = useState<any[] | null>(null)

  // Thème Global
  const [appTheme, setAppTheme] = useState('sauge-terracotta')

  // Journal de Bord & Commentaires
  const [events, setEvents] = useState<TripEvent[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [showEventsModal, setShowEventsModal] = useState(false)
  const [activeComments, setActiveComments] = useState<{ id: string, title: string, type: string } | null>(null)
  const [newComment, setNewComment] = useState('')

  // Dictionnaire de courses
  const [globalDictionary, setGlobalDictionary] = useState<Record<string, string>>({})

  // Étape 1 : Destination
  const [proposedWeeks, setProposedWeeks] = useState<any[]>([])
  const [proposedRegions, setProposedRegions] = useState<any[]>([])
  const [proposedPlaces, setProposedPlaces] = useState<any[]>([])
  const [newWeek, setNewWeek] = useState('')
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [newRegion, setNewRegion] = useState('')
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null)
  const [showPlaceForm, setShowPlaceForm] = useState(false)
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null)
  const [placeData, setPlaceData] = useState({ name: '', address: '', price: '', beds: '', amenities: '', link: '', lat: null as number|null, lng: null as number|null })  
  const [lockWeek, setLockWeek] = useState('')
  const [lockRegion, setLockRegion] = useState('')
  const [lockPlaceId, setLockPlaceId] = useState('')
  const [isLocking, setIsLocking] = useState(false)

  // Étape 2 : Planning & Activités
  const [selectedPlanningDay, setSelectedPlanningDay] = useState('Samedi (Arrivée)')
  const [activities, setActivities] = useState<Activity[]>([])
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState<string | number | null>(null)
  const [actTitle, setActTitle] = useState(''); const [actDesc, setActDesc] = useState(''); const [actPrice, setActPrice] = useState<number | string>(''); const [actLink, setActLink] = useState(''); const [actAddress, setActAddress] = useState(''); const [actDay, setActDay] = useState(''); const [actTimeSlot, setActTimeSlot] = useState('');
  const [isSavingAct, setIsSavingAct] = useState(false)

  // Étape 3 : Repas & Courses
  const [meals, setMeals] = useState<Meal[]>([])
  const [checkedItems, setCheckedItems] = useState<{[key: string]: boolean}>({})
  const [showMealForm, setShowMealForm] = useState(false)
  const [editingMealId, setEditingMealId] = useState<string | number | null>(null)
  const [mealDay, setMealDay] = useState('Samedi (Arrivée)'); const [mealType, setMealType] = useState('Dîner'); const [mealName, setMealName] = useState(''); const [mealStarter, setMealStarter] = useState(''); const [mealDessert, setMealDessert] = useState(''); const [mealDrinks, setMealDrinks] = useState(''); const [mealRecipeLink, setMealRecipeLink] = useState('');
  const [mealCooks, setMealCooks] = useState<string[]>([])
  const [mealIngredients, setMealIngredients] = useState<{name: string, qty: string}[]>([])
  const [extraItems, setExtraItems] = useState<{id: string, name: string, qty: string}[]>([])
  const [newExtraItem, setNewExtraItem] = useState(''); const [newExtraQty, setNewExtraQty] = useState('');

  // Étape 4 : Dépenses
  const [expenses, setExpenses] = useState<{ id: string | number; title: string; amount: number; paidBy: string; splitAmong: string[] }[]>([])
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | number | null>(null)
  const [expenseTitle, setExpenseTitle] = useState(''); const [expenseAmount, setExpenseAmount] = useState<number | ''>(''); const [expensePayer, setExpensePayer] = useState<string>(''); const [expenseSplitAmong, setExpenseSplitAmong] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<any[]>([])

  // Étape 5 : Logistique (Transports & Matériel)
  const [transports, setTransports] = useState<Transport[]>([])
  const [myTransport, setMyTransport] = useState<Partial<Transport>>({ mode: 'Voiture', coming_from: '', arrival_day: 'Samedi (Arrivée)', arrival_slot: 'Après-midi', arrival_time: '', departure_day: 'Samedi (Départ)', departure_slot: 'Matin', departure_time: '', seats_available: 0 })
  const [isEditingTransport, setIsEditingTransport] = useState(false)
  const [equipments, setEquipments] = useState<Equipment[]>([])
  const [newEquipment, setNewEquipment] = useState('')

  // Étape 6 : Galerie
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [selectedSlotForMedia, setSelectedSlotForMedia] = useState<{day: string, slot: string} | null>(null)
  const [gallerySortMode, setGallerySortMode] = useState<'date' | 'moment'>('date')
  const [showMediaUploadModal, setShowMediaUploadModal] = useState(false)
  const [pendingMediaItems, setPendingMediaItems] = useState<PendingMedia[]>([])
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null)
  const [editMediaDay, setEditMediaDay] = useState('')
  const [editMediaSlot, setEditMediaSlot] = useState('')
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const [viewerItems, setViewerItems] = useState<MediaItem[]>([])
  const [viewerCurrentIndex, setViewerCurrentIndex] = useState<number | null>(null)
  const [viewerRotation, setViewerRotation] = useState(0)
const openViewer = (items: MediaItem[], idx: number) => { 
    setViewerItems(items); 
    setViewerCurrentIndex(idx); 
    setViewerRotation(0); 
  };
  const closeViewer = () => { 
    setViewerCurrentIndex(null); 
    setViewerItems([]); 
  };
  const prevMedia = () => { 
    setViewerCurrentIndex(prev => prev !== null ? (prev > 0 ? prev - 1 : viewerItems.length - 1) : null); 
  };
  const nextMedia = () => { 
    setViewerCurrentIndex(prev => prev !== null ? (prev < viewerItems.length - 1 ? prev + 1 : 0) : null); 
  };
  // --- INITIALISATION THEME ET AUTO-PHRASE ---
  useEffect(() => { 
    const saved = localStorage.getItem('trip-theme') || 'sauge-terracotta'; 
    setAppTheme(saved); 
    document.documentElement.setAttribute('data-theme', saved); 
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate); const end = new Date(endDate);
      const startMonth = start.toLocaleDateString('fr-FR', { month: 'long' }); 
      const endMonth = end.toLocaleDateString('fr-FR', { month: 'long' });
      if (startMonth === endMonth) setNewWeek(`Du ${start.getDate()} au ${end.getDate()} ${startMonth}`);
      else setNewWeek(`Du ${start.getDate()} ${startMonth} au ${end.getDate()} ${endMonth}`);
    }
  }, [startDate, endDate])

  // --- CHARGEMENT DES DONNÉES TEMPS RÉEL ---
  useEffect(() => {
    fetchTripData()
    const channel = supabase.channel('trip_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposed_weeks' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposed_regions' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposed_places' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_votes' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_transports' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_items' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_events' }, () => fetchTripData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => fetchTripData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tripId])

  useEffect(() => {
    if (trip?.accommodation_lat && trip?.accommodation_lng) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${trip.accommodation_lat}&longitude=${trip.accommodation_lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`)
        .then(res => res.json())
        .then(data => {
          if (data.daily) {
            const forecast = data.daily.time.map((date: string, i: number) => ({ date, max: data.daily.temperature_2m_max[i], min: data.daily.temperature_2m_min[i], code: data.daily.weathercode[i] }))
            setWeather(forecast)
          }
        }).catch(e => console.error(e))
    }
  }, [trip?.accommodation_lat, trip?.accommodation_lng])

  async function fetchTripData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return; }
      setCurrentUser(session.user)

      // Chargement du Dico
      const { data: dictData } = await supabase.from('global_food_dictionary').select('*')
      if (dictData) {
        const dict: Record<string, string> = {};
        dictData.forEach((d: any) => dict[d.name] = d.category);
        setGlobalDictionary(dict);
      }

      // Chargement Voyage
      const { data: tripData, error: tripError } = await supabase.from('trips').select('*').eq('id', tripId).single()
      if (tripError) throw tripError; 
      setTrip(tripData)

      // Chargement Membres
      const { data: membersData } = await supabase.from('trip_members').select('user_id, role, profiles(id, name, avatar)').eq('trip_id', tripId)
      let loadedMembers: Member[] = []; 
      let isUserInTrip = false;
      if (membersData) {
        loadedMembers = membersData.map((m: any) => ({ id: m.profiles.id, name: m.profiles.name, avatar: m.profiles.avatar || '👤', role: m.role }));
        isUserInTrip = loadedMembers.some(m => m.id === session.user.id);
      }
      if (!isUserInTrip) {
        await supabase.from('trip_members').insert({ trip_id: tripId, user_id: session.user.id, role: 'admin' });
        const { data: myProfile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (myProfile) loadedMembers.push({ id: myProfile.id, name: myProfile.name, avatar: myProfile.avatar || '👤', role: 'admin' });
      }
      setMembers(loadedMembers)

      // Chargement Étape 1
      const { data: wData } = await supabase.from('proposed_weeks').select('*').eq('trip_id', tripId).order('created_at', { ascending: true })
      if (wData) setProposedWeeks(wData.map((w:any) => ({id: w.id, text: w.week_text, votes: w.votes || [], by: w.proposed_by})))

      const { data: rData } = await supabase.from('proposed_regions').select('*').eq('trip_id', tripId).order('created_at', { ascending: true })
      if (rData) setProposedRegions(rData.map((r:any) => ({id: r.id, name: r.name, ratings: r.ratings || {}, by: r.proposed_by})))

      const { data: pData } = await supabase.from('proposed_places').select('*').eq('trip_id', tripId).order('created_at', { ascending: true })
      if (pData) setProposedPlaces(pData.map((p:any) => ({id: p.id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, price: p.price, beds: p.beds, amenities: p.amenities, link: p.link, ratings: p.ratings || {}, by: p.proposed_by})))

      // Social
      const { data: evData } = await supabase.from('trip_events').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(50)
      if (evData) setEvents(evData)

      const { data: comData } = await supabase.from('comments').select('*').eq('trip_id', tripId).order('created_at', { ascending: true })
      if (comData) setComments(comData)

      // Planning & Repas
      const { data: mealsData } = await supabase.from('meals').select('*, meal_ingredients(name, qty), meal_cooks(user_id)').eq('trip_id', tripId)
      if (mealsData) setMeals(mealsData.map((m: any) => ({ id: m.id, day: m.day, type: m.type, name: m.name, starter: m.starter || '', dessert: m.dessert || '', drinks: m.drinks || '', recipeLink: m.recipe_link || '', cooks: m.meal_cooks.map((c: any) => c.user_id), ingredients: m.meal_ingredients })))

      const { data: activitiesData } = await supabase.from('activities').select('*, activity_votes(user_id, vote)').eq('trip_id', tripId)
      if (activitiesData) {
        setActivities(activitiesData.map((a: any) => {
          const votes: Record<string, ActivityVote> = {};
          a.activity_votes.forEach((v: any) => votes[v.user_id] = v.vote);
          return { id: a.id, title: a.title, description: a.description || '', price: a.price || '', link: a.link || '', address: a.address || '', durationFromAcc: a.duration_from_acc || '', day: a.day || '', timeSlot: a.time_slot || '', lat: a.lat, lng: a.lng, proposedBy: a.proposed_by || session.user.id, votes }
        }))
      }

      // Courses & Galerie
      const { data: extraData } = await supabase.from('shopping_items').select('*').eq('trip_id', tripId)
      if (extraData) setExtraItems(extraData.map((item: any) => ({ id: item.id, name: item.name, qty: item.qty || '' })))
      
      const { data: mediaData } = await supabase.from('media').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })
      if (mediaData) setMediaItems(mediaData)  

      // Dépenses & Logistique
      const { data: expensesData } = await supabase.from('expenses').select('*').eq('trip_id', tripId)
      if (expensesData) setExpenses(expensesData.map((e: any) => ({ id: e.id, title: e.title, amount: e.amount, paidBy: e.paid_by, splitAmong: e.split_among || [] })))
      
      const { data: settlementsData } = await supabase.from('settlements').select('*').eq('trip_id', tripId)
      setSettlements(settlementsData || [])

      const { data: tData } = await supabase.from('trip_transports').select('*').eq('trip_id', tripId)
      if (tData) {
        setTransports(tData);
        const mine = tData.find((t:any) => t.user_id === session.user.id);
        if (mine) {
          setMyTransport({
            mode: mine.mode, coming_from: mine.coming_from, 
            arrival_day: mine.arrival_day || 'Samedi (Arrivée)', arrival_slot: mine.arrival_slot || 'Après-midi', arrival_time: mine.arrival_time || '', 
            departure_day: mine.departure_day || 'Samedi (Départ)', departure_slot: mine.departure_slot || 'Matin', departure_time: mine.departure_time || '', 
            seats_available: mine.seats_available
          })
        }
      }

      const { data: eData } = await supabase.from('equipment_items').select('*').eq('trip_id', tripId).order('created_at', { ascending: true })
      if (eData) setEquipments(eData)

    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }

  // --- VARIABLES DÉRIVÉES ET DROITS ---
  const isAdmin = members.find(m => m.id === currentUser?.id)?.role === 'admin'; 
  const isLocked = trip?.is_planning_locked;
  const getMember = (id: string) => members.find(m => m.id === id) || { name: 'Ancien membre', avatar: '👤', role: 'member', id: '' };

  const allIngredients = Array.from(new Set([ 
    ...Object.keys(globalDictionary).map(k => k.charAt(0).toUpperCase() + k.slice(1)), 
    ...meals.flatMap(m => m.ingredients?.map((i: any) => i.name) || []) 
  ])).filter(Boolean).sort();


  // --- HANDLERS: SOCIAL ET DICO ---
  const logEvent = async (action: string, details: string) => {
    if (!currentUser) return;
    await supabase.from('trip_events').insert([{ trip_id: tripId, user_id: currentUser.id, action, details }]);
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser || !activeComments) return;
    await supabase.from('comments').insert([{ trip_id: tripId, user_id: currentUser.id, item_type: activeComments.type, item_id: activeComments.id.toString(), content: newComment.trim() }]);
    logEvent('a commenté', activeComments.title);
    setNewComment('');
    fetchTripData();
  }

  const learnNewIngredients = async (items: string[]) => { 
    let toUpsert: {name: string, category: string}[] = []; 
    const newDict = { ...globalDictionary }; 
    items.forEach(item => { 
      if (!item) return; 
      const key = item.toLowerCase().trim(); 
      if (key && !newDict[key]) { 
        const cat = guessCategory(key, newDict); 
        newDict[key] = cat; 
        toUpsert.push({ name: key, category: cat }); 
      } 
    }); 
    if (toUpsert.length > 0) { 
      setGlobalDictionary(newDict); 
      await supabase.from('global_food_dictionary').upsert(toUpsert); 
    } 
  };

  const handleRemoveMember = async (memberId: string) => { 
    if (!confirm("Voulez-vous vraiment retirer cette personne du voyage ?")) return; 
    try { 
      await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', memberId); 
      fetchTripData(); 
    } catch (err: any) { alert(err.message); } 
  };

  // --- HANDLERS: DESTINATION ---
  const handleSaveWeek = async (e?: React.FormEvent) => { 
    if(e) e.preventDefault(); 
    if(!newWeek.trim()) return; 
    if (editingWeekId) { 
      await supabase.from('proposed_weeks').update({ week_text: newWeek }).eq('id', editingWeekId); 
      setEditingWeekId(null); 
    } else { 
      await supabase.from('proposed_weeks').insert([{trip_id: tripId, week_text: newWeek, proposed_by: currentUser.id}]); 
      logEvent('a proposé une date', newWeek); 
    } 
    setNewWeek(''); setStartDate(''); setEndDate(''); fetchTripData(); 
  }
  const startEditWeek = (w: any) => { setEditingWeekId(w.id); setNewWeek(w.text); setStartDate(''); setEndDate(''); }; 
  const handleDeleteWeek = async (id: string) => { if(confirm("Supprimer ?")) { await supabase.from('proposed_weeks').delete().eq('id', id); fetchTripData(); } }; 
  const toggleWeekVote = async (weekId: string, currentVotes: string[]) => { if(!currentUser) return; const newVotes = currentVotes.includes(currentUser.id) ? currentVotes.filter(id => id !== currentUser.id) : [...currentVotes, currentUser.id]; await supabase.from('proposed_weeks').update({votes: newVotes}).eq('id', weekId); fetchTripData(); }
  
  const handleSaveRegion = async (e?: React.FormEvent) => { 
    if(e) e.preventDefault(); 
    if(!newRegion.trim()) return; 
    if (editingRegionId) { 
      await supabase.from('proposed_regions').update({ name: newRegion }).eq('id', editingRegionId); 
      setEditingRegionId(null); 
    } else { 
      await supabase.from('proposed_regions').insert([{trip_id: tripId, name: newRegion, proposed_by: currentUser.id}]); 
      logEvent('a proposé une destination', newRegion); 
    } 
    setNewRegion(''); fetchTripData(); 
  }
  const startEditRegion = (r: any) => { setEditingRegionId(r.id); setNewRegion(r.name); }; 
  const handleDeleteRegion = async (id: string) => { if(confirm("Supprimer ?")) { await supabase.from('proposed_regions').delete().eq('id', id); fetchTripData(); } }; 
  const handleRegionRating = async (regionId: string, currentRatings: any, score: number) => { if(!currentUser) return; const newRatings = {...currentRatings, [currentUser.id]: score}; await supabase.from('proposed_regions').update({ratings: newRatings}).eq('id', regionId); fetchTripData(); }

  const handleSavePlace = async (e?: React.FormEvent) => {
    if(e) e.preventDefault(); 
    if(!placeData.name.trim() || !placeData.address.trim()) return alert("Nom et adresse requis."); 
    let lat = placeData.lat, lng = placeData.lng;
    try { 
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeData.address)}`); 
      const geo = await res.json(); 
      if(geo && geo.length > 0) { lat = parseFloat(geo[0].lat); lng = parseFloat(geo[0].lon); } 
    } catch(err) {}
    
    const payload = { trip_id: tripId, name: placeData.name, address: placeData.address, price: placeData.price ? Number(placeData.price) : null, beds: placeData.beds ? Number(placeData.beds) : null, amenities: placeData.amenities, link: placeData.link, lat, lng };
    if (editingPlaceId) { 
      await supabase.from('proposed_places').update(payload).eq('id', editingPlaceId); 
    } else { 
      await supabase.from('proposed_places').insert([{ ...payload, proposed_by: currentUser.id }]); 
      logEvent('a déniché un gîte', placeData.name); 
    }
    setShowPlaceForm(false); setEditingPlaceId(null); setPlaceData({name: '', address: '', price: '', beds: '', amenities: '', link: '', lat: null, lng: null}); fetchTripData();
  }
  const startEditPlace = (p: any) => { setEditingPlaceId(p.id); setPlaceData({ name: p.name, address: p.address, price: p.price || '', beds: p.beds || '', amenities: p.amenities || '', link: p.link || '', lat: p.lat, lng: p.lng }); setShowPlaceForm(true); }; 
  const handleDeletePlace = async (id: string) => { if(confirm("Supprimer ?")) { await supabase.from('proposed_places').delete().eq('id', id); fetchTripData(); } }; 
  
  const getRatingStats = (ratings: Record<string, number>) => { 
    const scores = Object.values(ratings); 
    if (scores.length === 0) return { avg: 0, sd: 0, consensus: 0 }; 
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length; 
    const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length; 
    const sd = Math.sqrt(variance); 
    return { avg, sd, consensus: Math.max(0, avg - (sd * 0.8)) }; 
  }; 
  const handlePlaceRating = async (placeId: string, currentRatings: any, score: number) => { if(!currentUser) return; const newRatings = {...currentRatings, [currentUser.id]: score}; await supabase.from('proposed_places').update({ratings: newRatings}).eq('id', placeId); fetchTripData(); }

  // --- HANDLERS: VERROUILLAGE ---
  const handleLockPhase1 = async () => { if (!lockWeek || !lockRegion) return alert("Sélectionnez la semaine et la région !"); setIsLocking(true); try { await supabase.from('trips').update({ trip_week: lockWeek, trip_region: lockRegion }).eq('id', tripId); logEvent('a validé la destination', lockRegion); await fetchTripData(); } catch(err:any) { alert(err.message); } finally { setIsLocking(false); } }
  const handleUnlockPhase1 = async () => { if (!confirm("Revenir au vote de la région ?")) return; await supabase.from('trips').update({ trip_week: null, trip_region: null }).eq('id', tripId); fetchTripData(); }
  const handleLockPhase2 = async () => { const place = proposedPlaces.find(p => p.id === lockPlaceId); if (!place) return alert("Sélectionnez le gîte final."); setIsLocking(true); try { await supabase.from('trips').update({ accommodation_name: place.name, accommodation_address: place.address, accommodation_lat: place.lat, accommodation_lng: place.lng, is_planning_locked: true }).eq('id', tripId); logEvent('a sanctuarisé le logement', place.name); await fetchTripData(); setActiveTab('calendar'); } catch(err:any) { alert(err.message); } finally { setIsLocking(false); } }
  const handleUnlockTrip = async () => { if (!confirm("Déverrouiller le voyage ?")) return; await supabase.from('trips').update({ is_planning_locked: false }).eq('id', tripId); fetchTripData(); };
  const checkLock = (tabName: string, e: React.MouseEvent) => { if (!isLocked) { e.preventDefault(); alert("Il faut d'abord sanctuariser la destination."); } else setActiveTab(tabName); };

  // --- HANDLERS: LOGISTIQUE ---
  const handleSaveTransport = async (e: React.FormEvent) => { e.preventDefault(); if (!currentUser) return; await supabase.from('trip_transports').upsert({ trip_id: tripId, user_id: currentUser.id, ...myTransport }, { onConflict: 'trip_id, user_id' }); setIsEditingTransport(false); logEvent('a organisé son trajet', myTransport.mode || 'Voiture'); fetchTripData(); }
  const handleAddEquipment = async (e: React.FormEvent) => { e.preventDefault(); if (!newEquipment.trim() || !currentUser) return; await supabase.from('equipment_items').insert([{ trip_id: tripId, name: newEquipment.trim(), assignee_id: currentUser.id }]); logEvent('amène du matériel', newEquipment); setNewEquipment(''); fetchTripData(); }
  const toggleEquipmentAssign = async (eq: Equipment) => { const newAssignee = eq.assignee_id === currentUser.id ? null : currentUser.id; await supabase.from('equipment_items').update({ assignee_id: newAssignee }).eq('id', eq.id); fetchTripData(); }
  const deleteEquipment = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); await supabase.from('equipment_items').delete().eq('id', id); fetchTripData(); }
  const getTransportIcon = (mode: string) => { if (mode === 'Train') return <Train size={16} />; if (mode === 'Avion') return <Plane size={16} />; return <Car size={16} />; }

  // --- HANDLERS: REPAS ET COURSES ---
  const resetMealForm = () => { setEditingMealId(null); setMealDay('Samedi (Arrivée)'); setMealType('Déjeuner'); setMealName(''); setMealStarter(''); setMealDessert(''); setMealDrinks(''); setMealRecipeLink(''); setMealCooks([]); setMealIngredients([{ name: '', qty: '' }]); setShowMealForm(false); };
  const editMeal = (meal: Meal) => { setEditingMealId(meal.id); setMealDay(meal.day); setMealType(meal.type); setMealName(meal.name || ''); setMealStarter(meal.starter || ''); setMealDessert(meal.dessert || ''); setMealDrinks(meal.drinks || ''); setMealRecipeLink(meal.recipeLink || ''); setMealCooks(meal.cooks || []); setMealIngredients(meal.ingredients?.length ? meal.ingredients : [{ name: '', qty: '' }]); setShowMealForm(true); };
  
  const handleSaveMeal = async (e?: React.FormEvent) => { 
    if (e) e.preventDefault(); 
    if (!mealName.trim()) return; 
    const mealPayload = { trip_id: tripId, day: mealDay, type: mealType, name: mealName.trim(), starter: mealStarter.trim() || null, dessert: mealDessert.trim() || null, drinks: mealDrinks.trim() || null, recipe_link: mealRecipeLink.trim() || null }; 
    let currentMealId = editingMealId; 
    if (editingMealId) { 
      await supabase.from('meals').update(mealPayload).eq('id', editingMealId); 
      await supabase.from('meal_ingredients').delete().eq('meal_id', editingMealId); 
      await supabase.from('meal_cooks').delete().eq('meal_id', editingMealId); 
    } else { 
      const { data } = await supabase.from('meals').insert([mealPayload]).select().single(); 
      currentMealId = data?.id; 
      logEvent('a planifié un repas', mealName); 
    } 
    const ings = mealIngredients.filter(i => i.name.trim()).map(i => ({ meal_id: currentMealId, name: i.name.trim(), qty: i.qty.trim() || null })); 
    if (ings.length > 0) await supabase.from('meal_ingredients').insert(ings); 
    const cooks = mealCooks.map(id => ({ meal_id: currentMealId, user_id: id })); 
    if (cooks.length > 0) await supabase.from('meal_cooks').insert(cooks); 
    learnNewIngredients(ings.map(i => i.name)); 
    fetchTripData(); resetMealForm(); 
  }
  
  const handleDeleteMeal = async (id: string | number) => { await supabase.from('meals').delete().eq('id', id); fetchTripData(); }
  const handleAddExtraItem = async (e: React.FormEvent) => { e.preventDefault(); if (!newExtraItem.trim()) return; await supabase.from('shopping_items').insert([{ trip_id: tripId, name: newExtraItem.trim(), qty: newExtraQty.trim() || null }]); learnNewIngredients([newExtraItem.trim()]); setNewExtraItem(''); setNewExtraQty(''); fetchTripData(); };
  const handleDeleteExtraItem = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); await supabase.from('shopping_items').delete().eq('id', id); fetchTripData(); };
  
  const handleChangeCategory = async (itemId: string, newCategory: string) => { 
    const item = shoppingList.find(i => i.id === itemId); 
    if (!item) return; 
    const key = item.name.toLowerCase().trim(); 
    const newDict = { ...globalDictionary, [key]: newCategory }; 
    setGlobalDictionary(newDict); 
    await supabase.from('global_food_dictionary').upsert({ name: key, category: newCategory }); 
  };
  
  const shoppingList = useMemo(() => { 
    const list: Record<string, any> = {}; 
    meals.forEach(meal => { 
      meal.ingredients?.forEach(ing => { 
        if (!ing.name) return; 
        const key = ing.name.toLowerCase().trim(); 
        const tagText = `${meal.day.substring(0,3)}. ${meal.type === 'Déjeuner' ? 'Midi' : 'Soir'}`; 
        const tagColor = DAY_COLORS[meal.day] || 'bg-gray-100 text-gray-700'; 
        if (!list[key]) {
          list[key] = { id: key, name: ing.name, qtys: ing.qty ? [ing.qty] : [], tags: [{ text: tagText, color: tagColor }], category: guessCategory(ing.name, globalDictionary) }; 
        } else { 
          if (ing.qty && !list[key].qtys.includes(ing.qty)) list[key].qtys.push(ing.qty); 
          if (!list[key].tags.some((t: any) => t.text === tagText)) list[key].tags.push({ text: tagText, color: tagColor }) 
        } 
      }) 
    }); 
    extraItems.forEach(item => { 
      const key = item.name.toLowerCase().trim(); 
      if (!list[key]) {
        list[key] = { id: key, dbId: item.id, name: item.name, qtys: item.qty ? [item.qty] : [], tags: [{ text: 'Général', color: 'bg-gray-200 text-gray-700' }], isExtra: true, category: guessCategory(item.name, globalDictionary) }; 
      } else { 
        if (item.qty && !list[key].qtys.includes(item.qty)) list[key].qtys.push(item.qty); 
        if (!list[key].tags.some((t: any) => t.text === 'Général')) list[key].tags.push({ text: 'Général', color: 'bg-gray-200 text-gray-700' }); 
        list[key].isExtra = true; 
        list[key].dbId = item.id; 
      } 
    }); 
    return Object.values(list).map(item => ({ ...item, displayQty: item.qtys.join(' + ') })) 
  }, [meals, extraItems, globalDictionary]); 

  const toggleCheck = (id: string) => setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }))

  // --- HANDLERS: ACTIVITÉS ---
  const resetActivityForm = () => { setEditingActivityId(null); setActTitle(''); setActDesc(''); setActPrice(''); setActLink(''); setActAddress(''); setActDay(''); setActTimeSlot(''); setShowActivityForm(false); }
  const editActivity = (act: Activity) => { setEditingActivityId(act.id); setActTitle(act.title); setActDesc(act.description); setActPrice(act.price); setActLink(act.link || ''); setActAddress(act.address || ''); setActDay(act.day || ''); setActTimeSlot(act.timeSlot || ''); setShowActivityForm(true); }
  
  const handleSaveActivity = async (e?: React.FormEvent) => { 
    if (e) e.preventDefault(); 
    if (!actTitle.trim() || !currentUser) return; 
    setIsSavingAct(true); 
    let lat = null, lng = null, durationStr = null; 
    if (actAddress.trim()) { 
      try { 
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(actAddress)}`); 
        const geo = await geoRes.json(); 
        if (geo && geo.length > 0) { 
          lat = parseFloat(geo[0].lat); 
          lng = parseFloat(geo[0].lon); 
          if (trip?.accommodation_lat && trip?.accommodation_lng) { 
            const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${trip.accommodation_lng},${trip.accommodation_lat};${lng},${lat}?overview=false`); 
            const osrmData = await osrmRes.json(); 
            if (osrmData.routes && osrmData.routes.length > 0) { 
              const mins = Math.round(osrmData.routes[0].duration / 60); 
              if (mins < 60) durationStr = `${mins} min`; 
              else { const h = Math.floor(mins / 60); const m = mins % 60; durationStr = `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`; } 
            } 
          } 
        } 
      } catch (e) {} 
    } 
    const payload = { trip_id: tripId, title: actTitle, description: actDesc, price: actPrice === '' ? null : actPrice, link: actLink, address: actAddress.trim() || null, lat: lat, lng: lng, duration_from_acc: durationStr, day: actDay, time_slot: actTimeSlot, proposed_by: currentUser.id }; 
    if (editingActivityId) {
      await supabase.from('activities').update(payload).eq('id', editingActivityId); 
    } else { 
      await supabase.from('activities').insert([payload]); 
      logEvent('a ajouté une activité', actTitle); 
    } 
    await fetchTripData(); resetActivityForm(); setIsSavingAct(false); 
  }
  
  const handleDeleteActivity = async (id: string | number) => { await supabase.from('activities').delete().eq('id', id); fetchTripData(); }
  const handleActivityVote = async (actId: string | number, voteType: ActivityVote) => { if (!currentUser) return; await supabase.from('activity_votes').upsert({ activity_id: actId, user_id: currentUser.id, vote: voteType }, { onConflict: 'activity_id, user_id' }); fetchTripData(); }

  // --- HANDLERS: DÉPENSES ---
  const resetExpenseForm = () => { setEditingExpenseId(null); setExpenseTitle(''); setExpenseAmount(''); setExpensePayer(currentUser?.id || ''); setExpenseSplitAmong(members.map(m => m.id)); setShowExpenseForm(false); };
  const editExpense = (exp: any) => { setEditingExpenseId(exp.id); setExpenseTitle(exp.title); setExpenseAmount(exp.amount); setExpensePayer(exp.paidBy); setExpenseSplitAmong(exp.splitAmong); setShowExpenseForm(true); };
  
  const handleSaveExpense = async () => { 
    if (!expenseTitle.trim() || !expenseAmount || Number(expenseAmount) <= 0 || expenseSplitAmong.length === 0 || !expensePayer) return alert("Remplir tous les champs !"); 
    const payload = { trip_id: tripId, title: expenseTitle, amount: Number(expenseAmount), paid_by: expensePayer, split_among: expenseSplitAmong }; 
    if (editingExpenseId) {
      await supabase.from('expenses').update(payload).eq('id', editingExpenseId); 
    } else { 
      await supabase.from('expenses').insert([payload]); 
      logEvent('a ajouté une dépense', expenseTitle); 
    } 
    fetchTripData(); resetExpenseForm(); 
  };
  
  const handleDeleteExpense = async (id: string | number) => { await supabase.from('expenses').delete().eq('id', id); fetchTripData(); };
  const handleSettleDebt = async (payerId: string, receiverId: string, amount: number) => { if (!confirm("Confirmer le remboursement ?")) return; await supabase.from('settlements').insert([{ trip_id: tripId, payer_id: payerId, receiver_id: receiverId, amount: amount }]); logEvent('a validé un remboursement', `${amount}€`); fetchTripData(); };
  
  const { balances, reimbursements, allKnownMembers } = useMemo(() => { 
    const userBalances: Record<string, number> = {}; 
    const ghostMembers = [...members]; 
    ghostMembers.forEach((m: Member) => userBalances[m.id] = 0); 
    const ensureMemberExists = (id: string) => { if (!id) return; if (userBalances[id] === undefined) { userBalances[id] = 0; ghostMembers.push({ id: id, name: 'Ancien membre', avatar: '👤', role: 'member' }); } }; 
    
    expenses.forEach(exp => { 
      if (!exp.splitAmong || exp.splitAmong.length === 0) return; 
      ensureMemberExists(exp.paidBy); 
      exp.splitAmong.forEach(ensureMemberExists); 
      const splitAmount = exp.amount / exp.splitAmong.length; 
      if (exp.paidBy) userBalances[exp.paidBy] += exp.amount; 
      exp.splitAmong.forEach(memberId => { userBalances[memberId] -= splitAmount; }); 
    }); 
    
    settlements.forEach(s => { 
      ensureMemberExists(s.payer_id); 
      ensureMemberExists(s.receiver_id); 
      if (s.payer_id) userBalances[s.payer_id] += s.amount; 
      if (s.receiver_id) userBalances[s.receiver_id] -= s.amount; 
    }); 
    
    const debtors = Object.entries(userBalances).filter(([_, b]) => b < -0.01).sort((a, b) => a[1] - b[1]); 
    const creditors = Object.entries(userBalances).filter(([_, b]) => b > 0.01).sort((a, b) => b[1] - a[1]); 
    const newReimbursements: { from: string, to: string, amount: number }[] = []; 
    let d = 0, c = 0; 
    while (d < debtors.length && c < creditors.length) { 
      const debtor = debtors[d]; 
      const creditor = creditors[c]; 
      const amount = Math.min(-debtor[1], creditor[1]); 
      if (amount > 0.01) newReimbursements.push({ from: debtor[0], to: creditor[0], amount }); 
      debtor[1] += amount; creditor[1] -= amount; 
      if (debtor[1] > -0.01) d++; 
      if (creditor[1] < 0.01) c++; 
    } 
    return { balances: userBalances, reimbursements: newReimbursements, allKnownMembers: ghostMembers }; 
  }, [members, expenses, settlements]);

  // --- HANDLERS: MEDIAS ET GALERIE ---
  const handleFileSelectionForBulk = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    if (!e.target.files) return; 
    const files = Array.from(e.target.files); 
    const newPending = await Promise.all(files.map(async (file) => { 
      return new Promise<PendingMedia>((resolve) => { 
        EXIF.getData(file as any, function(this: any) { 
          let lat = null, lng = null, autoDay = selectedSlotForMedia?.day || '', autoSlot = selectedSlotForMedia?.slot || ''; 
          const latData = EXIF.getTag(this, 'GPSLatitude'); const lngData = EXIF.getTag(this, 'GPSLongitude'); const latRef = EXIF.getTag(this, 'GPSLatitudeRef'); const lngRef = EXIF.getTag(this, 'GPSLongitudeRef'); 
          if (latData && lngData && latRef && lngRef && latData.length >= 3 && lngData.length >= 3) { 
            const latDeg = latData[0].numerator / (latData[0].denominator || 1); const latMin = latData[1].numerator / (latData[1].denominator || 1); const latSec = latData[2].numerator / (latData[2].denominator || 1); 
            lat = latDeg + (latMin / 60) + (latSec / 3600); if (latRef === 'S') lat = -lat; 
            const lngDeg = lngData[0].numerator / (lngData[0].denominator || 1); const lngMin = lngData[1].numerator / (lngData[1].denominator || 1); const lngSec = lngData[2].numerator / (lngData[2].denominator || 1); 
            lng = lngDeg + (lngMin / 60) + (lngSec / 3600); if (lngRef === 'W') lng = -lng; 
          } 
          const dateTime = EXIF.getTag(this, 'DateTimeOriginal'); 
          if (dateTime && !selectedSlotForMedia) { 
            const [dateStr, timeStr] = dateTime.split(' '); const [y, m, d] = dateStr.split(':'); const dateObj = new Date(Number(y), Number(m)-1, Number(d)); 
            autoDay = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dateObj.getDay()]; 
            const hour = parseInt(timeStr.split(':')[0]); 
            if (hour >= 6 && hour < 12) autoSlot = 'Matin'; else if (hour >= 12 && hour < 14) autoSlot = 'Déjeuner'; else if (hour >= 14 && hour < 19) autoSlot = 'Après-midi'; else if (hour >= 19 && hour < 22) autoSlot = 'Dîner'; else autoSlot = 'Soirée'; 
            if (autoDay === 'Samedi') autoDay = hour < 14 ? 'Samedi (Départ)' : 'Samedi (Arrivée)'; 
          } 
          resolve({ id: Math.random().toString(36).substring(2), file, preview: URL.createObjectURL(file), day: autoDay, time_slot: autoSlot, lat, lng } as PendingMedia & { lat: number | null, lng: number | null }); 
        }); 
      }); 
    })); 
    setPendingMediaItems(prev => [...prev, ...newPending]); e.target.value = ''; 
  };
  
  const updatePendingMedia = (id: string, field: 'day' | 'time_slot', value: string) => { setPendingMediaItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item)); }; 
  const removePendingMedia = (id: string) => { setPendingMediaItems(prev => { const itemToRevoke = prev.find(item => item.id === id); if (itemToRevoke) URL.revokeObjectURL(itemToRevoke.preview); return prev.filter(item => item.id !== id); }); }; 
  const closeMediaUploadModal = () => { pendingMediaItems.forEach(item => URL.revokeObjectURL(item.preview)); setPendingMediaItems([]); setShowMediaUploadModal(false); setSelectedSlotForMedia(null); };
  
  const handleBulkMediaUpload = async () => { 
    if (pendingMediaItems.length === 0) return; 
    setIsUploading(true); 
    try { 
      const { data: { session } } = await supabase.auth.getSession(); 
      if (!session) return; 
      const uploadPromises = pendingMediaItems.map(async (item: any) => { 
        const fileExt = item.file.name.split('.').pop(); 
        const filePath = `${tripId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`; 
        await supabase.storage.from('trip-media').upload(filePath, item.file); 
        const { data } = supabase.storage.from('trip-media').getPublicUrl(filePath); 
        return { trip_id: tripId, uploader_id: session.user.id, file_path: data.publicUrl, media_type: item.file.type.startsWith('video/') ? 'video' : 'image', day: item.day || null, time_slot: item.time_slot || null, lat: (item as any).lat || null, lng: (item as any).lng || null }; 
      }); 
      const dbPayloads = await Promise.all(uploadPromises); 
      await supabase.from('media').insert(dbPayloads); 
      logEvent('a ajouté des souvenirs', `${dbPayloads.length} photo(s)/vidéo(s)`); 
      fetchTripData(); closeMediaUploadModal(); 
    } catch (error: any) { alert("Erreur lors de l'envoi : " + error.message); } finally { setIsUploading(false); } 
  };
  
  const handleDeleteMedia = async (id: string, url: string) => { if(!confirm("Supprimer définitivement ?")) return; try { const urlParts = url.split('/'); await supabase.storage.from('trip-media').remove([`${tripId}/${urlParts[urlParts.length - 1]}`]); await supabase.from('media').delete().eq('id', id); fetchTripData(); } catch (error: any) {} }; 
  const openEditMedia = (media: MediaItem) => { setEditingMedia(media); setEditMediaDay(media.day || ''); setEditMediaSlot(media.time_slot || ''); }; 
  const handleSaveMediaEdit = async () => { if (!editingMedia) return; await supabase.from('media').update({ day: editMediaDay || null, time_slot: editMediaSlot || null }).eq('id', editingMedia.id); fetchTripData(); setEditingMedia(null); };
  
  const toggleMediaSelection = (id: string) => { const newSet = new Set(selectedMediaIds); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedMediaIds(newSet); }
  
  const handleDownloadSelected = async () => { 
    if (selectedMediaIds.size === 0) return; 
    setIsDownloading(true); 
    try { 
      const zip = new JSZip(); 
      const itemsToDownload = mediaItems.filter(m => selectedMediaIds.has(m.id)); 
      const fetchPromises = itemsToDownload.map(async (item, index) => { 
        const response = await fetch(item.file_path); 
        const blob = await response.blob(); 
        const ext = item.file_path.split('.').pop() || 'jpg'; 
        const filename = `souvenir_${index + 1}.${ext}`; 
        zip.file(filename, blob); 
      }); 
      await Promise.all(fetchPromises); 
      const content = await zip.generateAsync({ type: 'blob' }); 
      const url = URL.createObjectURL(content); 
      const a = document.createElement('a'); 
      a.href = url; a.download = `${trip.name.replace(/\s+/g, '_')}_souvenirs.zip`; 
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); 
      setIsSelectionMode(false); setSelectedMediaIds(new Set()); 
    } catch (e) { alert("Erreur lors du téléchargement."); } finally { setIsDownloading(false); } 
  };
  
  const displayedMedia = gallerySortMode === 'moment' 
    ? [...mediaItems].sort((a, b) => { const dayA = DAY_ORDER[a.day || ''] || 99; const dayB = DAY_ORDER[b.day || ''] || 99; if (dayA !== dayB) return dayA - dayB; const slotA = SLOT_ORDER[a.time_slot || ''] || 99; const slotB = SLOT_ORDER[b.time_slot || ''] || 99; return slotA - slotB; }) 
    : mediaItems;

  // --- RENDU PRINCIPAL ---
  if (loading && !trip) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 gap-2"><Loader2 size={24} className="animate-spin" /> Chargement...</div>
  if (error || !trip) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm">{error || "Introuvable"}</div><button onClick={() => router.push('/')} className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm">Retour</button></div>

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">
      
      {/* SIDEBAR PC */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white shadow-sm z-10">
        <div className="p-6">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-primary-600 mb-4 transition-colors"><ChevronLeft size={14} /> Mes voyages</button>
          <h1 className="text-xl font-black text-primary-600 tracking-tight truncate">{trip.name}</h1>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => { const inviteLink = `${window.location.origin}/join/${trip.invite_code}`; navigator.clipboard.writeText(inviteLink); alert("Lien copié !"); }} className="flex-1 flex justify-center items-center gap-2 text-xs font-bold text-primary-600 bg-primary-50 px-3 py-2 rounded-xl hover:bg-primary-100 transition-colors shadow-sm group">
              <Copy size={14} className="group-hover:scale-110 transition-transform" /> Partager
            </button>
            <button onClick={() => setShowEventsModal(true)} className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-xl transition-colors relative">
              <Bell size={16} />
              {events.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
            </button>
          </div>
          <button onClick={() => setShowMembersModal(true)} className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500 bg-gray-50 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors shadow-sm w-full justify-center">
            <Users size={14} /> {members.length} participant(s)
          </button>        
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-2">
          <button onClick={() => setActiveTab('destination')} className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'destination' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}>
            <div className="flex items-center gap-3"><Target size={20} /> {isLocked ? 'Logistique' : 'Destination'}</div>
            {!isLocked && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
          </button>

          <div className="pt-4 mt-4 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-2">Organisation</p>
            <button onClick={(e) => checkLock('calendar', e)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'calendar' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'} ${!isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}><div className="flex items-center gap-3"><CalendarDays size={20} /> Planning</div>{!isLocked && <Lock size={14} className="text-gray-400"/>}</button>
            <button onClick={(e) => checkLock('activities', e)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'activities' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'} ${!isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}><div className="flex items-center gap-3"><Compass size={20} /> Activités</div>{!isLocked && <Lock size={14} className="text-gray-400"/>}</button>
            <button onClick={(e) => checkLock('meals', e)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'meals' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'} ${!isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}><div className="flex items-center gap-3"><Utensils size={20} /> Repas & Courses</div>{!isLocked && <Lock size={14} className="text-gray-400"/>}</button>
            <button onClick={(e) => checkLock('expenses', e)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'expenses' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'} ${!isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}><div className="flex items-center gap-3"><PieChart size={20} /> Comptes</div>{!isLocked && <Lock size={14} className="text-gray-400"/>}</button>
            <button onClick={(e) => checkLock('gallery', e)} className={`w-full flex justify-between items-center px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'gallery' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'} ${!isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}><div className="flex items-center gap-3"><Camera size={20} /> Galerie</div>{!isLocked && <Lock size={14} className="text-gray-400"/>}</button>
          </div>
        </nav>
        <div className="p-4 border-t border-gray-100"><button onClick={() => router.push('/profile')} className="w-full flex items-center justify-center gap-2 text-xs font-bold bg-gray-50 text-gray-600 px-4 py-2.5 rounded-xl hover:bg-primary-50 hover:text-primary-600 transition-colors"><Users size={14} /> Mon Profil</button></div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
        
        {/* HEADER MOBILE */}
        <div className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
          <div className="p-4 flex items-center justify-between">
            <div>
              <button onClick={() => router.push('/')} className="text-xs text-gray-400 hover:text-primary-600 flex items-center gap-1 mb-1 transition-colors">
                <ChevronLeft size={12} /> Retour
              </button>
              <h1 className="font-black text-primary-600 text-lg truncate max-w-[200px]">{trip.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowEventsModal(true)} className="relative p-2 bg-gray-50 text-gray-500 rounded-xl hover:text-primary-600 transition-colors">
                <Bell size={18} />
                {events.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
              </button>
              <button onClick={() => setShowMembersModal(true)} className="text-xs font-bold bg-primary-50 text-primary-600 p-2 rounded-xl hover:bg-primary-100 transition-colors">
                <Users size={18} />
              </button>
            </div>
          </div>
        </div>
        
        {/* DATALIST AUTOCROMPLÉTION GLOBALE */}
        <datalist id="ingredients-list">
          {allIngredients.map((ing, idx) => <option key={idx} value={ing} />)}
        </datalist>

        <div className="p-4 md:p-8">
          
          {/* =========================================================================
              ONGLET 1 : DESTINATION & LOGISTIQUE
              ========================================================================= */}
          {activeTab === 'destination' && (
            <div className="max-w-6xl mx-auto space-y-8">
              {!trip.trip_region ? (
                // --- PHASE 1 : OÙ ET QUAND ---
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary-400 to-blue-500"></div>
                  <div className="mb-6">
                    <h2 className="font-black text-2xl text-gray-800 mb-2">Étape 1 : Où et Quand ? 🌍</h2>
                    <p className="text-gray-500 text-sm">Proposez et notez les zones géographiques. Le système valorise les choix qui font l'unanimité !</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4"><Calendar size={18} className="text-primary-600"/> La semaine</h3>
                      <div className="space-y-3 mb-4">
                        {proposedWeeks.map(w => (
                          <div key={w.id} className="flex flex-col gap-2 bg-white p-3 rounded-xl border shadow-sm relative group">
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 z-10">
                              {(isAdmin || w.by === currentUser?.id) && (
                                <>
                                  <button onClick={() => startEditWeek(w)} className="p-1 bg-white border rounded text-gray-400 hover:text-primary-600 shadow-sm"><Pencil size={12}/></button>
                                  <button onClick={() => handleDeleteWeek(w.id)} className="p-1 bg-white border rounded text-gray-400 hover:text-red-600 shadow-sm"><Trash2 size={12}/></button>
                                </>
                              )}
                            </div>
                            <div className="flex items-center justify-between pr-14">
                              <span className="font-semibold text-sm">{w.text}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400">{w.votes.length} votes</span>
                                <button onClick={() => toggleWeekVote(w.id, w.votes)} className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors ${w.votes.includes(currentUser?.id) ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white text-gray-400 hover:text-primary-600'}`}><Check size={16} /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleSaveWeek} className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 px-2 py-2 text-xs border rounded-xl bg-white text-gray-600" title="Date de début" />
                          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 px-2 py-2 text-xs border rounded-xl bg-white text-gray-600" title="Date de fin" />
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={newWeek} onChange={e => setNewWeek(e.target.value)} placeholder="Format libre (Ex: Mi-Août)" className="flex-1 px-3 py-2 text-sm border rounded-xl" />
                          <button type="submit" disabled={!newWeek.trim()} className="bg-primary-600 text-white p-2 rounded-xl disabled:opacity-50 min-w-[36px] flex items-center justify-center">
                            {editingWeekId ? <Check size={18}/> : <Plus size={18}/>}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4"><Compass size={18} className="text-primary-600"/> La Zone Géo</h3>
                      <div className="space-y-3 mb-4">
                        {proposedRegions.map(r => {
                          const stats = getRatingStats(r.ratings);
                          return (
                            <div key={r.id} className="bg-white p-3 rounded-xl border shadow-sm flex flex-col gap-2 relative group">
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 z-10">
                                {(isAdmin || r.by === currentUser?.id) && (
                                  <><button onClick={() => startEditRegion(r)} className="p-1 bg-white border rounded text-gray-400 hover:text-primary-600 shadow-sm"><Pencil size={12}/></button><button onClick={() => handleDeleteRegion(r.id)} className="p-1 bg-white border rounded text-gray-400 hover:text-red-600 shadow-sm"><Trash2 size={12}/></button></>
                                )}
                              </div>
                              <div className="flex justify-between items-center pr-12">
                                <span className="font-semibold text-sm">{r.name}</span>
                                <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-100 px-2 py-1 rounded" title={`Moyenne brute : ${stats.avg.toFixed(1)}\nDispersion (Écart type) : ${stats.sd.toFixed(2)}`}>
                                  Score : {stats.consensus.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {[1,2,3,4,5].map(star => {
                                  const myScore = currentUser && r.ratings[currentUser.id] ? r.ratings[currentUser.id] : 0;
                                  return <button key={star} onClick={() => handleRegionRating(r.id, r.ratings, star)} className={myScore >= star ? 'text-yellow-400' : 'text-gray-300'}><Star size={20} fill={myScore >= star ? "currentColor" : "none"} /></button>
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <form onSubmit={handleSaveRegion} className="flex gap-2 relative">
                        <input type="text" value={newRegion} onChange={e => setNewRegion(e.target.value)} placeholder="Ex: Bretagne Nord" className="flex-1 px-3 py-2 text-sm border rounded-xl" />
                        <button type="submit" disabled={!newRegion.trim()} className="bg-primary-600 text-white p-2 rounded-xl disabled:opacity-50 min-w-[36px] flex items-center justify-center">{editingRegionId ? <Check size={18}/> : <Plus size={18}/>}</button>
                      </form>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="bg-primary-50 p-5 rounded-2xl border border-primary-100">
                      <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2"><Lock size={18} /> Valider l'Étape 1 (Admin)</h3>
                      <div className="flex flex-col md:flex-row gap-3 mb-4">
                        <select value={lockWeek} onChange={e => setLockWeek(e.target.value)} className="flex-1 text-sm px-3 py-2 border rounded-xl bg-white"><option value="">-- Semaine gagnante --</option>{proposedWeeks.map(w => <option key={w.id} value={w.text}>{w.text}</option>)}</select>
                        <select value={lockRegion} onChange={e => setLockRegion(e.target.value)} className="flex-1 text-sm px-3 py-2 border rounded-xl bg-white"><option value="">-- Région gagnante --</option>{proposedRegions.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</select>
                      </div>
                      <button onClick={handleLockPhase1} disabled={isLocking} className="w-full bg-primary-600 text-white py-3 rounded-xl font-black text-sm shadow-md hover:bg-primary-700 disabled:opacity-50">Valider et passer au choix du Gîte</button>
                    </div>
                  ) : (
                    <div className="bg-orange-50 text-orange-700 p-4 rounded-xl text-sm font-medium border border-orange-100 flex items-start gap-3"><Lock size={20} className="flex-shrink-0" /> Un administrateur doit valider la région avant de chercher les gîtes.</div>
                  )}
                </div>

              ) : !isLocked ? (
                // --- PHASE 2 : RECHERCHE DU GITE ---
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500"></div>
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 bg-primary-100 text-primary-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider mb-2">Étape 2</div>
                      <h2 className="font-black text-2xl text-gray-800 leading-tight">Objectif : {trip.trip_region} 🏡</h2>
                      <p className="text-gray-500 text-sm font-semibold">{trip.trip_week}</p>
                    </div>
                    {isAdmin && <button onClick={handleUnlockPhase1} className="text-xs font-bold text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors">Modifier région</button>}
                  </div>

                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 mb-8">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2"><Home size={18} className="text-primary-600"/> Les Gîtes trouvés</h3>
                      <button onClick={() => setShowPlaceForm(true)} className="text-xs font-bold bg-white border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:text-primary-600"><Plus size={14}/> Proposer un gîte</button>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        {proposedPlaces.length === 0 ? <div className="text-sm text-gray-400 italic">Aucune proposition.</div> : 
                          proposedPlaces.map(p => {
                            const stats = getRatingStats(p.ratings);
                            const itemComments = comments.filter(c => c.item_id === p.id && c.item_type === 'place');
                            return (
                              <div key={p.id} className="bg-white p-4 rounded-xl border shadow-sm relative group overflow-hidden">
                                <div className="absolute top-2 right-2 flex gap-1 z-10">
                                  <button onClick={() => setActiveComments({ id: p.id, title: p.name, type: 'place' })} className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center gap-1">
                                    <MessageCircle size={14}/> {itemComments.length > 0 && <span className="text-[10px] font-bold">{itemComments.length}</span>}
                                  </button>
                                  {(isAdmin || p.by === currentUser?.id) && (
                                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                      <button onClick={() => startEditPlace(p)} className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-primary-600"><Pencil size={14}/></button>
                                      <button onClick={() => handleDeletePlace(p.id)} className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-red-600"><Trash2 size={14}/></button>
                                    </div>
                                  )}
                                </div>
                                <h4 className="font-bold text-gray-800 pr-24">{p.name} {p.link && <a href={p.link} target="_blank" className="text-primary-500 ml-1"><ExternalLink size={12} className="inline"/></a>}</h4>
                                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                  {p.price && <span className="font-semibold text-orange-600">{p.price} €</span>}
                                  {p.beds && <span>🛏️ {p.beds} pers.</span>}
                                  {p.amenities && <span className="truncate max-w-[200px]">✨ {p.amenities}</span>}
                                </div>
                                
                                <div className="mt-3 flex items-center justify-between border-t pt-3">
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(star => {
                                      const myScore = currentUser && p.ratings[currentUser.id] ? p.ratings[currentUser.id] : 0;
                                      return <button key={star} onClick={() => handlePlaceRating(p.id, p.ratings, star)} className={myScore >= star ? 'text-yellow-400' : 'text-gray-200'}><Star size={20} fill={myScore >= star ? "currentColor" : "none"} /></button>
                                    })}
                                  </div>
                                  <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-100 px-2 py-1 rounded" title={`Moy: ${stats.avg.toFixed(1)} | Dispersion: ${stats.sd.toFixed(2)}`}>
                                    Consensus : {stats.consensus.toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            )
                          })
                        }
                      </div>
                      <MapView proposedGites={proposedPlaces} photos={mediaItems}/>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="bg-primary-50 p-5 rounded-2xl border border-primary-100">
                      <h3 className="font-bold text-primary-800 mb-3 flex items-center gap-2"><Lock size={18} /> Sanctuariser le Gîte (Admin)</h3>
                      <div className="flex flex-col sm:flex-row gap-3 mb-4">
                        <select value={lockPlaceId} onChange={e => setLockPlaceId(e.target.value)} className="flex-1 text-sm px-3 py-2 border rounded-xl bg-white"><option value="">-- Sélectionner le gîte final --</option>{proposedPlaces.map(p => <option key={p.id} value={p.id}>{p.name} (Score: {getRatingStats(p.ratings).consensus.toFixed(1)})</option>)}</select>
                        <button onClick={handleLockPhase2} disabled={isLocking} className="bg-primary-600 text-white px-6 py-2 rounded-xl font-black text-sm shadow-md hover:bg-primary-700 disabled:opacity-50">Verrouiller le voyage</button>
                      </div>
                      <p className="text-xs text-primary-500 font-medium">Le verrouillage débloquera l'accès au planning, repas, activités et comptes pour tout le groupe.</p>
                    </div>
                  ) : (
                    <div className="bg-orange-50 text-orange-700 p-4 rounded-xl text-sm font-medium border border-orange-100 flex items-start gap-3"><Lock size={20} className="flex-shrink-0" /> Un administrateur doit choisir le gîte final pour débloquer l'organisation.</div>
                  )}
                </div>

              ) : (
                // --- PHASE 3 : LOGISTIQUE ---
                <div className="space-y-6">
                  {/* EN TÊTE LOGISTIQUE */}
                  <div className="bg-white p-6 md:p-8 rounded-3xl border border-primary-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary-500 to-purple-500"></div>
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider mb-3"><Check size={12} /> Destination Sanctuarisée</div>
                        <h3 className="font-black text-3xl text-gray-800 tracking-tight">{trip.trip_region}</h3>
                        <p className="text-gray-500 mt-1 font-bold">{trip.trip_week}</p>
                      </div>
                      {isAdmin && <button onClick={handleUnlockTrip} className="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-2 rounded-xl transition-colors" title="Déverrouiller"><Unlock size={18} /></button>}
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-gray-800 text-lg flex items-center gap-2"><Home size={20} className="text-primary-600"/> {trip.accommodation_name}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin size={14}/> {trip.accommodation_address}</div>
                      </div>
                      <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(trip.accommodation_address)}`} target="_blank" rel="noreferrer" className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:text-primary-600 flex items-center gap-2 whitespace-nowrap"><MapIcon size={16}/> Ouvrir le GPS</a>
                    </div>

                    <div className="border border-gray-200 rounded-2xl overflow-hidden p-1 bg-gray-50">
                      <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2"><MapIcon size={14}/> Carte Logistique</div>
                      <MapView activities={activities} finalGite={{ name: trip.accommodation_name, lat: trip.accommodation_lat, lng: trip.accommodation_lng }} photos={mediaItems} />
                    </div>
                  </div>

                  {/* MODULES LOGISTIQUES */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col">
                      <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2 mb-4"><Car size={20} className="text-primary-600"/> Arrivées & Départs</h3>
                      <div className="space-y-3 mb-6 flex-1">
                        {transports.filter(t => t.user_id !== currentUser?.id).map(t => (
                          <div key={t.id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 font-bold text-sm text-gray-800">{getTransportIcon(t.mode)} <span>{getMember(t.user_id)?.name}</span></div>
                              {t.seats_available > 0 && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">{t.seats_available} place(s)</span>}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 bg-white/70 p-2.5 rounded-xl border border-gray-100">
                              <div><span className="font-bold text-emerald-600 flex items-center gap-1"><LogIn size={12}/> Arrivée :</span> {t.arrival_day} • {t.arrival_slot} {t.arrival_time && `(${t.arrival_time})`}</div>
                              <div><span className="font-bold text-amber-600 flex items-center gap-1"><LogOut size={12}/> Départ :</span> {t.departure_day} • {t.departure_slot} {t.departure_time && `(${t.departure_time})`}</div>
                            </div>
                          </div>
                        ))}
                        {transports.length === 0 && <div className="text-sm text-gray-400 italic">Personne n'a encore renseigné son trajet.</div>}
                      </div>

                      <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-bold text-sm text-gray-800">Mon trajet</span>
                          {!isEditingTransport && <button onClick={() => setIsEditingTransport(true)} className="text-xs text-primary-600 font-bold bg-primary-50 px-3 py-1.5 rounded-lg">{transports.some(t => t.user_id === currentUser?.id) ? 'Modifier' : 'Renseigner'}</button>}
                        </div>
                        {isEditingTransport ? (
                          <form onSubmit={handleSaveTransport} className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
                            <div className="grid grid-cols-2 gap-2"><select value={myTransport.mode} onChange={e => setMyTransport({...myTransport, mode: e.target.value})} className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none"><option>Voiture</option><option>Train</option><option>Avion</option><option>Covoiturage</option><option>Moto</option><option>Vélo</option></select><input type="text" value={myTransport.coming_from} onChange={e => setMyTransport({...myTransport, coming_from: e.target.value})} placeholder="Départ de (Ville)" className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white outline-none" /></div>
                            <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2"><span className="text-xs font-bold text-emerald-700 flex items-center gap-1"><LogIn size={12}/> Mon Arrivée</span><div className="grid grid-cols-2 gap-2"><select value={myTransport.arrival_day} onChange={e => setMyTransport({...myTransport, arrival_day: e.target.value})} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none">{WEEK_DAYS.map(d => <option key={d} value={d}>{d}</option>)}</select><select value={myTransport.arrival_slot} onChange={e => setMyTransport({...myTransport, arrival_slot: e.target.value})} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none">{['Matin', 'Déjeuner', 'Après-midi', 'Dîner', 'Soirée'].map(s => <option key={s} value={s}>{s}</option>)}</select></div><input type="text" value={myTransport.arrival_time} onChange={e => setMyTransport({...myTransport, arrival_time: e.target.value})} placeholder="Heure exacte (Ex: 16h30)" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none" /></div>
                            <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-2"><span className="text-xs font-bold text-amber-700 flex items-center gap-1"><LogOut size={12}/> Mon Départ</span><div className="grid grid-cols-2 gap-2"><select value={myTransport.departure_day} onChange={e => setMyTransport({...myTransport, departure_day: e.target.value})} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none">{WEEK_DAYS.map(d => <option key={d} value={d}>{d}</option>)}</select><select value={myTransport.departure_slot} onChange={e => setMyTransport({...myTransport, departure_slot: e.target.value})} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none">{['Matin', 'Déjeuner', 'Après-midi', 'Dîner', 'Soirée'].map(s => <option key={s} value={s}>{s}</option>)}</select></div><input type="text" value={myTransport.departure_time} onChange={e => setMyTransport({...myTransport, departure_time: e.target.value})} placeholder="Heure exacte (Ex: 10h00)" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none" /></div>
                            <div className="flex items-center gap-2 pt-1"><label className="text-xs text-gray-500 font-bold">Places libres :</label><input type="number" value={myTransport.seats_available} onChange={e => setMyTransport({...myTransport, seats_available: Number(e.target.value)})} className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-center outline-none" /></div>
                            <div className="flex gap-2 pt-2"><button type="button" onClick={() => setIsEditingTransport(false)} className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 rounded-xl">Annuler</button><button type="submit" className="flex-1 py-2 text-xs font-bold text-white bg-primary-600 rounded-xl shadow-sm">Valider</button></div>
                          </form>
                        ) : ( transports.some(t => t.user_id === currentUser?.id) ? (
                            <div className="p-3.5 bg-primary-50 rounded-2xl border border-primary-100 flex flex-col gap-2">
                              <div className="flex items-center justify-between"><div className="font-bold text-sm text-primary-900 flex items-center gap-2">{getTransportIcon(myTransport.mode || 'Voiture')} <span>En {myTransport.mode}</span></div>{myTransport.seats_available ? <span className="text-[10px] bg-primary-200 text-primary-800 font-bold px-2 py-0.5 rounded-full">+{myTransport.seats_available} places</span> : ''}</div>
                              <div className="grid grid-cols-2 gap-2 text-xs text-primary-800 bg-white/70 p-2.5 rounded-xl border border-primary-100">
                                <div><span className="font-bold text-emerald-700 flex items-center gap-1"><LogIn size={12}/> Arrivée :</span> {myTransport.arrival_day} • {myTransport.arrival_slot} {myTransport.arrival_time && `(${myTransport.arrival_time})`}</div>
                                <div><span className="font-bold text-amber-700 flex items-center gap-1"><LogOut size={12}/> Départ :</span> {myTransport.departure_day} • {myTransport.departure_slot} {myTransport.departure_time && `(${myTransport.departure_time})`}</div>
                              </div>
                            </div>
                          ) : ( <div className="text-xs text-orange-600 bg-orange-50 border border-orange-100 p-3 rounded-xl">Tu n'as pas encore indiqué tes dates d'arrivée et de départ !</div> )
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col">
                      <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2 mb-2"><Backpack size={20} className="text-primary-600"/> Matériel partagé</h3>
                      <p className="text-xs text-gray-500 mb-4">Jeux de société, enceinte, appareil à raclette... Évitons les doublons !</p>
                      
                      <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto pr-1 flex-1">
                        {equipments.map(eq => (
                          <div key={eq.id} onClick={() => toggleEquipmentAssign(eq)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer group transition-colors ${eq.assignee_id ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-primary-300 hover:bg-primary-50'}`}>
                            <div className="flex items-center gap-3"><div className={`w-5 h-5 rounded flex items-center justify-center border ${eq.assignee_id ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 text-transparent'}`}><Check size={14}/></div><span className={`text-sm font-semibold ${eq.assignee_id ? 'text-gray-500' : 'text-gray-800'}`}>{eq.name}</span></div>
                            <div className="flex items-center gap-2">{eq.assignee_id && <span className="text-[10px] font-bold bg-white px-2 py-1 border rounded-lg text-primary-600 shadow-sm">{getMember(eq.assignee_id)?.name}</span>} {(isAdmin || !eq.assignee_id || eq.assignee_id === currentUser?.id) && ( <button onClick={(e) => deleteEquipment(eq.id, e)} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14}/></button> )}</div>
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleAddEquipment} className="flex gap-2">
                        <input type="text" value={newEquipment} onChange={e => setNewEquipment(e.target.value)} placeholder="Ajouter un objet..." className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 outline-none" />
                        <button type="submit" disabled={!newEquipment.trim()} className="bg-primary-600 text-white px-4 py-2 rounded-xl disabled:opacity-50 font-bold"><Plus size={18}/></button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              ONGLET 2 : CALENDRIER
              ========================================================================= */}
          {activeTab === 'calendar' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Planning de la semaine</h2>
              
              {weather && isLocked && (
                <div className="bg-gradient-to-br from-blue-500 to-primary-600 rounded-3xl p-5 text-white shadow-md flex overflow-x-auto gap-4 snap-x hide-scrollbar">
                  <div className="flex items-center gap-3 pr-4 border-r border-white/20 shrink-0">
                    <CloudSun size={36} className="text-blue-100" />
                    <div><div className="font-black text-lg">Météo</div><div className="text-xs text-blue-100 max-w-[120px] truncate">{trip.accommodation_name}</div></div>
                  </div>
                  {weather.map((day, i) => {
                    const dateObj = new Date(day.date); const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''); const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                    return (
                      <div key={i} className="flex flex-col items-center justify-center shrink-0 bg-white/10 px-4 py-2 rounded-2xl snap-start">
                        <span className="text-xs font-bold text-blue-100">{capDay} {dateObj.getDate()}</span>
                        <span className="text-3xl my-1">{getWeatherIcon(day.code)}</span>
                        <span className="text-sm font-black">{Math.round(day.max)}° <span className="text-blue-200 font-medium ml-1">{Math.round(day.min)}°</span></span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex overflow-x-auto gap-2 pb-2 snap-x hide-scrollbar sticky top-[60px] md:top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-2 -mx-4 px-4 md:mx-0 md:px-0">
                  {WEEK_DAYS.map(day => (
                    <button
                      key={day}
                      onClick={() => setSelectedPlanningDay(day)}
                      className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${selectedPlanningDay === day ? 'bg-primary-600 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="bg-primary-50/50 px-5 py-3 border-b border-primary-50 flex items-center justify-between">
                    <span className="font-black text-primary-800 text-lg uppercase tracking-tight">{selectedPlanningDay}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {['Matin', 'Déjeuner', 'Après-midi', 'Dîner', 'Soirée'].map(slot => {
                      const day = selectedPlanningDay;
                      const slotMeals = meals.filter(m => m.day === day && m.type === slot);
                      const slotActivities = activities.filter(a => a.day === day && (a.timeSlot === slot || (a.timeSlot === 'Journée entière' && ['Matin', 'Déjeuner', 'Après-midi'].includes(slot))));
                      const slotArrivals = transports.filter(t => (t.arrival_day || 'Samedi (Arrivée)') === day && (t.arrival_slot || 'Après-midi') === slot);
                      const slotDepartures = transports.filter(t => (t.departure_day || 'Samedi (Départ)') === day && (t.departure_slot || 'Matin') === slot);

                      return (
                        <div key={slot} className="p-4 flex flex-col md:flex-row md:items-start gap-4 hover:bg-gray-50/30 transition-colors">
                          <div className="w-32 flex-shrink-0 flex flex-col gap-2">
                            <span className="font-bold text-sm text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 w-fit">{slot}</span>
                            {(() => {
                              const slotPhotos = mediaItems.filter((m: any) => m.day === day && m.time_slot === slot);
                              return (
                                <div className="flex flex-col gap-3 mt-2">
                                  <button onClick={() => { setSelectedSlotForMedia({ day, slot }); setShowMediaUploadModal(true); }} className="flex items-center gap-2 text-xs font-bold text-primary-600 bg-primary-50 px-3 py-2 rounded-xl hover:bg-primary-100 transition-colors shadow-sm w-fit"><Camera size={14} /> Photos</button>
                                  {slotPhotos.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {slotPhotos.map((photo: any, idx: number) => (
                                        <div key={photo.id} className="w-14 h-14 relative group">
                                          {photo.media_type === 'video' ? (
                                            <><video src={photo.file_path} className="w-full h-full object-cover rounded-xl border shadow-sm cursor-pointer" onClick={() => openViewer(slotPhotos, idx)} /><div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white"><Play size={10} fill="currentColor" /></div></div></>
                                          ) : ( <img src={photo.file_path} alt="Souvenir" onClick={() => openViewer(slotPhotos, idx)} className="w-full h-full object-cover rounded-xl border shadow-sm cursor-pointer" /> )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {slotArrivals.map(t => (
                              <div key={`arr-${t.id}`} className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-center">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                                <div className="text-[10px] font-black text-emerald-700 uppercase mb-0.5 flex items-center gap-1"><LogIn size={11}/> Arrivée</div>
                                <div className="font-bold text-emerald-950 text-sm flex items-center gap-1.5"><span>{getMember(t.user_id)?.name}</span> {t.mode && <span className="text-xs font-normal text-emerald-700">({t.mode})</span>}</div>
                                {t.arrival_time && <div className="text-[11px] text-emerald-600 font-medium">À {t.arrival_time}</div>}
                              </div>
                            ))}
                            {slotDepartures.map(t => (
                              <div key={`dep-${t.id}`} className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-center">
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                                <div className="text-[10px] font-black text-amber-700 uppercase mb-0.5 flex items-center gap-1"><LogOut size={11}/> Départ</div>
                                <div className="font-bold text-amber-950 text-sm flex items-center gap-1.5"><span>{getMember(t.user_id)?.name}</span> {t.mode && <span className="text-xs font-normal text-amber-700">({t.mode})</span>}</div>
                                {t.departure_time && <div className="text-[11px] text-amber-600 font-medium">À {t.departure_time}</div>}
                              </div>
                            ))}
                            {slotMeals.map(meal => (
                              <div key={`meal-${meal.id}`} className="bg-orange-50/50 border border-orange-100 p-3 rounded-xl shadow-sm relative overflow-hidden group cursor-pointer" onClick={() => setActiveTab('meals')}>
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400"></div>
                                <div className="text-[10px] font-black text-orange-600 uppercase mb-1 flex items-center gap-1"><Utensils size={10} /> Repas</div>
                                <div className="font-bold text-gray-800 text-sm">{meal.name}</div>
                              </div>
                            ))}
                            {slotActivities.map(act => {
                              const itemComments = comments.filter(c => c.item_id === act.id.toString() && c.item_type === 'activity');
                              return (
                                <div key={`act-${act.id}`} className="bg-primary-50/50 border border-primary-100 p-3 rounded-xl shadow-sm relative overflow-hidden group">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500"></div>
                                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                                    <button onClick={() => setActiveComments({ id: act.id.toString(), title: act.title, type: 'activity' })} className="p-1 bg-white/50 border border-gray-100 rounded text-gray-400 hover:text-primary-600 transition-colors flex items-center gap-1">
                                      <MessageCircle size={12}/> {itemComments.length > 0 && <span className="text-[9px] font-bold">{itemComments.length}</span>}
                                    </button>
                                  </div>
                                  <div className="flex justify-between items-start">
                                    <div className="cursor-pointer pr-8" onClick={() => setActiveTab('activities')}><div className="text-[10px] font-black text-primary-600 uppercase mb-1 flex items-center gap-1"><Compass size={10} /> {act.timeSlot === 'Journée entière' ? 'Activité longue' : 'Activité'}</div><div className="font-bold text-gray-800 text-sm">{act.title}</div></div>
                                  </div>
                                  {act.durationFromAcc && <div className="mt-2 text-[10px] font-bold text-orange-600 bg-orange-50 w-fit px-1.5 py-0.5 rounded flex items-center gap-1"><Car size={10}/> {act.durationFromAcc}</div>}
                                </div>
                              )
                            })}
                            {slotMeals.length === 0 && slotActivities.length === 0 && slotArrivals.length === 0 && slotDepartures.length === 0 && (
                              <div className="text-gray-300 text-sm font-medium italic">Quartier libre...</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              ONGLET 3 : ACTIVITÉS
              ========================================================================= */}
          {activeTab === 'activities' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-gray-800">Boîte à idées</h2><button onClick={() => { resetActivityForm(); setShowActivityForm(true); }} className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm"><Plus size={18} className="inline"/> Proposer</button></div>
              {trip?.accommodation_lat && trip?.accommodation_lng && (
                <div className="border border-gray-200 rounded-2xl overflow-hidden p-1 bg-white shadow-sm mb-6">
                  <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2"><MapIcon size={14}/> Carte des activités</div>
                  <MapView activities={activities} finalGite={{ name: trip.accommodation_name, lat: trip.accommodation_lat, lng: trip.accommodation_lng }} photos={mediaItems} />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {activities.map(act => {
                  const itemComments = comments.filter(c => c.item_id === act.id.toString() && c.item_type === 'activity');
                  return (
                    <div key={act.id} className="bg-white p-5 rounded-2xl border shadow-sm flex flex-col group relative">
                      <div className="absolute top-4 right-4 flex gap-1 z-10">
                        <button onClick={() => setActiveComments({ id: act.id.toString(), title: act.title, type: 'activity' })} className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center gap-1">
                          <MessageCircle size={14}/> {itemComments.length > 0 && <span className="text-[10px] font-bold">{itemComments.length}</span>}
                        </button>
                        {(isAdmin || act.proposedBy === currentUser?.id) && (
                          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                            <button onClick={() => editActivity(act)} className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-primary-600"><Pencil size={14}/></button>
                            <button onClick={() => handleDeleteActivity(act.id)} className="p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                          </div>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-gray-800 mb-2 pr-24">{act.title} {act.link && <a href={act.link} target="_blank" className="text-primary-500"><ExternalLink size={14} className="inline"/></a>}</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {act.price && <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-1 rounded">{act.price} €</span>}
                        {act.durationFromAcc && <span className="text-xs font-bold text-orange-700 bg-orange-50 px-2 py-1 rounded flex items-center gap-1" title="Temps de route"><Car size={12}/> {act.durationFromAcc}</span>}
                      </div>
                      {act.address && <p className="text-xs text-gray-500 mb-2 flex items-start gap-1"><MapPin size={12} className="flex-shrink-0 mt-0.5" /> <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(act.address)}`} target="_blank" className="hover:text-primary-600">{act.address}</a></p>}
                      <p className="text-sm text-gray-600 mb-4 flex-1">{act.description}</p>
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => handleActivityVote(act.id, 'yes')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${currentUser && act.votes[currentUser.id] === 'yes' ? 'bg-green-500 text-white' : 'text-gray-500'}`}>Partant</button>
                        <button onClick={() => handleActivityVote(act.id, 'maybe')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${currentUser && act.votes[currentUser.id] === 'maybe' ? 'bg-orange-400 text-white' : 'text-gray-500'}`}>Peut-être</button>
                        <button onClick={() => handleActivityVote(act.id, 'no')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${currentUser && act.votes[currentUser.id] === 'no' ? 'bg-red-500 text-white' : 'text-gray-500'}`}>Non</button>
                      </div>
                      {Object.keys(act.votes).length > 0 && (
                        <div className="flex gap-3 min-h-[24px]">
                          {['yes', 'maybe', 'no'].map(vType => {
                            const voters = Object.entries(act.votes).filter(([_, v]) => v === vType); if (voters.length === 0) return null;
                            const c = { yes: 'border-green-400 bg-green-50', maybe: 'border-orange-300 bg-orange-50', no: 'border-red-400 bg-red-50' };
                            return <div key={vType} className="flex -space-x-1.5">{voters.map(([uId]) => { const m = getMember(uId); return m ? <div key={uId} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${c[vType as ActivityVote]}`}>{m.avatar?.startsWith('http') ? <img src={m.avatar} alt={m.name} className="w-full h-full object-cover rounded-full" /> : m.avatar}</div> : null; })}</div>
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {showActivityForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <form onSubmit={handleSaveActivity} className="bg-white w-full max-w-md rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between"><h3 className="font-bold">{editingActivityId ? "Modifier" : "Nouvelle Activité"}</h3><button onClick={resetActivityForm}><X size={18}/></button></div>
                    <input type="text" value={actTitle} onChange={e => setActTitle(e.target.value)} placeholder="Titre *" className="w-full px-3 py-2 border rounded-xl"/>
                    <input type="text" value={actAddress} onChange={e => setActAddress(e.target.value)} placeholder="Adresse exacte (Pour le calcul GPS)" className="w-full px-3 py-2 border rounded-xl"/>
                    <textarea value={actDesc} onChange={e => setActDesc(e.target.value)} placeholder="Description" className="w-full px-3 py-2 border rounded-xl h-24"/>
                    <div className="grid grid-cols-2 gap-3">
                      <select value={actDay} onChange={e => setActDay(e.target.value)} className="border rounded-xl px-3 py-2 bg-white"><option value="">Jour</option>{WEEK_DAYS.map(d=><option key={d}>{d}</option>)}</select>
                      <select value={actTimeSlot} onChange={e => setActTimeSlot(e.target.value)} className="border rounded-xl px-3 py-2 bg-white"><option value="">Horaire</option><option value="Matin">Matin</option><option value="Déjeuner">Déjeuner</option><option value="Après-midi">Après-midi</option><option value="Dîner">Dîner</option><option value="Soirée">Soirée</option><option value="Journée entière">Journée entière</option></select>
                      <input type="number" value={actPrice} onChange={e => setActPrice(e.target.value)} placeholder="Prix (€)" className="border rounded-xl px-3 py-2"/>
                      <input type="url" value={actLink} onChange={e => setActLink(e.target.value)} placeholder="Lien Web" className="border rounded-xl px-3 py-2"/>
                    </div>
                    <button type="submit" disabled={isSavingAct} className="w-full bg-primary-600 text-white py-2.5 rounded-xl font-bold">{isSavingAct ? <Loader2 size={18} className="animate-spin" /> : "Valider"}</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              ONGLET 4 : REPAS ET COURSES
              ========================================================================= */}
          {activeTab === 'meals' && (
            <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto relative">
              <div className="flex-1 space-y-6">
                <h2 className="text-2xl font-bold text-gray-800">Planning des repas</h2>
                <div className="space-y-4">
                  {WEEK_DAYS.map(day => (
                    <div key={day} className="bg-white rounded-2xl border shadow-sm">
                      <div className="bg-gray-50 px-4 py-2 border-b font-bold text-gray-700">{day}</div>
                      <div className="divide-y">
                        {['Déjeuner', 'Dîner'].map(type => {
                          const meal = meals.find(m => m.day === day && m.type === type);
                          const mealActivities = activities.filter(a => a.day === day && (a.timeSlot === type || (a.timeSlot === 'Journée entière' && type === 'Déjeuner')));
                          return (
                            <div key={type} className="p-4 flex flex-col md:flex-row gap-4">
                              <div className="w-24 text-sm text-gray-400 font-semibold">{type}</div>
                              <div className="flex-1 space-y-3">
                                {meal && (
                                  <div className="group relative bg-white border border-gray-100 p-3 rounded-xl shadow-sm">
                                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex gap-2"><button onClick={() => editMeal(meal)} className="p-1 border rounded bg-white text-gray-400 hover:text-primary-600"><Pencil size={14}/></button><button onClick={() => handleDeleteMeal(meal.id)} className="p-1 border rounded bg-white text-gray-400 hover:text-red-600"><Trash2 size={14}/></button></div>
                                    <h3 className="font-bold text-lg mb-2">🍲 {meal.name} {meal.recipeLink && <a href={meal.recipeLink} target="_blank" className="text-primary-500 text-xs"><ExternalLink size={10} className="inline"/></a>}</h3>
                                    <div className="text-sm text-gray-500 space-y-1 mb-3">{meal.starter && <div>🥗 {meal.starter}</div>} {meal.dessert && <div>🍰 {meal.dessert}</div>} {meal.drinks && <div>🥂 {meal.drinks}</div>}</div>
                                    <div className="flex gap-2 flex-wrap">{meal.ingredients.map((i, idx) => <span key={idx} className="text-[11px] bg-gray-100 px-2 py-1 rounded">{i.name} {i.qty && `(${i.qty})`}</span>)}</div>
                                  </div>
                                )}
                                {mealActivities.map(act => (
                                  <div key={`act-meal-${act.id}`} className="bg-primary-50/50 border border-primary-100 p-3 rounded-xl shadow-sm relative overflow-hidden group cursor-pointer" onClick={() => setActiveTab('activities')}>
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500"></div><div className="text-[10px] font-black text-primary-600 uppercase mb-1 flex items-center gap-1"><Compass size={10} /> Activité / Resto</div><div className="font-bold text-gray-800 text-sm">{act.title}</div>
                                  </div>
                                ))}
                                {!meal && (
                                  <button onClick={() => { resetMealForm(); setMealDay(day); setMealType(type); setShowMealForm(true); }} className={`w-full border-2 border-dashed rounded-xl flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 ${mealActivities.length > 0 ? 'h-10 text-xs' : 'h-12 text-sm'}`}><Plus size={14} className="mr-2" /> {mealActivities.length > 0 ? 'Ajouter quand même un repas' : 'Ajouter un repas'}</button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-96">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-6">
                  <div className="flex justify-between mb-4"><h3 className="font-bold text-lg flex items-center gap-2"><ShoppingBag size={20} className="text-primary-600"/> Courses</h3><span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">{Object.keys(checkedItems).filter(k => checkedItems[k]).length}/{shoppingList.length}</span></div>
                  
                  <form onSubmit={handleAddExtraItem} className="flex gap-2 mb-4">
                    <input type="text" list="ingredients-list" value={newExtraItem} onChange={e => setNewExtraItem(e.target.value)} placeholder="Article libre (Bières)" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
                    <input type="text" value={newExtraQty} onChange={e => setNewExtraQty(e.target.value)} placeholder="Qté" className="w-16 border rounded-xl px-2 py-2 text-sm" />
                    <button type="submit" className="bg-primary-600 text-white p-2 rounded-xl"><Plus size={18}/></button>
                  </form>
                  
                  <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 pb-10">
                    {SHOPPING_CATEGORIES.map(category => {
                      const itemsInCategory = shoppingList.filter(item => item.category === category);
                      if (itemsInCategory.length === 0) return null;
                      return (
                        <div key={category} className="mb-2">
                          <h4 className="font-bold text-gray-800 border-b border-gray-100 pb-1 mb-2 text-sm">{category}</h4>
                          <div className="space-y-1.5">
                            {itemsInCategory.map((item, idx) => (
                              <div key={idx} onClick={() => toggleCheck(item.id)} className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer border group transition-all ${checkedItems[item.id] ? 'bg-gray-50 opacity-50 border-transparent' : 'bg-white hover:border-primary-100 border-gray-100 shadow-sm'}`}>
                                <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border shrink-0 ${checkedItems[item.id] ? 'bg-green-500 border-green-500 text-white' : ''}`}>{checkedItems[item.id] && <Check size={14} />}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className={`text-sm font-semibold truncate ${checkedItems[item.id] ? 'line-through' : ''}`}>{item.name} {item.displayQty && <span className="text-xs font-normal text-gray-500">({item.displayQty})</span>}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <select value={item.category} onChange={(e) => { e.stopPropagation(); handleChangeCategory(item.id, e.target.value); }} onClick={(e) => e.stopPropagation()} className="text-[10px] font-bold bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 hover:border-primary-300 hover:text-primary-600 outline-none cursor-pointer shadow-sm transition-colors">
                                        {SHOPPING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                      {item.isExtra && <button onClick={(e) => handleDeleteExtraItem(item.dbId, e)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-1">{item.tags.map((t:any, i:number) => <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.color}`}>{t.text}</span>)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {showMealForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
                    <div className="p-5 border-b flex justify-between"><h3 className="font-bold text-lg">{editingMealId ? 'Modifier le repas' : 'Nouveau repas'}</h3><button type="button" onClick={resetMealForm}><X size={18}/></button></div>
                    <form onSubmit={handleSaveMeal} className="flex-1 overflow-y-auto flex flex-col">
                      <div className="p-5 space-y-4">
                        <div className="font-bold text-primary-700 bg-primary-50 p-2 rounded">{mealDay} • {mealType}</div>
                        <input type="text" value={mealName} onChange={e => setMealName(e.target.value)} placeholder="Plat principal *" className="w-full px-3 py-2 border rounded-xl" autoFocus />
                        <div className="grid grid-cols-2 gap-3"><input type="text" value={mealStarter} onChange={e => setMealStarter(e.target.value)} placeholder="Entrée" className="border rounded-xl px-3 py-2" /><input type="text" value={mealDessert} onChange={e => setMealDessert(e.target.value)} placeholder="Dessert" className="border rounded-xl px-3 py-2" /></div>
                        <input type="text" value={mealDrinks} onChange={e => setMealDrinks(e.target.value)} placeholder="Boissons" className="w-full border rounded-xl px-3 py-2" />
                        <input type="url" value={mealRecipeLink} onChange={e => setMealRecipeLink(e.target.value)} placeholder="Lien Recette (Web)" className="w-full border rounded-xl px-3 py-2 text-primary-600" />
                        <div>
                          <label className="text-xs font-bold text-gray-500 block mb-1">Ingrédients</label>
                          {mealIngredients.map((ing, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                              <input type="text" list="ingredients-list" value={ing.name} onChange={e => { const i = [...mealIngredients]; i[idx].name = e.target.value; setMealIngredients(i); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setMealIngredients([...mealIngredients, {name:'', qty:''}]); } }} placeholder="Ingrédient" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
                              <input type="text" value={ing.qty} onChange={e => { const i = [...mealIngredients]; i[idx].qty = e.target.value; setMealIngredients(i); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setMealIngredients([...mealIngredients, {name:'', qty:''}]); } }} placeholder="Qté" className="w-16 border rounded-xl px-2 py-2 text-sm" />
                              <button type="button" onClick={() => setMealIngredients(mealIngredients.filter((_, i) => i !== idx))} className="text-red-400 p-2"><Trash2 size={16}/></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setMealIngredients([...mealIngredients, {name:'', qty:''}])} className="text-primary-600 text-xs font-bold flex items-center gap-1"><Plus size={12}/> Ajouter un ingrédient</button>
                        </div>
                      </div>
                      <div className="p-5 border-t"><button type="submit" className="w-full bg-primary-600 text-white py-2.5 rounded-xl font-bold">Valider le repas entier</button></div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              ONGLET 5 : COMPTES
              ========================================================================= */}
          {activeTab === 'expenses' && (
            <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto relative">
              <div className="w-full lg:w-1/3 space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm sticky top-6">
                  <h3 className="font-bold text-lg mb-4 flex gap-2"><PieChart size={18} className="text-primary-600"/> Soldes</h3>
                  <div className="space-y-2">
                    {allKnownMembers.map(m => {
                      const b = balances[m.id] || 0;
                      return (
                        <div key={m.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50">
                          <div className="flex gap-2 items-center"><div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs">{m.avatar?.startsWith('http') ? <img src={m.avatar} alt={m.name} className="w-full h-full object-cover rounded-full" /> : m.avatar}</div> <span className="text-sm font-semibold">{m.name}</span></div>
                          <span className={`font-bold text-sm ${b > 0.01 ? 'text-green-600' : b < -0.01 ? 'text-red-600' : 'text-gray-400'}`}>{b > 0 ? '+' : ''}{b.toFixed(2)} €</span>
                        </div>
                      )
                    })}
                  </div>
                  
                  {reimbursements.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <h4 className="text-xs font-bold text-gray-400 mb-3 uppercase">Remboursements</h4>
                      {reimbursements.map((r, idx) => (
                        <div key={idx} className="flex flex-col gap-2 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex justify-between items-center text-sm">
                            <span>{getMember(r.from)?.name} <ArrowRight size={12} className="inline mx-1"/> {getMember(r.to)?.name}</span>
                            <span className="font-bold text-primary-600">{r.amount.toFixed(2)} €</span>
                          </div>
                          <button onClick={() => handleSettleDebt(r.from, r.to, r.amount)} className="w-full bg-green-100 text-green-700 hover:bg-green-200 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center justify-center gap-2 text-xs"><Check size={14} /> Marquer comme remboursé</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Dépenses</h2><button onClick={() => { resetExpenseForm(); setShowExpenseForm(true); }} className="bg-primary-600 text-white px-4 py-2 rounded-xl text-sm"><Plus size={18} className="inline"/> Ajouter</button></div>
                {expenses.length === 0 ? <div className="text-center p-8 bg-white rounded-xl border text-gray-400">Aucune dépense.</div> : (
                  expenses.map(exp => (
                    <div key={exp.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between relative group">
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1"><button onClick={() => editExpense(exp)} className="p-1"><Pencil size={14}/></button><button onClick={() => handleDeleteExpense(exp.id)} className="p-1 text-red-500"><Trash2 size={14}/></button></div>
                      <div>
                        <h3 className="font-bold">{exp.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">Par {getMember(exp.paidBy)?.name} • Divisé en {exp.splitAmong.length}</p>
                      </div>
                      <div className="text-lg font-black text-primary-600">{exp.amount.toFixed(2)} €</div>
                    </div>
                  ))
                )}
              </div>

              {showExpenseForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white w-full max-w-md rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between"><h3 className="font-bold">{editingExpenseId ? 'Modifier' : 'Ajouter'}</h3><button onClick={resetExpenseForm}><X size={18}/></button></div>
                    <input type="text" value={expenseTitle} onChange={e => setExpenseTitle(e.target.value)} placeholder="Titre" className="w-full border rounded-xl px-3 py-2" />
                    <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value ? Number(e.target.value) : '')} placeholder="Montant (€)" className="w-full border rounded-xl px-3 py-2" />
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Payé par</label>
                      <select value={expensePayer} onChange={e => setExpensePayer(e.target.value)} className="w-full border rounded-xl px-3 py-2 bg-white">
                        <option value="" disabled>Sélectionner...</option>
                        {allKnownMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-bold text-gray-500 mb-1"><label>Pour qui ?</label><button onClick={() => setExpenseSplitAmong(expenseSplitAmong.length === allKnownMembers.length ? [] : allKnownMembers.map(m => m.id))} className="text-primary-600">Tout cocher</button></div>
                      <div className="flex flex-wrap gap-2">
                        {allKnownMembers.map(m => {
                          const isInc = expenseSplitAmong.includes(m.id);
                          return <button key={m.id} onClick={() => setExpenseSplitAmong(isInc ? expenseSplitAmong.filter(id => id !== m.id) : [...expenseSplitAmong, m.id])} className={`px-2 py-1 rounded border text-xs font-medium ${isInc ? 'bg-primary-600 text-white' : 'bg-gray-50'}`}>{m.name}</button>
                        })}
                      </div>
                    </div>
                    <button onClick={handleSaveExpense} className="w-full bg-primary-600 text-white py-2.5 rounded-xl font-bold">Valider</button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* =========================================================================
              ONGLET 6 : GALERIE
              ========================================================================= */}
          {activeTab === 'gallery' && (
            <div className="max-w-6xl mx-auto space-y-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 sticky top-[60px] md:top-0 bg-white/90 backdrop-blur-sm z-10 pt-2 -mx-4 px-4 md:mx-0 md:px-0">
                <h2 className="text-2xl font-bold text-gray-800">Souvenirs 📸</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {mediaItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      {isSelectionMode ? (
                        <>
                          <span className="text-sm font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg">{selectedMediaIds.size} sélectionné(s)</span>
                          <button onClick={handleDownloadSelected} disabled={isDownloading || selectedMediaIds.size === 0} className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary-700 disabled:opacity-50">
                            {isDownloading ? <Loader2 className="animate-spin" size={14}/> : <><Download size={14}/> ZIP</>}
                          </button>
                          <button onClick={() => {setIsSelectionMode(false); setSelectedMediaIds(new Set())}} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-gray-200">Annuler</button>
                        </>
                      ) : (
                        <button onClick={() => setIsSelectionMode(true)} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-gray-200 flex items-center gap-2"><Check size={14}/> Sélectionner</button>
                      )}
                    </div>
                  )}
                  {!isSelectionMode && (
                    <>
                      <div className="flex bg-gray-100 p-1 rounded-lg"><button onClick={() => setGallerySortMode('date')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${gallerySortMode === 'date' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}>Récents</button><button onClick={() => setGallerySortMode('moment')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${gallerySortMode === 'moment' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}>Par moment</button></div>
                      <button onClick={() => setShowMediaUploadModal(true)} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl font-medium text-sm hover:bg-primary-700 shadow-sm"><Plus size={18} /> Ajouter</button>
                    </>
                  )}
                </div>
              </div>
              
              {mediaItems.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 text-gray-400"><Camera size={48} className="mx-auto mb-4 text-gray-300" /><p>Aucun souvenir pour le moment.</p></div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {displayedMedia.map((media, idx) => (
                    <div key={media.id} onClick={() => isSelectionMode ? toggleMediaSelection(media.id) : openViewer(displayedMedia, idx)} className={`relative aspect-square group rounded-2xl overflow-hidden bg-gray-100 border-2 shadow-sm cursor-pointer transition-all ${isSelectionMode && selectedMediaIds.has(media.id) ? 'border-primary-500 scale-95 opacity-80' : 'border-transparent hover:border-gray-200'}`}>
                      {gallerySortMode === 'moment' && (media.day || media.time_slot) && !isSelectionMode && ( <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md pointer-events-none backdrop-blur-sm">{media.day?.replace(' (Arrivée)','').replace(' (Départ)','')} {media.time_slot ? `- ${media.time_slot}` : ''}</div> )}
                      {isSelectionMode && ( <div className="absolute top-2 left-2 z-20"><div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedMediaIds.has(media.id) ? 'bg-primary-500 border-primary-500 text-white' : 'bg-black/30 border-white text-transparent'} `}><Check size={14} /></div></div> )}
                      {media.media_type === 'video' ? ( <><video src={media.file_path} className="w-full h-full object-cover" /><div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"><Play size={20} fill="currentColor" /></div></div></> ) : ( <img src={media.file_path} alt="Souvenir" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" /> )}
                      {!isSelectionMode && ( <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 z-10" onClick={e => e.stopPropagation()}><button onClick={() => openEditMedia(media)} className="bg-white/90 p-1.5 rounded-lg text-gray-500 hover:text-primary-600"><Pencil size={14} /></button><button onClick={() => handleDeleteMedia(media.id, media.file_path)} className="bg-white/90 p-1.5 rounded-lg text-gray-500 hover:text-red-500"><Trash2 size={14} /></button></div> )}                        
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* =========================================================================
              MODALES COMMUNES
              ========================================================================= */}
          
          {/* 1. Modal Upload Media */}
          {showMediaUploadModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl p-5 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg text-gray-800">Ajouter des souvenirs</h3><button onClick={closeMediaUploadModal} className="text-gray-400 hover:text-gray-600"><X size={20}/></button></div>
                <input type="file" multiple accept="image/*,video/*" onChange={handleFileSelectionForBulk} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 mb-4 shrink-0"/>
                <div className="overflow-y-auto space-y-3 mb-4 flex-1 pr-2">
                  {pendingMediaItems.map(item => (
                    <div key={item.id} className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <img src={item.preview} className="w-16 h-16 object-cover rounded-lg shrink-0" alt="Aperçu" />
                      <div className="flex-1 w-full grid grid-cols-2 gap-2"><select value={item.day} onChange={e => updatePendingMedia(item.id, 'day', e.target.value)} className="border rounded-lg px-2 py-2 text-xs bg-white text-gray-700"><option value="">Jour</option>{WEEK_DAYS.map(d=><option key={d}>{d}</option>)}</select><select value={item.time_slot} onChange={e => updatePendingMedia(item.id, 'time_slot', e.target.value)} className="border rounded-lg px-2 py-2 text-xs bg-white text-gray-700"><option value="">Moment</option>{['Matin', 'Déjeuner', 'Après-midi', 'Dîner', 'Soirée', 'Journée entière'].map(s=><option key={s}>{s}</option>)}</select></div>
                      <button onClick={() => removePendingMedia(item.id)} className="text-red-400 hover:text-red-600 p-2 bg-white rounded-lg border border-red-100 shadow-sm"><Trash2 size={16}/></button>
                    </div>
                  ))}
                </div>
                <button onClick={handleBulkMediaUpload} disabled={isUploading || pendingMediaItems.length === 0} className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-bold shrink-0 shadow-md disabled:opacity-50 transition-all">{isUploading ? 'Envoi en cours...' : 'Envoyer les fichiers'}</button>
              </div>
            </div>
          )}

          {/* 2. Modal Edition Media */}
          {editingMedia && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-2xl">
                <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800">Classer ce souvenir</h3><button onClick={() => setEditingMedia(null)} className="text-gray-400 hover:text-gray-600 bg-gray-50 p-1.5 rounded-lg"><X size={18}/></button></div>
                <select value={editMediaDay} onChange={e => setEditMediaDay(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 bg-gray-50 text-gray-800 text-sm focus:ring-2 focus:ring-primary-500 outline-none"><option value="">Aucun jour défini</option>{WEEK_DAYS.map(d => <option key={d}>{d}</option>)}</select>
                <select value={editMediaSlot} onChange={e => setEditMediaSlot(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-3 bg-gray-50 text-gray-800 text-sm focus:ring-2 focus:ring-primary-500 outline-none"><option value="">Aucun moment défini</option>{['Matin', 'Déjeuner', 'Après-midi', 'Dîner', 'Soirée', 'Journée entière'].map(s => <option key={s}>{s}</option>)}</select>
                <button onClick={handleSaveMediaEdit} className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-primary-700 transition-colors">Enregistrer</button>
              </div>
            </div>
          )}

          {/* 3. Lightbox Plein Ecran */}
          {viewerCurrentIndex !== null && viewerItems.length > 0 && !isSelectionMode && (
            <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center backdrop-blur-md">
              <button onClick={closeViewer} className="absolute top-4 right-4 p-3 bg-white/10 rounded-full text-white z-[210]"><X size={24} /></button>
              {viewerItems.length > 1 && ( <><button onClick={prevMedia} className="absolute left-4 p-3 bg-white/10 rounded-full text-white z-[210]"><ChevronLeft size={32} /></button><button onClick={nextMedia} className="absolute right-4 p-3 bg-white/10 rounded-full text-white z-[210]"><ChevronRight size={32} /></button></>)}
              <div className="relative flex items-center justify-center w-[90vmin] h-[90vmin]">
                {viewerItems[viewerCurrentIndex].media_type === 'video' ? (<video src={viewerItems[viewerCurrentIndex].file_path} controls autoPlay className="max-w-full max-h-full object-contain" style={{ transform: `rotate(${viewerRotation}deg)`}} />) : (<img src={viewerItems[viewerCurrentIndex].file_path} className="max-w-full max-h-full object-contain" style={{ transform: `rotate(${viewerRotation}deg)`}} />)}
              </div>
            </div>
          )}

          {/* 4. MODALE ÉVÉNEMENTS (Journal de bord) */}
          {showEventsModal && (
            <div className="fixed inset-0 z-[150] flex justify-end bg-black/20 backdrop-blur-sm">
              <div className="bg-white w-full max-w-sm h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-5 border-b flex justify-between items-center bg-gray-50">
                  <h3 className="font-black text-lg text-gray-800 flex items-center gap-2"><Bell size={20} className="text-primary-600"/> Journal de bord</h3>
                  <button onClick={() => setShowEventsModal(false)} className="text-gray-400 hover:text-gray-600 p-1.5 bg-white rounded-lg border shadow-sm"><X size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {events.length === 0 ? <p className="text-sm text-gray-400 italic text-center mt-10">Aucune activité récente.</p> : events.map(ev => (
                    <div key={ev.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs shrink-0 overflow-hidden border border-primary-200">
                        {getMember(ev.user_id).avatar?.startsWith('http') ? <img src={getMember(ev.user_id).avatar} className="w-full h-full object-cover" /> : getMember(ev.user_id).avatar}
                      </div>
                      <div>
                        <div className="text-sm text-gray-800 leading-tight">
                          <span className="font-bold">{getMember(ev.user_id).name}</span> {ev.action} <span className="font-semibold text-primary-700">{ev.details}</span>
                        </div>
                        <div className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wide">{timeAgo(ev.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. MODALE COMMENTAIRES */}
          {activeComments && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-md h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                  <div><div className="text-[10px] font-black text-primary-600 uppercase">Commentaires sur</div><h3 className="font-bold text-gray-800 truncate pr-4">{activeComments.title}</h3></div>
                  <button onClick={() => setActiveComments(null)} className="text-gray-400 hover:text-gray-600 p-1.5 bg-white rounded-lg border shadow-sm shrink-0"><X size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
                  {comments.filter(c => c.item_id === activeComments.id && c.item_type === activeComments.type).length === 0 ? ( <div className="text-center text-sm text-gray-400 italic mt-10">Soyez le premier à donner votre avis !</div> ) : (
                    comments.filter(c => c.item_id === activeComments.id && c.item_type === activeComments.type).map(c => {
                      const isMe = c.user_id === currentUser?.id;
                      return (
                        <div key={c.id} className={`flex gap-2 w-full ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] shrink-0 overflow-hidden border border-primary-200 mt-1">
                            {getMember(c.user_id).avatar?.startsWith('http') ? <img src={getMember(c.user_id).avatar} className="w-full h-full object-cover" /> : getMember(c.user_id).avatar}
                          </div>
                          <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <span className="text-[10px] font-bold text-gray-400 mb-0.5 px-1">{getMember(c.user_id).name} • {timeAgo(c.created_at)}</span>
                            <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>{c.content}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <form onSubmit={handleAddComment} className="p-3 border-t bg-gray-50 flex gap-2">
                  <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Votre message..." className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-sm bg-white outline-none" autoFocus />
                  <button type="submit" disabled={!newComment.trim()} className="bg-primary-600 text-white p-2.5 rounded-full disabled:opacity-50 shrink-0"><Play size={18} className="ml-0.5"/></button>
                </form>
              </div>
            </div>
          )}

          {/* 6. MODALE MEMBRES */}
          {showMembersModal && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4">
                <div className="flex justify-between items-center"><h3 className="font-bold text-lg text-gray-800">Équipe ({members.length})</h3><button onClick={() => setShowMembersModal(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 p-1.5 rounded-lg"><X size={18}/></button></div>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-sm overflow-hidden shrink-0 border border-primary-200">{m.avatar?.startsWith('http') ? <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" /> : m.avatar}</div>
                        <div><div className="text-sm font-bold text-gray-800">{m.name} {m.id === currentUser?.id && <span className="text-primary-500">(Moi)</span>}</div><div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{m.role}</div></div>
                      </div>
                      {isAdmin && m.id !== currentUser?.id && <button onClick={() => handleRemoveMember(m.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm bg-white border border-red-100" title="Exclure"><Trash2 size={16}/></button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* NAV MOBILE */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t flex justify-around p-2 pb-safe z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('destination')} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'destination' ? 'text-primary-600 font-bold' : 'text-gray-400'}`}><div className="relative"><Target size={20} />{!isLocked && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}</div><span className="text-[10px] mt-1">{isLocked ? 'Logistique' : 'Lieu'}</span></button>
        <button onClick={(e) => checkLock('calendar', e)} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'calendar' ? 'text-primary-600 font-bold' : 'text-gray-400'} ${!isLocked ? 'opacity-50' : ''}`}><CalendarDays size={20} /><span className="text-[10px] mt-1">Planning</span></button>
        <button onClick={(e) => checkLock('activities', e)} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'activities' ? 'text-primary-600 font-bold' : 'text-gray-400'} ${!isLocked ? 'opacity-50' : ''}`}><Compass size={20} /><span className="text-[10px] mt-1">Activités</span></button>
        <button onClick={(e) => checkLock('meals', e)} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'meals' ? 'text-primary-600 font-bold' : 'text-gray-400'} ${!isLocked ? 'opacity-50' : ''}`}><Utensils size={20} /><span className="text-[10px] mt-1">Repas</span></button>
        <button onClick={(e) => checkLock('expenses', e)} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'expenses' ? 'text-primary-600 font-bold' : 'text-gray-400'} ${!isLocked ? 'opacity-50' : ''}`}><PieChart size={20} /><span className="text-[10px] mt-1">Comptes</span></button>
        <button onClick={(e) => checkLock('gallery', e)} className={`flex flex-col items-center p-1.5 rounded-xl ${activeTab === 'gallery' ? 'text-primary-600 font-bold' : 'text-gray-400'} ${!isLocked ? 'opacity-50' : ''}`}><Camera size={20} /><span className="text-[10px] mt-1">Galerie</span></button>
      </nav>
    </div>
  )
}