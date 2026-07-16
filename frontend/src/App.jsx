import { useState, useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';

import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

let BusIcon = L.divIcon({
  className: 'leaflet-bus-marker',
  html: `
    <div class="bus-marker-pin standard">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

L.Marker.prototype.options.icon = BusIcon;

let SelectedBusIcon = L.divIcon({
  className: 'leaflet-bus-marker selected',
  html: `
    <div class="bus-marker-pin selected">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </svg>
      <div class="marker-pulse-ring"></div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

let PlaybackBusIcon = L.divIcon({
  className: 'leaflet-bus-marker playback',
  html: `
    <div class="bus-marker-pin playback">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <path d="M9 17h6" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18]
});

function ChangeMapView({ center, zoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

function App() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicleInput, setVehicleInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewType, setViewType] = useState('map');
  const [trail, setTrail] = useState([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);

  // Playback state
  const [playbackDate, setPlaybackDate] = useState(new Date().toISOString().split('T')[0]);
  const [playbackPoints, setPlaybackPoints] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlayingPlayback, setIsPlayingPlayback] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);

  const API_BASE_URL = 'http://localhost:5000/api';

  // Mobile detection with resize listener
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const fetchAllVehicles = async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setListLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/vehicles`);
      const result = await response.json();
      if (response.ok && result.success) {
        setVehicles(result.data);
        setSelectedVehicle(current => {
          if (!current) return null;
          const updated = result.data.find(v => v.name === current.name);
          return updated || current;
        });
      } else {
        if (!isAutoRefresh) setError(result.error || 'Failed to load vehicles registry');
      }
    } catch (err) {
      console.error(err);
      if (!isAutoRefresh) {
        setError('Failed to connect to backend server. Make sure the backend server is running on port 5000.');
      }
    } finally {
      if (!isAutoRefresh) setListLoading(false);
    }
  };

  useEffect(() => {
    fetchAllVehicles();
    const interval = setInterval(() => fetchAllVehicles(true), 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedVehicle) {
      setTrail([[selectedVehicle.latitude, selectedVehicle.longitude]]);
    } else {
      setTrail([]);
    }
  }, [selectedVehicle?.name]);

  useEffect(() => {
    if (viewType !== 'live_trace' || !selectedVehicle?.name) return;
    const fetchLatest = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/vehicle/${encodeURIComponent(selectedVehicle.name)}`);
        const result = await response.json();
        if (response.ok && result.success) {
          const newVehicle = result.data;
          setSelectedVehicle(newVehicle);
          setTrail(prev => {
            if (prev.length === 0) return [[newVehicle.latitude, newVehicle.longitude]];
            const lastPoint = prev[prev.length - 1];
            if (lastPoint[0] !== newVehicle.latitude || lastPoint[1] !== newVehicle.longitude) {
              return [...prev, [newVehicle.latitude, newVehicle.longitude]];
            }
            return prev;
          });
        } else {
          setError(result.error || 'Selected vehicle was not found in the live registry.');
          setSelectedVehicle(null);
          setViewType('map');
        }
      } catch (err) {
        console.error('Error polling vehicle coordinates:', err);
      }
    };
    fetchLatest();
    const pollInterval = setInterval(fetchLatest, 1000);
    return () => clearInterval(pollInterval);
  }, [viewType, selectedVehicle?.name]);

  const fetchPlaybackHistory = async () => {
    if (!selectedVehicle) return;
    setPlaybackLoading(true);
    setPlaybackError(null);
    setIsPlayingPlayback(false);
    setPlaybackIndex(0);
    setPlaybackPoints([]);
    try {
      const response = await fetch(`${API_BASE_URL}/vehicle/${encodeURIComponent(selectedVehicle.name)}/playback?date=${playbackDate}`);
      const result = await response.json();
      if (response.ok && result.success) {
        if (result.data.length === 0) {
          setPlaybackError(`No GPS historical coordinates found for vehicle "${selectedVehicle.name}" on ${playbackDate}.`);
        } else {
          setPlaybackPoints(result.data);
          setViewType('playback');
        }
      } else {
        setPlaybackError(result.error || `Failed to retrieve playback history for ${selectedVehicle.name}.`);
      }
    } catch (err) {
      console.error('Playback Fetch Error:', err);
      setPlaybackError('Failed to connect to the backend server to fetch history logs.');
    } finally {
      setPlaybackLoading(false);
    }
  };

  useEffect(() => {
    if (!isPlayingPlayback || playbackPoints.length === 0) return;
    if (playbackIndex >= playbackPoints.length - 1) {
      setIsPlayingPlayback(false);
      return;
    }
    const timer = setTimeout(() => setPlaybackIndex(prev => prev + 1), 1000 / playbackSpeed);
    return () => clearTimeout(timer);
  }, [isPlayingPlayback, playbackIndex, playbackSpeed, playbackPoints.length]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!vehicleInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/vehicle/${encodeURIComponent(vehicleInput.trim())}`);
      const result = await response.json();
      if (response.ok && result.success) {
        setSelectedVehicle(result.data);
        setViewType('map');
        fetchAllVehicles(true);
      } else {
        setError(result.error || 'Failed to retrieve vehicle location data');
        setSelectedVehicle(null);
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Verify that the backend server is running.');
      setSelectedVehicle(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleInput(vehicle.name);
    setError(null);
    setViewType('map');
    setMobileSidebarOpen(false);
    setMobileSheetExpanded(false);
    setPlaybackPoints([]);
    setPlaybackIndex(0);
    setIsPlayingPlayback(false);
    setPlaybackError(null);
  };

  const openGoogleMaps = () => {
    const target = selectedVehicle;
    if (!target) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${target.latitude},${target.longitude}`, '_blank');
  };

  const getStatusText = (speed) => {
    if (speed > 5) return 'Moving';
    if (speed > 0) return 'Slow';
    return 'Idle';
  };

  const getStatusClass = (speed) => {
    if (speed > 5) return 'status-pill moving';
    if (speed > 0) return 'status-pill idle';
    return 'status-pill offline';
  };

  const getVehicleStatus = (speed) => {
    if (speed > 5) return 'moving';
    if (speed > 0) return 'idle';
    return 'stopped';
  };

  const totalCount = vehicles.length;
  const movingCount = vehicles.filter(v => v && typeof v.speed === 'number' && v.speed > 5).length;
  const idleCount = vehicles.filter(v => v && typeof v.speed === 'number' && v.speed > 0 && v.speed <= 5).length;
  const stoppedCount = vehicles.filter(v => v && typeof v.speed === 'number' && v.speed === 0).length;

  const filteredVehicles = vehicles.filter(v => {
    if (!v || !v.name) return false;
    const matchesSearch = v.name.toLowerCase().includes(sidebarFilter.toLowerCase());
    const status = getVehicleStatus(v.speed);
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getMapCenterAndZoom = () => {
    if (selectedVehicle) {
      return { center: [selectedVehicle.latitude, selectedVehicle.longitude], zoom: viewType === 'live_trace' ? 16 : 14 };
    }
    const validVehicles = filteredVehicles.filter(v => v.latitude && v.longitude);
    if (validVehicles.length > 0) {
      const avgLat = validVehicles.reduce((sum, v) => sum + v.latitude, 0) / validVehicles.length;
      const avgLng = validVehicles.reduce((sum, v) => sum + v.longitude, 0) / validVehicles.length;
      return { center: [avgLat, avgLng], zoom: 11 };
    }
    return { center: [16.83868, 82.225266], zoom: 11 };
  };

  const mapConfig = getMapCenterAndZoom();

  // Shared map JSX renderer
  const renderMapContent = () => (
    <div style={{ position: 'relative', height: '100%', width: '100%', minHeight: '100%' }}>
      <MapContainer
        key={selectedVehicle ? `map-${selectedVehicle.name}-${viewType}` : 'map-fleet'}
        center={mapConfig.center}
        zoom={mapConfig.zoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {viewType !== 'playback' && selectedVehicle && selectedVehicle.history && selectedVehicle.history.length > 1 && (
          <Polyline positions={selectedVehicle.history} color="#2563eb" weight={4.5} opacity={0.8} />
        )}

        {viewType === 'live_trace' && selectedVehicle && (
          <Polyline positions={trail} color="#ef4444" weight={4} opacity={0.8} dashArray="5, 10" />
        )}

        {viewType === 'playback' && playbackPoints.length > 1 && (
          <>
            <Polyline positions={playbackPoints.map(p => [p.latitude, p.longitude])} color="#6366f1" weight={4} opacity={0.5} />
            <Polyline positions={playbackPoints.slice(0, playbackIndex + 1).map(p => [p.latitude, p.longitude])} color="#a5b4fc" weight={4} opacity={0.9} />
            <Marker position={[playbackPoints[playbackIndex].latitude, playbackPoints[playbackIndex].longitude]} icon={PlaybackBusIcon}>
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <h4 style={{ color: '#f59e0b', marginBottom: '4px', fontSize: '0.95rem' }}>{selectedVehicle?.name}</h4>
                  <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Speed:</strong> {playbackPoints[playbackIndex].speed} km/h</p>
                  <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Time:</strong> {playbackPoints[playbackIndex].timestamp}</p>
                  <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Point:</strong> {playbackIndex + 1} / {playbackPoints.length}</p>
                </div>
              </Popup>
            </Marker>
            <ChangeMapView center={[playbackPoints[playbackIndex].latitude, playbackPoints[playbackIndex].longitude]} zoom={15} />
          </>
        )}

        {viewType === 'live_trace' && selectedVehicle ? (
          <Marker position={[selectedVehicle.latitude, selectedVehicle.longitude]} icon={SelectedBusIcon}>
            <Popup>
              <div style={{ minWidth: '150px' }}>
                <h4 style={{ color: 'var(--accent-danger)', marginBottom: '4px', fontSize: '0.95rem' }}>{selectedVehicle.name}</h4>
                <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Speed:</strong> {selectedVehicle.speed} km/h</p>
                <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Status:</strong> Live Tracing</p>
                <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Coords:</strong> {selectedVehicle.latitude.toFixed(5)}, {selectedVehicle.longitude.toFixed(5)}</p>
              </div>
            </Popup>
          </Marker>
        ) : viewType !== 'playback' ? (
          filteredVehicles.map(vehicle => {
            const isSelected = selectedVehicle && selectedVehicle.name === vehicle.name;
            return (
              <Marker
                key={vehicle.name}
                position={[vehicle.latitude, vehicle.longitude]}
                icon={isSelected ? SelectedBusIcon : BusIcon}
                eventHandlers={{ click: () => handleSelectVehicle(vehicle) }}
              >
                <Popup>
                  <div style={{ minWidth: '150px' }}>
                    <h4 style={{ color: isSelected ? 'var(--accent-danger)' : 'var(--accent-primary)', marginBottom: '4px', fontSize: '0.95rem' }}>{vehicle.name}</h4>
                    <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Speed:</strong> {vehicle.speed} km/h</p>
                    <p style={{ margin: '2px 0', fontSize: '0.8rem' }}><strong>Time:</strong> {vehicle.timestamp}</p>
                    <button
                      onClick={() => handleSelectVehicle(vehicle)}
                      style={{ marginTop: '0.5rem', width: '100%', backgroundColor: isSelected ? 'var(--accent-danger)' : 'var(--accent-primary)', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                    >
                      {isSelected ? 'Focus Track' : 'Active Track'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })
        ) : null}

        {viewType !== 'playback' && <ChangeMapView center={mapConfig.center} zoom={mapConfig.zoom} />}
      </MapContainer>

      {/* Floating Playback Controls */}
      {viewType === 'playback' && playbackPoints.length > 0 && (
        <div className="playback-controls">
          <div className="playback-controls-row">
            <button className="playback-btn" onClick={() => setIsPlayingPlayback(p => !p)} title={isPlayingPlayback ? 'Pause' : 'Play'}>
              {isPlayingPlayback ? '⏸' : '▶️'}
            </button>
            <button className="playback-btn" onClick={() => { setPlaybackIndex(0); setIsPlayingPlayback(false); }} title="Reset">⏮</button>
            <div className="playback-speed-selector">
              {[1, 2, 5, 10].map(s => (
                <button key={s} className={`speed-btn ${playbackSpeed === s ? 'active' : ''}`} onClick={() => setPlaybackSpeed(s)}>{s}x</button>
              ))}
            </div>
            <div className="playback-info">
              <span className="playback-time">{playbackPoints[playbackIndex]?.timestamp || ''}</span>
              <span className="playback-speed-info">{playbackPoints[playbackIndex]?.speed || 0} km/h</span>
            </div>
            <button className="playback-btn exit" onClick={() => { setViewType('map'); setIsPlayingPlayback(false); }} title="Exit playback">✕</button>
          </div>
          <div className="playback-slider-row">
            <span className="playback-counter">{playbackIndex + 1} / {playbackPoints.length}</span>
            <input
              type="range" min={0} max={playbackPoints.length - 1} value={playbackIndex}
              onChange={(e) => { setPlaybackIndex(Number(e.target.value)); setIsPlayingPlayback(false); }}
              className="playback-slider"
            />
            <span className="playback-counter">{Math.round((playbackIndex / Math.max(playbackPoints.length - 1, 1)) * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <header>
        <div className="logo-container">
          <span className="logo-icon">📡</span>
          <span className="logo-text">PydahSoft GPS Tracker</span>
        </div>
        <div className="header-right">
          {selectedVehicle ? (
            <div className="badge-mode live">
              <span className="badge-dot"></span>
              Tracking: {selectedVehicle.name}
            </div>
          ) : (
            <div className="badge-mode fleet">
              <span className="badge-dot"></span>
              Fleet Overview ({vehicles.length} Vehicles)
            </div>
          )}
          {/* Hamburger only for desktop sidebar (tablet) */}
          {!isMobile && (
            <button
              className={`mobile-sidebar-toggle ${mobileSidebarOpen ? 'active' : ''}`}
              onClick={() => setMobileSidebarOpen(o => !o)}
              aria-label="Toggle vehicle list"
            >
              {mobileSidebarOpen ? '✕' : '☰'}
            </button>
          )}
        </div>
      </header>

      {isMobile ? (
        /* ============================================================
           MOBILE LAYOUT
           ============================================================ */
        <div className={`mobile-wrapper ${selectedVehicle ? 'vehicle-mode' : 'fleet-mode'}`}>

          {/* MAP REGION */}
          <div className={`mobile-map-region ${selectedVehicle ? 'map-fullscreen' : 'map-split'}`}>
            {viewType !== 'iframe' || !selectedVehicle ? (
              renderMapContent()
            ) : (
              <iframe
                src={selectedVehicle.uiiframe}
                title={`Live tracking for ${selectedVehicle.name}`}
                className="iframe-container"
              />
            )}

            {/* Live trace badge on map (mobile) */}
            {selectedVehicle && viewType === 'live_trace' && (
              <div className="mobile-map-badge live-trace-badge">
                <span className="live-dot-pulse" style={{ backgroundColor: 'var(--accent-danger)', width: '6px', height: '6px', boxShadow: '0 0 6px var(--accent-danger)' }}></span>
                LIVE TRACING
              </div>
            )}
            {selectedVehicle && viewType === 'playback' && playbackPoints.length > 0 && (
              <div className="mobile-map-badge playback-badge">
                ⏱ PLAYBACK — {playbackDate}
              </div>
            )}
          </div>

          {/* FLEET LIST — shown when no vehicle is selected */}
          {!selectedVehicle && (
            <div className="mobile-fleet-panel">
              <div className="mobile-fleet-header">
                <h3>Connected Fleet</h3>
                <span className="live-indicator">
                  <span className="live-dot-pulse"></span>
                  LIVE
                </span>
              </div>

              {error && <div className="mobile-error-bar">⚠️ {error}</div>}

              <div className="mobile-fleet-search">
                <span className="search-box-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search vehicles..."
                  value={sidebarFilter}
                  onChange={(e) => setSidebarFilter(e.target.value)}
                  className="sidebar-search-input"
                />
                {sidebarFilter && <button className="clear-filter-btn" onClick={() => setSidebarFilter('')}>×</button>}
              </div>

              <div className="mobile-fleet-filters">
                <button className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                  All <span className="filter-count">{totalCount}</span>
                </button>
                <button className={`filter-tab moving ${statusFilter === 'moving' ? 'active' : ''}`} onClick={() => setStatusFilter('moving')}>
                  🟢 <span className="filter-count">{movingCount}</span>
                </button>
                <button className={`filter-tab idle ${statusFilter === 'idle' ? 'active' : ''}`} onClick={() => setStatusFilter('idle')}>
                  🟡 <span className="filter-count">{idleCount}</span>
                </button>
                <button className={`filter-tab stopped ${statusFilter === 'stopped' ? 'active' : ''}`} onClick={() => setStatusFilter('stopped')}>
                  🔴 <span className="filter-count">{stoppedCount}</span>
                </button>
              </div>

              <div className="mobile-vehicle-scroll">
                {listLoading && vehicles.length === 0 ? (
                  <div className="sidebar-loading"><div className="mini-spinner"></div><p>Loading fleet...</p></div>
                ) : filteredVehicles.length === 0 ? (
                  <div className="sidebar-empty"><p>No vehicles found</p></div>
                ) : (
                  filteredVehicles.map(vehicle => {
                    const status = getVehicleStatus(vehicle.speed);
                    return (
                      <div
                        key={vehicle.name}
                        className={`vehicle-list-item ${status}`}
                        onClick={() => handleSelectVehicle(vehicle)}
                      >
                        <div className="vehicle-item-header">
                          <span className="vehicle-item-name">{vehicle.name}</span>
                          <span className={`status-dot ${status}`}></span>
                        </div>
                        <div className="vehicle-item-details">
                          <span className="vehicle-item-speed">{vehicle.speed} km/h</span>
                          <span className="vehicle-item-time">
                            {vehicle.timestamp.includes(' ') ? vehicle.timestamp.split(' ')[1] : vehicle.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* VEHICLE BOTTOM SHEET — shown when vehicle is selected */}
          {selectedVehicle && (
            <div className={`mobile-vehicle-sheet ${mobileSheetExpanded ? 'expanded' : ''}`}>

              {/* Drag handle to expand/collapse */}
              <div className="sheet-drag-handle" onClick={() => setMobileSheetExpanded(e => !e)}>
                <div className="handle-pill"></div>
                <span className="sheet-expand-hint">{mobileSheetExpanded ? '▼ Less' : '▲ Details'}</span>
              </div>

              {/* Vehicle name + status + speed */}
              <div className="sheet-info-row">
                <div className="sheet-name-group">
                  <span className="sheet-vehicle-name">{selectedVehicle.name}</span>
                  <span className={getStatusClass(selectedVehicle.speed)}>{getStatusText(selectedVehicle.speed)}</span>
                </div>
                <div className="sheet-speed-badge">
                  {selectedVehicle.speed} <span>km/h</span>
                </div>
              </div>

              {/* Icon action buttons row */}
              <div className="sheet-action-icons">
                <button
                  className={`sheet-icon-btn ${viewType === 'map' ? 'active' : ''}`}
                  onClick={() => setViewType('map')}
                >
                  <span className="icon-btn-emoji">🗺️</span>
                  <span className="icon-btn-label">Map</span>
                </button>
                <button
                  className={`sheet-icon-btn ${viewType === 'live_trace' ? 'active-red' : ''}`}
                  onClick={() => setViewType('live_trace')}
                >
                  <span className="icon-btn-emoji">📡</span>
                  <span className="icon-btn-label">Trace</span>
                </button>
                {selectedVehicle.uiiframe && (
                  <button
                    className={`sheet-icon-btn ${viewType === 'iframe' ? 'active' : ''}`}
                    onClick={() => setViewType('iframe')}
                  >
                    <span className="icon-btn-emoji">📺</span>
                    <span className="icon-btn-label">Feed</span>
                  </button>
                )}
                <button className="sheet-icon-btn" onClick={openGoogleMaps}>
                  <span className="icon-btn-emoji">↗️</span>
                  <span className="icon-btn-label">G.Maps</span>
                </button>
                <button
                  className="sheet-icon-btn danger"
                  onClick={() => {
                    setSelectedVehicle(null);
                    setVehicleInput('');
                    setViewType('map');
                    setMobileSheetExpanded(false);
                  }}
                >
                  <span className="icon-btn-emoji">◀</span>
                  <span className="icon-btn-label">Fleet</span>
                </button>
              </div>

              {/* Expanded telemetry details */}
              {mobileSheetExpanded && (
                <div className="sheet-expanded-content">
                  <div className="sheet-stats">
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Vehicle Name</span>
                      <span className="sheet-stat-value indigo">{selectedVehicle.name}</span>
                    </div>
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Telemetry Unit ID</span>
                      <span className="sheet-stat-value">{selectedVehicle.units}</span>
                    </div>
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Coordinates</span>
                      <span className="sheet-stat-value small">{selectedVehicle.latitude.toFixed(6)}, {selectedVehicle.longitude.toFixed(6)}</span>
                    </div>
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Velocity</span>
                      <span className="sheet-stat-value emerald">{selectedVehicle.speed} km/h</span>
                    </div>
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Timestamp</span>
                      <span className="sheet-stat-value small">{selectedVehicle.timestamp}</span>
                    </div>
                    <div className="sheet-stat-row">
                      <span className="sheet-stat-label">Current Status</span>
                      <span className={getStatusClass(selectedVehicle.speed)}>{getStatusText(selectedVehicle.speed)}</span>
                    </div>
                  </div>

                  {/* Playback section */}
                  <div className="sheet-playback-section">
                    <p className="sheet-playback-title">📅 Route Playback</p>
                    <div className="sheet-playback-row">
                      <input
                        type="date"
                        value={playbackDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={(e) => setPlaybackDate(e.target.value)}
                        className="sheet-date-input"
                      />
                      <button
                        onClick={fetchPlaybackHistory}
                        disabled={playbackLoading}
                        className="sheet-fetch-btn"
                      >
                        {playbackLoading ? '⏳' : '▶ Fetch'}
                      </button>
                    </div>
                    {playbackError && <div className="sheet-playback-error">⚠️ {playbackError}</div>}
                    {playbackPoints.length > 0 && !playbackError && (
                      <p className="sheet-playback-ok">✓ {playbackPoints.length} points loaded for {playbackDate}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      ) : (
        /* ============================================================
           DESKTOP LAYOUT (tablets ≥769px)
           ============================================================ */
        <div className="app-container">
          {/* Sidebar backdrop for tablet drawer */}
          {mobileSidebarOpen && (
            <div className="sidebar-backdrop visible" onClick={() => setMobileSidebarOpen(false)} />
          )}

          {/* Left Sidebar */}
          <aside className={`sidebar-panel ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
              <h3>Connected Fleet</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="live-indicator">
                  <span className="live-dot-pulse"></span>
                  LIVE
                </span>
                <button className="sidebar-close-btn" onClick={() => setMobileSidebarOpen(false)} aria-label="Close sidebar">✕</button>
              </div>
            </div>

            <div className="sidebar-search-box">
              <span className="search-box-icon">🔍</span>
              <input
                type="text"
                placeholder="Filter registry..."
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                className="sidebar-search-input"
              />
              {sidebarFilter && <button className="clear-filter-btn" onClick={() => setSidebarFilter('')}>×</button>}
            </div>

            <div className="sidebar-filters">
              <button className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
                All <span className="filter-count">{totalCount}</span>
              </button>
              <button className={`filter-tab moving ${statusFilter === 'moving' ? 'active' : ''}`} onClick={() => setStatusFilter('moving')}>
                Moving <span className="filter-count">{movingCount}</span>
              </button>
              <button className={`filter-tab idle ${statusFilter === 'idle' ? 'active' : ''}`} onClick={() => setStatusFilter('idle')}>
                Idle <span className="filter-count">{idleCount}</span>
              </button>
              <button className={`filter-tab stopped ${statusFilter === 'stopped' ? 'active' : ''}`} onClick={() => setStatusFilter('stopped')}>
                Stopped <span className="filter-count">{stoppedCount}</span>
              </button>
            </div>

            <div className="vehicle-list-wrapper">
              {listLoading && vehicles.length === 0 ? (
                <div className="sidebar-loading"><div className="mini-spinner"></div><p>Loading fleet registry...</p></div>
              ) : filteredVehicles.length === 0 ? (
                <div className="sidebar-empty"><p>No vehicles found</p></div>
              ) : (
                <div className="vehicle-scroll-list">
                  {filteredVehicles.map(vehicle => {
                    const isSelected = selectedVehicle && selectedVehicle.name === vehicle.name;
                    const status = getVehicleStatus(vehicle.speed);
                    return (
                      <div
                        key={vehicle.name}
                        className={`vehicle-list-item ${isSelected ? 'active' : ''} ${status}`}
                        onClick={() => handleSelectVehicle(vehicle)}
                      >
                        <div className="vehicle-item-header">
                          <span className="vehicle-item-name">{vehicle.name}</span>
                          <span className={`status-dot ${status}`}></span>
                        </div>
                        <div className="vehicle-item-details">
                          <span className="vehicle-item-speed">{vehicle.speed} km/h</span>
                          <span className="vehicle-item-time">
                            {vehicle.timestamp.includes(' ') ? vehicle.timestamp.split(' ')[1] : vehicle.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          {/* Right Main Content */}
          <main className="main-content-panel">
            <section className="hero-section">
              <h1 className="hero-title">GPS Vehicle Telemetry Tracker</h1>
              <p className="hero-subtitle">
                Monitor live locations, velocity statistics, and active streams of your transport fleet in real-time.
              </p>
            </section>

            <section className="search-container">
              <div style={{ width: '100%' }}>
                <form onSubmit={handleSearch} className="search-form">
                  <div className="search-input-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search vehicle number (e.g. AP39WH2173)..."
                      value={vehicleInput}
                      onChange={(e) => setVehicleInput(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <button type="submit" className="search-button" disabled={loading}>
                    {loading ? 'Querying...' : 'Get Location'}
                  </button>
                </form>
              </div>
            </section>

            {loading && (
              <section className="loading-container">
                <div className="spinner"></div>
                <p className="loading-text">Connecting to server and querying live GPS data...</p>
              </section>
            )}

            {error && !loading && (
              <section className="error-card">
                <div className="error-header"><span>⚠️</span> Telemetry Query Failed</div>
                <div className="error-body">{error}</div>
              </section>
            )}

            {!loading && (
              <section className="dashboard-grid">
                {selectedVehicle ? (
                  <div className="card">
                    <h2 className="card-title"><span>📊</span> Telemetry Logs</h2>
                    <div className="stats-list">
                      <div className="stat-item">
                        <span className="stat-label">Vehicle Name</span>
                        <span className="stat-value highlight-indigo">{selectedVehicle.name}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Telemetry Unit ID</span>
                        <span className="stat-value">{selectedVehicle.units}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Coordinates</span>
                        <span className="stat-value">{selectedVehicle.latitude.toFixed(6)}, {selectedVehicle.longitude.toFixed(6)}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Velocity</span>
                        <span className="stat-value highlight-emerald">{selectedVehicle.speed} km/h</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Telemetry Timestamp</span>
                        <span className="stat-value" style={{ fontSize: '0.85rem' }}>{selectedVehicle.timestamp}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Current Status</span>
                        <span className={getStatusClass(selectedVehicle.speed)}>{getStatusText(selectedVehicle.speed)}</span>
                      </div>
                    </div>

                    <div className="map-actions" style={{ marginTop: '0.5rem', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', width: '100%' }}>
                        <button className={`action-btn ${viewType === 'map' ? 'active' : ''}`} onClick={() => setViewType('map')}
                          style={{ flex: 1, justifyContent: 'center', backgroundColor: viewType === 'map' ? 'rgba(99, 102, 241, 0.15)' : '', borderColor: viewType === 'map' ? 'var(--accent-primary)' : '' }}>
                          🗺️ Map View
                        </button>
                        <button className={`action-btn ${viewType === 'live_trace' ? 'active' : ''}`} onClick={() => setViewType('live_trace')}
                          style={{ flex: 1.2, justifyContent: 'center', backgroundColor: viewType === 'live_trace' ? 'rgba(239, 68, 68, 0.15)' : '', borderColor: viewType === 'live_trace' ? 'var(--accent-danger)' : '', color: viewType === 'live_trace' ? '#fca5a5' : '' }}>
                          📡 Live Trace
                        </button>
                        {selectedVehicle.uiiframe && (
                          <button className={`action-btn ${viewType === 'iframe' ? 'active' : ''}`} onClick={() => setViewType('iframe')}
                            style={{ flex: 1, justifyContent: 'center', backgroundColor: viewType === 'iframe' ? 'rgba(99, 102, 241, 0.15)' : '', borderColor: viewType === 'iframe' ? 'var(--accent-primary)' : '' }}>
                            📺 Live Feed
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                        <button className="action-btn" onClick={openGoogleMaps} style={{ flex: 1, justifyContent: 'center' }}>↗️ Google Maps</button>
                        <button className="action-btn deselect-btn" onClick={() => { setSelectedVehicle(null); setVehicleInput(''); setViewType('map'); }}
                          style={{ flex: 1, justifyContent: 'center', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                          ❌ Fleet Overview
                        </button>
                      </div>

                      <div style={{ marginTop: '0.5rem', padding: '0.85rem', backgroundColor: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: '600', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📅 Route Playback</p>
                        <div style={{ display: 'flex', gap: '0.4rem', width: '100%', alignItems: 'center' }}>
                          <input type="date" value={playbackDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setPlaybackDate(e.target.value)}
                            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', padding: '0.4rem 0.6rem', fontSize: '0.8rem', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }} />
                          <button onClick={fetchPlaybackHistory} disabled={playbackLoading}
                            style={{ background: viewType === 'playback' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '8px', color: '#a5b4fc', padding: '0.4rem 0.7rem', fontSize: '0.75rem', fontWeight: '600', cursor: playbackLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                            {playbackLoading ? '⏳ Loading...' : '▶ Fetch'}
                          </button>
                        </div>
                        {playbackError && (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.65rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', fontSize: '0.72rem', color: '#fca5a5', lineHeight: '1.4' }}>
                            ⚠️ {playbackError}
                          </div>
                        )}
                        {playbackPoints.length > 0 && !playbackError && (
                          <p style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>
                            ✓ {playbackPoints.length} coordinate{playbackPoints.length !== 1 ? 's' : ''} loaded for {playbackDate}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card welcome-stats-card">
                    <h2 className="card-title"><span>📊</span> Fleet Summary</h2>
                    <div className="stats-list">
                      <div className="stat-item">
                        <span className="stat-label">Total Connected</span>
                        <span className="stat-value highlight-indigo">{totalCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Moving Vehicles</span>
                        <span className="stat-value highlight-emerald">{movingCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Idle Vehicles</span>
                        <span className="stat-value" style={{ color: 'var(--accent-primary)' }}>{idleCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Stopped / Offline</span>
                        <span className="stat-value" style={{ color: 'var(--accent-danger)' }}>{stoppedCount}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.2rem', color: 'var(--accent-primary)' }}>ℹ️</span>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Select a vehicle from the left panel or click a map marker to view live telemetry logs.
                      </p>
                    </div>
                  </div>
                )}

                {/* Map Panel */}
                <div className="card map-panel">
                  <h2 className="card-title" style={{ justifyContent: 'space-between' }}>
                    <span>📍</span> {selectedVehicle ? `Tracking ${selectedVehicle.name}` : 'Live Fleet Positions'}
                    {!selectedVehicle && <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>Fleet View</span>}
                    {selectedVehicle && viewType === 'live_trace' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: '600' }}>
                        <span className="live-dot-pulse" style={{ backgroundColor: 'var(--accent-danger)', width: '6px', height: '6px', boxShadow: '0 0 6px var(--accent-danger)' }}></span>
                        LIVE TRACING (1s)
                      </span>
                    )}
                    {selectedVehicle && viewType === 'playback' && playbackPoints.length > 0 && (
                      <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)', fontWeight: '600' }}>
                        ⏱ PLAYBACK — {playbackDate}
                      </span>
                    )}
                  </h2>

                  <div className="map-container-wrapper">
                    {viewType !== 'iframe' || !selectedVehicle ? (
                      renderMapContent()
                    ) : (
                      <iframe src={selectedVehicle.uiiframe} title={`Live tracking for ${selectedVehicle.name}`} className="iframe-container" />
                    )}
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      )}

      <footer>
        <p>&copy; {new Date().getFullYear()} PydahSoft GPS Transport Services. All rights reserved.</p>
      </footer>
    </>
  );
}

export default App;
