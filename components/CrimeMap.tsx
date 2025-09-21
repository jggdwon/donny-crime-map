

import React, { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.heat';
import moment from 'moment';
import { Crime, Insight, PredictiveHotspot, StopSearch } from '../types';
import { generateIncidentBriefing, generateStopSearchBriefing } from '../services/geminiService';

declare module 'leaflet' {
  interface MarkerOptions {
      crimeId?: string;
  }

  // --- Leaflet.markercluster ---
  class MarkerClusterGroup extends L.FeatureGroup {
    constructor(options?: any);
    addLayer(layer: L.Layer): this;
    removeLayer(layer: L.Layer): this;
    clearLayers(): this;
    eachLayer(fn: (layer: L.Layer) => void): this;
    zoomToShowLayer(layer: L.Layer, callback?: () => void): void;
  }
  function markerClusterGroup(options?: any): MarkerClusterGroup;

  // --- Leaflet.heat ---
  type HeatLatLngTuple = [number, number, number]; // lat, lng, intensity

  interface HeatLayerOptions extends LayerOptions {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: { [key: number]: string };
  }

  class HeatLayer extends L.Layer {
      constructor(latlngs: (L.LatLng | HeatLatLngTuple)[], options?: HeatLayerOptions);
  }

  function heatLayer(latlngs: Array<L.LatLng | HeatLatLngTuple>, options?: HeatLayerOptions): HeatLayer;
}

const createCrimePopupContent = (crime: Crime, briefingContent: string): string => {
    return `<div class="crime-marker-popup">
        <h3 class="font-bold text-lg mb-2">${crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h3>
        <div><strong>Date:</strong> ${moment(crime.month).format('MMMM YYYY')}</div>
        <div><strong>Location:</strong> ${crime.location.street.name}</div>
        <div><strong>Outcome:</strong> ${crime.outcome_status?.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? 'N/A'}</div>
        <div class="briefing-content">${briefingContent}</div>
    </div>`;
};

const createStopSearchPopupContent = (stopSearch: StopSearch, briefingContent: string): string => {
    return `<div class="crime-marker-popup">
        <h3 class="font-bold text-lg mb-2">Stop and Search</h3>
        <div><strong>Date:</strong> ${moment(stopSearch.datetime).format('YYYY-MM-DD HH:mm')}</div>
        <div><strong>Outcome:</strong> ${stopSearch.outcome}</div>
        <div class="briefing-content">${briefingContent}</div>
    </div>`;
};

const loadingBriefingContent = `<div class="loading-spinner"></div><p class="text-center text-xs text-gray-400">Generating briefing...</p>`;


// Fix for default marker icons in a browser ESM environment
let DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;


interface CrimeMapProps {
  crimes: Crime[];
  insights: Insight[];
  predictiveHotspots: PredictiveHotspot[];
  isDensityHeatmapVisible: boolean;
  isRecencyHeatmapVisible: boolean;
  isInsightsVisible: boolean;
  isPredictiveHotspotsVisible: boolean;
  isMapEffectEnabled: boolean;
  onCrimeSelect: (crimeId: string | null) => void;
  selectedCrimeId: string | null;
  selectedStopSearch: StopSearch | null;
  allCrimes: Crime[];
  allStopSearches: any[];
}

const CrimeMap: React.FC<CrimeMapProps> = ({
  crimes,
  insights,
  predictiveHotspots,
  isDensityHeatmapVisible,
  isRecencyHeatmapVisible,
  isInsightsVisible,
  isPredictiveHotspotsVisible,
  isMapEffectEnabled,
  onCrimeSelect,
  selectedCrimeId,
  selectedStopSearch,
  allCrimes,
  allStopSearches,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const crimeMarkersRef = useRef<L.MarkerClusterGroup | null>(null);
  const densityHeatLayerRef = useRef<L.HeatLayer | null>(null);
  const recencyHeatLayerRef = useRef<L.HeatLayer | null>(null);
  const insightsLayerRef = useRef<L.LayerGroup | null>(null);
  const predictiveHotspotLayerRef = useRef<L.FeatureGroup | null>(null);
  const stopSearchCircleRef = useRef<L.Layer | null>(null);
  
  const briefingCacheRef = useRef<Map<string, string>>(new Map());
  const briefingLoadingRef = useRef<Set<string>>(new Set());

  const getCrimeVisuals = (crimeDate: string) => {
    const daysOld = moment().diff(moment(crimeDate), 'days');
    if (daysOld <= 7) return { color: 'rgb(255,0,0)', size: 28 };
    if (daysOld <= 30) return { color: 'rgb(255,165,0)', size: 24 };
    if (daysOld <= 90) return { color: 'rgb(255,255,0)', size: 20 };
    return { color: 'rgb(0,255,0)', size: 16 };
  };
  
  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    const map = L.map(mapContainerRef.current, {
        center: [53.522820, -1.128462],
        zoom: 13,
        layers: [satelliteLayer] // Default to satellite view
    });
    mapRef.current = map;
    
    map.on('click', () => {
        onCrimeSelect(null); // Deselect when clicking the map background
    });

    const baseMaps = {
        "Satellite": satelliteLayer,
        "Street": streetLayer
    };

    L.control.layers(baseMaps).addTo(map);


    crimeMarkersRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 60, // A smaller radius will break clusters apart sooner on zoom.
    }).addTo(map);
    
    insightsLayerRef.current = L.layerGroup().addTo(map);
    predictiveHotspotLayerRef.current = L.featureGroup().addTo(map);

    return () => {
        map.remove();
        mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Update map effect
  useEffect(() => {
      const tilePane = mapContainerRef.current?.querySelector('.leaflet-tile-pane') as HTMLElement | null;
      if (tilePane) {
          if (isMapEffectEnabled) {
            tilePane.style.animation = 'mapEffect 8s infinite alternate ease-in-out';
            tilePane.style.filter = '';
          } else {
            tilePane.style.animation = 'none';
            tilePane.style.filter = 'grayscale(20%) contrast(0.9) brightness(0.9)';
          }
      }
  }, [isMapEffectEnabled]);

  // Update crime markers
  useEffect(() => {
    const markers = crimeMarkersRef.current;
    if (!markers || !mapRef.current) return;

    markers.clearLayers();
    crimes.forEach(crime => {
        const lat = parseFloat(crime.location.latitude);
        const lng = parseFloat(crime.location.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        
        const crimeId = crime.persistent_id || String(crime.id);

        const { color, size } = getCrimeVisuals(crime.month);
        const iconHtml = `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`;
        const customIcon = L.divIcon({
            className: `custom-div-icon ${crime.category === 'burglary' ? 'burglary-flash' : ''}`,
            html: iconHtml,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        const marker = L.marker([lat, lng], { icon: customIcon, crimeId: crimeId });

        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (stopSearchCircleRef.current && mapRef.current) {
                mapRef.current.removeLayer(stopSearchCircleRef.current);
            }
            onCrimeSelect(crimeId);
        });
        
        const popup = L.popup({ autoPan: true, autoPanPadding: L.point(50, 50), closeOnClick: false, autoClose: false })
            .setContent(createCrimePopupContent(crime, loadingBriefingContent));

        marker.bindPopup(popup);

        marker.on('popupopen', async (e) => {
            const popup = e.popup;
            const cacheKey = `crime-${crime.id}`;

            if (briefingCacheRef.current.has(cacheKey)) {
                popup.setContent(createCrimePopupContent(crime, briefingCacheRef.current.get(cacheKey)!));
                return;
            }

            if (briefingLoadingRef.current.has(cacheKey)) return;

            briefingLoadingRef.current.add(cacheKey);
            try {
                const briefingText = await generateIncidentBriefing(crime, allCrimes, allStopSearches);
                const briefingHtml = briefingText.replace(/\n/g, '<br/>');
                briefingCacheRef.current.set(cacheKey, briefingHtml);
                popup.setContent(createCrimePopupContent(crime, briefingHtml));
            } catch (error) {
                const errorHtml = `<div class="text-red-400">Failed to load briefing.</div>`;
                popup.setContent(createCrimePopupContent(crime, errorHtml));
            } finally {
                briefingLoadingRef.current.delete(cacheKey);
            }
        });
        markers.addLayer(marker);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crimes, onCrimeSelect, allCrimes, allStopSearches]);

  // Handle selected crime from list
  useEffect(() => {
    const map = mapRef.current;
    const markers = crimeMarkersRef.current;
    if (!map || !markers || !selectedCrimeId) return;

    let targetMarker: L.Marker | null = null;
    markers.eachLayer(layer => {
        const marker = layer as L.Marker;
        if (marker.options.crimeId === selectedCrimeId) {
            targetMarker = marker;
        }
    });

    if (targetMarker) {
        markers.zoomToShowLayer(targetMarker, () => {
            targetMarker?.openPopup();
        });
    }

  }, [selectedCrimeId]);


    // Handle selected stop & search
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (stopSearchCircleRef.current) {
            map.removeLayer(stopSearchCircleRef.current);
        }

        if (selectedStopSearch && selectedStopSearch.location) {
            const lat = parseFloat(selectedStopSearch.location.latitude);
            const lng = parseFloat(selectedStopSearch.location.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            map.closePopup();

            const circle = L.circle([lat, lng], {
                radius: 150,
                color: '#FF8C00',
                fillColor: '#FF8C00',
                fillOpacity: 0.3
            });
            
            const popup = L.popup({ autoPan: true, autoPanPadding: L.point(50, 50), closeOnClick: true, autoClose: true })
                 .setContent(createStopSearchPopupContent(selectedStopSearch, loadingBriefingContent));

            circle.bindPopup(popup).addTo(map);
            stopSearchCircleRef.current = circle;

            map.flyTo([lat, lng], 15);
            circle.openPopup();

            circle.on('popupopen', async (e) => {
                const popup = e.popup;
                const cacheKey = `ss-${selectedStopSearch.datetime}-${lat}-${lng}`;

                if (briefingCacheRef.current.has(cacheKey)) {
                    popup.setContent(createStopSearchPopupContent(selectedStopSearch, briefingCacheRef.current.get(cacheKey)!));
                    return;
                }
                if (briefingLoadingRef.current.has(cacheKey)) return;

                briefingLoadingRef.current.add(cacheKey);
                try {
                    const briefingText = await generateStopSearchBriefing(selectedStopSearch, allCrimes, allStopSearches);
                    const briefingHtml = briefingText.replace(/\n/g, '<br/>');
                    briefingCacheRef.current.set(cacheKey, briefingHtml);
                    popup.setContent(createStopSearchPopupContent(selectedStopSearch, briefingHtml));
                } catch(error) {
                    const errorHtml = `<div class="text-red-400">Failed to load briefing.</div>`;
                    popup.setContent(createStopSearchPopupContent(selectedStopSearch, errorHtml));
                } finally {
                    briefingLoadingRef.current.delete(cacheKey);
                }
            });
            
            circle.on('popupclose', () => {
                 if (stopSearchCircleRef.current) {
                    map.removeLayer(stopSearchCircleRef.current);
                    stopSearchCircleRef.current = null;
                }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedStopSearch, allCrimes, allStopSearches]);


  // Update heatmaps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (densityHeatLayerRef.current) map.removeLayer(densityHeatLayerRef.current);
    if (recencyHeatLayerRef.current) map.removeLayer(recencyHeatLayerRef.current);

    if (isDensityHeatmapVisible) {
        const heatData = crimes
            .map(c => [parseFloat(c.location.latitude), parseFloat(c.location.longitude), 1])
            .filter(p => !isNaN(p[0]) && !isNaN(p[1])) as L.HeatLatLngTuple[];
        if (heatData.length > 0) {
            densityHeatLayerRef.current = L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 17, minOpacity: 0.7 }).addTo(map);
        }
    } else if (isRecencyHeatmapVisible) {
        const getRecencyIntensity = (date: string) => {
            const daysOld = moment().diff(moment(date), 'days');
            if (daysOld <= 7) return 1.0;
            if (daysOld <= 30) return 0.7;
            if (daysOld <= 90) return 0.4;
            return 0.1;
        };
        const heatData = crimes
            .map(c => [parseFloat(c.location.latitude), parseFloat(c.location.longitude), getRecencyIntensity(c.month)])
            .filter(p => !isNaN(p[0]) && !isNaN(p[1])) as L.HeatLatLngTuple[];
        if (heatData.length > 0) {
            recencyHeatLayerRef.current = L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 17, minOpacity: 0.7 }).addTo(map);
        }
    }
  }, [crimes, isDensityHeatmapVisible, isRecencyHeatmapVisible]);
  
  // Update insights layer
  useEffect(() => {
    const layer = insightsLayerRef.current;
    if (!layer || !mapRef.current) return;
    layer.clearLayers();

    if (isInsightsVisible) {
        insights.forEach(insight => {
            const relevantCrime = crimes.find(c => c.location.street.name.toLowerCase().includes(insight.area.toLowerCase()));
            const lat = relevantCrime ? parseFloat(relevantCrime.location.latitude) : 53.522820;
            const lng = relevantCrime ? parseFloat(relevantCrime.location.longitude) : -1.128462;

            if (!isNaN(lat) && !isNaN(lng)) {
                const icon = L.divIcon({
                    className: 'custom-insight-icon',
                    html: `<div class="flex items-center justify-center w-[30px] h-[30px] text-xl text-[#0D1117] font-bold bg-[#FFD700] rounded-full shadow-[0_0_7px_var(--accent-primary)] border-2 border-solid border-[#FFD700]">💡</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
                L.marker([lat, lng], { icon }).bindPopup(`<b>Insight: ${insight.area}</b><br>${insight.insight}`).addTo(layer);
            }
        });
    }
  }, [isInsightsVisible, insights, crimes]);
  
  // Update predictive hotspots layer
  useEffect(() => {
    const layer = predictiveHotspotLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (isPredictiveHotspotsVisible) {
        predictiveHotspots.forEach(hotspot => {
            const { latitude, longitude } = hotspot;
             if (!isNaN(latitude) && !isNaN(longitude)) {
                const icon = L.divIcon({
                    className: 'custom-predictive-icon',
                    html: `<div class="flex items-center justify-center w-[30px] h-[30px] text-xl text-[#0D1117] font-bold bg-[#FF4500] rounded-full shadow-[0_0_7px_var(--predictive-hotspot)] border-2 border-solid border-[#FF4500] animate-[pulse-predictive_1.5s_infinite_alternate]">🎯</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
                const marker = L.marker([latitude, longitude], { icon }).bindPopup(`<b>Predicted Hotspot: ${hotspot.area}</b><br><b>Crime:</b> ${hotspot.predictedCrimeType}<br><b>Reason:</b> ${hotspot.reason}`);
                
                marker.on('click', () => {
                    map.flyTo(marker.getLatLng(), 17, {
                        animate: true,
                        duration: 1.5,
                        easeLinearity: 0.25
                    });
                    marker.openPopup();
                    marker.once('popupopen', (e) => {
                        setTimeout(() => {
                            const popupHeight = e.popup.getElement()?.clientHeight ?? 0;
                            map.panBy([0, -(popupHeight / 4)], { animate: true, duration: 0.5 });
                        }, 500);
                    });
                });

                marker.addTo(layer);
             }
        });
        if (predictiveHotspots.length > 0) {
            map.flyToBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 14 });
        }
    }
  }, [isPredictiveHotspotsVisible, predictiveHotspots]);

  return (
    <div 
        id="map" 
        ref={mapContainerRef} 
        className="h-[70vh] w-full rounded-md shadow-[inset_0_0_10px_rgba(0,0,0,0.9),_0_0_5px_var(--accent-primary),_inset_0_0_0_2px_var(--accent-primary),_inset_0_0_0_4px_var(--border-color),_inset_0_0_0_6px_var(--bg-dark)] border-4 border-solid border-[#FFD700] bg-[#0A0A0A] relative mb-1.5"
    >
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center text-[#FFD700] font-bold text-xs" style={{textShadow: '0 0 2px rgba(255,215,0,0.7)'}}>
          <div className="bg-[#21262D] py-1 px-2 rounded-md border border-solid border-[#FFD700] shadow-[0_0_5px_rgba(0,0,0,0.5)] flex items-center justify-center gap-1">
              <span>N</span>
              <svg viewBox="0 0 24 24" className="stroke-[#FFD700] fill-none w-4 h-4 align-middle">
                  <line x1="12" y1="2" x2="12" y2="22"></line>
                  <polyline points="5 9 12 2 19 9"></polyline>
              </svg>
          </div>
      </div>
    </div>
  );
};

export default memo(CrimeMap);