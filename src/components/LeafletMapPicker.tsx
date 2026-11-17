import L from 'leaflet';
import React, { useEffect, useRef } from 'react';

// Fix default Leaflet marker icons when bundled with Vite
const pinIcon = L.divIcon({
  className: 'kc-map-pin',
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#b04a17;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  color?: string;
}

interface LeafletMapPickerProps {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  markers?: MapMarker[];
  heightClass?: string;
  interactive?: boolean;
}

export const MANGALURU_AREAS = [
  { label: 'Kankanady, Mangaluru', lat: 12.8732, lng: 74.8554 },
  { label: 'Bejai, Mangaluru', lat: 12.8857, lng: 74.8414 },
  { label: 'Surathkal, Mangaluru', lat: 12.9906, lng: 74.7988 },
  { label: 'Hampankatta, Mangaluru', lat: 12.8698, lng: 74.843 },
  { label: 'Baikampady, Mangaluru', lat: 12.9141, lng: 74.856 },
];

export const LeafletMapPicker: React.FC<LeafletMapPickerProps> = ({
  lat,
  lng,
  onChange,
  markers = [],
  heightClass = 'h-56',
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const primaryMarkerRef = useRef<L.Marker | null>(null);
  const extraLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: interactive && Boolean(onChange),
    }).addTo(map);

    if (interactive && onChange) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onChange(Math.round(pos.lat * 100000) / 100000, Math.round(pos.lng * 100000) / 100000);
      });
      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChange(
          Math.round(e.latlng.lat * 100000) / 100000,
          Math.round(e.latlng.lng * 100000) / 100000
        );
      });
    }

    const extraLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    primaryMarkerRef.current = marker;
    extraLayerRef.current = extraLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      primaryMarkerRef.current = null;
      extraLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !primaryMarkerRef.current) return;
    primaryMarkerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: true });
  }, [lat, lng]);

  useEffect(() => {
    if (!extraLayerRef.current) return;
    extraLayerRef.current.clearLayers();
    for (const m of markers) {
      const icon = L.divIcon({
        className: 'kc-recycler-pin',
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:${m.color || '#16a34a'};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const mk = L.marker([m.lat, m.lng], { icon });
      mk.bindPopup(
        `<div style="font-family:IBM Plex Sans,sans-serif;font-size:12px;"><strong>${m.label}</strong>${
          m.sublabel ? `<div style="color:#475569;margin-top:2px;">${m.sublabel}</div>` : ''
        }</div>`
      );
      mk.addTo(extraLayerRef.current);
    }
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 dark:border-emerald-950/60 bg-slate-100 dark:bg-[#15201b]`}
      aria-label="OpenStreetMap location selector"
    />
  );
};
