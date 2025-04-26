import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { createGridBridgeClient } from "../lib/grid/GridBridgeClient.ts";

interface GridControllerProps {
  // Host and port for the Grid bridge
  host?: string;
  port?: number;

  // Callback for when a key is pressed on the grid
  onGridKey?: (x: number, y: number, s: number) => void;

  // Methods to control LEDs exposed to parent component
  onSetupController?: (controller: {
    setLed: (x: number, y: number, s: number) => Promise<boolean>;
    setAll: (s: number) => Promise<boolean>;
    setMap: (
      x_offset: number,
      y_offset: number,
      data: number[][],
    ) => Promise<boolean>;
  }) => void;

  // Connection status callback
  onConnectionStatus?: (connected: boolean, info: string) => void;

  // Debug options
  debugMode?: boolean;
}

export default function GridController({
  host = "localhost",
  port = 8001,
  onGridKey,
  onSetupController,
  onConnectionStatus,
  debugMode = false,
}: GridControllerProps) {
  // Create a reference to the component itself (for external access to public methods)
  const componentRef = useRef({
    // Method to highlight a specific row on the grid
    highlightRow: async (row: number, brightness: number = 5) => {
      if (!gridBridge.value || !isConnected.value) return;

      // Create a pattern with the specified row lit
      const newGridState = [...gridState.value];

      // Clear existing content first
      for (let i = 0; i < newGridState.length; i++) {
        if (Math.floor(i / 16) === row) {
          newGridState[i] = brightness;
        }
      }

      // Update the grid
      gridState.value = newGridState;

      // Send to the physical grid
      const data = Array(8).fill([]).map((_, y) => {
        return Array(16).fill(0).map((_, x) => {
          return y === row ? brightness : 0;
        });
      });

      await gridBridge.value.map(0, 0, data);
    },

    // Method to indicate the active parameter value on a row
    setParameterValue: async (
      row: number,
      column: number,
      brightness: number = 15,
    ) => {
      if (!gridBridge.value || !isConnected.value) return;

      // Create a pattern with just that single LED lit on the row
      const rowOffset = row * 16;
      const newGridState = [...gridState.value];

      // First clear this row
      for (let i = 0; i < 16; i++) {
        newGridState[rowOffset + i] = 0;
      }

      // Then set the active parameter LED
      newGridState[rowOffset + column] = brightness;

      // Update local state
      gridState.value = newGridState;

      // Update physical grid
      await gridBridge.value.all(0); // Clear first

      // Set the LED for this parameter
      await gridBridge.value.set(column, row, brightness);
    },

    // Draw a sequence on a row (for example, to show a series of active notes)
    drawRowPattern: async (row: number, pattern: number[]) => {
      if (!gridBridge.value || !isConnected.value || pattern.length !== 16) {
        return;
      }

      // Update the grid state for this row
      const rowOffset = row * 16;
      const newGridState = [...gridState.value];

      // Set each cell in the row according to the pattern
      for (let i = 0; i < 16; i++) {
        newGridState[rowOffset + i] = pattern[i];
      }

      // Update local state
      gridState.value = newGridState;

      // Update physical grid for this row
      for (let i = 0; i < 16; i++) {
        await gridBridge.value.set(i, row, pattern[i]);
      }
    },
  });
  // Store port for UI display
  const serverPort = port;
  // Grid state tracking
  const isConnected = useSignal(false);
  const connectionInfo = useSignal("");
  const gridBridge = useSignal<any>(null);
  const lastKeyEvent = useSignal<{ x: number; y: number; s: number } | null>(
    null,
  );
  const connectionError = useSignal<string | null>(null);

  // Debug logs
  const showDebugLogs = useSignal(debugMode);
  const debugLogs = useSignal<string[]>([]);
  const rawMessages = useSignal<string[]>([]);
  const showRawMessages = useSignal(debugMode);
  const memoryStats = useSignal<{ heapSize: number; heapUsed: number } | null>(
    null,
  );

  // Virtual grid state for visual display
  const gridState = useSignal<number[]>(Array(16 * 8).fill(0));

  // Initialize the WebSocket client for Grid connections
  useEffect(() => {
    // Create a WebSocket client for Grid communication
    const bridge = createGridBridgeClient(host, port);
    gridBridge.value = bridge;

    // Memory usage tracker for debugging
    let memoryTracker: number | null = null;

    if (debugMode) {
      // Track memory usage every 2 seconds
      memoryTracker = setInterval(() => {
        try {
          // Chrome-specific memory API
          const perf = performance as any;
          if (perf && perf.memory) {
            memoryStats.value = {
              heapSize: Math.round(
                perf.memory.totalJSHeapSize / (1024 * 1024),
              ),
              heapUsed: Math.round(
                perf.memory.usedJSHeapSize / (1024 * 1024),
              ),
            };
          }
        } catch (e) {
          // Memory API not available, ignore
        }
      }, 2000) as unknown as number;
    }

    // Helper function to add message to the debug logs
    const addMessage = (direction: string, data: any) => {
      if (!showRawMessages.value) return;

      const timestamp = new Date().toLocaleTimeString();
      const dataStr = typeof data === "string"
        ? data.substring(0, 200) // Limit length to prevent UI issues
        : "[Binary data]";

      rawMessages.value = [
        ...rawMessages.value.slice(-19),
        `${timestamp} ${direction}: ${dataStr}`,
      ];
    };

    // Set up callbacks
    bridge.onConnect(() => {
      console.log("Connected to Grid bridge");
      isConnected.value = true;
      connectionError.value = null;

      // Update connection info
      const connInfo = `Connected to ${bridge.getServerUrl()}`;
      connectionInfo.value = connInfo;

      // Call parent callback if provided
      if (onConnectionStatus) {
        onConnectionStatus(true, connInfo);
      }

      // Add to debug logs
      const timestamp = new Date().toLocaleTimeString();
      debugLogs.value = [
        ...debugLogs.value.slice(-49),
        `${timestamp} - CONNECTED to ${bridge.getServerUrl()}`,
      ];
    });

    bridge.onDisconnect(() => {
      console.log("Disconnected from Grid bridge");
      isConnected.value = false;

      // Update connection info
      const connInfo = `Disconnected from ${bridge.getServerUrl()}`;
      connectionInfo.value = connInfo;

      // Call parent callback if provided
      if (onConnectionStatus) {
        onConnectionStatus(false, connInfo);
      }

      // Add to debug logs
      const timestamp = new Date().toLocaleTimeString();
      debugLogs.value = [
        ...debugLogs.value.slice(-49),
        `${timestamp} - DISCONNECTED from ${bridge.getServerUrl()}`,
      ];
    });

    bridge.onError((message) => {
      console.error("Grid bridge error:", message);
      connectionError.value = message;

      // Update connection info
      const connInfo = `Error: ${message}`;
      connectionInfo.value = connInfo;

      // Call parent callback if provided
      if (onConnectionStatus) {
        onConnectionStatus(false, connInfo);
      }

      // Add to debug logs
      const timestamp = new Date().toLocaleTimeString();
      debugLogs.value = [
        ...debugLogs.value.slice(-49),
        `${timestamp} - ERROR: ${message}`,
      ];
    });

    bridge.onKey((data) => {
      try {
        console.log(`Grid key: x=${data.x}, y=${data.y}, s=${data.s}`);
        lastKeyEvent.value = data;

        // Add to debug logs
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.value = [
          ...debugLogs.value.slice(-49),
          `${timestamp} - KEY: x=${data.x}, y=${data.y}, s=${data.s}`,
        ];

        // Update grid state for visual display
        const index = data.y * 16 + data.x;
        if (index >= 0 && index < 16 * 8) { // Double-check to avoid out-of-bounds
          const newGridState = [...gridState.value];
          newGridState[index] = data.s * 15; // Scale to 0-15 brightness
          gridState.value = newGridState;
        } else {
          console.error(
            `Invalid grid index: ${index} from x=${data.x}, y=${data.y}`,
          );
          debugLogs.value = [
            ...debugLogs.value.slice(-49),
            `${timestamp} - ERROR: Invalid grid index: ${index}`,
          ];
        }

        // Call the callback if provided
        if (onGridKey) {
          onGridKey(data.x, data.y, data.s);
        }
      } catch (error: any) {
        console.error("Error handling key event:", error);
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.value = [
          ...debugLogs.value.slice(-49),
          `${timestamp} - ERROR handling key event: ${
            error.message || String(error)
          }`,
        ];
      }
    });

    // Display connection info
    const initialConnInfo = `Connecting to ${bridge.getServerUrl()}`;
    connectionInfo.value = initialConnInfo;

    // Call parent callback with initial status
    if (onConnectionStatus) {
      onConnectionStatus(false, initialConnInfo);
    }

    // Connect to the Grid
    const connectPromise = bridge.connect();

    // Add debug hooks if needed
    connectPromise.then((success: boolean) => {
      if (success && debugMode) {
        // Get the socket instance after successful connection
        const socket = bridge.getSocket();
        if (socket) {
          // Add debug logging for outgoing messages
          const originalSend = socket.send;
          socket.send = function (data) {
            addMessage("OUT", data);
            return originalSend.apply(this, [data]);
          };

          // Add listener for incoming messages
          socket.addEventListener("message", (event) => {
            addMessage("IN", event.data);
          });
        }
      }
    });

    // Handle connection results
    connectPromise.then((success: boolean) => {
      if (success) {
        connectionInfo.value = `Connected to ${bridge.getServerUrl()}`;
        console.log("Grid bridge client connected successfully");
        // Add to debug logs
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.value = [
          ...debugLogs.value.slice(-49),
          `${timestamp} - CONNECTED to ${bridge.getServerUrl()}`,
        ];
      } else {
        connectionInfo.value = `Failed to connect to ${bridge.getServerUrl()}`;
        console.error("Failed to connect to Grid bridge");
        // Add to debug logs
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.value = [
          ...debugLogs.value.slice(-49),
          `${timestamp} - CONNECTION FAILED to ${bridge.getServerUrl()}`,
        ];
      }
    })
      .catch((error: Error) => {
        connectionInfo.value = `Error: ${error.message}`;
        connectionError.value = error.message;
        console.error("Error connecting to Grid bridge:", error);
        // Add to debug logs
        const timestamp = new Date().toLocaleTimeString();
        debugLogs.value = [
          ...debugLogs.value.slice(-49),
          `${timestamp} - CONNECTION ERROR: ${error.message}`,
        ];
      });

    // Clean up on component unmount
    return () => {
      if (memoryTracker) {
        clearInterval(memoryTracker);
      }

      // Disconnect WebSocket and cleanup
      if (bridge) {
        // Cleanup any event listeners on the socket
        const socket = bridge.getSocket();
        if (socket && debugMode) {
          // We can't really "restore" a modified socket's methods,
          // but we can remove our event listeners
          try {
            socket.removeEventListener("message", () => {});
          } catch (e) {
            // ignore errors during cleanup
          }
        }

        bridge.disconnect();
      }
    };

    // Expose control methods to parent component if callback provided
    if (onSetupController) {
      const controller: {
        setLed: (x: number, y: number, s: number) => Promise<boolean>;
        setAll: (s: number) => Promise<boolean>;
        setMap: (
          x_offset: number,
          y_offset: number,
          data: number[][],
        ) => Promise<boolean>;
        highlightRow: (row: number, brightness?: number) => Promise<void>;
        setParameterValue: (
          row: number,
          column: number,
          brightness?: number,
        ) => Promise<void>;
        drawRowPattern: (row: number, pattern: number[]) => Promise<void>;
      } = {
        setLed: (x: number, y: number, s: number) => {
          // Update local state for visual display
          const index = y * 16 + x;
          const newGridState = [...gridState.value];
          newGridState[index] = s;
          gridState.value = newGridState;

          // Send to grid
          return bridge.set(x, y, s);
        },
        setAll: (s: number) => {
          // Update local state for visual display
          gridState.value = Array(16 * 8).fill(s);

          // Send to grid
          return bridge.all(s);
        },
        setMap: (x_offset: number, y_offset: number, data: number[][]) => {
          // Update local state for visual display
          const newGridState = [...gridState.value];

          for (let y = 0; y < data.length; y++) {
            for (let x = 0; x < data[0].length; x++) {
              const gridX = x + x_offset;
              const gridY = y + y_offset;

              if (gridX >= 0 && gridX < 16 && gridY >= 0 && gridY < 8) {
                const index = gridY * 16 + gridX;
                newGridState[index] = data[y][x];
              }
            }
          }

          gridState.value = newGridState;

          // Send to grid
          return bridge.map(x_offset, y_offset, data);
        },

        // Expose the new methods from componentRef
        highlightRow: componentRef.current.highlightRow,
        setParameterValue: componentRef.current.setParameterValue,
        drawRowPattern: componentRef.current.drawRowPattern,
      };

      onSetupController?.(controller);
    }

    // Clean up on unmount
    return () => {
      if (bridge) {
        bridge.disconnect();
      }
    };
  }, [host, port]);

  // Connect or disconnect from the grid
  const toggleConnection = () => {
    if (gridBridge.value) {
      if (isConnected.value) {
        gridBridge.value.disconnect();
      } else {
        connectionInfo.value =
          `Connecting to ${gridBridge.value.getServerUrl()}...`;
        connectionError.value = null;
        gridBridge.value.connect()
          .then((success: boolean) => {
            if (success) {
              connectionInfo.value =
                `Connected to ${gridBridge.value.getServerUrl()}`;
            } else {
              connectionInfo.value =
                `Failed to connect to ${gridBridge.value.getServerUrl()}`;
            }
          })
          .catch((error: Error) => {
            connectionInfo.value = `Error: ${error.message}`;
            connectionError.value = error.message;
          });
      }
    }
  };

  // Render a simplified visual grid representation without redundant controls
  return (
    <div>
      {/* Only show the connect button if not connected */}
      {!isConnected.value && (
        <button
          type="button"
          class="connection-toggle connect"
          style="margin-bottom: 15px;"
          onClick={toggleConnection}
        >
          Connect to Grid
        </button>
      )}

      {connectionError.value && (
        <div
          class="connection-error"
          style="margin-bottom: 15px; max-height: 150px;"
        >
          <div class="error-message">{connectionError.value}</div>
          <div class="error-help">
            <strong>Check if:</strong>
            <ol>
              <li>The Swift app is running</li>
              <li>The WebSocket server is started on port {serverPort}</li>
            </ol>
          </div>
        </div>
      )}

      {/* Grid controls */}
      <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 10px;">
        <button
          type="button"
          class="grid-control-button"
          style="background-color: #444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; min-width: 100px;"
          onClick={async () => {
            if (gridBridge.value && isConnected.value) {
              await gridBridge.value.all(0);
              // Update local grid state
              gridState.value = Array(16 * 8).fill(0);
            }
          }}
          disabled={!isConnected.value}
        >
          Clear Grid
        </button>

        <button
          type="button"
          class="grid-control-button"
          style="background-color: #444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; min-width: 100px;"
          onClick={async () => {
            if (gridBridge.value && isConnected.value) {
              // First clear the grid
              await gridBridge.value.all(0);
              gridState.value = Array(16 * 8).fill(0);

              // Create a checkerboard pattern
              const newGridState = [...gridState.value];
              for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 16; x++) {
                  if ((x + y) % 2 === 0) {
                    const index = y * 16 + x;
                    await gridBridge.value.set(x, y, 15);
                    newGridState[index] = 15;
                    // Update state incrementally for visual effect
                    gridState.value = [...newGridState];
                    await new Promise((resolve) => setTimeout(resolve, 10));
                  }
                }
              }
            }
          }}
          disabled={!isConnected.value}
        >
          Test Pattern
        </button>
      </div>

      {/* Visual grid representation */}
      <div
        class="grid-display"
        style="border: 1px solid #666; padding: 5px; border-radius: 4px; background-color: #333;"
      >
        {Array.from({ length: 8 }).map((_, y) => (
          <div class="grid-row" key={y}>
            {Array.from({ length: 16 }).map((_, x) => {
              const index = y * 16 + x;
              const brightness = gridState.value[index];

              return (
                <div
                  class={`grid-cell ${brightness > 0 ? "active" : ""}`}
                  key={`${x}-${y}`}
                  style={{
                    opacity: brightness > 0 ? brightness / 15 : 1,
                    backgroundColor: brightness > 0
                      ? `rgb(255, ${255 - brightness * 16}, 0)`
                      : "#444",
                    width: "26px",
                    height: "26px",
                    margin: "1px",
                    borderRadius: "3px",
                    cursor: isConnected.value ? "pointer" : "default",
                  }}
                  onClick={async () => {
                    // Only allow interaction when connected
                    if (!isConnected.value || !gridBridge.value) return;

                    // Toggle the LED state
                    const newBrightness = brightness > 0 ? 0 : 15;
                    await gridBridge.value.set(x, y, newBrightness);

                    // Update local state - create a new array to trigger reactivity
                    const newGridState = [...gridState.value];
                    newGridState[index] = newBrightness;
                    gridState.value = newGridState;
                  }}
                  title={`x: ${x}, y: ${y}, brightness: ${brightness}${
                    isConnected.value ? " (click to toggle)" : ""
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Only show disconnect button if connected */}
      {isConnected.value && (
        <button
          type="button"
          class="connection-toggle disconnect"
          style="margin-top: 15px;"
          onClick={toggleConnection}
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
