const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global cache and history trackers
let cachedVehiclesList = [];
const vehicleHistory = {}; // Key: vehicle name, Value: { points: [[lat, lng]], wasStopped: boolean }

// Helper function to normalize vehicle numbers for fuzzy matching (removes hyphens, spaces, casing)
function normalizeVehicleNumber(str) {
  if (!str) return '';
  return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// Fetch all vehicles from remote GPS registry
async function fetchVehiclesListFromRemote() {
  const token = process.env.GPS_TOKEN;
  const username = process.env.GPS_USERNAME;
  const password = process.env.GPS_PASSWORD;

  if (!token || !username || !password || token === 'your_token_here' || username === 'your_username_here' || token === 'YOUR_TOKEN_ID' || username === 'YOUR_USERNAME') {
    throw new Error('Backend API is not fully configured. Please configure valid GPS_TOKEN, GPS_USERNAME, and GPS_PASSWORD in backend/.env');
  }

  const url = `https://pfmsledger.in/tggapi/vehicleslist_api.php?token=${token}`;
  
  // The API requires POST parameters Username and Password
  const params = new URLSearchParams();
  params.append('Username', username);
  params.append('Password', password);
  params.append('items', 'all');

  const apiResponse = await axios.post(url, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 12000 // 12s timeout
  });

  const rawData = apiResponse.data;

  // Handle "Invalid Token" response returned from the remote GPS server
  if (typeof rawData === 'string' && rawData.trim() === 'Invalid Token') {
    const err = new Error('Authentication failed: Invalid Token provided.');
    err.statusCode = 401;
    throw err;
  }

  let vehiclesList = [];
  
  if (typeof rawData === 'string') {
    let cleaned = rawData.trim();
    if (cleaned.startsWith('Ex:')) {
      cleaned = cleaned.substring(3).trim();
    }
    
    try {
      vehiclesList = JSON.parse(cleaned);
    } catch (e) {
      const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        vehiclesList = JSON.parse(arrayMatch[0]);
      } else {
        throw new Error('Failed to parse GPS API response format');
      }
    }
  } else if (Array.isArray(rawData)) {
    vehiclesList = rawData;
  } else if (rawData && typeof rawData === 'object') {
    const possibleArray = Object.values(rawData).find(val => Array.isArray(val));
    if (possibleArray) {
      vehiclesList = possibleArray;
    } else {
      vehiclesList = [rawData];
    }
  }

  if (!Array.isArray(vehiclesList)) {
    vehiclesList = Object.values(vehiclesList);
  }

  // Prevent cache poisoning if the API returned an error object wrapped in an array or a bot-protection block
  const deniedItem = Array.isArray(vehiclesList) && vehiclesList.find(v => v && v.message && (v.message.includes('Access denied') || v.message.includes('Imunify360')));
  if (deniedItem) {
    const err = new Error(`Remote API blocked IP: ${deniedItem.message}`);
    err.statusCode = 403;
    throw err;
  }

  if (vehiclesList.length === 1 && vehiclesList[0] && vehiclesList[0].Error) {
    const err = new Error(`Remote API returned error: ${vehiclesList[0].Error}`);
    err.statusCode = 400;
    throw err;
  }

  // Clean up uiiframe URL formatting and rewrite to local proxy to fix 404 assets
  return vehiclesList.map(vehicle => {
    if (vehicle.uiiframe && typeof vehicle.uiiframe === 'string') {
      const cleanedUrl = vehicle.uiiframe.replace('https:////', 'https://').replace('https:///', 'https://');
      try {
        const urlObj = new URL(cleanedUrl);
        const tokenVal = urlObj.searchParams.get('token');
        const vehicleVal = urlObj.searchParams.get('vehicle');
        if (tokenVal && vehicleVal) {
          vehicle.uiiframe = `/api/proxy-livefeed?token=${tokenVal}&vehicle=${vehicleVal}`;
        } else {
          vehicle.uiiframe = cleanedUrl;
        }
      } catch (e) {
        vehicle.uiiframe = cleanedUrl;
      }
    }
    return vehicle;
  });
}

// Cache updating logic
async function updateCache(throwOnError = false) {
  try {
    const fetched = await fetchVehiclesListFromRemote();
    
    // Process coordinates and update trip history log
    fetched.forEach(vehicle => {
      const name = vehicle.name;
      const lat = vehicle.latitude;
      const lng = vehicle.longitude;
      const speed = vehicle.speed;

      if (!vehicleHistory[name]) {
        vehicleHistory[name] = { points: [[lat, lng]], wasStopped: speed === 0 };
      } else {
        const history = vehicleHistory[name];
        const points = history.points;
        const lastPoint = points[points.length - 1];

        if (speed === 0) {
          history.wasStopped = true;
        } else {
          // If vehicle transitions from stopped to moving, clear old trail to begin a new trip
          if (history.wasStopped) {
            history.points = [[lat, lng]];
            history.wasStopped = false;
          } else {
            // Append if coordinate changes
            if (lastPoint[0] !== lat || lastPoint[1] !== lng) {
              points.push([lat, lng]);
              if (points.length > 500) {
                points.shift();
              }
            }
          }
        }
      }
      vehicle.history = vehicleHistory[name].points;
    });

    cachedVehiclesList = fetched;
    console.log(`[Cache] Successfully updated. Count: ${cachedVehiclesList.length} vehicles.`);
  } catch (err) {
    console.error('[Cache Error] Background update failed:', err.message);
    if (throwOnError) {
      throw err;
    }
  }
}

// Endpoint to list all connected vehicles (loads from memory)
app.get('/api/vehicles', async (req, res) => {
  try {
    if (cachedVehiclesList.length === 0) {
      await updateCache(true);
    }
    return res.json({ success: true, count: cachedVehiclesList.length, data: cachedVehiclesList });
  } catch (error) {
    console.error('API Vehicles Error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: `Failed to fetch vehicles list: ${error.message}`
    });
  }
});

// Endpoint to query specific vehicle location (loads from memory)
app.get('/api/vehicle/:vehicleNumber', async (req, res) => {
  const { vehicleNumber } = req.params;

  if (!vehicleNumber) {
    return res.status(400).json({ success: false, error: 'Vehicle number is required' });
  }

  try {
    if (cachedVehiclesList.length === 0) {
      await updateCache(true);
    }
    
    const normalizedInput = normalizeVehicleNumber(vehicleNumber);

    // Search for matching vehicle in cache
    const matchedVehicle = cachedVehiclesList.find(vehicle => {
      return normalizeVehicleNumber(vehicle.name) === normalizedInput;
    });

    if (!matchedVehicle) {
      return res.status(404).json({
        success: false,
        error: `Vehicle '${vehicleNumber}' was not found in the live GPS registry. Verify the registration name.`
      });
    }

    return res.json({ success: true, mode: 'live', data: matchedVehicle });

  } catch (error) {
    console.error('API Vehicle Query Error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: `Failed to fetch vehicle details: ${error.message}`
    });
  }
});

// Endpoint to query vehicle playback logs for a specific date
app.get('/api/vehicle/:vehicleNumber/playback', async (req, res) => {
  const { vehicleNumber } = req.params;
  const { date } = req.query; // Expects YYYY-MM-DD

  if (!vehicleNumber) {
    return res.status(400).json({ success: false, error: 'Vehicle number is required' });
  }

  if (!date) {
    return res.status(400).json({ success: false, error: 'Playback date is required (YYYY-MM-DD)' });
  }

  try {
    if (cachedVehiclesList.length === 0) {
      await updateCache(true);
    }

    const normalizedInput = normalizeVehicleNumber(vehicleNumber);

    // Find the exact vehicle name to query remote API
    const matchedVehicle = cachedVehiclesList.find(vehicle => {
      return normalizeVehicleNumber(vehicle.name) === normalizedInput;
    });

    if (!matchedVehicle) {
      return res.status(404).json({
        success: false,
        error: `Vehicle '${vehicleNumber}' was not found in the live GPS registry.`
      });
    }

    const token = process.env.GPS_TOKEN;
    const username = process.env.GPS_USERNAME;
    const password = process.env.GPS_PASSWORD;
    const template = process.env.GPS_REPORT_TEMPLATE || 'history';

    const url = `https://pfmsledger.in/tggapi/reports_api.php?token=${token}`;

    const dateFrom = `${date} 00:00:00`;
    const dateTo = `${date} 23:59:59`;

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    params.append('vehicle_name', matchedVehicle.name);
    params.append('date_from', dateFrom);
    params.append('date_to', dateTo);
    params.append('template', template);

    console.log(`[Playback] Fetching history for ${matchedVehicle.name} on date ${date} using template "${template}"`);

    const apiResponse = await axios.post(url, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000 // 15s timeout
    });

    const rawReport = apiResponse.data;

    // Check if the response contains standard errors
    if (rawReport && rawReport.Error) {
      if (rawReport.Error === 'Invalid Template Name') {
        return res.status(400).json({
          success: false,
          templateError: true,
          error: `Report template "${template}" is not configured on this account. Go to your TGG web portal, check your report templates, and set the correct name in your backend/.env under GPS_REPORT_TEMPLATE.`
        });
      }
      return res.status(400).json({ success: false, error: rawReport.Error });
    }

    // Try to find the list of records in response
    let list = [];
    if (Array.isArray(rawReport)) {
      list = rawReport;
    } else if (rawReport && typeof rawReport === 'object') {
      const possibleArray = Object.values(rawReport).find(val => Array.isArray(val));
      if (possibleArray) {
        list = possibleArray;
      } else {
        list = [rawReport];
      }
    }

    // Dynamically parse columns (latitude, longitude, speed, timestamp)
    const points = list.map(item => {
      const latKey = ['latitude', 'lat', 'y', 'LAT', 'LATITUDE'].find(k => item[k] !== undefined);
      const lngKey = ['longitude', 'lng', 'x', 'LNG', 'LONGITUDE'].find(k => item[k] !== undefined);
      const speedKey = ['speed', 's', 'SPEED', 'speed_kmh'].find(k => item[k] !== undefined);
      const timeKey = ['timestamp', 'time', 't', 'datetime', 'date', 'date_time'].find(k => item[k] !== undefined);

      if (latKey === undefined || lngKey === undefined) return null;

      const latitude = parseFloat(item[latKey]);
      const longitude = parseFloat(item[lngKey]);

      if (isNaN(latitude) || isNaN(longitude)) return null;

      return {
        latitude,
        longitude,
        speed: speedKey !== undefined ? parseFloat(item[speedKey]) || 0 : 0,
        timestamp: timeKey !== undefined ? String(item[timeKey]) : new Date().toISOString()
      };
    }).filter(p => p !== null);

    return res.json({
      success: true,
      templateUsed: template,
      count: points.length,
      data: points
    });

  } catch (error) {
    console.error('API Vehicle Playback Query Error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: `Failed to query historical route logs: ${error.message}`
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Proxy live vehicle feed and inject working libraries to fix 404 console errors
app.get('/api/proxy-livefeed', async (req, res) => {
  const { token, vehicle } = req.query;

  if (!token || !vehicle) {
    return res.status(400).send('Missing token or vehicle parameter');
  }

  try {
    const url = `https://pfmsledger.in/tggapi/livevehicle.php?token=${token}&vehicle=${vehicle}`;
    const response = await axios.get(url, {
      timeout: 10000
    });

    let html = response.data;

    // Convert relative asset paths to absolute paths pointing to pfmsledger.in
    // and replace the broken assets with working CDNs or remove them to avoid 404 console errors.
    html = html
      // Replace source and href directories
      .replace(/src="assets\//g, 'src="https://pfmsledger.in/tggapi/assets/')
      .replace(/href="assets\//g, 'href="https://pfmsledger.in/tggapi/assets/')
      
      // Fix broken jquery script
      .replace(/<script src="https:\/\/pfmsledger\.in\/tggapi\/assets\/js\/jquery\.js"><\/script>/g, '<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>')
      
      // Fix broken bootstrap script
      .replace(/<script src="https:\/\/pfmsledger\.in\/tggapi\/assets\/js\/bootstrap\.min\.js"><\/script>/g, '<script src="https://cdn.jsdelivr.net/npm/bootstrap@3.4.1/dist/js/bootstrap.min.js"></script>')
      
      // Remove missing leaflet.label.css
      .replace(/<link rel="stylesheet" href="https:\/\/pfmsledger\.in\/tggapi\/assets\/leaflet\.label\.css" \/>/g, '<!-- removed leaflet.label.css -->')
      .replace(/<link rel="stylesheet" href="https:\/\/pfmsledger\.in\/tggapi\/assets\/leaflet\.label\.css"\/>/g, '<!-- removed leaflet.label.css -->')
      
      // Remove missing scrollReveal.js and custom.js scripts
      .replace(/<script src="https:\/\/pfmsledger\.in\/tggapi\/assets\/js\/scrollReveal\.js"><\/script>/g, '<!-- removed scrollReveal.js -->')
      .replace(/<script src="https:\/\/pfmsledger\.in\/tggapi\/assets\/js\/custom\.js"><\/script>/g, '<!-- removed custom.js -->');

    res.setHeader('Content-Type', 'text/html');
    return res.send(html);
  } catch (error) {
    console.error('Proxy livefeed error:', error.message);
    return res.status(500).send(`Failed to load live tracking view: ${error.message}`);
  }
});

// Start Cache Poller Loop
async function initCachePoller() {
  try {
    console.log('[Cache] Initializing vehicles cache...');
    await updateCache(false);
  } catch (e) {
    console.warn('[Cache Warning] Initial vehicle load failed on startup. Will retry on request or next poller cycle.');
  }
  
  // Update cache every 15 seconds to avoid triggering bot protection / rate limits (default 15000ms)
  const POLL_INTERVAL = parseInt(process.env.GPS_POLL_INTERVAL_MS, 10) || 15000;
  console.log(`[Cache] Background poller scheduled every ${POLL_INTERVAL / 1000}s.`);
  setInterval(() => updateCache(false), POLL_INTERVAL);
}

app.listen(PORT, async () => {
  console.log(`GPS Tracker Backend running on port ${PORT}`);
  await initCachePoller();
});
