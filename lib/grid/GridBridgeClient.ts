/**
 * GridBridgeClient.ts
 * WebSocket client that connects to a Swift app server to interface with a Monome Grid
 * Based on the protocol in reference/web_grid_bridge.js
 */

/**
 * WebSocket client to interface with a Monome Grid through a Swift app
 */
export class GridBridgeClient {
  // WebSocket connection
  private socket: WebSocket | null = null;
  private connected: boolean = false;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectIntervalTime: number = 5000; // milliseconds
  private maxReconnectAttempts: number = 3; // Maximum number of automatic reconnection attempts
  private reconnectAttempts: number = 0;

  // Grid dimensions
  private width: number = 16;
  private height: number = 8;

  // LED state tracking
  private ledState: number[] = Array(16 * 8).fill(0);

  // Server connection information
  private serverUrl: string;

  // Callback functions
  private onKeyCallback:
    | ((data: { x: number; y: number; s: number }) => void)
    | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onErrorCallback: ((message: string) => void) | null = null;

  /**
   * Create a new GridBridgeClient
   * @param host Server hostname (default: localhost)
   * @param port Server port (default: 8001)
   */
  constructor(host: string = "localhost", port: number = 8001) {
    this.serverUrl = `ws://${host}:${port}`;
    this.ledState = Array(this.width * this.height).fill(0);
  }

  /**
   * Connect to the Grid server
   */
  async connect(): Promise<boolean> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log("Already connected to Grid bridge");
      return true;
    }

    // Reset reconnect attempts on manual connection
    this.reconnectAttempts = 0;

    try {
      console.log(`Connecting to Grid bridge at ${this.serverUrl}...`);

      // Create WebSocket connection
      this.socket = new WebSocket(this.serverUrl);

      // Set up event handlers
      this.socket.onopen = this._handleOpen.bind(this);
      this.socket.onclose = this._handleClose.bind(this);
      this.socket.onerror = this._handleError.bind(this);
      this.socket.onmessage = this._handleMessage.bind(this);

      // Return a promise that resolves when the connection is established or fails
      return new Promise((resolve) => {
        // Set a timeout for connection attempts
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            const port = this.serverUrl.split(":").pop();
            console.error(
              `Connection timeout - Make sure the Grid WebSocket server is running on port ${port}`,
            );
            if (this.socket) {
              this.socket.close();
            }
            resolve(false);
          }
        }, 5000);

        // Check connection state regularly
        const checkConnection = () => {
          if (this.connected) {
            clearTimeout(connectionTimeout);
            resolve(true);
          } else if (
            this.socket && this.socket.readyState === WebSocket.CLOSED
          ) {
            clearTimeout(connectionTimeout);
            resolve(false);
          } else {
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
      });
    } catch (error) {
      console.error("Error connecting to Grid bridge:", error);
      return false;
    }
  }

  /**
   * Disconnect from the Grid server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.connected = false;
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

    if (!this.connected || !this.socket) {
      console.warn("Not connected to Grid bridge");
      return false;
    }

    // Update local state
    const index = y * this.width + x;
    this.ledState[index] = s;

    // Send command to the Grid bridge
    const message = JSON.stringify({
      type: "set_led",
      x: x,
      y: y,
      s: s,
    });

    try {
      this.socket.send(message);
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
    if (!this.connected || !this.socket) {
      console.warn("Not connected to Grid bridge");
      return false;
    }

    // Update local state
    this.ledState.fill(s);

    // Send command to the Grid bridge
    const message = JSON.stringify({
      type: "all_led",
      s: s,
    });

    try {
      this.socket.send(message);
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
    if (!this.connected || !this.socket) {
      console.warn("Not connected to Grid bridge");
      return false;
    }

    // Send command to the Grid bridge
    const message = JSON.stringify({
      type: "map",
      x_offset: x_offset,
      y_offset: y_offset,
      data: data,
    });

    try {
      this.socket.send(message);

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
   * Get the current connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Get the WebSocket instance (for debug purposes only)
   */
  getSocket(): WebSocket | null {
    return this.socket;
  }

  /**
   * Set callback for key press events from the Grid
   * @param callback Function to call when a key event is received
   */
  onKey(callback: (data: { x: number; y: number; s: number }) => void): void {
    this.onKeyCallback = callback;
  }

  /**
   * Set callback for Grid connection events
   * @param callback Function to call when the Grid connects
   */
  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  /**
   * Set callback for Grid disconnection events
   * @param callback Function to call when the Grid disconnects
   */
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Set callback for error events
   * @param callback Function to call when an error occurs
   */
  onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Handle WebSocket open event
   */
  private _handleOpen(): void {
    console.log("WebSocket connected to Grid bridge");
    this.connected = true;

    if (this.onConnectCallback) {
      this.onConnectCallback();
    }
  }

  /**
   * Handle WebSocket close event
   */
  private _handleClose(): void {
    console.log("WebSocket disconnected from Grid bridge");
    this.connected = false;

    if (this.onDisconnectCallback) {
      this.onDisconnectCallback();
    }

    // Attempt to reconnect, but only a limited number of times
    if (
      !this.reconnectInterval &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.reconnectAttempts++;

      const port = this.serverUrl.split(":").pop();
      console.log(
        `Reconnection attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}...`,
      );

      this.reconnectInterval = setInterval(() => {
        if (!this.connected) {
          console.log(
            `Attempting to reconnect to Grid bridge at ${this.serverUrl}...`,
          );

          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(
              `Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Please check if the Swift WebSocket server is running on port ${port}.`,
            );
            clearInterval(this.reconnectInterval!);
            this.reconnectInterval = null;

            if (this.onErrorCallback) {
              this.onErrorCallback(
                `Maximum reconnection attempts reached. Please check if the Swift WebSocket server is running on port ${port}.`,
              );
            }
            return;
          }

          this.connect().then((success) => {
            if (success) {
              console.log("Reconnection successful!");
              this.reconnectAttempts = 0;
              clearInterval(this.reconnectInterval!);
              this.reconnectInterval = null;
            }
          });
        } else {
          clearInterval(this.reconnectInterval!);
          this.reconnectInterval = null;
        }
      }, this.reconnectIntervalTime);
    }
  }

  /**
   * Handle WebSocket error event
   */
  private _handleError(event: Event): void {
    console.error("WebSocket error:", event);

    const port = this.serverUrl.split(":").pop();
    const errorMessage =
      `WebSocket error: Unable to connect to the Grid WebSocket server on port ${port}. Make sure the Swift app is running and serving WebSockets.`;

    if (this.onErrorCallback) {
      this.onErrorCallback(errorMessage);
    }
  }

  /**
   * Handle WebSocket message event
   */
  private _handleMessage(event: MessageEvent): void {
    try {
      // Safety check for data size to prevent memory issues
      if (typeof event.data === "string" && event.data.length > 10000) {
        console.error(
          `Message too large (${event.data.length} bytes), ignoring`,
        );
        if (this.onErrorCallback) {
          this.onErrorCallback(
            `Message too large (${event.data.length} bytes), ignoring`,
          );
        }
        return;
      }

      // Log the raw message for debugging
      const rawData = typeof event.data === "string"
        ? event.data.substring(0, 100) // Limit to first 100 chars
        : "Non-text message";

      console.log(`Raw message received: ${rawData}`);

      // Handle text messages
      if (typeof event.data === "string") {
        // First check if it roughly matches expected JSON pattern before parsing
        if (!this._isLikelyValidJson(event.data)) {
          console.warn(
            "Received message doesn't appear to be valid JSON, ignoring",
          );
          if (this.onErrorCallback) {
            this.onErrorCallback("Invalid message format, not JSON");
          }
          return;
        }

        try {
          const message = JSON.parse(event.data);

          // Basic structure validation
          if (!message || typeof message !== "object" || !message.type) {
            console.warn("Message missing required 'type' field");
            if (this.onErrorCallback) {
              this.onErrorCallback("Message missing required 'type' field");
            }
            return;
          }

          // Validate grid coordinates to ensure they're in range
          if (message.type === "key_event") {
            // Safety check for coordinate values before validation
            if (!this._hasValidProperties(message, ["x", "y", "s"])) {
              console.warn("Key event missing required properties");
              if (this.onErrorCallback) {
                this.onErrorCallback("Key event missing required properties");
              }
              return;
            }

            // Extract values with validation
            const x = this._validateCoordinate(message.x, 0, this.width - 1);
            const y = this._validateCoordinate(message.y, 0, this.height - 1);
            const s = this._validateCoordinate(message.s, 0, 15);

            if (x !== null && y !== null && s !== null) {
              console.log(`Button event: x=${x}, y=${y}, s=${s}`);
              if (this.onKeyCallback) {
                this.onKeyCallback({ x, y, s });
              }
            } else {
              console.warn(
                `Invalid grid coordinates: x=${message.x}, y=${message.y}, s=${message.s}`,
              );
              if (this.onErrorCallback) {
                this.onErrorCallback(
                  `Invalid grid coordinates: x=${message.x}, y=${message.y}, s=${message.s}`,
                );
              }
            }
          } else if (message.type === "status") {
            // Handle grid connection status
            if (typeof message.connected !== "boolean") {
              console.warn("Status message missing 'connected' boolean");
              return;
            }
            console.log(
              `Grid status: ${
                message.connected ? "connected" : "disconnected"
              }`,
            );
          } else if (message.type === "error") {
            // Handle error messages
            if (typeof message.message !== "string") {
              console.warn("Error message missing 'message' string");
              return;
            }
            console.error("Grid bridge error:", message.message);
            if (this.onErrorCallback) {
              this.onErrorCallback(message.message);
            }
          } else if (message.type === "welcome") {
            // Handle welcome message
            console.log("Received welcome message:", message.message);
          } else {
            console.warn("Unknown message type:", message.type);
          }
        } catch (parseError: any) {
          console.error("Error parsing JSON message:", parseError);
          if (this.onErrorCallback) {
            this.onErrorCallback(
              `JSON parse error: ${parseError.message || String(parseError)}`,
            );
          }
        }
      } // Handle binary messages if needed (not expected in this protocol)
      else if (event.data instanceof ArrayBuffer) {
        console.warn("Received binary message, not expected in this protocol");
        if (this.onErrorCallback) {
          this.onErrorCallback("Unexpected binary message received");
        }
      }
    } catch (error: any) {
      console.error("Error handling message:", error);
      if (this.onErrorCallback) {
        this.onErrorCallback(
          `Message handling error: ${error.message || String(error)}`,
        );
      }
    }
  }

  /**
   * Validate a coordinate value is within range
   * Returns the value if valid, null if invalid
   */
  private _validateCoordinate(
    value: any,
    min: number,
    max: number,
  ): number | null {
    // Check if it's a number
    const numValue = Number(value);

    // Ensure it's a valid number
    if (isNaN(numValue)) {
      return null;
    }

    // Ensure it's within the acceptable range
    if (numValue < min || numValue > max) {
      return null;
    }

    // It's valid, return the number
    return numValue;
  }

  /**
   * Performs a quick check to see if a string is likely to be valid JSON
   * without actually parsing it, to avoid throwing exceptions
   */
  private _isLikelyValidJson(str: string): boolean {
    // Empty strings are not valid JSON
    if (!str || str.trim() === "") {
      return false;
    }

    // Check if it starts with { or [ and ends with } or ]
    const trimmed = str.trim();

    // Check first and last characters
    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];

    // If it's not an object or array, it's not what we expect
    const validStart = firstChar === "{" || firstChar === "[";
    const validEnd = lastChar === "}" || lastChar === "]";

    // Simple length check to prevent memory issues
    const reasonableLength = trimmed.length < 10000;

    return validStart && validEnd && reasonableLength;
  }

  /**
   * Checks if an object has all required properties and they are of acceptable types
   */
  private _hasValidProperties(obj: any, props: string[]): boolean {
    if (!obj || typeof obj !== "object") {
      return false;
    }

    return props.every((prop) => {
      const value = obj[prop];
      // Make sure property exists and is not null/undefined
      const exists = value !== undefined && value !== null;

      // For coordinates, check that they're numbers or strings that can be converted to numbers
      if (prop === "x" || prop === "y" || prop === "s") {
        const numValue = Number(value);
        return exists && !isNaN(numValue) && isFinite(numValue);
      }

      return exists;
    });
  }
}

// Export a factory function to create a GridBridgeClient instance
export function createGridBridgeClient(
  host?: string,
  port?: number,
): GridBridgeClient {
  return new GridBridgeClient(host, port);
}
