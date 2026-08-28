'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Correction des icônes par défaut de Leaflet
const iconGite = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})

const iconActivity = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})

const iconProposed = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})

const iconPhoto = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
})
// Ce sous-composant ajuste automatiquement le zoom pour voir tous les points
function BoundsHelper({ markers }: { markers: any[] }) {
  const map = useMap()
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [markers, map])
  return null
}

export default function MapView({ proposedGites = [], activities = [], finalGite = null, photos = [] }: any) {
  const allMarkers = [
    ...proposedGites.filter((g: any) => g.lat && g.lng),
    ...activities.filter((a: any) => a.lat && a.lng),
    ...photos.filter((p: any) => p.lat && p.lng),
    ...(finalGite && finalGite.lat ? [finalGite] : [])
  ]

  const center = allMarkers.length > 0 ? [allMarkers[0].lat, allMarkers[0].lng] : [46.603354, 1.888334] // Centre France par défaut

  return (
    <div className="h-[450px] w-full rounded-2xl overflow-hidden border border-gray-200 z-0 relative">
      <MapContainer center={center as any} zoom={5} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <BoundsHelper markers={allMarkers} />
        
        {/* Phase 1 : Gîtes proposés (Marqueurs oranges) */}
        {proposedGites.map((gite: any) => gite.lat && (
          <Marker key={`g-${gite.id}`} position={[gite.lat, gite.lng]} icon={iconProposed}>
            <Popup>
              <strong>{gite.name}</strong><br/>
              {gite.price && <>{gite.price} €/semaine<br/></>}
              {gite.beds && <>{gite.beds} couchages</>}
            </Popup>
          </Marker>
        ))}

        {/* Phase 2 : Le Gîte final (Marqueur rouge) */}
        {finalGite && finalGite.lat && (
          <Marker position={[finalGite.lat, finalGite.lng]} icon={iconGite}>
            <Popup><strong>🏡 {finalGite.name}</strong></Popup>
          </Marker>
        )}

        {/* Phase 2 : Les activités (Marqueurs bleus) */}
        {activities.map((act: any) => act.lat && (
          <Marker key={`a-${act.id}`} position={[act.lat, act.lng]} icon={iconActivity}>
            <Popup><strong>{act.title}</strong><br/>{act.durationFromAcc && `🚗 ${act.durationFromAcc}`}</Popup>
          </Marker>
        ))}
          {/* Phase 3 : Les Photos (Marqueurs violets) */}
        {photos.map((photo: any) => photo.lat && (
          <Marker key={`p-${photo.id}`} position={[photo.lat, photo.lng]} icon={iconPhoto}>
            <Popup>
              <div className="w-24 h-24 overflow-hidden rounded-lg">
                <img src={photo.file_path} alt="Souvenir" className="w-full h-full object-cover" />
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )

}

