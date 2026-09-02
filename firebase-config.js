/**
 * PrimeRP - Firebase Firestore Configuration & Data Service
 * 
 * Instrukcja:
 * 1. Skopiuj swój obiekt firebaseConfig z konsoli Firebase (Project Settings -> General -> Your apps -> SDK setup/config)
 * 2. Wklej poniżej w DEFAULT_FIREBASE_CONFIG lub skorzystaj z przycisku "Konfiguracja Firebase" w panelu /admin!
 */

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAby2GGsHH5O1tSKJOnRYNg90QTYreDmtc",
    authDomain: "primerp-de269.firebaseapp.com",
    projectId: "primerp-de269",
    storageBucket: "primerp-de269.firebasestorage.app",
    messagingSenderId: "132454456916",
    appId: "1:132454456916:web:d644ac1358e39477eed7c1",
    measurementId: "G-TM3HNEB6HD"
};

class PrimeFirebaseService {
    constructor() {
        this.app = null;
        this.db = null;
        this.isReady = false;
        this.config = this.loadConfig();
        this.init();
    }

    loadConfig() {
        try {
            const saved = localStorage.getItem('primemap_firebase_config');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.projectId && parsed.projectId === 'primerp-de269') {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Błąd odczytu konfiguracji z localStorage:', e);
        }
        return DEFAULT_FIREBASE_CONFIG;
    }

    isConfigured() {
        return Boolean(
            this.config && 
            this.config.projectId && 
            this.config.apiKey
        );
    }

    saveConfig(newConfig) {
        this.config = newConfig;
        localStorage.setItem('primemap_firebase_config', JSON.stringify(newConfig));
        if (typeof firebase !== 'undefined') {
            if (firebase.apps.length > 0) {
                firebase.app().delete().then(() => {
                    this.init();
                    window.location.reload();
                });
            } else {
                this.init();
                window.location.reload();
            }
        }
    }

    init() {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK nie jest jeszcze załadowane.');
            return;
        }

        if (this.isConfigured()) {
            try {
                if (!firebase.apps.length) {
                    this.app = firebase.initializeApp(this.config);
                } else {
                    this.app = firebase.app();
                }
                this.db = firebase.firestore();
                this.isReady = true;
                console.log('✅ Połączono pomyślnie z Firebase Firestore!');
            } catch (err) {
                console.error('❌ Błąd inicjalizacji Firebase:', err);
                this.isReady = false;
            }
        } else {
            console.log('ℹ️ Firebase nie jest jeszcze skonfigurowany. Używanie pamięci lokalnej (fallback).');
            this.isReady = false;
        }
    }

    // Nasłuchiwanie zmian stref na żywo (realtime)
    subscribeZones(onUpdate, onError) {
        if (this.isReady && this.db) {
            return this.db.collection('zones').onSnapshot((snapshot) => {
                const zones = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const normalizedCoords = (data.coords || []).map(p => {
                        if (Array.isArray(p)) return [p[0], p[1]];
                        if (p && typeof p === 'object' && ('lat' in p || 'lng' in p)) {
                            return [Number(p.lat), Number(p.lng)];
                        }
                        return p;
                    });
                    zones.push({ id: doc.id, ...data, coords: normalizedCoords });
                });
                onUpdate(zones);
            }, (error) => {
                console.error('Błąd pobierania stref z Firestore:', error);
                if (onError) onError(error);
            });
        } else {
            // Fallback do localStorage
            const loadLocal = () => {
                try {
                    const localData = localStorage.getItem('primemap_local_zones');
                    const zones = localData ? JSON.parse(localData) : [];
                    onUpdate(zones);
                } catch (e) {
                    onUpdate([]);
                }
            };
            loadLocal();
            const listener = (e) => {
                if (e.key === 'primemap_local_zones') {
                    loadLocal();
                }
            };
            window.addEventListener('storage', listener);
            return () => window.removeEventListener('storage', listener);
        }
    }

    // Zapisanie nowej strefy
    async addZone(zoneData) {
        // Firestore nie zezwala na zagnieżdżone tablice (nested arrays, np. [[lat, lng]]),
        // dlatego konwertujemy wierzchołki na tablicę obiektów [{lat, lng}, ...]
        const sanitizedCoords = (zoneData.coords || []).map(p => {
            if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
            if (p && typeof p === 'object') return { lat: p.lat, lng: p.lng };
            return p;
        });

        const payload = {
            ...zoneData,
            coords: sanitizedCoords,
            createdAt: new Date().toISOString()
        };

        if (this.isReady && this.db) {
            const docRef = await this.db.collection('zones').add(payload);
            return { id: docRef.id, ...payload, coords: zoneData.coords };
        } else {
            const localData = localStorage.getItem('primemap_local_zones');
            const zones = localData ? JSON.parse(localData) : [];
            const newZone = { id: 'local_' + Date.now(), ...payload, coords: zoneData.coords };
            zones.push(newZone);
            localStorage.setItem('primemap_local_zones', JSON.stringify(zones));
            window.dispatchEvent(new Event('storage'));
            return newZone;
        }
    }

    // Aktualizacja istniejącej strefy
    async updateZone(zoneId, zoneData) {
        const sanitizedCoords = (zoneData.coords || []).map(p => {
            if (Array.isArray(p)) return { lat: p[0], lng: p[1] };
            if (p && typeof p === 'object') return { lat: p.lat, lng: p.lng };
            return p;
        });

        const payload = {
            ...zoneData,
            coords: sanitizedCoords,
            updatedAt: new Date().toISOString()
        };

        if (this.isReady && this.db) {
            await this.db.collection('zones').doc(zoneId).update(payload);
            return { id: zoneId, ...payload, coords: zoneData.coords };
        } else {
            const localData = localStorage.getItem('primemap_local_zones');
            let zones = localData ? JSON.parse(localData) : [];
            zones = zones.map(z => z.id === zoneId ? { ...z, ...payload, coords: zoneData.coords } : z);
            localStorage.setItem('primemap_local_zones', JSON.stringify(zones));
            window.dispatchEvent(new Event('storage'));
            return { id: zoneId, ...payload, coords: zoneData.coords };
        }
    }

    // Usunięcie strefy
    async deleteZone(zoneId) {
        if (this.isReady && this.db) {
            await this.db.collection('zones').doc(zoneId).delete();
            return true;
        } else {
            const localData = localStorage.getItem('primemap_local_zones');
            let zones = localData ? JSON.parse(localData) : [];
            zones = zones.filter(z => z.id !== zoneId);
            localStorage.setItem('primemap_local_zones', JSON.stringify(zones));
            window.dispatchEvent(new Event('storage'));
            return true;
        }
    }
}

// Inicjalizacja serwisu
window.PrimeService = new PrimeFirebaseService();
