const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const axios = require('axios');
const dgram = require('dgram');
const os = require('os');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Arduino WiFi configuration
const ARDUINO_IP = process.env.ARDUINO_IP || '192.168.1.100';
const ARDUINO_PORT = process.env.ARDUINO_PORT || 80;
const ARDUINO_ENDPOINT = process.env.ARDUINO_ENDPOINT || '/command';

// Arduino CLI configuration (for code uploads)
const ARDUINO_CLI_PATH = process.env.ARDUINO_CLI_PATH || 'arduino-cli';
const ARDUINO_BOARD = process.env.ARDUINO_BOARD || 'arduino:renesas_uno:unor4wifi';
const ARDUINO_UPLOAD_PORT = process.env.ARDUINO_UPLOAD_PORT || '';

// Store current state
let currentState = {
  command: 0,
  status: 'disconnected',
  lastUpdate: null
};

// Store discovered devices
let discoveredDevices = [];
let autoDetectedArduino = null;

// Network utilities
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return '192.168.1.1'; // fallback
}

function getNetworkRange(ip) {
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

// Scan network for Arduino devices
async function scanNetworkForArduino() {
  const localIP = getLocalIPAddress();
  const networkRange = getNetworkRange(localIP);
  const discovered = [];
  
  console.log(`🔍 Scanning network ${networkRange}.0/24 for Arduino devices...`);
  
  // Scan common Arduino ports and endpoints
  const scanPromises = [];
  
  for (let i = 1; i <= 254; i++) {
    const testIP = `${networkRange}.${i}`;
    
    // Test multiple endpoints that Arduino might respond to
    const endpoints = [
      { path: '/status', method: 'GET' },
      { path: '/', method: 'GET' },
      { path: '/command', method: 'GET' },
      { path: '/arduino', method: 'GET' }
    ];
    
    endpoints.forEach(endpoint => {
      scanPromises.push(
        testArduinoEndpoint(testIP, endpoint.path, endpoint.method)
          .then(result => {
            if (result.success) {
              return {
                ip: testIP,
                endpoint: endpoint.path,
                method: endpoint.method,
                response: result.data,
                type: 'arduino'
              };
            }
            return null;
          })
          .catch(() => null)
      );
    });
  }
  
  // Wait for all scans to complete (with timeout)
  const results = await Promise.allSettled(
    scanPromises.map(promise => 
      Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(null), 1000)) // 1 second timeout per request
      ])
    )
  );
  
  // Filter out successful discoveries
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      discovered.push(result.value);
    }
  });
  
  // Remove duplicates (same IP)
  const uniqueDevices = discovered.filter((device, index, self) => 
    index === self.findIndex(d => d.ip === device.ip)
  );
  
  discoveredDevices = uniqueDevices;
  
  if (uniqueDevices.length > 0) {
    console.log(`✅ Found ${uniqueDevices.length} potential Arduino device(s):`);
    uniqueDevices.forEach(device => {
      console.log(`   - ${device.ip} (${device.endpoint})`);
    });
    
    // Auto-select the first Arduino found
    autoDetectedArduino = uniqueDevices[0];
    console.log(`🎯 Auto-selected Arduino: ${autoDetectedArduino.ip}`);
    console.log(`🔗 Arduino connection URL: http://${autoDetectedArduino.ip}:${ARDUINO_PORT}${ARDUINO_ENDPOINT}`);
    
    return uniqueDevices;
  } else {
    console.log('❌ No Arduino devices found on network');
    return [];
  }
}

// Test if an IP address responds to Arduino endpoints
async function testArduinoEndpoint(ip, endpoint, method = 'GET') {
  try {
    const url = `http://${ip}:${ARDUINO_PORT}${endpoint}`;
    const response = await axios({
      method: method,
      url: url,
      timeout: 2000, // 2 second timeout
      headers: {
        'User-Agent': 'Arduino-Detector/1.0'
      }
    });
    
    // Check if response looks like Arduino
    const isArduino = checkIfArduinoResponse(response.data, response.headers);
    
    if (isArduino) {
      return { success: true, data: response.data };
    }
    
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Check if response looks like it came from Arduino
function checkIfArduinoResponse(data, headers) {
  if (!data) return false;
  
  const responseStr = JSON.stringify(data).toLowerCase();
  const contentType = headers['content-type'] || '';
  
  // Check for Arduino indicators
  const arduinoIndicators = [
    'arduino',
    'motor',
    'command',
    'status',
    'armed',
    'running',
    'currentmotor'
  ];
  
  // Check if response contains Arduino-related keywords
  const hasArduinoKeywords = arduinoIndicators.some(indicator => 
    responseStr.includes(indicator)
  );
  
  // Check if it's JSON response (Arduino web servers typically return JSON)
  const isJson = contentType.includes('application/json') || 
                 (typeof data === 'object' && data !== null);
  
  return hasArduinoKeywords || isJson;
}

// Direct WiFi communication to Arduino
async function sendCommandToArduino(command) {
  // Use auto-detected Arduino if available, otherwise fall back to configured IP
  const targetIP = autoDetectedArduino ? autoDetectedArduino.ip : ARDUINO_IP;
  
  try {
    const url = `http://${targetIP}:${ARDUINO_PORT}${ARDUINO_ENDPOINT}`;
    
    console.log(`📡 Sending command ${command} to Arduino at ${url}`);
    console.log(`🎯 Target Arduino IP: ${targetIP}`);
    
    const response = await axios.post(url, {
      command: command,
      timestamp: new Date().toISOString()
    }, {
      timeout: 5000, // 5 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Command ${command} sent successfully to Arduino at ${targetIP}`);
    console.log('📨 Arduino response:', response.data);
    
    return { 
      success: true, 
      data: response.data,
      arduinoResponse: response.data,
      arduinoIP: targetIP
    };
  } catch (error) {
    console.error('Error sending command to Arduino:', error.message);
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return { 
        success: false, 
        error: `Cannot connect to Arduino at ${targetIP}:${ARDUINO_PORT}. Check if Arduino is running and IP is correct.`,
        details: error.message
      };
    }
    
    return { 
      success: false, 
      error: error.message,
      details: error.response?.data || 'No response from Arduino'
    };
  }
}

// Test Arduino connection
async function testArduinoConnection() {
  // Use auto-detected Arduino if available, otherwise fall back to configured IP
  const targetIP = autoDetectedArduino ? autoDetectedArduino.ip : ARDUINO_IP;
  
  try {
    const url = `http://${targetIP}:${ARDUINO_PORT}/status`;
    console.log(`🔍 Testing connection to Arduino at ${targetIP}...`);
    const response = await axios.get(url, { timeout: 3000 });
    console.log(`✅ Arduino connection test successful at ${targetIP}:`, response.data);
    return { success: true, data: response.data, arduinoIP: targetIP };
  } catch (error) {
    console.log(`❌ Arduino connection test failed at ${targetIP}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Arduino code upload functions
async function uploadCodeToArduino(code) {
  try {
    // Create temporary directory for the sketch
    const tempDir = path.join(__dirname, 'temp_sketch');
    const sketchDir = path.join(tempDir, 'arduino_sketch');
    
    // Clean up any existing temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Directory doesn't exist, that's fine
    }
    
    // Create directories
    await fs.mkdir(sketchDir, { recursive: true });
    
    // Create the main sketch file
    const sketchFile = path.join(sketchDir, 'arduino_sketch.ino');
    await fs.writeFile(sketchFile, code);
    
    console.log('Code saved to temporary file:', sketchFile);
    
    // Check if Arduino CLI is available
    try {
      await execAsync(`${ARDUINO_CLI_PATH} version`);
    } catch (error) {
      console.log('Arduino CLI not found, using simulation mode for code upload');
      return { success: true, simulated: true, message: 'Arduino CLI not installed - code saved to file' };
    }
    
    // Compile the sketch
    console.log('Compiling sketch...');
    const compileResult = await execAsync(
      `${ARDUINO_CLI_PATH} compile --fqbn ${ARDUINO_BOARD} ${sketchDir}`,
      { timeout: 60000 } // 60 second timeout
    );
    
    console.log('Compilation successful');
    
    // Upload the sketch if port is specified
    if (ARDUINO_UPLOAD_PORT) {
      console.log(`Uploading to port ${ARDUINO_UPLOAD_PORT}...`);
      const uploadResult = await execAsync(
        `${ARDUINO_CLI_PATH} upload --fqbn ${ARDUINO_BOARD} --port ${ARDUINO_UPLOAD_PORT} ${sketchDir}`,
        { timeout: 120000 } // 2 minute timeout for upload
      );
      
      console.log('Upload successful');
      
      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });
      
      return { 
        success: true, 
        message: 'Code compiled and uploaded successfully',
        compilation: compileResult.stdout,
        upload: uploadResult.stdout
      };
    } else {
      console.log('No upload port specified, compilation only');
      
      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });
      
      return { 
        success: true, 
        message: 'Code compiled successfully (no upload - port not specified)',
        compilation: compileResult.stdout
      };
    }
    
  } catch (error) {
    console.error('Error uploading code:', error);
    
    // Clean up on error
    try {
      const tempDir = path.join(__dirname, 'temp_sketch');
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Error cleaning up:', cleanupError);
    }
    
    return { 
      success: false, 
      error: error.message,
      stderr: error.stderr || ''
    };
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Log current Arduino connection status
  if (autoDetectedArduino) {
    console.log(`🎯 Current Arduino IP: ${autoDetectedArduino.ip}`);
  } else {
    console.log(`🔧 Using configured Arduino IP: ${ARDUINO_IP}`);
  }
  
  // Send current state to new client
  socket.emit('state-update', currentState);
  
  // Send discovered devices to new client
  socket.emit('devices-discovered', discoveredDevices);
  
  // Handle command from client
  socket.on('send-command', async (data) => {
    const { command, description } = data;
    
    console.log(`Received command: ${command} - ${description}`);
    
    // Update state
    currentState.command = command;
    currentState.status = 'sending';
    currentState.lastUpdate = new Date().toISOString();
    
    // Broadcast state update
    io.emit('state-update', currentState);
    
    // Send command to Arduino
    const result = await sendCommandToArduino(command);
    
    // Update state based on result
    currentState.status = result.success ? 'connected' : 'error';
    currentState.lastUpdate = new Date().toISOString();
    
    // Broadcast final state
    io.emit('state-update', currentState);
    
    // Send result back to client
    socket.emit('command-result', {
      success: result.success,
      command: command,
      description: description,
      error: result.error,
      arduinoResponse: result.arduinoResponse,
      arduinoIP: result.arduinoIP
    });
  });
  
  // Handle code upload from client
  socket.on('upload-code', async (data) => {
    const { code, timestamp } = data;
    
    console.log('Received code upload request');
    
    // Upload code to Arduino
    const result = await uploadCodeToArduino(code);
    
    // Send result back to client
    socket.emit('code-upload-result', {
      success: result.success,
      message: result.message,
      error: result.error,
      timestamp: timestamp
    });
  });
  
  // Handle Arduino connection test
  socket.on('test-connection', async () => {
    console.log('Testing Arduino connection...');
    const result = await testArduinoConnection();
    socket.emit('connection-test-result', result);
  });
  
  // Handle network scan request
  socket.on('scan-network', async () => {
    console.log('Starting network scan...');
    const devices = await scanNetworkForArduino();
    socket.emit('network-scan-result', {
      devices: devices,
      autoDetected: autoDetectedArduino
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoints
app.get('/api/status', (req, res) => {
  res.json(currentState);
});

app.get('/api/devices', (req, res) => {
  res.json({
    discovered: discoveredDevices,
    autoDetected: autoDetectedArduino
  });
});

app.post('/api/scan', async (req, res) => {
  const devices = await scanNetworkForArduino();
  res.json({
    devices: devices,
    autoDetected: autoDetectedArduino
  });
});

app.post('/api/command', async (req, res) => {
  const { command } = req.body;
  
  if (command === undefined || command < 0 || command > 3) {
    return res.status(400).json({ error: 'Invalid command. Must be 0-3.' });
  }
  
  const result = await sendCommandToArduino(command);
  res.json(result);
});

app.post('/api/upload-code', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: 'No code provided.' });
  }
  
  const result = await uploadCodeToArduino(code);
  res.json(result);
});

app.get('/api/test-connection', async (req, res) => {
  const result = await testArduinoConnection();
  res.json(result);
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Web interface available at http://localhost:${PORT}`);
  console.log(`🔧 API available at http://localhost:${PORT}/api`);
  console.log(`🤖 Arduino target: http://${ARDUINO_IP}:${ARDUINO_PORT}${ARDUINO_ENDPOINT}`);
  
  // Auto-scan for Arduino devices on startup
  console.log('🔍 Auto-scanning for Arduino devices...');
  scanNetworkForArduino().then(devices => {
    if (devices.length > 0) {
      console.log('✅ Arduino auto-detection successful');
      console.log(`🎯 Connected to Arduino at: ${autoDetectedArduino.ip}`);
      currentState.status = 'connected';
    } else {
      console.log('❌ No Arduino devices found, using configured IP');
      console.log(`🔧 Fallback IP: ${ARDUINO_IP}`);
      currentState.status = 'error';
    }
  });
  
  if (!ARDUINO_UPLOAD_PORT) {
    console.log('⚠️  Arduino upload port not specified. Code compilation only (no upload).');
    console.log('   Set ARDUINO_UPLOAD_PORT in .env file to enable code uploads');
  }
}); 