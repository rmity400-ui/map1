import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Moon, Sun, Search, X, Save, Trash2, Shield, User, Info, Map as MapIcon, Loader2, Navigation, PhoneCall, Plus, Menu } from 'lucide-react';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';

// ដំណោះស្រាយទី១: ប្តូរមកប្រើ Firebase Config ពិតប្រាកដរបស់អ្នក ឬប្រើ Environment Variables
// សូមយក Config ពី Firebase Project របស់អ្នកមកដាក់ទីនេះ
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY || "សូមដាក់_API_KEY_របស់អ្នកទីនេះ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "សូមដាក់_AUTH_DOMAIN_របស់អ្នកទីនេះ",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || process.env.REACT_APP_FIREBASE_PROJECT_ID || "សូមដាក់_PROJECT_ID_របស់អ្នកទីនេះ",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || process.env.REACT_APP_FIREBASE_APP_ID || ""
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// កំណត់ App ID ជារបស់អ្នកផ្ទាល់ ជៀសវាងអថេរពី AI Platform
const appId = 'smart-map-app-kh'; 

// រូបមន្តគណនាចម្ងាយ (Haversine Formula) គិតជា គីឡូម៉ែត្រ (km)
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
  // --- Core State ---
  const [map, setMap] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar toggle
  
  const [locations, setLocations] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [userLocation, setUserLocation] = useState(null); // Live GPS Tracking
  const [gpsStatus, setGpsStatus] = useState('កំពុងស្វែងរក GPS...'); 
  
  // --- Modal & Search State ---
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
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // --- Auth & Data Effects (Firebase for Locations) ---
  useEffect(() => {
    document.title = "📍 SmartMap";
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  // ទាញយកទិន្នន័យទីតាំងពី Firebase (អចិន្ត្រៃយ៍)
  useEffect(() => {
    if (!authUser) return;

    const locRef = collection(db, 'smartmap_data', appId, 'locations'); // កែប្រែ Path ឲ្យខ្លីជាងមុន
    const unsub = onSnapshot(locRef, (snapshot) => {
      const locList = [];
      snapshot.forEach(doc => {
        locList.push({ id: doc.id, ...doc.data() });
      });
      setLocations(locList);
    }, (error) => console.error("Error fetching locations:", error));

    return () => unsub();
  }, [authUser]);

  // Dark Map Style
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

  // --- Initialize Map & Live Auto Center Tracking ---
  useEffect(() => {
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      // ដក &libraries=places ចេញដើម្បីកុំឱ្យវាទាមទារ Legacy API
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDcelrKRrV4GaPKftfT29JzuFsOuLk5CO8`;
      script.async = true;
      script.defer = true;
      script.onload = initializeMap;
      document.head.appendChild(script);
    } else if (window.google && window.google.maps) {
      initializeMap();
    }
  }, []);

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) return;

    const initialMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: 11.5564, lng: 104.9282 }, 
      zoom: 12,
      minZoom: 4, 
      mapTypeControl: true,
      mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          position: window.google.maps.ControlPosition.TOP_RIGHT,
      },
      zoomControl: true,
      scaleControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      gestureHandling: 'greedy', 
    });

    infoWindowRef.current = new window.google.maps.InfoWindow();

    initialMap.addListener("click", () => {
       if (infoWindowRef.current) infoWindowRef.current.close();
    });

    // មុខងារចុចឲ្យជាប់ (Long Press)
    initialMap.addListener("contextmenu", (e) => {
       const lat = e.latLng.lat();
       const lng = e.latLng.lng();
       
       if (tempMarkerRef.current) tempMarkerRef.current.setMap(null);
       
       tempMarkerRef.current = new window.google.maps.Marker({
         position: { lat, lng },
         map: initialMap,
         icon: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png",
         animation: window.google.maps.Animation.DROP
       });

       const contentString = `
         <div class="p-2 min-w-[200px] text-center font-sans" style="font-family: inherit;">
             <h3 class="font-bold text-gray-900 mb-3 text-base">ទីតាំងបានជ្រើសរើស</h3>
             <div class="flex flex-col gap-2">
                 <a href="https://www.google.com/maps?layer=c&cbll=${lat},${lng}" target="_blank" class="bg-blue-100 text-blue-700 hover:bg-blue-200 py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-1 transition-colors" style="text-decoration:none; display: block;">
                   🖼️ មើលរូបភាពកន្លែងនេះ
                 </a>
                 ${isAdminRef.current ? `
                 <button id="add-temp-btn" class="bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-bold border-none cursor-pointer transition-colors w-full mt-1">
                   ➕ បន្ថែមទីតាំងនេះ
                 </button>
                 ` : ''}
             </div>
         </div>
       `;
       infoWindowRef.current.setContent(contentString);
       infoWindowRef.current.open(initialMap, tempMarkerRef.current);

       window.google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
         const btn = document.getElementById('add-temp-btn');
         if (btn) {
           btn.addEventListener('click', () => {
              setPendingLocation({ lat, lng });
              setFormData({ name: '', phone: '', type: 'សាលារៀន/នាយកសាលា' });
              setShowAddModal(true);
              infoWindowRef.current.close();
           });
         }
       });
    });

    // 📍 ធានាថា LIVE GPS TRACKING ដំណើរការ ១០០% (ចាប់ទីតាំងអូតូពេលដើរ)
    if (navigator.geolocation) {
       navigator.geolocation.watchPosition((position) => {
          const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(userPos); // បច្ចុប្បន្នភាពទីតាំង (ធ្វើឱ្យ List ទីតាំងនៅក្បែរ update អូតូ)
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
       }, (error) => {
          console.log("GPS Error: ", error);
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

  // Display Markers for saved locations
  useEffect(() => {
    if (!map || !window.google || !window.google.maps) return;

    markers.forEach(m => {
        if (m && m.marker && typeof m.marker.setMap === 'function') {
            m.marker.setMap(null);
        }
    });
    
    const newMarkers = [];

    locations.forEach(loc => {
      let iconUrl = "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
      if (loc.type === "មេភូមិ" || loc.type === "មេឃុំ/ចៅសង្កាត់") iconUrl = "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
      else if (loc.type === "ប៉ុស្តិ៍ប៉ូលីស") iconUrl = "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
      else if (loc.type === "អភិបាលស្រុក/ខណ្ឌ") iconUrl = "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
      else if (loc.type === "សាលារៀន/នាយកសាលា") iconUrl = "http://maps.google.com/mapfiles/ms/icons/orange-dot.png";

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
    
    return () => {
        newMarkers.forEach(m => {
            if (m && m.marker && typeof m.marker.setMap === 'function') {
                m.marker.setMap(null);
            }
        });
    };
  }, [map, locations]);

  // 📍 គណនា និង Random ទីតាំងនៅក្បែរខ្លួនជានិច្ច (Proximity Sorting)
  const nearbyLocations = useMemo(() => {
      if (!locations || locations.length === 0) return [];
      
      const mappedLocs = locations.map(loc => {
          let distance = null;
          if (userLocation) {
              distance = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
          }
          return { ...loc, distance };
      });

      // តម្រៀបពីកន្លែងដែលនៅក្បែរយើងបំផុត ទៅកន្លែងឆ្ងាយបំផុត
      return mappedLocs.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
      });
  }, [locations, userLocation]);

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
    setIsSidebarOpen(false); // Close sidebar on mobile after selecting

    let actualMarker = markerObj || markers.find(m => m.id === loc.id)?.marker;

    if (actualMarker) {
      const formattedDistance = loc.distance !== null && loc.distance !== undefined ? 
         `<p class="text-xs font-bold text-gray-500 mb-3 bg-gray-100 p-1.5 rounded inline-block">ចម្ងាយពីអ្នក: ${formatDistance(loc.distance)}</p>` : '';
         
      const phoneContent = loc.phone ? `
            <a href="tel:${loc.phone}" class="bg-green-500 hover:bg-green-600 text-white w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 font-bold shadow-md transition-colors mt-2" style="text-decoration: none;">
                <span style="font-size: 1.2rem;">📞</span> ខលឥឡូវនេះ
            </a>
            <p class="text-center text-gray-500 text-xs mt-2">${loc.phone}</p>
            ` : '';

      const contentString = `
        <div class="p-2 min-w-[220px]">
            <h3 class="font-bold text-lg text-gray-900 mb-1 border-b pb-1">${loc.name}</h3>
            <p class="text-sm font-medium text-blue-600 mb-2">${loc.type}</p>
            ${formattedDistance}
            ${phoneContent}
        </div>
      `;
      infoWindowRef.current.setContent(contentString);
      infoWindowRef.current.open(map, actualMarker);
    }
  };

  const handleInitiateAddDetail = () => {
    setIsAutoLocating(true);
    if (navigator.geolocation) {
      showToast("កំពុងទាញយកទីតាំងអ្នកផ្ទាល់...", "success");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setPendingLocation(newPos);
          setFormData({ name: '', phone: '', type: 'សាលារៀន/នាយកសាលា' });
          setIsAutoLocating(false);
          setShowAddModal(true);
          
          if(map) { 
            map.panTo(newPos); 
            map.setZoom(18); 
          }
        },
        () => {
          setIsAutoLocating(false);
          showToast("មិនអាចចាប់យកទីតាំងបានទេ! សូមបើក GPS (Location)។", "error");
        },
        { enableHighAccuracy: true }
      );
    } else {
       setIsAutoLocating(false);
       showToast("ឧបករណ៍របស់អ្នកមិនគាំទ្រ GPS ទេ!", "error");
    }
  };

  // --- Google Maps Geocoder Search ---
  const executeSearch = async (query, localResults = []) => {
    if (!query) return;
    setSearchLoading(true);
    
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&accept-language=km,en&countrycodes=kh&addressdetails=1&limit=5`);
      
      if (!response.ok) {
         throw new Error('Network response was not ok');
      }

      const results = await response.json();

      if (results && results.length > 0) {
          const mappedData = results.map((place, index) => {
              const addr = place.address || {};
              const mainName = addr.village || addr.suburb || addr.town || addr.city || addr.state || place.name || query;
              
              return {
                  id: place.place_id || index.toString(),
                  name: mainName,
                  subName: place.display_name,
                  lat: parseFloat(place.lat),
                  lng: parseFloat(place.lon),
                  boundingbox: place.boundingbox,
                  isExternal: true
              };
          });
          setSearchResults([...localResults, ...mappedData]);
          setIsSearching(true);
      } else {
          setSearchResults(localResults);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults(localResults);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.trim().length < 1) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    const lowerQuery = query.toLowerCase();
    const localMatches = locations
      .filter(loc =>
          loc.name.toLowerCase().includes(lowerQuery) ||
          loc.type.toLowerCase().includes(lowerQuery) ||
          (loc.phone && loc.phone.includes(lowerQuery))
      )
      .map(loc => ({
          ...loc,
          subName: `ទីតាំងក្នុងប្រព័ន្ធ • ${loc.type}`,
          isLocal: true
      }));

    setSearchResults(localMatches);

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(query.trim(), localMatches);
    }, 300); 
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectSearchResult(searchResults[0]);
      } else if (searchQuery.trim()) {
        executeSearch(searchQuery.trim(), []);
      }
    }
  };

  const handleSelectSearchResult = (result) => {
    setSearchQuery(result.name); 
    setIsSearching(false);
    
    if (result.isLocal) {
        focusLocation(result);
    } else {
        if(map && window.google) {
          if (result.boundingbox) {
             const sw = new window.google.maps.LatLng(result.boundingbox[0], result.boundingbox[2]);
             const ne = new window.google.maps.LatLng(result.boundingbox[1], result.boundingbox[3]);
             const bounds = new window.google.maps.LatLngBounds(sw, ne);
             map.fitBounds(bounds); 
          } else {
             map.panTo({ lat: result.lat, lng: result.lng });
             map.setZoom(16);
          }
          
          if (tempMarkerRef.current) tempMarkerRef.current.setMap(null);
          tempMarkerRef.current = new window.google.maps.Marker({
              position: { lat: result.lat, lng: result.lng },
              map: map,
              icon: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png",
              title: result.name,
              animation: window.google.maps.Animation.DROP
          });
          setTimeout(() => {
              if (tempMarkerRef.current) tempMarkerRef.current.setMap(null);
          }, 6000); 
        }
    }
  };

  const saveLocation = async () => {
    if (!formData.name.trim()) return showToast("សូមបញ្ចូលឈ្មោះ ឬ តួនាទី", "error");
    if (!formData.phone.trim()) return showToast("សូមបញ្ចូលលេខទូរស័ព្ទ", "error");
    if (!authUser) return showToast("មានបញ្ហាប្រព័ន្ធ។ សូមរង់ចាំបន្តិច", "error");

    const newId = Date.now().toString();
    const newLoc = {
      ...formData,
      lat: pendingLocation.lat,
      lng: pendingLocation.lng,
      createdAt: Date.now()
    };

    try {
        const docRef = doc(db, 'smartmap_data', appId, 'locations', newId);
        await setDoc(docRef, newLoc);
        setShowAddModal(false);
        showToast("បានរក្សាទុកទីតាំងដោយជោគជ័យ!", "success");
    } catch (e) {
        showToast("មិនអាចរក្សាទុកបានទេ", "error");
    }
  };

  const deleteLocation = async (id, e) => {
    e.stopPropagation();
    if (!isAdmin || !authUser) return;
    try {
       await deleteDoc(doc(db, 'smartmap_data', appId, 'locations', id));
       showToast("បានលុបទិន្នន័យ!", "success");
    } catch (err) {
       showToast("មិនអាចលុបបានទេ", "error");
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'ict168') { 
        setIsAdmin(true);
        setShowPasswordModal(false);
        setAdminPassword('');
        showToast('បានចូលជា Admin ដោយជោគជ័យ!', 'success');
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
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 text-gray-600 dark:text-gray-300">
              <Menu className="w-6 h-6" />
          </button>
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md hidden md:block">
            <MapIcon className="w-5 h-5" />
          </div>
          <h1 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-1">📍 SmartMap</h1>
        </div>
        
        {/* Search Box */}
        <div className="flex-grow max-w-2xl mx-2 md:mx-6 relative" ref={searchRef}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {searchLoading ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> : <Search className="w-5 h-5 text-gray-400" />}
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={handleSearch}
            onKeyDown={handleSearchKeyDown}
            placeholder="ស្វែងរក ខេត្ត ស្រុក ភូមិ ឬទីតាំងផ្សេងៗ..." 
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-inner text-sm md:text-base" 
            autoComplete="off" 
          />
          {isSearching && searchResults.length > 0 && (
            <ul className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
              {searchResults.map((result, idx) => (
                <li key={idx} onClick={() => handleSelectSearchResult(result)} className="px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer flex items-start gap-3 transition-colors">
                  <div className={`p-2 rounded-full shrink-0 mt-0.5 ${result.isLocal ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      <MapPin className={`w-4 h-4 ${result.isLocal ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex flex-col">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-100 flex items-center gap-2">
                          {result.name}
                          {result.isLocal && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 rounded">មានក្នុងប្រព័ន្ធ</span>
                          )}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight line-clamp-2">{result.subName}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => isAdmin ? (setIsAdmin(false), showToast('បានចាកចេញពី Admin', 'success')) : setShowPasswordModal(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${isAdmin ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
          >
            {isAdmin ? <Shield className="w-4 h-4 text-green-500" /> : <User className="w-4 h-4" />}
            <span className="hidden md:inline">{isAdmin ? 'Admin' : 'User'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex relative overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className={`w-[300px] md:w-80 bg-white dark:bg-gray-800 shadow-md flex flex-col h-full shrink-0 z-10 border-r border-gray-200 dark:border-gray-700 absolute md:relative transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          
          {isAdmin && (
            <div className="p-4 border-b dark:border-gray-700 space-y-3">
                 <button 
                    onClick={handleInitiateAddDetail}
                    disabled={isAutoLocating}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all active:scale-95 disabled:bg-gray-400"
                 >
                    {isAutoLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {isAutoLocating ? "កំពុងចាប់ទីតាំង..." : "បន្ថែមព័ត៌មានលម្អិតទីនេះ"}
                 </button>
            </div>
          )}

          <div className="p-4 pb-2 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
                   <Navigation className="w-4 h-4 text-blue-500" /> ទីតាំងបន្ទាន់ក្បែរៗអ្នក
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] font-bold bg-white dark:bg-gray-700 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm" title={gpsStatus}>
                    <div className={`w-2 h-2 rounded-full ${userLocation ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`}></div>
                    <span className={userLocation ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                        {userLocation ? 'GPS កំពុងដើរ' : 'ស្វែងរក GPS...'}
                    </span>
                </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">ចាប់យកទីតាំង និងបង្ហាញទីតាំងដែលជិតអ្នកបំផុតដោយស្វ័យប្រវត្តិ។</p>
          </div>

          <div className="flex-grow overflow-y-auto px-4 pb-4 pt-2 custom-scrollbar bg-gray-50 dark:bg-gray-800/50">
            <ul className="space-y-3">
              {nearbyLocations.length === 0 ? (
                <li className="text-gray-400 text-sm text-center py-10 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin mb-3 opacity-50" />
                    មិនទាន់មានទិន្នន័យនៅជុំវិញនេះទេ...
                </li>
              ) : (
                nearbyLocations.map((loc) => (
                  <li key={loc.id} onClick={() => focusLocation(loc)} className="bg-white dark:bg-gray-700 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-600 cursor-pointer hover:border-blue-300 dark:hover:border-blue-500 transition-colors">
                      <div className="flex justify-between items-start">
                          <div className="flex-grow">
                              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{loc.name}</h3>
                              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1 mt-0.5">{loc.type}</p>
                              {loc.distance !== null && (
                                  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">
                                      ចម្ងាយ: {formatDistance(loc.distance)}
                                  </span>
                              )}
                          </div>
                          {isAdmin && (
                              <button onClick={(e) => deleteLocation(loc.id, e)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-lg transition-colors ml-2">
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          )}
                      </div>
                      {loc.phone && (
                          <a href={`tel:${loc.phone}`} onClick={e => e.stopPropagation()} className="mt-2.5 flex items-center justify-center gap-1.5 w-full bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 py-2 rounded-lg text-xs font-bold transition-colors border border-green-100 dark:border-green-800">
                              <PhoneCall className="w-3.5 h-3.5" /> ហៅទូរស័ព្ទឥឡូវនេះ
                          </a>
                      )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </aside>

        {/* Map Container */}
        <div className="flex-grow h-full relative z-0">
          <div ref={mapRef} className="w-full h-full outline-none"></div>
          
          {/* ប៊ូតុងទៅកាន់ទីតាំងបច្ចុប្បន្នរបស់ User (កូដដែលដាច់) */}
          <button 
             onClick={() => {
                if (userLocation && map) {
                  map.panTo(userLocation);
                  map.setZoom(16);
                } else {
                  showToast('មិនទាន់ចាប់ទីតាំងបានទេ ឬសូមបើក GPS', 'error');
                }
             }}
             className="absolute bottom-6 right-6 bg-white dark:bg-gray-800 p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 z-10 transition-colors"
          >
             <Navigation className="w-6 h-6 text-blue-500" />
          </button>
        </div>
      </main>
      
      {/* Toast Notification */}
      {toast.show && (
        <div className={`absolute top-20 right-5 z-50 px-4 py-2 rounded shadow-lg text-white font-bold ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}

      {/* Admin Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
           <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm shadow-xl">
             <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Shield className="text-blue-500"/> ចូលជា Admin</h2>
             <input 
                type="password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="វាយបញ្ចូលលេខសម្ងាត់..."
                className="w-full p-3 border rounded mb-4 focus:outline-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
             />
             <div className="flex justify-end gap-2">
                <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">បោះបង់</button>
                <button onClick={handleAdminLogin} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded font-bold">យល់ព្រម</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}