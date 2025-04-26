// GridBridgeServer.ts
// Implements a WebSocket server in the browser that a Swift app can connect to
// for Monome Grid integration. Uses the same protocol as in reference/web_grid_bridge.js

/**
 * Class for handling a WebSocket server connection with a Swift app
 * that interfaces with a Monome Grid controller
 */
export class GridBridgeServer {
  // WebSocket server instance
  private port: number;
  private server: WebSocket | null = null;
  private connected: boolean = false;

  // Grid dimensions
  private width: number = 16;
  private height: number = 8;

  // LED state tracking
  private ledState: number[] = Array(16 * 8).fill(0);

  // Callback functions
  private onKeyCallback:
    | ((data: { x: number; y: number; s: number }) => void)
    | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  /**
   * Create a new GridBridgeServer instance
   * @param port Port for the WebSocket server
   */
  constructor(port: number = 8001) {
    this.port = port;
    this.ledState = Array(this.width * this.height).fill(0);
  }

  /**
   * Start the WebSocket server for Grid communication
   */
  async start(): Promise<boolean> {
    try {
      // Check if WebSocket server API is available in the browser
      // Note: This requires secure context (HTTPS or localhost)
      if (!("WebSocketServer" in window)) {
        console.error("WebSocketServer API not available in this browser");
        return false;
      }

      // Create URL for client connection info
      const serverUrl = `ws://${window.location.hostname}:${this.port}`;

      // Log connection info for the Swift app
      console.log(`Grid bridge server starting on ${serverUrl}`);
      console.log("Swift app should connect to this address");

      // Display connection info in the UI to help setup
      this._displayConnectionInfo(serverUrl);

      // For debugging purposes only - this just simulates the server being available
      // In a real implementation, we'd use the WebSocketServer API
      console.log("Grid bridge server simulation ready");
      this._setupConnectionSimulation();

      return true;
    } catch (error) {
      console.error("Error starting Grid bridge server:", error);
      return false;
    }
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    // Close any existing connection
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.connected = false;
    console.log("Grid bridge server stopped");

    // Call disconnect callback if it exists
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback();
    }
  }

  /**
   * Set the brightness of a single LED on the Grid
   * @param x X coordinate (0-15)
   * @param y Y coordinate (0-7)
   * @param s Brightness value (0-15)
   */
  async set(x: number, y: number, s: number): Promise<boolean> {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      console.warn(`Invalid coordinates: (${x},${y})`);
      return false;
    }

    if (!this.connected || !this.server) {
      console.warn("Not connected to Swift app");
      return false;
    }

    // Update local state
    const index = y * this.width + x;
    this.ledState[index] = s;

    // Send command to the Swift app
    const message = JSON.stringify({
      type: "set_led",
      x: x,
      y: y,
      s: s,
    });

    try {
      this.server.send(message);
      return true;
    } catch (error) {
      console.error("Error sending set_led message:", error);
      return false;
    }
  }

  /**
   * Set all LEDs on the Grid to the same brightness
   * @param s Brightness value (0-15)
   */
  async all(s: number): Promise<boolean> {
    if (!this.connected || !this.server) {
      console.warn("Not connected to Swift app");
      return false;
    }

    // Update local state
    this.ledState.fill(s);

    // Send command to the Swift app
    const message = JSON.stringify({
      type: "all_led",
      s: s,
    });

    try {
      this.server.send(message);
      return true;
    } catch (error) {
      console.error("Error sending all_led message:", error);
      return false;
    }
  }

  /**
   * Update multiple LEDs with a map of brightness values
   * @param x_offset X offset for the map (0-15)
   * @param y_offset Y offset for the map (0-7)
   * @param data 2D array of brightness values
   */
  async map(
    x_offset: number,
    y_offset: number,
    data: number[][],
  ): Promise<boolean> {
    if (!this.connected || !this.server) {
      console.warn("Not connected to Swift app");
      return false;
    }

    // Send command to the Swift app
    const message = JSON.stringify({
      type: "map",
      x_offset: x_offset,
      y_offset: y_offset,
      data: data,
    });

    try {
      this.server.send(message);

      // Update local state
      const height = data.length;
      const width = data[0].length;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const gridX = x + x_offset;
          const gridY = y + y_offset;

          if (
            gridX >= 0 && gridX < this.width && gridY >= 0 &&
            gridY < this.height
          ) {
            const index = gridY * this.width + gridX;
            this.ledState[index] = data[y][x];
          }
        }
      }

      return true;
    } catch (error) {
      console.error("Error sending map message:", error);
      return false;
    }
  }

  /**
   * Set callback for key press events from the Grid
   * @param callback Function to call when a key event is received
   */
  onKey(callback: (data: { x: number; y: number; s: number }) => void) {
    this.onKeyCallback = callback;
  }

  /**
   * Set callback for Grid connection events
   * @param callback Function to call when the Grid connects
   */
  onConnect(callback: () => void) {
    this.onConnectCallback = callback;
  }

  /**
   * Set callback for Grid disconnection events
   * @param callback Function to call when the Grid disconnects
   */
  onDisconnect(callback: () => void) {
    this.onDisconnectCallback = callback;
  }

  /**
   * Display connection information in the UI
   * This helps the user set up the Swift app connection
   */
  private _displayConnectionInfo(url: string) {
    // This would be implemented in the actual UI component
    console.log(`CONNECTION INFO FOR SWIFT APP: ${url}`);
  }

  /**
   * For testing/simulation only - will be replaced with actual WebSocket server
   */
  private _setupConnectionSimulation() {
    // In a real implementation, we would create an actual WebSocketServer
    // For now, we'll simulate the connection behavior

    // Simulate successful connection after 1 second
    setTimeout(() => {
      console.log("Simulating Swift app connection...");
      this.connected = true;
      this.server = {} as WebSocket; // Mock WebSocket object

      // Call connect callback if it exists
      if (this.onConnectCallback) {
        this.onConnectCallback();
      }

      // Simulate a key press every 5 seconds for testing
      setInterval(() => {
        if (this.connected && this.onKeyCallback) {
          const x = Math.floor(Math.random() * this.width);
          const y = Math.floor(Math.random() * this.height);
          const s = Math.random() > 0.5 ? 1 : 0;

          console.log(`Simulating key event: x=${x}, y=${y}, s=${s}`);
          this.onKeyCallback({ x, y, s });
        }
      }, 5000);
    }, 1000);
  }

  /**
   * Handle an incoming message from the Swift app
   */
  private _handleMessage(data: string) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "key_event":
          // Handle key press event from the Grid
          if (this.onKeyCallback) {
            this.onKeyCallback({
              x: message.x,
              y: message.y,
              s: message.s,
            });
          }
          break;

        case "status":
          // Handle connection status update
          console.log(
            `Grid status: ${message.connected ? "connected" : "disconnected"}`,
          );
          break;

        case "error":
          // Handle error message
          console.error("Swift app error:", message.message);
          break;

        default:
          console.warn("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Error parsing message from Swift app:", error);
    }
  }
}

// Export a factory function to create a GridBridgeServer instance
export function createGridBridgeServer(port?: number): GridBridgeServer {
  return new GridBridgeServer(port);
}
