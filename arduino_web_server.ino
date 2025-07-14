/*
  Arduino Uno R4 WiFi Web Server for Motor Control
  This code creates a web server that accepts commands from the web interface
*/

#include <WiFiS3.h>
#include <ArduinoJson.h>

// WiFi credentials - CHANGE THESE TO YOUR NETWORK
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Motor control pins
#define M1_STEP_PIN  5   // PUL+
#define M1_DIR_PIN   6   // DIR+
#define RELAY1_PIN   8   // VMOT for driver 1

#define M2_STEP_PIN  2   // PUL+
#define M2_DIR_PIN   3   // DIR+
#define RELAY2_PIN   9   // VMOT for driver 2

const int RELAY_ACTIVE   = LOW;
const int RELAY_INACTIVE = HIGH;

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

  // Default state: both drivers off
  digitalWrite(M1_STEP_PIN, LOW);
  digitalWrite(M2_STEP_PIN, LOW);
  digitalWrite(M1_DIR_PIN, HIGH);
  digitalWrite(M2_DIR_PIN, HIGH);
  digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
  digitalWrite(RELAY2_PIN, RELAY_INACTIVE);

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
  Serial.println("System ready");
}

void loop() {
  WiFiClient client = server.available();
  
  if (client) {
    Serial.println("New client connected");
    String currentLine = "";
    String requestMethod = "";
    String requestPath = "";
    bool isPostRequest = false;
    String postData = "";
    
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        
        if (c == '\n') {
          if (currentLine.length() == 0) {
            // End of headers, send response
            if (requestPath == "/status") {
              sendStatusResponse(client);
            } else if (requestPath == "/command" && isPostRequest) {
              processCommandRequest(client, postData);
            } else {
              sendDefaultResponse(client);
            }
            break;
          } else {
            // Parse request line
            if (currentLine.startsWith("GET ")) {
              requestMethod = "GET";
              requestPath = currentLine.substring(4, currentLine.indexOf(" HTTP"));
            } else if (currentLine.startsWith("POST ")) {
              requestMethod = "POST";
              isPostRequest = true;
              requestPath = currentLine.substring(5, currentLine.indexOf(" HTTP"));
            }
            currentLine = "";
          }
        } else if (c != '\r') {
          currentLine += c;
          
          // Collect POST data
          if (isPostRequest && currentLine.length() == 0) {
            while (client.available()) {
              postData += (char)client.read();
            }
          }
        }
      }
    }
    
    client.stop();
    Serial.println("Client disconnected");
  }
  
  // Motor control logic
  if (running) {
    const int pulseCount = 50;  // Send more pulses per batch for efficiency
    const int highPulse = 2;    // Shorter high pulse (2µs minimum for most drivers)
    const int lowPulse = 2;     // Very short low time = faster rotation

    if (currentM == 1) {
      // Send motor 1 pulses continuously at maximum rate
      for (int i = 0; i < pulseCount; i++) {
        digitalWrite(M1_STEP_PIN, HIGH);
        delayMicroseconds(highPulse);
        digitalWrite(M1_STEP_PIN, LOW);
        delayMicroseconds(lowPulse);
      }
    } else if (currentM == 2) {
      // Send motor 2 pulses continuously at maximum rate
      for (int i = 0; i < pulseCount; i++) {
        digitalWrite(M2_STEP_PIN, HIGH);
        delayMicroseconds(highPulse);
        digitalWrite(M2_STEP_PIN, LOW);
        delayMicroseconds(lowPulse);
      }
    }
    // Allow time for web server between pulse batches
    delayMicroseconds(500);
  }
}

void sendStatusResponse(WiFiClient& client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println();
  
  StaticJsonDocument<200> doc;
  doc["status"] = "ok";
  doc["command"] = command;
  doc["armed"] = armed;
  doc["running"] = running;
  doc["currentMotor"] = currentM;
  doc["ip"] = WiFi.localIP().toString();
  
  String response;
  serializeJson(doc, response);
  client.println(response);
}

void processCommandRequest(WiFiClient& client, String& postData) {
  Serial.println("Received command data: " + postData);
  
  // Parse JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, postData);
  
  if (!error) {
    if (doc.containsKey("command")) {
      int newCommand = doc["command"];
      processCommand(newCommand);
      
      // Send success response
      client.println("HTTP/1.1 200 OK");
      client.println("Content-Type: application/json");
      client.println("Access-Control-Allow-Origin: *");
      client.println("Connection: close");
      client.println();
      
      StaticJsonDocument<200> responseDoc;
      responseDoc["status"] = "ok";
      responseDoc["command"] = command;
      responseDoc["message"] = "Command processed successfully";
      
      String response;
      serializeJson(responseDoc, response);
      client.println(response);
    } else {
      sendErrorResponse(client, "No command field found");
    }
  } else {
    sendErrorResponse(client, "Invalid JSON: " + String(error.c_str()));
  }
}

void sendDefaultResponse(WiFiClient& client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println();
  
  StaticJsonDocument<200> doc;
  doc["status"] = "ok";
  doc["message"] = "Arduino Motor Control Web Server";
  doc["endpoints"] = "/status, /command";
  
  String response;
  serializeJson(doc, response);
  client.println(response);
}

void sendErrorResponse(WiFiClient& client, String error) {
  client.println("HTTP/1.1 400 Bad Request");
  client.println("Content-Type: application/json");
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println();
  
  StaticJsonDocument<200> doc;
  doc["status"] = "error";
  doc["error"] = error;
  
  String response;
  serializeJson(doc, response);
  client.println(response);
}

void processCommand(int cmd) {
  command = constrain(cmd, 0, 3);

  switch (command) {
    case 0: // OFF - stop all motors
      running = false;
      armed = false;
      digitalWrite(RELAY1_PIN, RELAY_INACTIVE);
      digitalWrite(RELAY2_PIN, RELAY_INACTIVE);
      Serial.println(F("⏹ Motors stopped and disarmed"));
      break;

    case 1: // ARM - prepare motors but don't run
      armed = true;
      running = false;
      Serial.println(F("🟢 Armed - ready for motor command"));
      break;

    case 2: // Run Motor 1 continuously
      if (armed) {
        digitalWrite(RELAY1_PIN, RELAY_ACTIVE);
        delay(200);  // Longer relay activation wait
        currentM = 1;
        running = true;
        Serial.println(F("→ Motor 1 running at full speed"));
      } else {
        Serial.println(F("⚠️ Motor not armed. Send command 1 first."));
      }
      break;

    case 3: // Run Motor 2 continuously
      if (armed) {
        digitalWrite(RELAY2_PIN, RELAY_ACTIVE);
        delay(200);  // Longer relay activation wait
        currentM = 2;
        running = true;
        Serial.println(F("→ Motor 2 running at full speed"));
      } else {
        Serial.println(F("⚠️ Motor not armed. Send command 1 first."));
      }
      break;
  }
} 