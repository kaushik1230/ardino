// Socket.IO connection
const socket = io();

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusDot = statusIndicator.querySelector('.status-dot');
const statusText = statusIndicator.querySelector('.status-text');
const currentCommandEl = document.getElementById('currentCommand');
const lastUpdateEl = document.getElementById('lastUpdate');
const arduinoIPEl = document.getElementById('arduinoIP');
const logMessages = document.getElementById('logMessages');
const toastContainer = document.getElementById('toastContainer');

// Command input elements
const customCommandInput = document.getElementById('customCommand');
const sendCustomCommandBtn = document.getElementById('sendCustomCommand');

// Code editor elements
const arduinoCodeEditor = document.getElementById('arduinoCode');
const uploadCodeBtn = document.getElementById('uploadCodeBtn');
const clearCodeBtn = document.getElementById('clearCodeBtn');
const loadExampleBtn = document.getElementById('loadExampleBtn');

// Network scanner elements
const scanNetworkBtn = document.getElementById('scanNetworkBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const discoveredDevicesEl = document.getElementById('discoveredDevices');

// Control buttons
const offBtn = document.getElementById('offBtn');
const onBtn = document.getElementById('onBtn');
const m1Btn = document.getElementById('m1Btn');
const m2Btn = document.getElementById('m2Btn');

// State management
let isConnected = false;
let currentCommand = 0;
let discoveredDevices = [];
let autoDetectedArduino = null;

// Example Arduino code templates
const exampleCodes = {
    basic: `/*
  Basic Arduino Motor Control Example
  This code demonstrates basic motor control functionality
*/

// Pin definitions
const int M1_STEP_PIN = 5;
const int M1_DIR_PIN = 6;
const int M2_STEP_PIN = 2;
const int M2_DIR_PIN = 3;

void setup() {
  Serial.begin(9600);
  
  // Setup motor pins
  pinMode(M1_STEP_PIN, OUTPUT);
  pinMode(M1_DIR_PIN, OUTPUT);
  pinMode(M2_STEP_PIN, OUTPUT);
  pinMode(M2_DIR_PIN, OUTPUT);
  
  Serial.println("Motor control system ready");
}

void loop() {
  // Your motor control logic here
  // This is where you'll add your custom functionality
}`,
    
    motorControl: `/*
  Advanced Motor Control with Speed Control
  Includes PWM speed control and direction control
*/

// Motor control pins
const int M1_STEP_PIN = 5;
const int M1_DIR_PIN = 6;
const int M1_ENABLE_PIN = 8;
const int M2_STEP_PIN = 2;
const int M2_DIR_PIN = 3;
const int M2_ENABLE_PIN = 9;

// Control variables
int motor1Speed = 100;
int motor2Speed = 100;
bool motor1Direction = true;
bool motor2Direction = true;

void setup() {
  Serial.begin(9600);
  
  // Setup all pins
  pinMode(M1_STEP_PIN, OUTPUT);
  pinMode(M1_DIR_PIN, OUTPUT);
  pinMode(M1_ENABLE_PIN, OUTPUT);
  pinMode(M2_STEP_PIN, OUTPUT);
  pinMode(M2_DIR_PIN, OUTPUT);
  pinMode(M2_ENABLE_PIN, OUTPUT);
  
  // Initialize motors
  digitalWrite(M1_ENABLE_PIN, HIGH); // Disable initially
  digitalWrite(M2_ENABLE_PIN, HIGH);
  
  Serial.println("Advanced motor control ready");
}

void loop() {
  // Example: Run motor 1 for 1000 steps
  runMotor1(1000, motor1Speed, motor1Direction);
  delay(1000);
  
  // Example: Run motor 2 for 1000 steps in opposite direction
  motor2Direction = !motor2Direction;
  runMotor2(1000, motor2Speed, motor2Direction);
  delay(1000);
}

void runMotor1(int steps, int speed, bool direction) {
  digitalWrite(M1_ENABLE_PIN, LOW); // Enable motor
  digitalWrite(M1_DIR_PIN, direction ? HIGH : LOW);
  
  for (int i = 0; i < steps; i++) {
    digitalWrite(M1_STEP_PIN, HIGH);
    delayMicroseconds(speed);
    digitalWrite(M1_STEP_PIN, LOW);
    delayMicroseconds(speed);
  }
  
  digitalWrite(M1_ENABLE_PIN, HIGH); // Disable motor
}

void runMotor2(int steps, int speed, bool direction) {
  digitalWrite(M2_ENABLE_PIN, LOW); // Enable motor
  digitalWrite(M2_DIR_PIN, direction ? HIGH : LOW);
  
  for (int i = 0; i < steps; i++) {
    digitalWrite(M2_STEP_PIN, HIGH);
    delayMicroseconds(speed);
    digitalWrite(M2_STEP_PIN, LOW);
    delayMicroseconds(speed);
  }
  
  digitalWrite(M2_ENABLE_PIN, HIGH); // Disable motor
}`,
    
    wifiServer: `/*
  Arduino WiFi Web Server for Motor Control
  This code creates a web server on your Arduino Uno R4 WiFi
*/

#include <WiFiS3.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Motor control pins
#define M1_STEP_PIN  5
#define M1_DIR_PIN   6
#define RELAY1_PIN   8

#define M2_STEP_PIN  2
#define M2_DIR_PIN   3
#define RELAY2_PIN   9

// Web server
WiFiServer server(80);

// State variables
bool armed = false;
bool running = false;
uint8_t currentM = 0;
int command = 0;

void setup() {
  Serial.begin(9600);
  delay(1500);

  // Setup motor pins
  pinMode(M1_STEP_PIN, OUTPUT);
  pinMode(M1_DIR_PIN, OUTPUT);
  pinMode(M2_STEP_PIN, OUTPUT);
  pinMode(M2_DIR_PIN, OUTPUT);
  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);

  // Default state
  digitalWrite(M1_STEP_PIN, LOW);
  digitalWrite(M2_STEP_PIN, LOW);
  digitalWrite(M1_DIR_PIN, HIGH);
  digitalWrite(M2_DIR_PIN, HIGH);
  digitalWrite(RELAY1_PIN, HIGH);
  digitalWrite(RELAY2_PIN, HIGH);

  // Connect to WiFi
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Start web server
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  WiFiClient client = server.available();
  
  if (client) {
    Serial.println("New client connected");
    String currentLine = "";
    
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        
        if (c == '\\n') {
          if (currentLine.length() == 0) {
            // Send HTTP response
            client.println("HTTP/1.1 200 OK");
            client.println("Content-Type: application/json");
            client.println("Access-Control-Allow-Origin: *");
            client.println("Connection: close");
            client.println();
            
            // Send JSON response
            StaticJsonDocument<200> doc;
            doc["status"] = "ok";
            doc["command"] = command;
            doc["armed"] = armed;
            doc["running"] = running;
            doc["currentMotor"] = currentM;
            
            String response;
            serializeJson(doc, response);
            client.println(response);
            break;
          } else {
            currentLine = "";
          }
        } else if (c != '\\r') {
          currentLine += c;
        }
        
        // Check for POST request with command
        if (currentLine.startsWith("POST /command")) {
          // Parse JSON command
          String jsonData = "";
          while (client.available()) {
            jsonData += (char)client.read();
          }
          
          // Parse command (simplified)
          if (jsonData.indexOf("\\"command\\"") != -1) {
            int cmdStart = jsonData.indexOf("\\"command\\"") + 11;
            int cmdEnd = jsonData.indexOf(",", cmdStart);
            if (cmdEnd == -1) cmdEnd = jsonData.indexOf("}", cmdStart);
            
            String cmdStr = jsonData.substring(cmdStart, cmdEnd);
            command = cmdStr.toInt();
            
            // Process command
            processCommand(command);
          }
        }
      }
    }
    
    client.stop();
    Serial.println("Client disconnected");
  }
  
  // Motor control logic
  if (running) {
    const int pulseCount = 50;
    const int highPulse = 2;
    const int lowPulse = 2;

    if (currentM == 1) {
      for (int i = 0; i < pulseCount; i++) {
        digitalWrite(M1_STEP_PIN, HIGH);
        delayMicroseconds(highPulse);
        digitalWrite(M1_STEP_PIN, LOW);
        delayMicroseconds(lowPulse);
      }
    } else if (currentM == 2) {
      for (int i = 0; i < pulseCount; i++) {
        digitalWrite(M2_STEP_PIN, HIGH);
        delayMicroseconds(highPulse);
        digitalWrite(M2_STEP_PIN, LOW);
        delayMicroseconds(lowPulse);
      }
    }
    delayMicroseconds(500);
  }
}

void processCommand(int cmd) {
  command = constrain(cmd, 0, 3);
  
  switch (command) {
    case 0: // OFF
      running = false;
      armed = false;
      digitalWrite(RELAY1_PIN, HIGH);
      digitalWrite(RELAY2_PIN, HIGH);
      Serial.println("Motors stopped and disarmed");
      break;
      
    case 1: // ON
      armed = true;
      running = false;
      Serial.println("Motors armed");
      break;
      
    case 2: // M1
      if (armed) {
        digitalWrite(RELAY1_PIN, LOW);
        delay(200);
        currentM = 1;
        running = true;
        Serial.println("Motor 1 running");
      } else {
        Serial.println("Motor not armed. Send command 1 first.");
      }
      break;
      
    case 3: // M2
      if (armed) {
        digitalWrite(RELAY2_PIN, LOW);
        delay(200);
        currentM = 2;
        running = true;
        Serial.println("Motor 2 running");
      } else {
        Serial.println("Motor not armed. Send command 1 first.");
      }
      break;
  }
}`
};

// Utility functions
function formatTime(date) {
    return new Date(date).toLocaleTimeString();
}

function addLogEntry(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = formatTime(new Date());
    
    const textSpan = document.createElement('span');
    textSpan.className = 'log-text';
    textSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(textSpan);
    
    logMessages.appendChild(logEntry);
    logMessages.scrollTop = logMessages.scrollHeight;
    
    // Keep only last 50 log entries
    while (logMessages.children.length > 50) {
        logMessages.removeChild(logMessages.firstChild);
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

function updateStatus(status, text) {
    statusDot.className = `status-dot ${status}`;
    statusText.textContent = text;
    isConnected = status === 'connected';
}

function updateCurrentCommand(command) {
    currentCommand = command;
    currentCommandEl.textContent = command;
}

function updateLastUpdate(timestamp) {
    if (timestamp) {
        lastUpdateEl.textContent = formatTime(new Date(timestamp));
    } else {
        lastUpdateEl.textContent = 'Never';
    }
}

function updateArduinoIP(ip) {
    arduinoIPEl.textContent = ip || 'Not Connected';
}

// Network scanning functions
function scanNetworkForArduino() {
    if (!socket.connected) {
        showToast('Not connected to server', 'error');
        return;
    }
    
    scanNetworkBtn.disabled = true;
    scanNetworkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
    
    socket.emit('scan-network');
    addLogEntry('Scanning network for Arduino devices...', 'info');
}

function displayDiscoveredDevices(devices, autoDetected) {
    discoveredDevices = devices;
    autoDetectedArduino = autoDetected;
    
    if (devices.length === 0) {
        discoveredDevicesEl.innerHTML = `
            <div class="no-devices">
                <i class="fas fa-search"></i>
                <p>No Arduino devices found</p>
                <p>Make sure your Arduino is connected to the same WiFi network</p>
            </div>
        `;
        return;
    }
    
    const deviceList = document.createElement('div');
    deviceList.className = 'device-list';
    
    devices.forEach(device => {
        const isAutoDetected = autoDetected && autoDetected.ip === device.ip;
        const deviceItem = document.createElement('div');
        deviceItem.className = `device-item ${isAutoDetected ? 'auto-detected' : ''}`;
        
        deviceItem.innerHTML = `
            <div class="device-header">
                <span class="device-ip">${device.ip}</span>
                <span class="device-badge ${isAutoDetected ? 'auto' : 'arduino'}">
                    ${isAutoDetected ? 'Auto' : 'Arduino'}
                </span>
            </div>
            <div class="device-details">
                <div>Endpoint: <span class="device-endpoint">${device.endpoint}</span></div>
                <div>Method: ${device.method}</div>
            </div>
        `;
        
        deviceItem.addEventListener('click', () => {
            // Select this device
            document.querySelectorAll('.device-item').forEach(item => {
                item.classList.remove('selected');
            });
            deviceItem.classList.add('selected');
            
            // Update auto-detected Arduino
            autoDetectedArduino = device;
            updateArduinoIP(device.ip);
            
            addLogEntry(`Selected Arduino: ${device.ip}`, 'info');
            showToast(`Selected Arduino: ${device.ip}`, 'success');
        });
        
        deviceList.appendChild(deviceItem);
    });
    
    discoveredDevicesEl.innerHTML = '';
    discoveredDevicesEl.appendChild(deviceList);
    
    // Update Arduino IP if auto-detected
    if (autoDetected) {
        updateArduinoIP(autoDetected.ip);
    }
}

// Send command function
function sendCommand(command, description) {
    if (!isConnected && !socket.connected) {
        showToast('Not connected to server', 'error');
        return;
    }
    
    socket.emit('send-command', {
        command: command,
        description: description
    });
    
    addLogEntry(`Sending command: ${command} - ${description}`, 'info');
}

// Test Arduino connection
function testArduinoConnection() {
    if (!socket.connected) {
        showToast('Not connected to server', 'error');
        return;
    }
    
    testConnectionBtn.disabled = true;
    testConnectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
    
    socket.emit('test-connection');
    addLogEntry('Testing Arduino connection...', 'info');
}

// Code editor functions
function uploadCodeToArduino() {
    const code = arduinoCodeEditor.value.trim();
    
    if (!code) {
        showToast('Please enter some code first', 'error');
        return;
    }
    
    if (!isConnected && !socket.connected) {
        showToast('Not connected to server', 'error');
        return;
    }
    
    // Show upload progress
    uploadCodeBtn.disabled = true;
    uploadCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
    // Send code to server for upload
    socket.emit('upload-code', {
        code: code,
        timestamp: new Date().toISOString()
    });
    
    addLogEntry('Uploading code to Arduino...', 'info');
}

function clearCodeEditor() {
    arduinoCodeEditor.value = '';
    showToast('Code editor cleared', 'success');
    addLogEntry('Code editor cleared', 'info');
}

function loadExampleCode() {
    // Create a simple dropdown or modal to select example
    const examples = Object.keys(exampleCodes);
    const selectedExample = prompt(
        `Select an example:\n${examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}\n\nEnter number (1-${examples.length}):`
    );
    
    const index = parseInt(selectedExample) - 1;
    if (index >= 0 && index < examples.length) {
        const exampleName = examples[index];
        arduinoCodeEditor.value = exampleCodes[exampleName];
        showToast(`Loaded ${exampleName} example`, 'success');
        addLogEntry(`Loaded ${exampleName} example code`, 'info');
    } else if (selectedExample !== null) {
        showToast('Invalid selection', 'error');
    }
}

// Socket.IO event handlers
socket.on('connect', () => {
    updateStatus('connected', 'Connected');
    addLogEntry('Connected to server', 'success');
    showToast('Connected to server', 'success');
});

socket.on('disconnect', () => {
    updateStatus('error', 'Disconnected');
    addLogEntry('Disconnected from server', 'error');
    showToast('Disconnected from server', 'error');
});

socket.on('state-update', (state) => {
    updateCurrentCommand(state.command);
    updateLastUpdate(state.lastUpdate);
    
    if (state.status === 'connected') {
        updateStatus('connected', 'Connected');
    } else if (state.status === 'error') {
        updateStatus('error', 'Error');
    } else if (state.status === 'sending') {
        updateStatus('error', 'Sending...');
    }
});

socket.on('devices-discovered', (devices) => {
    displayDiscoveredDevices(devices, autoDetectedArduino);
});

socket.on('command-result', (result) => {
    if (result.success) {
        addLogEntry(`Command ${result.command} sent successfully: ${result.description}`, 'success');
        showToast(`Command sent: ${result.description}`, 'success');
        
        if (result.arduinoResponse) {
            addLogEntry(`Arduino response: ${JSON.stringify(result.arduinoResponse)}`, 'info');
        }
        
        if (result.arduinoIP) {
            updateArduinoIP(result.arduinoIP);
        }
    } else {
        addLogEntry(`Failed to send command ${result.command}: ${result.error}`, 'error');
        showToast(`Command failed: ${result.error}`, 'error');
    }
});

socket.on('code-upload-result', (result) => {
    // Reset upload button
    uploadCodeBtn.disabled = false;
    uploadCodeBtn.innerHTML = '<i class="fas fa-upload"></i> Upload to Arduino';
    
    if (result.success) {
        addLogEntry('Code uploaded successfully to Arduino', 'success');
        showToast('Code uploaded successfully!', 'success');
    } else {
        addLogEntry(`Code upload failed: ${result.error}`, 'error');
        showToast(`Upload failed: ${result.error}`, 'error');
    }
});

socket.on('connection-test-result', (result) => {
    // Reset test button
    testConnectionBtn.disabled = false;
    testConnectionBtn.innerHTML = '<i class="fas fa-wifi"></i> Test Connection';
    
    if (result.success) {
        addLogEntry('Arduino connection test successful', 'success');
        showToast('Arduino connection successful!', 'success');
        updateStatus('connected', 'Connected to Arduino');
        
        if (result.arduinoIP) {
            updateArduinoIP(result.arduinoIP);
        }
    } else {
        addLogEntry(`Arduino connection test failed: ${result.error}`, 'error');
        showToast('Arduino connection failed', 'error');
        updateStatus('error', 'Arduino Error');
    }
});

socket.on('network-scan-result', (result) => {
    // Reset scan button
    scanNetworkBtn.disabled = false;
    scanNetworkBtn.innerHTML = '<i class="fas fa-search"></i> Scan Network';
    
    displayDiscoveredDevices(result.devices, result.autoDetected);
    
    if (result.devices.length > 0) {
        addLogEntry(`Found ${result.devices.length} Arduino device(s)`, 'success');
        showToast(`Found ${result.devices.length} Arduino device(s)`, 'success');
        
        if (result.autoDetected) {
            addLogEntry(`Auto-selected Arduino: ${result.autoDetected.ip}`, 'info');
        }
    } else {
        addLogEntry('No Arduino devices found on network', 'error');
        showToast('No Arduino devices found', 'error');
    }
});

// Event listeners for custom command input
sendCustomCommandBtn.addEventListener('click', () => {
    const command = parseInt(customCommandInput.value);
    
    if (isNaN(command) || command < 0 || command > 3) {
        showToast('Please enter a valid command (0-3)', 'error');
        return;
    }
    
    const descriptions = {
        0: 'OFF - Stop all motors',
        1: 'ON - Arm motors',
        2: 'M1 - Run Motor 1',
        3: 'M2 - Run Motor 2'
    };
    
    sendCommand(command, descriptions[command]);
    customCommandInput.value = '';
});

customCommandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendCustomCommandBtn.click();
    }
});

// Event listeners for code editor
uploadCodeBtn.addEventListener('click', uploadCodeToArduino);
clearCodeBtn.addEventListener('click', clearCodeEditor);
loadExampleBtn.addEventListener('click', loadExampleCode);

// Event listeners for network scanning
scanNetworkBtn.addEventListener('click', scanNetworkForArduino);
testConnectionBtn.addEventListener('click', testArduinoConnection);

// Event listeners for control buttons
offBtn.addEventListener('click', () => {
    sendCommand(0, 'OFF - Stop all motors');
});

onBtn.addEventListener('click', () => {
    sendCommand(1, 'ON - Arm motors');
});

m1Btn.addEventListener('click', () => {
    sendCommand(2, 'M1 - Run Motor 1');
});

m2Btn.addEventListener('click', () => {
    sendCommand(3, 'M2 - Run Motor 2');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Only trigger shortcuts if not typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch (e.key) {
        case '0':
            offBtn.click();
            break;
        case '1':
            onBtn.click();
            break;
        case '2':
            m1Btn.click();
            break;
        case '3':
            m2Btn.click();
            break;
        case 'Escape':
            offBtn.click();
            break;
    }
});

// Add visual feedback for button presses
const controlButtons = [offBtn, onBtn, m1Btn, m2Btn];
controlButtons.forEach(btn => {
    btn.addEventListener('mousedown', () => {
        btn.style.transform = 'scale(0.95)';
    });
    
    btn.addEventListener('mouseup', () => {
        btn.style.transform = '';
    });
    
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
    });
});

// Initialize connection status
if (socket.connected) {
    updateStatus('connected', 'Connected');
} else {
    updateStatus('error', 'Connecting...');
}

// Add initial log entry
addLogEntry('Arduino Motor Control Interface loaded', 'info'); 