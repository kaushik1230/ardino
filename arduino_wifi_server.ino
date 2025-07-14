#include <WiFiS3.h>
#include <ArduinoJson.h>

// WiFi credentials - UPDATE THESE WITH YOUR NETWORK INFO
const char* ssid = "YOUR_WIFI_SSID";        // Replace with your WiFi name
const char* password = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password

// ─── PIN ASSIGNMENTS ────────────────────────────────────────────────────
// Motor 1 (driver 1)
#define M1_STEP_PIN  5   // PUL+
#define M1_DIR_PIN   6   // DIR+
#define RELAY1_PIN   8   // Relay1 IN (LOW = VMOT+ on Driver1)

// Motor 2 (driver 2)
#define M2_STEP_PIN  2   // PUL+
#define M2_DIR_PIN   3   // DIR+
#define RELAY2_PIN   9   // Relay2 IN (LOW = VMOT+ on Driver2)

// Relay polarity for your 5 V modules:
const int RELAY_ACTIVE   = LOW;
const int RELAY_INACTIVE = HIGH;

// Server configuration
WiFiServer server(80);
String header;

// Motor state
bool motor1Running = false;
bool motor2Running = false;
bool motorsArmed = false;

// Stepper motor control variables
unsigned long lastStep1 = 0;
unsigned long lastStep2 = 0;
const unsigned long stepDelay = 1000; // microseconds between steps

// JSON document for responses
StaticJsonDocument<200> doc;

void setup() {
  Serial.begin(9600);
  
  // Initialize motor control pins
  pinMode(M1_STEP_PIN, OUTPUT);
  pinMode(M1_DIR_PIN, OUTPUT);
  pinMode(RELAY1_PIN, OUTPUT);
  
  pinMode(M2_STEP_PIN, OUTPUT);
  pinMode(M2_DIR_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  
  // Start with motors off (relays inactive)
  digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
  digitalWrite(RELAY2_PIN, RELAY_INACTIVE);
  digitalWrite(M1_STEP_PIN, LOW);
  digitalWrite(M2_STEP_PIN, LOW);
  
  Serial.println("Arduino Uno R4 WiFi Motor Controller");
  Serial.println("====================================");
  
  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());
  
  // Start web server
  server.begin();
  Serial.println("Web server started on port 80");
  Serial.println("Available endpoints:");
  Serial.println("  GET  /status  - Get current motor status");
  Serial.println("  POST /command - Send motor commands (0-3)");
  Serial.println("  GET  /        - Basic info page");
}

void loop() {
  // Handle stepper motor stepping
  unsigned long currentMicros = micros();
  
  if (motor1Running && (currentMicros - lastStep1 >= stepDelay)) {
    digitalWrite(M1_STEP_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(M1_STEP_PIN, LOW);
    lastStep1 = currentMicros;
  }
  
  if (motor2Running && (currentMicros - lastStep2 >= stepDelay)) {
    digitalWrite(M2_STEP_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(M2_STEP_PIN, LOW);
    lastStep2 = currentMicros;
  }
  
  WiFiClient client = server.available();
  
  if (client) {
    Serial.println("New client connected");
    String currentLine = "";
    bool currentLineIsBlank = true;
    String requestMethod = "";
    String requestPath = "";
    String requestBody = "";
    bool isPostRequest = false;
    bool readingBody = false;
    int contentLength = 0;
    
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        Serial.write(c);
        
        if (readingBody) {
          requestBody += c;
          if (requestBody.length() >= contentLength) {
            break;
          }
        } else {
          if (c == '\n' && currentLineIsBlank) {
            // End of headers, check if this is a POST request
            if (isPostRequest && contentLength > 0) {
              readingBody = true;
            } else {
              break;
            }
          }
          
          if (c == '\n') {
            // Starting a new line
            if (currentLine.length() > 0) {
              // Parse request line
              if (requestMethod == "") {
                int firstSpace = currentLine.indexOf(' ');
                int secondSpace = currentLine.indexOf(' ', firstSpace + 1);
                if (firstSpace > 0 && secondSpace > firstSpace) {
                  requestMethod = currentLine.substring(0, firstSpace);
                  requestPath = currentLine.substring(firstSpace + 1, secondSpace);
                  Serial.print("Request: ");
                  Serial.print(requestMethod);
                  Serial.print(" ");
                  Serial.println(requestPath);
                }
              }
              
              // Parse headers
              if (currentLine.startsWith("Content-Length: ")) {
                contentLength = currentLine.substring(16).toInt();
              }
            }
            currentLine = "";
            currentLineIsBlank = true;
          } else if (c != '\r') {
            currentLineIsBlank = false;
            currentLine += c;
          }
        }
      }
    }
    
    // Handle the request
    if (requestPath == "/status") {
      handleStatusRequest(client);
    } else if (requestPath == "/command") {
      handleCommandRequest(client, requestMethod, requestBody);
    } else if (requestPath == "/") {
      handleRootRequest(client);
    } else {
      handleNotFound(client);
    }
    
    // Close the connection
    client.stop();
    Serial.println("Client disconnected");
  }
}

void handleStatusRequest(WiFiClient& client) {
  Serial.println("Handling status request");
  
  doc.clear();
  doc["status"] = "ok";
  doc["motors_armed"] = motorsArmed;
  doc["motor1_running"] = motor1Running;
  doc["motor2_running"] = motor2Running;
  doc["relay1_active"] = (digitalRead(RELAY1_PIN) == RELAY_ACTIVE);
  doc["relay2_active"] = (digitalRead(RELAY2_PIN) == RELAY_ACTIVE);
  doc["ip_address"] = WiFi.localIP().toString();
  doc["mac_address"] = WiFi.macAddress();
  doc["uptime"] = millis();
  
  String response;
  serializeJson(doc, response);
  
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  client.println("Access-Control-Allow-Headers: Content-Type");
  client.println("Connection: close");
  client.println();
  client.println(response);
}

void handleCommandRequest(WiFiClient& client, String method, String body) {
  Serial.println("Handling command request");
  Serial.print("Method: ");
  Serial.println(method);
  Serial.print("Body: ");
  Serial.println(body);
  
  int command = -1;
  
  if (method == "POST") {
    // Parse JSON body
    StaticJsonDocument<200> requestDoc;
    DeserializationError error = deserializeJson(requestDoc, body);
    
    if (!error) {
      command = requestDoc["command"];
      Serial.print("Parsed command: ");
      Serial.println(command);
    } else {
      Serial.print("JSON parsing failed: ");
      Serial.println(error.c_str());
    }
  } else if (method == "GET") {
    // For GET requests, parse from query string (simplified)
    command = 0; // Default command for GET
  }
  
  Serial.print("Final command to process: ");
  Serial.println(command);
  
  // Process command
  bool success = processCommand(command);
  
  // Send response
  doc.clear();
  if (success) {
    doc["status"] = "ok";
    doc["command"] = command;
    doc["message"] = getCommandDescription(command);
    doc["motors_armed"] = motorsArmed;
    doc["motor1_running"] = motor1Running;
    doc["motor2_running"] = motor2Running;
  } else {
    doc["status"] = "error";
    doc["message"] = "Invalid command";
  }
  
  String response;
  serializeJson(doc, response);
  
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  client.println("Access-Control-Allow-Headers: Content-Type");
  client.println("Connection: close");
  client.println();
  client.println(response);
}

void handleRootRequest(WiFiClient& client) {
  Serial.println("Handling root request");
  
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();
  client.println("<!DOCTYPE html>");
  client.println("<html>");
  client.println("<head><title>Arduino Motor Controller</title></head>");
  client.println("<body>");
  client.println("<h1>Arduino Uno R4 WiFi Motor Controller</h1>");
  client.println("<p>This Arduino is running a motor control web server.</p>");
  client.println("<p><strong>IP Address:</strong> " + WiFi.localIP().toString() + "</p>");
  client.println("<p><strong>MAC Address:</strong> " + WiFi.macAddress() + "</p>");
  client.println("<p><strong>Uptime:</strong> " + String(millis()) + " ms</p>");
  client.println("<p><strong>Available endpoints:</strong></p>");
  client.println("<ul>");
  client.println("<li><code>GET /status</code> - Get motor status</li>");
  client.println("<li><code>POST /command</code> - Send motor commands</li>");
  client.println("</ul>");
  client.println("<p><strong>Commands:</strong></p>");
  client.println("<ul>");
  client.println("<li><code>0</code> - OFF - Disarm motors</li>");
  client.println("<li><code>1</code> - ON - Arm motors</li>");
  client.println("<li><code>2</code> - M1 - Run Motor 1</li>");
  client.println("<li><code>3</code> - M2 - Run Motor 2</li>");
  client.println("</ul>");
  client.println("</body>");
  client.println("</html>");
}

void handleNotFound(WiFiClient& client) {
  Serial.println("Handling 404 request");
  
  client.println("HTTP/1.1 404 Not Found");
  client.println("Content-Type: text/plain");
  client.println("Connection: close");
  client.println();
  client.println("404 - Endpoint not found");
  client.println("Available endpoints: /status, /command, /");
}

bool processCommand(int command) {
  Serial.print("Processing command: ");
  Serial.println(command);
  Serial.print("Current motors armed: ");
  Serial.println(motorsArmed);
  
  switch (command) {
    case 0: // OFF - Disarm motors
      motorsArmed = false;
      motor1Running = false;
      motor2Running = false;
      // Turn off both relays
      digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
      digitalWrite(RELAY2_PIN, RELAY_INACTIVE);
      digitalWrite(M1_STEP_PIN, LOW);
      digitalWrite(M2_STEP_PIN, LOW);
      Serial.println("Motors disarmed and stopped");
      Serial.print("Relay 1 (pin ");
      Serial.print(RELAY1_PIN);
      Serial.println(") set to INACTIVE");
      Serial.print("Relay 2 (pin ");
      Serial.print(RELAY2_PIN);
      Serial.println(") set to INACTIVE");
      return true;
      
    case 1: // ON - Arm motors
      motorsArmed = true;
      motor1Running = false;
      motor2Running = false;
      // Keep relays off but motors are now armed
      digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
      digitalWrite(RELAY2_PIN, RELAY_INACTIVE);
      digitalWrite(M1_STEP_PIN, LOW);
      digitalWrite(M2_STEP_PIN, LOW);
      Serial.println("Motors armed");
      Serial.print("Relay 1 (pin ");
      Serial.print(RELAY1_PIN);
      Serial.println(") set to INACTIVE");
      Serial.print("Relay 2 (pin ");
      Serial.print(RELAY2_PIN);
      Serial.println(") set to INACTIVE");
      return true;
      
    case 2: // M1 - Run Motor 1
      if (motorsArmed) {
        motor1Running = true;
        motor2Running = false;
        // Activate relay 1 and start stepping motor 1
        digitalWrite(RELAY1_PIN, RELAY_ACTIVE);
        digitalWrite(RELAY2_PIN, RELAY_INACTIVE);
        digitalWrite(M1_DIR_PIN, HIGH); // Set direction
        Serial.println("Motor 1 running");
        Serial.print("Relay 1 (pin ");
        Serial.print(RELAY1_PIN);
        Serial.println(") set to ACTIVE");
        Serial.print("Relay 2 (pin ");
        Serial.print(RELAY2_PIN);
        Serial.println(") set to INACTIVE");
        Serial.print("Motor 1 direction pin (");
        Serial.print(M1_DIR_PIN);
        Serial.println(") set to HIGH");
        return true;
      } else {
        Serial.println("Motors not armed - cannot run motor");
        return false;
      }
      
    case 3: // M2 - Run Motor 2
      if (motorsArmed) {
        motor1Running = false;
        motor2Running = true;
        // Activate relay 2 and start stepping motor 2
        digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
        digitalWrite(RELAY2_PIN, RELAY_ACTIVE);
        digitalWrite(M2_DIR_PIN, HIGH); // Set direction
        Serial.println("Motor 2 running");
        Serial.print("Relay 1 (pin ");
        Serial.print(RELAY1_PIN);
        Serial.println(") set to INACTIVE");
        Serial.print("Relay 2 (pin ");
        Serial.print(RELAY2_PIN);
        Serial.println(") set to ACTIVE");
        Serial.print("Motor 2 direction pin (");
        Serial.print(M2_DIR_PIN);
        Serial.println(") set to HIGH");
        return true;
      } else {
        Serial.println("Motors not armed - cannot run motor");
        return false;
      }
      
    default:
      Serial.println("Invalid command");
      return false;
  }
}

String getCommandDescription(int command) {
  switch (command) {
    case 0: return "OFF - Disarm motors";
    case 1: return "ON - Arm motors";
    case 2: return "M1 - Run Motor 1";
    case 3: return "M2 - Run Motor 2";
    default: return "Unknown command";
  }
} 