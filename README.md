# Arduino Motor Control Website

A modern web interface for controlling Arduino Uno R4 WiFi motors through direct WiFi communication. This application provides a beautiful, responsive interface to send commands to your Arduino and control motor operations.

## Features

- 🎮 **Quick Control Buttons**: One-click access to OFF, ON, M1, and M2 commands
- ⌨️ **Custom Command Input**: Send any command (0-3) directly
- 💻 **Custom Code Editor**: Write and upload Arduino code directly to your device
- 📊 **Real-time Status**: Live connection status and command feedback
- 📝 **Command Logging**: Track all sent commands with timestamps
- 🔌 **WebSocket Communication**: Real-time updates and instant feedback
- 📱 **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- ⌨️ **Keyboard Shortcuts**: Use number keys 0-3 for quick access
- 🎨 **Modern UI**: Beautiful dark theme with smooth animations
- 🔗 **Direct WiFi Communication**: No cloud services required

## Command Reference

| Command | Description | Action |
|---------|-------------|---------|
| `0` | OFF | Stop all motors and disarm |
| `1` | ON | Arm motors (prepare for operation) |
| `2` | M1 | Run Motor 1 continuously |
| `3` | M2 | Run Motor 2 continuously |

## Prerequisites

- Node.js (v14 or higher)
- Arduino Uno R4 WiFi
- WiFi network (same network as your computer)
- Arduino CLI (optional, for code uploads)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 2. Configure Arduino WiFi Connection

1. **Upload Arduino Code**:
   - Open `arduino_web_server.ino` in Arduino IDE
   - Change WiFi credentials to match your network:
     ```cpp
     const char* ssid = "YOUR_WIFI_SSID";
     const char* password = "YOUR_WIFI_PASSWORD";
     ```
   - Upload to your Arduino Uno R4 WiFi
   - Note the IP address shown in Serial Monitor

2. **Create Environment File**:
   ```bash
   # Copy the example environment file
   cp env.example .env
   
   # Edit the .env file with your Arduino's IP address
   nano .env
   ```

   Add your Arduino's IP address:
   ```env
   ARDUINO_IP=192.168.1.100  # Use your Arduino's actual IP
   ARDUINO_PORT=80
   ARDUINO_ENDPOINT=/command
   PORT=3000
   ```

### 3. Configure Arduino CLI (Optional - for Code Uploads)

If you want to upload custom code to your Arduino:

1. **Install Arduino CLI**:
   ```bash
   # macOS
   brew install arduino-cli
   
   # Linux
   curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
   
   # Windows
   # Download from https://github.com/arduino/arduino-cli/releases
   ```

2. **Configure Arduino CLI**:
   ```bash
   # Initialize Arduino CLI
   arduino-cli config init
   
   # Update core index
   arduino-cli core update-index
   
   # Install Uno R4 WiFi core
   arduino-cli core install arduino:renesas_uno
   ```

3. **Find your Arduino port**:
   ```bash
   # List available ports
   arduino-cli board list
   ```

4. **Update your .env file**:
   ```env
   ARDUINO_CLI_PATH=arduino-cli
   ARDUINO_BOARD=arduino:renesas_uno:unor4wifi
   ARDUINO_UPLOAD_PORT=/dev/ttyUSB0  # Use your actual port
   ```

### 4. Start the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

### 5. Access the Web Interface

Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Quick Controls
- Click the **OFF** button to stop all motors
- Click the **ON** button to arm the motors
- Click **M1** to run Motor 1
- Click **M2** to run Motor 2

### Custom Commands
1. Enter a command (0-3) in the input field
2. Click "Send" or press Enter
3. The command will be sent to your Arduino

### Custom Code Upload
1. **Write Code**: Use the code editor to write your Arduino code
2. **Load Examples**: Click "Load Example" to get started with templates
3. **Upload**: Click "Upload to Arduino" to compile and upload your code
4. **Clear**: Use "Clear" to reset the editor

**Available Examples**:
- **Basic**: Simple motor control setup
- **Motor Control**: Advanced motor control with speed and direction
- **WiFi Server**: Complete web server for motor control

### Connection Testing
- Click "Test Connection" to verify Arduino connectivity
- Check the status indicator for connection status
- View logs for detailed connection information

### Keyboard Shortcuts
- `0` - OFF (stop all motors)
- `1` - ON (arm motors)
- `2` - M1 (run motor 1)
- `3` - M2 (run motor 2)
- `Escape` - OFF (emergency stop)

## Arduino Code Requirements

Your Arduino code should include:
- WiFi connection setup
- Web server functionality
- Motor control logic
- JSON command parsing

The provided `arduino_web_server.ino` file includes everything needed.

## API Endpoints

### REST API
- `GET /api/status` - Get current system status
- `POST /api/command` - Send a command to Arduino
- `POST /api/upload-code` - Upload Arduino code
- `GET /api/test-connection` - Test Arduino connection

### WebSocket Events
- `send-command` - Send command to Arduino
- `upload-code` - Upload Arduino code
- `test-connection` - Test Arduino connection
- `state-update` - Receive state updates
- `command-result` - Receive command results
- `code-upload-result` - Receive code upload results
- `connection-test-result` - Receive connection test results

## Troubleshooting

### Connection Issues
1. **Check Arduino IP address**:
   - Verify IP address in `.env` file matches Arduino's IP
   - Check Serial Monitor for Arduino's IP address
   - Ensure both devices are on same WiFi network

2. **Arduino not responding**:
   - Check if Arduino code is uploaded and running
   - Verify WiFi connection on Arduino
   - Check Serial Monitor for error messages
   - Use "Test Connection" button to diagnose

3. **Web interface not loading**:
   - Ensure server is running (`npm start`)
   - Check if port 3000 is available
   - Try accessing `http://localhost:3000`

### Code Upload Issues
1. **Arduino CLI not found**:
   - Install Arduino CLI (see setup instructions)
   - Verify `ARDUINO_CLI_PATH` in `.env` file

2. **Compilation errors**:
   - Check your Arduino code syntax
   - Ensure all required libraries are installed
   - Verify board type in `.env` file

3. **Upload fails**:
   - Check if Arduino is connected and port is correct
   - Verify `ARDUINO_UPLOAD_PORT` in `.env` file
   - Try uploading manually with Arduino IDE first

### WiFi Issues
1. **Arduino won't connect to WiFi**:
   - Check WiFi credentials in Arduino code
   - Ensure WiFi network is 2.4GHz (Uno R4 WiFi doesn't support 5GHz)
   - Check signal strength

2. **IP address changes**:
   - Configure static IP on your router
   - Or update `.env` file when IP changes
   - Check Serial Monitor for new IP address

## Development

### Project Structure
```
ardino/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── arduino_web_server.ino # Arduino code template
├── public/                # Frontend files
│   ├── index.html         # Main HTML page
│   ├── styles.css         # CSS styles
│   └── script.js          # Frontend JavaScript
├── env.example            # Environment variables template
└── README.md              # This file
```

### Adding Features
- **New Commands**: Add to the command mapping in `script.js`
- **UI Changes**: Modify `styles.css` and `index.html`
- **Backend Logic**: Update `server.js`
- **Code Examples**: Add to `exampleCodes` object in `script.js`
- **Arduino Code**: Modify `arduino_web_server.ino`

## License

MIT License - feel free to use and modify as needed.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Verify WiFi connection and IP address
3. Check server logs for error messages
4. Ensure all dependencies are installed
5. For code upload issues, verify Arduino CLI installation
6. Use the "Test Connection" button to diagnose issues

---

**Happy Motor Controlling! 🚀** 