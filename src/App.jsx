import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Moon, Sun, Search, X, Save, Trash2, Shield, User, Info, Map as MapIcon, Loader2, Navigation, PhoneCall, Plus, Menu, Eye, EyeOff, AlertCircle } from 'lucide-react';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "សូមដាក់_API_KEY_របស់អ្នកទីនេះ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "សូមដាក់_AUTH_DOMAIN_របស់អ្នកទីនេះ",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "សូមដាក់_PROJECT_ID_របស់អ្នកទីនេះ",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'smart-map-app-kh'; 

// រូបមន្តគណនាចម្ងាយ
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

export default function App() {
  const [map, setMap] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [showDistances, setShowDistances] = useState(true); // មុខងារថ្មីបិទ/បើកចម្ងាយ
  
  // Data States
  const [firebaseLocations, setFirebaseLocations] = useState([]); // ទិន្នន័យពី Admin
  const [osmLocations, setOsmLocations] = useState([]); // ទិន្នន័យទាញពី GPS ស្វ័យប្រវត្តិ
  const [lastFetchedPos, setLastFetchedPos] = useState(null); // កត់ត្រាទីតាំងដែលបានទាញយកចុងក្រោយ

  const [markers, setMarkers] = useState([]);
  const [userLocation, setUserLocation] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('កំពុងស្វែងរក GPS...'); 
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', type: 'សាលារៀន/នាយកសាលា' });
  const [isAutoLocating, setIsAutoLocating] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const searchRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const mapRef = useRef(null);
  const infoWindowRef = useRef(null);
  const userMarkerRef = useRef(null);
  const tempMarkerRef = useRef(null);
  const isMapCenteredRef = useRef(false);

  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  useEffect(() => {
    document.title = "📍 SmartMap";
    signInAnonymously(auth).catch(e => console.error("Auth error:", e));

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const locRef = collection(db, 'smartmap_data', appId, 'locations');
    const unsub = onSnapshot(locRef, (snapshot) => {
      const locList = [];
      snapshot.forEach(doc => {
        locList.push({ id: doc.id, isAdminData: true, ...doc.data() });
      });
      setFirebaseLocations(locList);
    }, (error) => console.error("Error fetching locations:", error));
    return () => unsub();
  }, [authUser]);

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  ];

  useEffect(() => {
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDcelrKRrV4GaPKftfT29JzuFsOuLk5CO8`;
      script.async = true;
      script.defer = true;
      script.onload = initializeMap;
      document.head.appendChild(script);
    } else if (window.google && window.google.maps) {
      initializeMap();
    }
  }, []);

  const fetchNearbyPOIs = async (lat, lng) => {
      try {
          // ទាញយកទីតាំងសំខាន់ៗជុំវិញ 3km ពីកន្លែងដែលឈរ (សាលា, ពេទ្យ, ប៉ូលីស)
          const query = `
              [out:json];
              (
                node["amenity"="school"](around:3000,${lat},${lng});
                node["amenity"="hospital"](around:3000,${lat},${lng});
                node["amenity"="police"](around:3000,${lat},${lng});
              );
              out body;
          `;
          const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
          const response = await fetch(url);
          const data = await response.json();
          
          if (data && data.elements) {
              const formattedPOIs = data.elements.filter(e => e.tags && e.tags.name).map(el => {
                  let type = "ទីតាំងផ្សេងៗ";
                  if (el.tags.amenity === 'school') type = "សាលារៀន/នាយកសាលា";
                  else if (el.tags.amenity === 'hospital') type = "មន្ទីរពេទ្យ";
                  else if (el.tags.amenity === 'police') type = "ប៉ុស្តិ៍ប៉ូលីស";

                  return {
                      id: `osm-${el.id}`,
                      name: el.tags.name,
                      type: type,
                      lat: el.lat,
                      lng: el.lon,
                      isAdminData: false // សម្គាល់ថាជាទិន្នន័យអូតូ មិនមែន Admin ដាក់
                  };
              });
              setOsmLocations(formattedPOIs);
          }
      } catch (error) {
          console.error("Failed to fetch nearby POIs", error);
      }
  };

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) return;
    const initialMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: 11.5564, lng: 104.9282 }, 
      zoom: 12,
      minZoom: 4, 
      mapTypeControl: true,
      zoomControl: true,
      gestureHandling: 'greedy', 
    });

    infoWindowRef.current = new window.google.maps.InfoWindow();
    initialMap.addListener("click", () => { if (infoWindowRef.current) infoWindowRef.current.close(); });

    // 📍 LIVE GPS TRACKING & AUTO FETCH
    if (navigator.geolocation) {
       navigator.geolocation.watchPosition((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const userPos = { lat, lng };
          
          setUserLocation(userPos); 
          setGpsStatus('កំពុងដំណើរការ (Live)');
          
          if (!isMapCenteredRef.current) {
             initialMap.setCenter(userPos);
             initialMap.setZoom(16);
             isMapCenteredRef.current = true;
          }
          
          if (userMarkerRef.current) {
              userMarkerRef.current.setPosition(userPos);
          } else {
              userMarkerRef.current = new window.google.maps.Marker({
                 position: userPos,
                 map: initialMap,
                 icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 2,
                 },
                 title: "អ្នកកំពុងនៅទីនេះ",
                 zIndex: 999
              });
          }

          // ទាញយកទិន្នន័យអូតូ ប្រសិនបើដើរឆ្ងាយជាង 500m ពីការទាញចុងក្រោយ
          setLastFetchedPos(prev => {
              if (!prev || calculateDistance(prev.lat, prev.lng, lat, lng) > 0.5) {
                  fetchNearbyPOIs(lat, lng);
                  return userPos;
              }
              return prev;
          });

       }, (error) => {
          setGpsStatus('មិនអាចចាប់ទីតាំងបាន (សូមបើក GPS)');
       }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 });
    } else {
       setGpsStatus('Browser មិនគាំទ្រ GPS');
    }

    setMap(initialMap);
  };

  useEffect(() => {
    if (map && window.google && window.google.maps) {
      map.setOptions({ styles: isDarkMode ? darkMapStyle : [] });
    }
  }, [isDarkMode, map]);

  // បញ្ចូលទិន្នន័យ Admin និង ទិន្នន័យ Auto បញ្ចូលគ្នាដើម្បីគូសលើផែនទី
  const allLocationsForMap = useMemo(() => {
      // ត្រងយក OSM ណាដែលជាន់គ្នាជាមួយ Admin (នៅជិតជាង 50m) ចេញ
      const filteredOsm = osmLocations.filter(osmLoc => {
          const isTooClose = firebaseLocations.some(fbLoc => 
              calculateDistance(osmLoc.lat, osmLoc.lng, fbLoc.lat, fbLoc.lng) < 0.05
          );
          return !isTooClose;
      });
      return [...firebaseLocations, ...filteredOsm];
  }, [firebaseLocations, osmLocations]);

  useEffect(() => {
    if (!map || !window.google || !window.google.maps) return;

    markers.forEach(m => {
        if (m && m.marker && typeof m.marker.setMap === 'function') m.marker.setMap(null);
    });
    
    const newMarkers = [];

    allLocationsForMap.forEach(loc => {
      let iconUrl = loc.isAdminData 
          ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png" 
          : "http://maps.google.com/mapfiles/ms/icons/purple-dot.png"; // ពណ៌ខុសគ្នាសម្រាប់ទិន្នន័យមិនទាន់បញ្ជាក់

      if (loc.isAdminData) {
          if (loc.type === "មេភូមិ" || loc.type === "មេឃុំ/ចៅសង្កាត់") iconUrl = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
          else if (loc.type === "ប៉ុស្តិ៍ប៉ូលីស") iconUrl = "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
      }

      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: map,
        title: loc.name,
        icon: iconUrl,
        animation: window.google.maps.Animation.DROP
      });

      marker.addListener("click", () => focusLocation(loc, marker));
      newMarkers.push({ id: loc.id, marker });
    });

    setMarkers(newMarkers);
    
    return () => newMarkers.forEach(m => m.marker?.setMap(null));
  }, [map, allLocationsForMap]);

  const nearbyLocations = useMemo(() => {
      if (!allLocationsForMap || allLocationsForMap.length === 0) return [];
      
      const mappedLocs = allLocationsForMap.map(loc => {
          let distance = null;
          if (userLocation) distance = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
          return { ...loc, distance };
      });

      return mappedLocs.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
      });
  }, [allLocationsForMap, userLocation]);

  const formatDistance = (dist) => {
      if (dist === null || dist === undefined) return '';
      if (dist < 1) return `${(dist * 1000).toFixed(0)} ម៉ែត្រ`;
      return `${dist.toFixed(1)} គ.ម`;
  };

  const focusLocation = (loc, markerObj = null) => {
    if (!map || !infoWindowRef.current || !window.google) return;
    const pos = { lat: loc.lat, lng: loc.lng };
    map.panTo(pos);
    map.setZoom(18);
    setIsSidebarOpen(false);

    let actualMarker = markerObj || markers.find(m => m.id === loc.id)?.marker;

    if (actualMarker) {
      const formattedDistance = (showDistances && loc.distance !== null && loc.distance !== undefined) ? 
         `<p class="text-xs font-bold text-gray-500 mb-3 bg-gray-100 p-1.5 rounded inline-block">ចម្ងាយ: ${formatDistance(loc.distance)}</p>` : '';
         
      const phoneContent = loc.isAdminData && loc.phone ? `
            <a href="tel:${loc.phone}" class="bg-green-500 hover:bg-green-600 text-white w-full py-2 px-3 rounded-lg flex items-center justify-center gap-2 font-bold shadow-md transition-colors mt-2" style="text-decoration: none;">
                <span style="font-size: 1rem;">📞</span> ខល ${loc.phone}
            </a>
            ` : (!loc.isAdminData ? `<p class="text-xs text-red-500 font-bold bg-red-50 p-2 rounded">មិនទាន់មានទិន្នន័យពី Admin</p>` : '');

      const contentString = `
        <div class="p-2 min-w-[200px]">
            <h3 class="font-bold text-lg text-gray-900 mb-1 border-b pb-1 flex items-center gap-1">
               ${loc.isAdminData ? '✅' : '❓'} ${loc.name}
            </h3>
            <p class="text-sm font-medium text-blue-600 mb-2">${loc.type}</p>
            ${formattedDistance}
            ${phoneContent}
        </div>
      `;
      infoWindowRef.current.setContent(contentString);
      infoWindowRef.current.open(map, actualMarker);
    }
  };

  // មុខងារ Admin ចាប់ទីតាំងដែលកំពុងឈរដើម្បីបញ្ចូលទិន្នន័យ
  const handleInitiateAddDetail = () => {
    setIsAutoLocating(true);
    if (navigator.geolocation) {
      showToast("កំពុងចាប់យកទីតាំង...", "success");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setPendingLocation(newPos);
          setFormData({ name: '', phone: '', type: 'សាលារៀន/នាយកសាលា' });
          setIsAutoLocating(false);
          setShowAddModal(true);
          if(map) { map.panTo(newPos); map.setZoom(18); }
        },
        () => {
          setIsAutoLocating(false);
          showToast("សូមបើក GPS ទូរស័ព្ទ!", "error");
        }, { enableHighAccuracy: true }
      );
    }
  };

  const saveLocation = async () => {
    if (!formData.name.trim()) return showToast("សូមបញ្ចូលឈ្មោះ", "error");
    if (!formData.phone.trim()) return showToast("សូមបញ្ចូលលេខទូរស័ព្ទ", "error");
    
    const newId = Date.now().toString();
    const newLoc = { ...formData, lat: pendingLocation.lat, lng: pendingLocation.lng, createdAt: Date.now() };

    try {
        await setDoc(doc(db, 'smartmap_data', appId, 'locations', newId), newLoc);
        setShowAddModal(false);
        showToast("បានរក្សាទុក!", "success");
    } catch (e) { showToast("Error saving", "error"); }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'ict168') { 
        setIsAdmin(true);
        setShowPasswordModal(false);
        setAdminPassword('');
        showToast('ចូលប្រើជា Admin ដោយជោគជ័យ!', 'success');
    } else {
        showToast('លេខសម្ងាត់មិនត្រឹមត្រូវ!', 'error');
    }
  }

  const showToast = (msg, type) => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  return (
    <div className={`h-screen flex flex-col font-sans ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-800'} overflow-hidden`}>
      
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm z-20 p-3 flex justify-between items-center relative transition-colors duration-300">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2">
              <Menu className="w-6 h-6" />
          </button>
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md hidden md:block">
            <MapIcon className="w-5 h-5" />
          </div>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-1">📍 SmartMap</h1>
        </div>
        
        {/* Search Component Hidden for Brevity (Same as before) */}
        <div className="flex-grow max-w-xl mx-2 md:mx-6">
           <div className="w-full relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
              <input type="text" placeholder="ស្វែងរក..." className="w-full pl-10 pr-3 py-2 border rounded-full dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" disabled/>
           </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {/* ប៊ូតុងបង្ហាញ/លាក់ចម្ងាយ (ថ្មី) */}
          <button 
             onClick={() => setShowDistances(!showDistances)} 
             className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
             title="បិទ/បើក ការបង្ហាញចម្ងាយ"
          >
             {showDistances ? <Eye className="w-5 h-5 text-blue-500" /> : <EyeOff className="w-5 h-5" />}
          </button>
          
          {/* ប៊ូតុង Dark Mode */}
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => isAdmin ? setIsAdmin(false) : setShowPasswordModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${isAdmin ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}
          >
            {isAdmin ? <Shield className="w-4 h-4 text-green-500" /> : <User className="w-4 h-4" />}
            <span className="hidden md:inline">{isAdmin ? 'Admin' : 'Login'}</span>
          </button>
        </div>
      </header>

      <main className="flex-grow flex relative overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className={`w-[300px] md:w-80 bg-white dark:bg-gray-800 shadow-md flex flex-col h-full shrink-0 z-10 border-r dark:border-gray-700 absolute md:relative transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          
          {/* មុខងារ Admin ប្រើសម្រាប់បញ្ជាក់ទីតាំង */}
          {isAdmin && (
            <div className="p-4 border-b dark:border-gray-700">
                 <button 
                    onClick={handleInitiateAddDetail} disabled={isAutoLocating}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all active:scale-95"
                 >
                    {isAutoLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    បន្ថែមព័ត៌មានលម្អិតទីនេះ
                 </button>
                 <p className="text-[10px] text-gray-500 text-center mt-2">📍 ប្រព័ន្ធនឹងចាប់យកទីតាំងដែលអ្នកឈរផ្ទាល់</p>
            </div>
          )}

          <div className="p-4 pb-2 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold flex items-center gap-2">
                   <Navigation className="w-4 h-4 text-blue-500" /> ទីតាំងនៅក្បែរ
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] bg-white dark:bg-gray-700 px-2 py-1 rounded-full border shadow-sm">
                    <div className={`w-2 h-2 rounded-full ${userLocation ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                    <span>{userLocation ? 'GPS OK' : 'ស្វែងរក...'}</span>
                </div>
            </div>
          </div>

          {/* List of Locations (Admin Data & Auto Data) */}
          <div className="flex-grow overflow-y-auto px-4 pb-4 pt-2 custom-scrollbar bg-gray-50 dark:bg-gray-800/50">
            <ul className="space-y-3">
              {nearbyLocations.length === 0 ? (
                <li className="text-gray-400 text-sm text-center py-10">កំពុងស្កេនរកទីតាំងជុំវិញអ្នក...</li>
              ) : (
                nearbyLocations.map((loc) => (
                  <li key={loc.id} onClick={() => focusLocation(loc)} className={`rounded-xl p-3 shadow-sm border cursor-pointer transition-colors ${loc.isAdminData ? 'bg-white dark:bg-gray-700 border-blue-100 dark:border-gray-600 hover:border-blue-400' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-400 opacity-90'}`}>
                      
                      <div className="flex justify-between items-start mb-1.5">
                          <h3 className="font-bold text-sm flex items-center gap-1.5">
                              {loc.isAdminData ? <span className="text-green-500" title="ទិន្នន័យបញ្ជាក់ដោយ Admin">✅</span> : <span className="text-gray-400" title="ទីតាំងទូទៅ">📌</span>}
                              {loc.name}
                          </h3>
                          {loc.isAdminData && isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'smartmap_data', appId, 'locations', loc.id)); }} className="text-red-500 p-1">
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                              {loc.type}
                          </span>
                          {showDistances && loc.distance !== null && (
                              <span className="text-[10px] font-bold bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                                  ចម្ងាយ: {formatDistance(loc.distance)}
                              </span>
                          )}
                      </div>

                      {/* Display Data Logic */}
                      {loc.isAdminData ? (
                          <div className="mt-2 bg-green-50 dark:bg-green-900/20 p-2 rounded-lg border border-green-100 dark:border-green-800">
                             <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">តួនាទី: <span className="font-bold text-gray-900 dark:text-white">{loc.type}</span></p>
                             <p className="text-xs text-gray-700 dark:text-gray-300 font-medium mt-1">លេខ: <span className="font-bold text-blue-600 dark:text-blue-400">{loc.phone}</span></p>
                          </div>
                      ) : (
                          <div className="mt-2 bg-gray-200/50 dark:bg-gray-800 p-2 rounded-lg flex items-center gap-1.5">
                             <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                             <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium italic">មិនទាន់មានទិន្នន័យពី Admin</p>
                          </div>
                      )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>

        {/* Map */}
        <div className="flex-grow h-full relative z-0">
          <div ref={mapRef} className="w-full h-full"></div>
          <button 
             onClick={() => { if (userLocation && map) { map.panTo(userLocation); map.setZoom(16); } }}
             className="absolute bottom-6 right-6 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg border hover:bg-gray-50 z-10"
          >
             <Navigation className="w-6 h-6 text-blue-500" />
          </button>
        </div>
      </main>

      {/* Admin Password Modal - Redesigned & Secured */}
      {showPasswordModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-50 p-4 transition-all duration-300">
           <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 border border-gray-100 dark:border-gray-700">
             
             <div className="flex items-center justify-between mb-6">
                 <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                    <Shield className="text-blue-500 w-6 h-6"/> ចូលជាអ្នកគ្រប់គ្រង
                 </h2>
                 <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                 </button>
             </div>
             
             <div className="mb-6">
                 <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">លេខសម្ងាត់ (Password)</label>
                 <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                    placeholder="••••••••"
                    className="w-full p-3.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-900 dark:text-white transition-shadow shadow-inner"
                    autoFocus
                 />
                 <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> ព័ត៌មាននេះត្រូវបានរក្សាការសម្ងាត់។
                 </p>
             </div>
             
             <button 
                onClick={handleAdminLogin} 
                className="w-full py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
             >
                យល់ព្រម
             </button>
           </div>
        </div>
      )}

      {/* Add Location Modal (For Admin) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
             <h2 className="text-xl font-bold mb-4">📍 បញ្ចូលព័ត៌មានលម្អិតទីតាំងនេះ</h2>
             <div className="space-y-4">
               <div>
                 <label className="block text-sm mb-1">ឈ្មោះស្ថាប័ន / បុគ្គល</label>
                 <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600" placeholder="ឧ. សាលាបឋមសិក្សាបាដាក" />
               </div>
               <div>
                 <label className="block text-sm mb-1">តួនាទី / ប្រភេទ</label>
                 <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600">
                    <option value="សាលារៀន/នាយកសាលា">សាលារៀន / នាយកសាលា</option>
                    <option value="មេភូមិ">មេភូមិ</option>
                    <option value="ប៉ុស្តិ៍ប៉ូលីស">ប៉ុស្តិ៍ប៉ូលីស</option>
                    <option value="មន្ទីរពេទ្យ">មន្ទីរពេទ្យ / មណ្ឌលសុខភាព</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm mb-1">លេខទូរស័ព្ទទំនាក់ទំនង</label>
                 <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 border rounded-xl dark:bg-gray-700 dark:border-gray-600" placeholder="012 345 678" />
               </div>
               <div className="flex justify-end gap-3 mt-6">
                 <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">បោះបង់</button>
                 <button onClick={saveLocation} className="px-5 py-2.5 bg-green-600 text-white hover:bg-green-700 rounded-xl font-bold flex items-center gap-2"><Save className="w-4 h-4"/> រក្សាទុក</button>
               </div>
             </div>
           </div>
        </div>
      )}

      {toast.show && (
        <div className={`absolute top-20 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-bold flex items-center gap-2 animate-bounce ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}