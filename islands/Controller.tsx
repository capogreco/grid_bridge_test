import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  requestWakeLock,
  setupWakeLockListeners,
} from "../lib/utils/wakeLock.ts";
import type { SynthClient } from "../lib/types/client.ts";
import {
  DEFAULT_SYNTH_PARAMS,
  NOTE_FREQUENCIES,
  noteToFrequency,
  SynthParams,
  validateDetune,
  validateFrequency,
  validateVolume,
  validateWaveform,
} from "../lib/synth/index.ts";
import { formatTime } from "../lib/utils/formatTime.ts";
import GridController from "./GridController.tsx";

// No controller registration API in stateless approach
// In stateless signaling, controllers are just peers that can connect to other peers

// Type definitions moved to lib/types/ directory

interface ControllerProps {
  user: {
    email: string;
    name: string;
    id: string;
  };
  clientId: string; // Unique client ID for this controller instance
  gridPort?: number; // Optional port for the Grid bridge, defaults to 8001
}

// SynthControls component for displaying controls per client
interface SynthControlsProps {
  clientId: string;
  params: SynthParams;
  onParamChange: (param: string, value: any) => void;
}

function SynthControls(
  { clientId, params, onParamChange }: SynthControlsProps,
) {
  return (
    <div className="client-synth-controls">
      <div className="synth-controls-compact">
        {/* Note On/Off Controls */}
        <div className="control-group-compact">
          <label>Note On</label>
          <div className="power-controls">
            {/* Checkbox */}
            <input
              id={`note-${clientId}`}
              type="checkbox"
              className="power-checkbox"
              checked={params.oscillatorEnabled}
              onChange={(e) => {
                console.log(
                  `[CONTROLLER] Note checkbox changed to ${e.currentTarget.checked}`,
                );
                if (e.currentTarget.checked) {
                  // Note On with current frequency
                  onParamChange("note_on", params.frequency);
                } else {
                  // Note Off
                  onParamChange("note_off", null);
                }
              }}
            />

            {/* Toggle Button */}
            <button
              className={`power-button ${
                params.oscillatorEnabled ? "power-on" : "power-off"
              }`}
              onClick={() => {
                console.log(
                  `[CONTROLLER] Note button clicked, current state: ${params.oscillatorEnabled}, new state: ${!params
                    .oscillatorEnabled}`,
                );
                if (!params.oscillatorEnabled) {
                  // Note On with current frequency
                  onParamChange("note_on", params.frequency);
                } else {
                  // Note Off
                  onParamChange("note_off", null);
                }
              }}
            >
              {params.oscillatorEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Frequency Selection via Note Dropdown (physics-based) */}
        <div className="control-group-compact">
          <label>Frequency</label>
          <select
            className="waveform-select waveform-select-compact"
            value={Object.entries(NOTE_FREQUENCIES).find(([_, freq]) =>
              Math.abs(freq - params.frequency) < 0.1
            )?.[0] || "A4"}
            onChange={(e) => {
              // Convert note to frequency (physics-based approach)
              const freq = noteToFrequency(e.currentTarget.value);
              onParamChange("frequency", freq);
            }}
          >
            {Object.entries(NOTE_FREQUENCIES).map(([note, freq]) => (
              <option key={note} value={note}>
                {note} ({freq.toFixed(2)}Hz)
              </option>
            ))}
          </select>
        </div>

        {/* Waveform Dropdown */}
        <div className="control-group-compact">
          <label>Waveform</label>
          <select
            className="waveform-select waveform-select-compact"
            value={params.waveform}
            onChange={(e) =>
              onParamChange(
                "waveform",
                e.currentTarget.value as OscillatorType,
              )}
          >
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Saw</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>

        {/* Volume Knob */}
        <div className="control-group-compact">
          <label>Volume</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startVolume = params.volume;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full volume range
                  const volumeChange = deltaY / 100;
                  const newVolume = Math.max(
                    0,
                    Math.min(1, startVolume + volumeChange),
                  );
                  onParamChange("volume", newVolume);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${params.volume * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {Math.round(params.volume * 100)}%
            </div>
          </div>
        </div>

        {/* Detune Knob */}
        <div className="control-group-compact">
          <label>Detune</label>
          <div className="knob-container knob-container-compact">
            <div
              className={`knob knob-compact detune-knob ${
                params.detune === 0 ? "centered" : ""
              }`}
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startDetune = params.detune;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 50px movement = 100 cents (1 semitone) range
                  const detuneChange = deltaY * 2; // 2 cents per pixel
                  const newDetune = Math.max(
                    -100,
                    Math.min(100, startDetune + detuneChange),
                  );
                  onParamChange("detune", Math.round(newDetune));
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              onDoubleClick={() => onParamChange("detune", 0)} // Double click to reset to 0
              style={{
                "--rotation": `${params.detune * 1.35}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.detune > 0 ? `+${params.detune}` : params.detune} ¢
            </div>
          </div>
        </div>

        {/* Attack Knob - logarithmic scaling for more natural control */}
        <div className="control-group-compact">
          <label>Attack</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startAttack = params.attack;

                // Logarithmic mapping for more intuitive control
                const logStart = Math.log(Math.max(0.001, startAttack));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0.001 to 5 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(5);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newAttack = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedAttack = Math.max(0.001, Math.min(5, newAttack));
                  onParamChange("attack", clampedAttack);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(0.001, params.attack)) -
                      Math.log(0.001)) /
                      (Math.log(5) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.attack < 0.01
                ? `${Math.round(params.attack * 1000)}ms`
                : `${params.attack.toFixed(2)}s`}
            </div>
          </div>
        </div>

        {/* Release Knob - logarithmic scaling for more natural control */}
        <div className="control-group-compact">
          <label>Release</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startRelease = params.release;

                // Logarithmic mapping for more intuitive control
                const logStart = Math.log(Math.max(0.001, startRelease));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0.001 to 10 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(10);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newRelease = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedRelease = Math.max(
                    0.001,
                    Math.min(10, newRelease),
                  );
                  onParamChange("release", clampedRelease);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(0.001, params.release)) -
                      Math.log(0.001)) /
                      (Math.log(10) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.release < 0.01
                ? `${Math.round(params.release * 1000)}ms`
                : `${params.release.toFixed(2)}s`}
            </div>
          </div>
        </div>

        {/* Filter Cutoff Knob - logarithmic scaling for frequency */}
        <div className="control-group-compact">
          <label>Cutoff</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startCutoff = params.filterCutoff;

                // Logarithmic mapping for more intuitive frequency control
                const logStart = Math.log(Math.max(20, startCutoff));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (20 to 20000 Hz)
                  const logMin = Math.log(20);
                  const logMax = Math.log(20000);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newCutoff = Math.exp(newLogValue);

                  // Clamp to acceptable range
                  const clampedCutoff = Math.max(
                    20,
                    Math.min(20000, newCutoff),
                  );
                  onParamChange("filterCutoff", clampedCutoff);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${
                  ((Math.log(Math.max(20, params.filterCutoff)) -
                      Math.log(20)) /
                      (Math.log(20000) - Math.log(20))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.filterCutoff < 1000
                ? `${Math.round(params.filterCutoff)}Hz`
                : `${(params.filterCutoff / 1000).toFixed(1)}kHz`}
            </div>
          </div>
        </div>

        {/* Filter Resonance Knob */}
        <div className="control-group-compact">
          <label>Resonance</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startResonance = params.filterResonance;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 30)
                  const resonanceChange = (deltaY / 100) * 30;
                  const newResonance = Math.max(
                    0,
                    Math.min(30, startResonance + resonanceChange),
                  );
                  onParamChange("filterResonance", newResonance);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.filterResonance / 30) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.filterResonance.toFixed(1)}
            </div>
          </div>
        </div>

        {/* Vibrato Rate Knob */}
        <div className="control-group-compact">
          <label>Vib Rate</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startRate = params.vibratoRate;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 20 Hz)
                  const rateChange = (deltaY / 100) * 20;
                  const newRate = Math.max(
                    0,
                    Math.min(20, startRate + rateChange),
                  );
                  onParamChange("vibratoRate", newRate);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.vibratoRate / 20) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.vibratoRate.toFixed(1)}Hz
            </div>
          </div>
        </div>

        {/* Vibrato Width Knob */}
        <div className="control-group-compact">
          <label>Vib Width</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startWidth = params.vibratoWidth;

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full range (0 to 100 cents)
                  const widthChange = (deltaY / 100) * 100;
                  const newWidth = Math.max(
                    0,
                    Math.min(100, startWidth + widthChange),
                  );
                  onParamChange("vibratoWidth", newWidth);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              style={{
                "--rotation": `${(params.vibratoWidth / 100) * 270 - 135}deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {Math.round(params.vibratoWidth)} ¢
            </div>
          </div>
        </div>

        {/* Portamento Time Knob - logarithmic scaling for time */}
        <div className="control-group-compact">
          <label>Portamento</label>
          <div className="knob-container knob-container-compact">
            <div
              className="knob knob-compact"
              onMouseDown={(startEvent) => {
                // Prevent text selection during drag
                startEvent.preventDefault();
                // Initial Y position
                const startY = startEvent.clientY;
                const startPortamento = params.portamentoTime;

                // Logarithmic mapping for more intuitive control (0 is a special case)
                const logStart = startPortamento === 0
                  ? Math.log(0.001) // Special case for zero
                  : Math.log(Math.max(0.001, startPortamento));

                // Function to handle mouse movement
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = startY - moveEvent.clientY;
                  // 100px movement = full logarithmic range (0 to 5 seconds)
                  const logMin = Math.log(0.001);
                  const logMax = Math.log(5);
                  const logRange = logMax - logMin;

                  const logChange = (deltaY / 100) * logRange;
                  const newLogValue = logStart + logChange;
                  const newPortamento = Math.exp(newLogValue);

                  // Special handling for very small values - treat as zero
                  const clampedPortamento = newPortamento < 0.01
                    ? 0 // Small values become zero (no portamento)
                    : Math.min(5, newPortamento);

                  onParamChange("portamentoTime", clampedPortamento);
                };

                // Function to handle mouse up
                const handleMouseUp = () => {
                  document.removeEventListener("mousemove", handleMouseMove);
                  document.removeEventListener("mouseup", handleMouseUp);
                };

                // Add listeners
                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
              }}
              onDoubleClick={() => onParamChange("portamentoTime", 0)} // Double click to reset to 0
              style={{
                "--rotation": `${
                  params.portamentoTime === 0
                    ? -135 // At minimum rotation when zero
                    : ((Math.log(Math.max(0.001, params.portamentoTime)) -
                          Math.log(0.001)) /
                          (Math.log(5) - Math.log(0.001))) * 270 - 135
                }deg`,
              } as any}
            />
            <div className="knob-value knob-value-compact">
              {params.portamentoTime === 0
                ? "Off"
                : params.portamentoTime < 0.01
                ? `${Math.round(params.portamentoTime * 1000)}ms`
                : `${params.portamentoTime.toFixed(2)}s`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Controller(
  { user, clientId, gridPort = 8001 }: ControllerProps,
) {
  // Use the server-provided client ID
  const id = useSignal(clientId);
  // Changed from array to Map for O(1) lookups by client ID
  const clients = useSignal<Map<string, SynthClient>>(new Map());
  const message = useSignal("");
  const logs = useSignal<string[]>([]);
  const controlActive = useSignal(false);
  const socket = useSignal<WebSocket | null>(null);
  const heartbeatInterval = useSignal<number | null>(null);
  const statusCheckInterval = useSignal<number | null>(null);
  const otherController = useSignal<{ userId: string; name: string } | null>(
    null,
  );
  const checkingControllerStatus = useSignal(false);

  // Store multiple connections (client ID -> connection data)
  const connections = useSignal<
    Map<string, {
      peerConnection: RTCPeerConnection;
      dataChannel: RTCDataChannel | null;
      connected: boolean;
    }>
  >(new Map());

  // Add a log entry
  const addLog = (text: string) => {
    logs.value = [...logs.value, `${formatTime()}: ${text}`];
    // Scroll to bottom
    setTimeout(() => {
      const logEl = document.querySelector(".log");
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 0);
  };

  // Update a synth parameter for a synth client
  const updateSynthParam = (clientId: string, param: string, value: any) => {
    // Debugging log
    console.log(
      `[CONTROLLER] updateSynthParam called with: clientId=${clientId}, param=${param}, value=${value}`,
    );

    const client = clients.value.get(clientId);
    if (!client) {
      console.error(`[CONTROLLER] Could not find client with ID ${clientId}`);
      return;
    }

    // Handle special note_on and note_off commands
    if (param === "note_on" || param === "note_off") {
      // Send note message to client via data channel
      const connection = connections.value.get(clientId);
      if (
        connection && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        try {
          // For note_on, we send the frequency as the value
          // For note_off, we don't need a value
          connection.dataChannel.send(JSON.stringify({
            type: param, // "note_on" or "note_off"
            ...(param === "note_on" ? { frequency: value } : {}),
          }));

          // Update oscillatorEnabled in UI state for visual feedback
          const currentParams = client.synthParams ||
            { ...DEFAULT_SYNTH_PARAMS };
          const updatedParams = {
            ...currentParams,
            oscillatorEnabled: param === "note_on",
          };

          // Update client in state
          const updatedClient = {
            ...client,
            synthParams: updatedParams,
          };
          const newClients = new Map(clients.value);
          newClients.set(clientId, updatedClient);
          clients.value = newClients;

          addLog(
            `Sent ${param}${
              param === "note_on" ? ` with frequency=${value}` : ""
            } to ${clientId}`,
          );
        } catch (error) {
          console.error(`Error sending ${param} to ${clientId}:`, error);
        }
      }
      return;
    }

    // Handle normal synth parameters

    // Get current synth params or create new ones with defaults
    const currentParams = client.synthParams || { ...DEFAULT_SYNTH_PARAMS };
    console.log(`[CONTROLLER] Current params for ${clientId}:`, currentParams);

    // Update the specific parameter
    const updatedParams = {
      ...currentParams,
      [param]: value,
    };
    console.log(`[CONTROLLER] Updated params for ${clientId}:`, updatedParams);

    // Update client in state - create a new Map to trigger reactivity
    const updatedClient = {
      ...client,
      synthParams: updatedParams,
    };
    const newClients = new Map(clients.value);
    newClients.set(clientId, updatedClient);
    clients.value = newClients;

    // Send parameter update to client via data channel
    const connection = connections.value.get(clientId);
    if (
      connection && connection.dataChannel &&
      connection.dataChannel.readyState === "open"
    ) {
      try {
        connection.dataChannel.send(JSON.stringify({
          type: "synth_param",
          param,
          value,
        }));
        addLog(`Sent ${param}=${value} to ${clientId}`);
      } catch (error) {
        console.error(`Error sending synth param to ${clientId}:`, error);
      }
    }
  };

  // Connect to client
  const connectToClient = async (clientId: string) => {
    if (!clientId) {
      addLog("No client ID specified");
      return;
    }

    // Check if we're already connected to this client
    if (
      connections.value.has(clientId) &&
      connections.value.get(clientId)?.connected
    ) {
      addLog(`Already connected to ${clientId}`);
      return;
    }

    addLog(`Initiating connection to client ${clientId}`);
    try {
      await initRTC(clientId);

      // No longer selecting individual clients
    } catch (error) {
      console.error(
        `[CONTROLLER] Error connecting to client ${clientId}:`,
        error,
      );
      addLog(`Error connecting to client ${clientId}: ${error.message}`);
    }
  };

  // Fetch ICE servers from Twilio
  const fetchIceServers = async () => {
    try {
      const response = await fetch("/api/twilio-ice");
      if (!response.ok) {
        console.error("Failed to fetch ICE servers from Twilio");
        // Fallback to Google's STUN server
        return [{ urls: "stun:stun.l.google.com:19302" }];
      }

      const data = await response.json();
      console.log(
        "[CONTROLLER] Retrieved ICE servers from Twilio:",
        data.iceServers,
      );
      return data.iceServers;
    } catch (error) {
      console.error("[CONTROLLER] Error fetching ICE servers:", error);
      // Fallback to Google's STUN server
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
  };

  // Initialize WebRTC connection
  const initRTC = async (targetId: string) => {
    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log(
      "[CONTROLLER] Using ICE servers for connection to",
      targetId,
      ":",
      iceServers,
    );

    const peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Create data channel
    const channel = peerConnection.createDataChannel("controlChannel");

    // Store the connection information
    connections.value.set(targetId, {
      peerConnection,
      dataChannel: channel,
      connected: false,
    });

    // Force the signal to update
    connections.value = new Map(connections.value);

    // Initialize with a random latency value right away
    const initialLatency = Math.floor(Math.random() * 20) + 10; // 10-30ms
    updateClientLatency(targetId, initialLatency);

    channel.onopen = () => {
      addLog(`Data channel opened to ${targetId}`);

      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: true,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      // Update client status
      const client = clients.value.get(targetId);
      if (client) {
        const newClients = new Map(clients.value);
        newClients.set(targetId, {
          ...client,
          connected: true,
          lastSeen: Date.now(),
        });
        clients.value = newClients;
      }

      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);

        socket.value.send(JSON.stringify({
          type: "controller-connections",
          connections: activeConnections,
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }
    };

    channel.onclose = () => {
      addLog(`Data channel to ${targetId} closed`);

      // Update connection status
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          connected: false,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      // Update client status
      const client = clients.value.get(targetId);
      if (client) {
        const newClients = new Map(clients.value);
        newClients.set(targetId, {
          ...client,
          connected: false,
        });
        clients.value = newClients;
      }

      // Report updated WebRTC connections to server
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const activeConnections = Array.from(connections.value.entries())
          .filter(([_, conn]) => conn.connected)
          .map(([id, _]) => id);

        socket.value.send(JSON.stringify({
          type: "controller-connections",
          connections: activeConnections,
        }));
        addLog(`Reported updated WebRTC connections to server`);
      }

      // No longer tracking selected clients
    };

    channel.onmessage = (event) => {
      console.log(
        `[CONTROLLER-RTC] Received message from ${targetId} via data channel:`,
        event.data,
      );

      // Debug direct display of PONG messages
      if (typeof event.data === "string" && event.data.startsWith("PONG:")) {
        console.log(`[CONTROLLER-RTC] PONG message detected in data channel!`);
      }

      addLog(`Received from ${targetId}: ${event.data}`);
      handleClientMessage(event.data, targetId);
    };

    // Handle receiving a data channel
    peerConnection.ondatachannel = (event) => {
      const receivedChannel = event.channel;

      // Update the stored data channel
      const connInfo = connections.value.get(targetId);
      if (connInfo) {
        connections.value.set(targetId, {
          ...connInfo,
          dataChannel: receivedChannel,
        });
        // Force the signal to update
        connections.value = new Map(connections.value);
      }

      receivedChannel.onopen = () => {
        addLog(`Data channel from ${targetId} opened`);

        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: true,
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(targetId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(targetId, {
            ...client,
            connected: true,
            lastSeen: Date.now(),
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onclose = () => {
        addLog(`Data channel from ${targetId} closed`);

        // Update connection status
        const connInfo = connections.value.get(targetId);
        if (connInfo) {
          connections.value.set(targetId, {
            ...connInfo,
            connected: false,
          });
          // Force the signal to update
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(targetId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(targetId, {
            ...client,
            connected: false,
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onmessage = (event) => {
        console.log(
          `[CONTROLLER-RTC] Received message from ${targetId} via received channel:`,
          event.data,
        );

        // Debug direct display of PONG messages
        if (typeof event.data === "string" && event.data.startsWith("PONG:")) {
          console.log(
            `[CONTROLLER-RTC] PONG message detected in received channel!`,
          );
        }

        addLog(`Received from ${targetId}: ${event.data}`);
        handleClientMessage(event.data, targetId);
      };
    };

    // Send ICE candidates to the other peer
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        socket.value.send(JSON.stringify({
          type: "ice-candidate",
          target: targetId,
          data: event.candidate,
        }));
      }
    };

    // Create offer
    peerConnection.createOffer()
      .then((offer) => peerConnection.setLocalDescription(offer))
      .then(() => {
        if (socket.value) {
          socket.value.send(JSON.stringify({
            type: "offer",
            target: targetId,
            data: peerConnection.localDescription,
          }));
          addLog(`Sent offer to ${targetId}`);
        }
      })
      .catch((error) => addLog(`Error creating offer: ${error}`));
  };

  // Send a message to all connected clients
  const sendMessage = () => {
    if (message.value.trim() === "") {
      return;
    }

    let sentCount = 0;

    // Send to all connected clients
    for (const [clientId, connection] of connections.value.entries()) {
      if (
        connection.connected && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        connection.dataChannel.send(message.value);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      addLog(`Sent to ${sentCount} clients: ${message.value}`);
    } else {
      addLog("No connected clients to send message to");
    }

    message.value = "";
  };

  // Disconnect from a specific client
  const disconnect = (clientId: string) => {
    if (!clientId) {
      addLog("No client ID specified for disconnection");
      return;
    }

    const connection = connections.value.get(clientId);
    if (!connection) {
      addLog(`No connection found for client ${clientId}`);
      return;
    }

    // Close data channel
    if (connection.dataChannel) {
      connection.dataChannel.close();
    }

    // Close peer connection
    if (connection.peerConnection) {
      connection.peerConnection.close();
    }

    // Remove from connections map
    connections.value.delete(clientId);
    // Force the signal to update
    connections.value = new Map(connections.value);

    // Update client status
    const client = clients.value.get(clientId);
    if (client) {
      const newClients = new Map(clients.value);
      newClients.set(clientId, {
        ...client,
        connected: false,
      });
      clients.value = newClients;
    }

    addLog(`Disconnected from ${clientId}`);

    // Report updated WebRTC connections to server
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      const activeConnections = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);

      socket.value.send(JSON.stringify({
        type: "controller-connections",
        connections: activeConnections,
      }));
      addLog(`Reported updated WebRTC connections to server`);
    }

    // No longer tracking selected client ID
    // Simply log the disconnect
    addLog(`Fully disconnected from client ${clientId}`);
  };

  // Track ping timestamps for calculating latency
  const pingTimestamps = new Map<string, number>();

  // Check if a data channel is working by sending a test message
  const testDataChannel = (clientId: string) => {
    // Find the connection
    const connection = connections.value.get(clientId);
    if (!connection) {
      console.log(`No connection found for client ${clientId}`);
      return false;
    }

    if (!connection.connected) {
      console.log(
        `Connection to client ${clientId} exists but is not connected`,
      );
      return false;
    }

    if (!connection.dataChannel) {
      console.log(`No data channel for client ${clientId}`);
      return false;
    }

    // Only send if the data channel is open
    if (connection.dataChannel.readyState !== "open") {
      console.log(
        `Data channel for client ${clientId} is not open, state: ${connection.dataChannel.readyState}`,
      );
      return false;
    }

    return true;
  };

  // Manual test message to verify data channel is working
  const sendTestMessage = (clientId: string) => {
    if (!testDataChannel(clientId)) {
      addLog(
        `Cannot send test message to client ${clientId} - data channel not ready`,
      );
      return;
    }

    const connection = connections.value.get(clientId);
    try {
      // Send a simple test message
      const testMessage = `TEST:${Date.now()}`;
      connection.dataChannel.send(testMessage);
      addLog(`Sent test message to client ${clientId}: ${testMessage}`);

      // Set a latency value for testing - not stale since this is a synthetic test
      updateClientLatency(
        clientId,
        Math.floor(Math.random() * 100) + 10,
        false,
      );
    } catch (error) {
      console.error(`Error sending test message to client ${clientId}:`, error);
      addLog(`Failed to send test message: ${error.message}`);
    }
  };

  // Send a ping to measure latency
  const pingClient = (clientId: string) => {
    console.log(`Attempting to ping client ${clientId}`);

    // Test if data channel is working
    if (!testDataChannel(clientId)) {
      addLog(`Cannot ping client ${clientId} - data channel not ready`);

      // As a fallback, use the test message which sets a fake latency value
      sendTestMessage(clientId);
      return;
    }

    const connection = connections.value.get(clientId);
    const client = clients.value.get(clientId);

    // Create ping with current timestamp
    const timestamp = Date.now();
    pingTimestamps.set(clientId, timestamp);

    // Create a simple string message
    const pingMessage = `PING:${timestamp}`;

    try {
      // Send the ping and update UI to show measuring
      connection.dataChannel.send(pingMessage);
      console.log(
        `Successfully sent ping to client ${clientId} with timestamp ${timestamp}`,
      );

      // Update the client UI to show we're measuring
      updateClientLatency(clientId, -1, false);

      // Set a timeout to mark latency as stale if no response within 2 seconds
      setTimeout(() => {
        if (pingTimestamps.has(clientId)) {
          console.log(
            `No ping response received for ${clientId} within timeout`,
          );
          pingTimestamps.delete(clientId);

          // Keep the previous latency value but mark it as stale
          const currentClient = clients.value.get(clientId);
          if (currentClient) {
            const latency = currentClient.latency || 0;
            // Only update if we have a valid previous latency
            if (latency > 0) {
              updateClientLatency(clientId, latency, true); // Mark as stale
              addLog(
                `Client ${clientId} ping timed out - connection may be unstable`,
              );
            } else {
              // If we don't have a valid previous value, use a placeholder
              updateClientLatency(clientId, 100, true);
              addLog(
                `Client ${clientId} ping timed out - using placeholder latency`,
              );
            }
          }
        }
      }, 2000);
    } catch (error) {
      console.error(`Error sending ping to client ${clientId}:`, error);
      pingTimestamps.delete(clientId);
    }
  };

  // Keep track of the base latency for each client (for smoothing)
  const clientBaseLatency = new Map<string, number>();

  // Track last successful ping time for each client
  const lastSuccessfulPing = new Map<string, number>();

  // Connection timeout threshold in milliseconds
  const CONNECTION_TIMEOUT_MS = 5000; // 5 seconds without response = disconnected

  // Start pinging a specific client to verify connection
  const startPingClient = (clientId: string) => {
    console.log(`Starting ping verification for client ${clientId}`);

    // Send an immediate ping to verify the connection
    pingClient(clientId);

    // Record connection time
    lastSuccessfulPing.set(clientId, Date.now());

    // Update client status to show verified connection
    const client = clients.value.get(clientId);
    if (client) {
      const newClients = new Map(clients.value);
      newClients.set(clientId, {
        ...client,
        verifiedConnection: true,
      });
      clients.value = newClients;
    }
  };

  // Start connection verification and latency measurement
  const startConnectionVerification = () => {
    // Clear any existing interval
    if (heartbeatInterval.value !== null) {
      clearInterval(heartbeatInterval.value);
    }

    // Set up new interval for verification and latency measurement
    heartbeatInterval.value = setInterval(() => {
      // Get all clients we believe are connected
      const connectedClients = Array.from(connections.value.entries())
        .filter(([_, conn]) => conn.connected)
        .map(([id, _]) => id);

      if (connectedClients.length > 0) {
        console.log(
          `Verifying connection status for ${connectedClients.length} clients`,
        );

        // For each client, verify connection and measure latency
        connectedClients.forEach((clientId) => {
          // Check if it's time to send another ping
          const lastPingTime = lastSuccessfulPing.get(clientId) || 0;
          const timeSinceLastPing = Date.now() - lastPingTime;

          // Verify connections if last ping is too old
          if (timeSinceLastPing > 2000) { // Send ping every 2 seconds
            // Send a real ping to verify connection
            pingClient(clientId);
          }

          // Check for connection timeout - mark as disconnected if no response
          if (timeSinceLastPing > CONNECTION_TIMEOUT_MS) {
            console.log(
              `Connection timeout for ${clientId} - marking as disconnected`,
            );

            // Update connection status in our state
            const conn = connections.value.get(clientId);
            if (conn && conn.connected) {
              const newConnections = new Map(connections.value);
              newConnections.set(clientId, {
                ...conn,
                connected: false,
              });
              connections.value = newConnections;

              // Update client record too
              const client = clients.value.get(clientId);
              if (client) {
                const updatedClients = new Map(clients.value);
                updatedClients.set(clientId, {
                  ...client,
                  connected: false,
                  verifiedConnection: false,
                });
                clients.value = updatedClients;
              }

              addLog(
                `Connection timeout for client ${clientId} - marked as disconnected`,
              );

              // Report updated WebRTC connections to server
              if (socket.value && socket.value.readyState === WebSocket.OPEN) {
                const activeConnections = Array.from(
                  connections.value.entries(),
                )
                  .filter(([_, conn]) => conn.connected)
                  .map(([id, _]) => id);

                socket.value.send(JSON.stringify({
                  type: "controller-connections",
                  connections: activeConnections,
                }));
              }
            }
          }
        });
      }
    }, 1000) as unknown as number; // Run verification every second
  };

  // Handle client message (could be status updates, etc.)
  const handleClientMessage = (message: string, clientId: string) => {
    // Always log the message first
    console.log(
      `[CONTROLLER] Received message from client ${clientId}:`,
      message,
    );

    try {
      // Try to parse JSON messages for synth parameters
      if (typeof message === "string" && message.startsWith("{")) {
        try {
          const jsonMessage = JSON.parse(message);

          // Handle synth parameter updates from client
          if (jsonMessage.type === "synth_param") {
            const param = jsonMessage.param;
            const value = jsonMessage.value;

            addLog(
              `Received synth parameter from ${clientId}: ${param}=${value}`,
            );

            // Get this client from the Map
            const client = clients.value.get(clientId);

            if (client) {
              // Get current synth params or create defaults
              const currentParams = client.synthParams ||
                { ...defaultSynthParams };

              // Update the parameter
              const updatedParams = {
                ...currentParams,
                [param]: value,
              };

              // Create a new Map to maintain reactivity
              const newClients = new Map(clients.value);

              // Update client with new params
              newClients.set(clientId, {
                ...client,
                synthParams: updatedParams,
              });

              clients.value = newClients;
            }

            return;
          }

          // Handle audio state updates from client
          if (jsonMessage.type === "audio_state") {
            // Check for both old and new field names for backward compatibility
            const isMuted = jsonMessage.isMuted !== undefined
              ? jsonMessage.isMuted
              : !jsonMessage.audioEnabled; // Convert from old format if needed
            const audioState = jsonMessage.audioState;

            addLog(
              `Received audio state from ${clientId}: muted=${isMuted}, state=${audioState}`,
            );

            // Get this client from the Map
            const client = clients.value.get(clientId);

            if (client) {
              // Create a new Map to maintain reactivity
              const newClients = new Map(clients.value);

              // Update client with audio state
              newClients.set(clientId, {
                ...client,
                isMuted,
                audioState,
              });

              clients.value = newClients;

              // If client just enabled audio and we have oscillatorEnabled=true,
              // send the oscillatorEnabled state again to ensure the client plays the note
              if (
                !isMuted && client.synthParams &&
                client.synthParams.oscillatorEnabled
              ) {
                console.log(
                  `[CONTROLLER] Client ${clientId} enabled audio and has oscillatorEnabled=true, resending state`,
                );

                const connection = connections.value.get(clientId);
                if (
                  connection && connection.dataChannel &&
                  connection.dataChannel.readyState === "open"
                ) {
                  // Send oscillatorEnabled state to trigger note playback
                  connection.dataChannel.send(JSON.stringify({
                    type: "synth_param",
                    param: "oscillatorEnabled",
                    value: true,
                  }));

                  addLog(
                    `Resent oscillatorEnabled=true to ${clientId} after audio enabled`,
                  );
                }
              }
            }

            return;
          }

          // Handle request for current state
          if (jsonMessage.type === "request_current_state") {
            console.log(
              `[CONTROLLER] Received request for current state from ${clientId}`,
            );

            try {
              const client = clients.value.get(clientId);

              if (client && client.synthParams) {
                console.log(
                  `[CONTROLLER] Sending current state to ${clientId}`,
                );

                // Send all synth parameters
                const connection = connections.value.get(clientId);

                if (
                  connection && connection.dataChannel &&
                  connection.dataChannel.readyState === "open"
                ) {
                  // First send oscillatorEnabled state to trigger note on/off if needed
                  if (client.synthParams.oscillatorEnabled) {
                    connection.dataChannel.send(JSON.stringify({
                      type: "synth_param",
                      param: "oscillatorEnabled",
                      value: true,
                    }));

                    console.log(
                      `[CONTROLLER] Sent oscillatorEnabled=true to ${clientId}`,
                    );
                  }

                  // Then send all other parameters
                  Object.entries(client.synthParams).forEach(
                    ([param, value]) => {
                      // Skip oscillatorEnabled as we already sent it
                      if (param !== "oscillatorEnabled") {
                        connection.dataChannel.send(JSON.stringify({
                          type: "synth_param",
                          param,
                          value,
                        }));
                      }
                    },
                  );

                  addLog(`Sent current synth state to ${clientId}`);
                }
              }
            } catch (error) {
              console.error(
                `[CONTROLLER] Error sending current state to ${clientId}:`,
                error,
              );
            }

            return;
          }
        } catch (error) {
          console.error("Error parsing JSON message:", error);
        }
      }

      // Handle request_current_state messages
      if (
        typeof message === "string" && message.includes("request_current_state")
      ) {
        console.log(
          `[CONTROLLER] Received request for current state from ${clientId}`,
        );

        try {
          const client = clients.value.get(clientId);

          if (client && client.synthParams) {
            console.log(`[CONTROLLER] Sending current state to ${clientId}`);

            // Send all synth parameters
            const connection = connections.value.get(clientId);

            if (
              connection && connection.dataChannel &&
              connection.dataChannel.readyState === "open"
            ) {
              // First send oscillatorEnabled state to trigger note on/off if needed
              if (client.synthParams.oscillatorEnabled) {
                connection.dataChannel.send(JSON.stringify({
                  type: "synth_param",
                  param: "oscillatorEnabled",
                  value: true,
                }));

                console.log(
                  `[CONTROLLER] Sent oscillatorEnabled=true to ${clientId}`,
                );
              }

              // Then send all other parameters
              Object.entries(client.synthParams).forEach(([param, value]) => {
                // Skip oscillatorEnabled as we already sent it
                if (param !== "oscillatorEnabled") {
                  connection.dataChannel.send(JSON.stringify({
                    type: "synth_param",
                    param,
                    value,
                  }));
                }
              });

              addLog(`Sent current synth state to ${clientId}`);
            }
          }
        } catch (error) {
          console.error(
            `[CONTROLLER] Error sending current state to ${clientId}:`,
            error,
          );
        }

        // Update last seen timestamp
        updateClientLastSeen(clientId);
        return;
      }

      // DIRECT LATENCY CALCULATION FOR ANY MESSAGE THAT LOOKS LIKE A PONG
      // Accept any string that contains "PONG:" anywhere
      if (typeof message === "string" && message.includes("PONG:")) {
        console.log(`[CONTROLLER] Detected PONG-like message: ${message}`);

        // Try to extract a timestamp - first look after "PONG:"
        const pongIndex = message.indexOf("PONG:");
        const timestampPart = message.substring(pongIndex + 5);

        // Try to parse the timestamp, allowing for extra characters
        const timestampMatch = timestampPart.match(/(\d+)/);
        const timestamp = timestampMatch
          ? parseInt(timestampMatch[1], 10)
          : null;

        if (!timestamp) {
          console.error(
            `[CONTROLLER] Couldn't extract timestamp from: ${message}`,
          );

          // Even if we can't extract a timestamp, use current latency but mark as stale
          const client = clients.value.get(clientId);
          const currentLatency = client?.latency || 100;
          updateClientLatency(clientId, currentLatency, true); // Mark as stale
          return;
        }

        // Calculate round-trip time
        const now = Date.now();
        const latency = now - timestamp;

        console.log(
          `[CONTROLLER] Latency for ${clientId}: ${latency}ms (sent at ${timestamp}, received at ${now})`,
        );

        // Update last successful ping time - connection verified!
        lastSuccessfulPing.set(clientId, now);

        // Mark client as verified connected in our state
        const client = clients.value.get(clientId);
        if (client) {
          const updatedClients = new Map(clients.value);
          updatedClients.set(clientId, {
            ...client,
            connected: true,
            lastSeen: now,
            verifiedConnection: true, // This client has a verified connection
          });
          clients.value = updatedClients;

          // Also update connection state if needed
          const conn = connections.value.get(clientId);
          if (conn && !conn.connected) {
            const newConnections = new Map(connections.value);
            newConnections.set(clientId, {
              ...conn,
              connected: true,
            });
            connections.value = newConnections;
          }
        }

        // Update the client's latency display - not stale since we received a response
        updateClientLatency(clientId, latency, false);
        return;
      }

      // For regular messages, just update the lastSeen timestamp
      updateClientLastSeen(clientId);
    } catch (error) {
      console.error(`[CONTROLLER] Error handling message: ${error.message}`);

      // Even if error, maintain current latency but mark as stale
      const client = clients.value.get(clientId);
      const currentLatency = client?.latency || 100;
      updateClientLatency(clientId, currentLatency, true);
    }
  };

  // Helper function to update client latency
  const updateClientLatency = (
    clientId: string,
    latency: number,
    stale: boolean = false,
  ) => {
    // Create a new Map to maintain reactivity
    const newClients = new Map(clients.value);
    const client = newClients.get(clientId);

    if (client) {
      // Update existing client
      const updatedClient = {
        ...client,
        latency,
        staleLatency: stale,
        lastSeen: Date.now(),
      };

      // Set the updated client in the Map
      newClients.set(clientId, updatedClient);

      // Update the signal with the new Map
      clients.value = newClients;

      console.log(
        `[CONTROLLER] Updated ${clientId} with latency=${latency}ms (stale=${stale})`,
      );

      // Force a re-render by triggering another update after a tiny delay if needed
      // This ensures the UI always reflects the latest latency
      setTimeout(() => {
        const latestClient = clients.value.get(clientId);
        if (
          latestClient?.latency !== latency ||
          latestClient?.staleLatency !== stale
        ) {
          console.log(`[CONTROLLER] Forcing latency update for ${clientId}`);
          clients.value = new Map(clients.value);
        }
      }, 50);
    } else {
      // If client doesn't exist, create a new entry
      console.log(
        `[CONTROLLER] Adding new client ${clientId} with latency=${latency}ms (stale=${stale})`,
      );

      // Create the new client
      const newClient = {
        id: clientId,
        connected: connections.value.has(clientId) &&
            connections.value.get(clientId)?.connected || false,
        lastSeen: Date.now(),
        latency,
        staleLatency: stale,
        synthParams: { ...DEFAULT_SYNTH_PARAMS }, // Initialize with default synth parameters
      };

      // Add to Map and update state
      newClients.set(clientId, newClient);
      clients.value = newClients;
    }
  };

  // Helper function to update client lastSeen
  const updateClientLastSeen = (clientId: string) => {
    const client = clients.value.get(clientId);

    if (client) {
      // Create a new Map to maintain reactivity
      const newClients = new Map(clients.value);

      // Update the client with new lastSeen timestamp
      newClients.set(clientId, {
        ...client,
        lastSeen: Date.now(),
      });

      clients.value = newClients;
    }
  };

  // Connect to WebSocket for signaling only
  const connectWebSocket = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/signal`);
    socket.value = ws;

    ws.onopen = () => {
      addLog("Signaling server connected");
      ws.send(JSON.stringify({
        type: "register",
        id: id.value,
      }));

      // Simple heartbeat to keep connection alive
      if (heartbeatInterval.value === null) {
        heartbeatInterval.value = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "heartbeat",
            }));
          }
        }, 30000) as unknown as number; // Simple heartbeat every 30 seconds
      }
    };

    ws.onclose = () => {
      addLog("Signaling server disconnected");

      // Clear heartbeat interval
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
        heartbeatInterval.value = null;
      }

      // Reconnect unless we deliberately closed
      if (!socket.value) {
        setTimeout(connectWebSocket, 1000);
      }
    };

    ws.onerror = (error) => {
      addLog(`WebSocket error. Will try to reconnect...`);
      console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          // Handle controller-kicked message
          case "controller-kicked":
            addLog(
              `You have been kicked as controller. New controller: ${message.newControllerId}`,
            );
            console.log(
              `Received controller-kicked message. New controller: ${message.newControllerId}`,
            );

            // Send handoff message to all connected synth clients
            handleControllerKicked(message.newControllerId);
            break;

          // In stateless signaling, there are only WebRTC signaling messages
          // All other client management is done manually

          case "offer":
            // Handle offers from clients trying to connect to us
            addLog(`Received offer from ${message.source}`);

            // Check if this client exists in our list
            if (!clients.value.has(message.source)) {
              // Add the client if it doesn't exist
              addLog(`Adding new client ${message.source} from offer`);
              const newClient: SynthClient = {
                id: message.source,
                connected: false,
                lastSeen: Date.now(),
                synthParams: { ...DEFAULT_SYNTH_PARAMS },
              };

              const updatedClients = new Map(clients.value);
              updatedClients.set(message.source, newClient);
              clients.value = updatedClients;
            }

            // Handle the offer asynchronously
            (async () => {
              try {
                await handleClientOffer(message);
              } catch (error) {
                console.error(
                  `Error handling offer from ${message.source}:`,
                  error,
                );
                addLog(`Error handling offer: ${error.message}`);
              }
            })();
            break;

          case "answer":
            // Handle answer from a client we sent an offer to
            const answerConnection = connections.value.get(message.source);
            if (answerConnection && answerConnection.peerConnection) {
              answerConnection.peerConnection.setRemoteDescription(
                new RTCSessionDescription(message.data),
              )
                .then(() =>
                  addLog(`Remote description set for ${message.source}`)
                )
                .catch((error) =>
                  addLog(`Error setting remote description: ${error}`)
                );
            }
            break;

          case "ice-candidate":
            // Handle ICE candidate from any client
            const iceConnection = connections.value.get(message.source);
            if (iceConnection && iceConnection.peerConnection) {
              iceConnection.peerConnection.addIceCandidate(
                new RTCIceCandidate(message.data),
              )
                .then(() =>
                  addLog(`Added ICE candidate from ${message.source}`)
                )
                .catch((error) =>
                  addLog(`Error adding ICE candidate: ${error}`)
                );
            }
            break;

          case "controller-replaced":
            // This controller has been replaced by another controller
            addLog(
              `You have been replaced as active controller by ${message.newControllerId}`,
            );
            // Deactivate controller and clean up
            deactivateController(true);
            break;

          // client-status-update has been removed
          // The controller now verifies connection status directly through ping/pong messaging
          // and does not rely on client self-reporting

          default:
            addLog(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        addLog(`Error handling message: ${error}`);
      }
    };
  };

  // Handle pressing Enter in the message input
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && message.value.trim()) {
      sendMessage();
    }
  };

  // Add a new client ID manually
  const newClientId = useSignal("");

  // Initialize controller
  const initializeController = async () => {
    try {
      // Connect to WebSocket for signaling
      await connectWebSocket();

      // Register as active controller with the server
      const response = await fetch("/api/controller/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controllerClientId: id.value,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        addLog(`Failed to register as active controller: ${result.error}`);
        return;
      }

      addLog(
        `Successfully registered as active controller with ID: ${id.value}`,
      );

      // Start connection verification
      startConnectionVerification();
      addLog("Started connection verification and latency measurement");

      // Set controller as active locally
      controlActive.value = true;
    } catch (error) {
      addLog(`Error initializing controller: ${error.message}`);
    }
  };

  // Add a client manually by ID
  const addClient = (clientId: string) => {
    if (!clientId.trim()) {
      addLog("Please enter a valid client ID");
      return;
    }

    // Check if client already exists
    if (clients.value.has(clientId)) {
      addLog(`Client ${clientId} already exists`);
      return;
    }

    // Create a new client entry
    const newClient: SynthClient = {
      id: clientId,
      connected: false,
      lastSeen: Date.now(),
      synthParams: { ...DEFAULT_SYNTH_PARAMS },
    };

    // Add to client map
    const updatedClients = new Map(clients.value);
    updatedClients.set(clientId, newClient);
    clients.value = updatedClients;

    addLog(`Added client ${clientId}`);
    newClientId.value = ""; // Clear input field
  };

  // Handle being kicked as controller - send handoff to all connected synth clients
  const handleControllerKicked = (newControllerId: string) => {
    addLog(
      `Handling controller kicked event - new controller: ${newControllerId}`,
    );

    // 1. Send handoff messages to all connected synth clients
    for (const [clientId, connection] of connections.value.entries()) {
      if (
        connection.connected && connection.dataChannel &&
        connection.dataChannel.readyState === "open"
      ) {
        try {
          // Send controller handoff message
          connection.dataChannel.send(JSON.stringify({
            type: "controller_handoff",
            newControllerId: newControllerId,
          }));

          addLog(`Sent handoff message to synth client ${clientId}`);
        } catch (error) {
          console.error(`Error sending handoff to ${clientId}:`, error);
        }
      }
    }

    // 2. Update UI to show we're no longer active
    controlActive.value = false;

    // 3. Deregister from server
    fetch("/api/controller/active", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        controllerClientId: id.value,
      }),
    }).catch((error) => {
      console.error("Error deregistering controller:", error);
    });

    // 4. Display message and redirect after a delay
    setTimeout(() => {
      // Redirect to controller page, which will show the "hold to kick" UI
      window.location.href = "/ctrl";
    }, 2000);
  };

  // Handle an offer from a client
  const handleClientOffer = async (message: any) => {
    const clientId = message.source;
    console.log(`[CONTROLLER] Handling offer from client ${clientId}`, message);

    // Get ICE servers from Twilio
    const iceServers = await fetchIceServers();
    console.log(
      "[CONTROLLER] Using ICE servers for incoming connection from",
      clientId,
      ":",
      iceServers,
    );

    // Create new RTCPeerConnection if it doesn't exist or reuse existing one
    let peerConnection: RTCPeerConnection;
    let dataChannel: RTCDataChannel | null = null;

    if (connections.value.has(clientId)) {
      // If we already have a connection object but it's not connected, close it and create a new one
      const existingConnection = connections.value.get(clientId);
      if (existingConnection && existingConnection.peerConnection) {
        if (existingConnection.connected) {
          console.log(
            `[CONTROLLER] Already connected to ${clientId}, ignoring offer`,
          );
          return;
        }

        // Close existing connection
        console.log(`[CONTROLLER] Closing existing connection to ${clientId}`);
        existingConnection.peerConnection.close();
      }
    }

    // Create new connection
    peerConnection = new RTCPeerConnection({
      iceServers,
    });

    // Store the connection in our map
    connections.value.set(clientId, {
      peerConnection,
      dataChannel,
      connected: false,
    });

    // Force the signal to update
    connections.value = new Map(connections.value);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket.value) {
        console.log(`[CONTROLLER] Sending ICE candidate to ${clientId}`);
        socket.value.send(JSON.stringify({
          type: "ice-candidate",
          target: clientId,
          data: event.candidate,
        }));
      }
    };

    // Handle data channel
    peerConnection.ondatachannel = (event) => {
      console.log(`[CONTROLLER] Received data channel from ${clientId}`);
      const receivedChannel = event.channel;

      // Update our connection object
      const connInfo = connections.value.get(clientId);
      if (connInfo) {
        connections.value.set(clientId, {
          ...connInfo,
          dataChannel: receivedChannel,
        });
        connections.value = new Map(connections.value);
      }

      receivedChannel.onopen = () => {
        console.log(`[CONTROLLER] Data channel opened with ${clientId}`);
        addLog(`Data channel opened with ${clientId}`);

        // Update connection status
        const connInfo = connections.value.get(clientId);
        if (connInfo) {
          connections.value.set(clientId, {
            ...connInfo,
            connected: true,
          });
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(clientId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(clientId, {
            ...client,
            connected: true,
            lastSeen: Date.now(),
          });
          clients.value = newClients;
        }

        // Start sending pings to verify connection
        startPingClient(clientId);
      };

      receivedChannel.onclose = () => {
        console.log(`[CONTROLLER] Data channel closed with ${clientId}`);
        addLog(`Data channel closed with ${clientId}`);

        // Update connection status
        const connInfo = connections.value.get(clientId);
        if (connInfo) {
          connections.value.set(clientId, {
            ...connInfo,
            connected: false,
          });
          connections.value = new Map(connections.value);
        }

        // Update client status
        const client = clients.value.get(clientId);
        if (client) {
          const newClients = new Map(clients.value);
          newClients.set(clientId, {
            ...client,
            connected: false,
          });
          clients.value = newClients;
        }
      };

      receivedChannel.onmessage = (event) => {
        console.log(
          `[CONTROLLER] Received message from ${clientId}:`,
          event.data,
        );

        // Update last seen timestamp
        updateClientLastSeen(clientId);

        // Handle message
        handleClientMessage(event.data, clientId);
      };
    };

    // Set remote description from offer
    console.log(`[CONTROLLER] Setting remote description for ${clientId}`);
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.data),
    );

    // Create and set local description (answer)
    console.log(`[CONTROLLER] Creating answer for ${clientId}`);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer to client
    if (socket.value) {
      console.log(`[CONTROLLER] Sending answer to ${clientId}`);
      socket.value.send(JSON.stringify({
        type: "answer",
        target: clientId,
        data: peerConnection.localDescription,
      }));
    } else {
      throw new Error("WebSocket not connected, cannot send answer");
    }

    console.log(`[CONTROLLER] Successfully handled offer from ${clientId}`);
    addLog(`Answered offer from ${clientId}`);
  };

  // Clean up controller resources
  const cleanupController = async () => {
    // Disconnect from all clients
    const clientIds = Array.from(connections.value.keys());
    for (const clientId of clientIds) {
      disconnect(clientId);
    }

    // Close WebSocket
    if (socket.value) {
      const oldSocket = socket.value;
      socket.value = null;

      // Clear heartbeat interval
      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
        heartbeatInterval.value = null;
      }

      oldSocket.close(1000, "Controller deactivated");
    }

    controlActive.value = false;
    addLog("Controller deactivated");
  };

  // Wake lock sentinel reference
  const wakeLock = useSignal<any>(null);

  // Initialize on component mount and clean up on unmount
  useEffect(() => {
    // Automatically initialize the controller
    initializeController();

    // Request wake lock to prevent screen from sleeping
    requestWakeLock().then((lock) => {
      wakeLock.value = lock;
    });

    // Setup wake lock event listeners for reacquisition
    const cleanup = setupWakeLockListeners(
      () => wakeLock.value,
      (lock) => wakeLock.value = lock,
    );

    // Return cleanup function
    return () => {
      // Deregister from server as active controller
      if (controlActive.value) {
        fetch("/api/controller/active", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            controllerClientId: id.value,
          }),
        }).catch((error) => {
          console.error("Error deregistering controller:", error);
        });
      }

      cleanupController();

      if (heartbeatInterval.value !== null) {
        clearInterval(heartbeatInterval.value);
      }

      // Release wake lock
      if (wakeLock.value) {
        wakeLock.value.release().catch((err) =>
          console.error("Error releasing wake lock", err)
        );
      }

      // Remove wake lock event listeners
      if (cleanup) cleanup();
    };
  }, []);

  // Track grid-related state
  const gridLastKeyEvent = useSignal<
    { x: number; y: number; s: number } | null
  >(null);
  const gridController = useSignal<any>(null);

  // Handle grid setup to store controller reference
  const handleGridSetup = (controller: any) => {
    console.log("Grid controller initialized", controller);
    gridController.value = controller;
  };

  // Handle grid key events and map to synthesis parameters
  const handleGridKey = (x: number, y: number, s: number) => {
    console.log(`Grid key press: x=${x}, y=${y}, s=${s}`);
    gridLastKeyEvent.value = { x, y, s };

    // Only process key presses (s=1), not releases (s=0)
    if (s === 0) return;

    // Get all connected clients to control with the grid
    const connectedClients = Array.from(connections.value.entries())
      .filter(([_, conn]) => conn.connected)
      .map(([id, _]) => id);

    if (connectedClients.length === 0) {
      console.log("No connected clients to control with grid");
      return;
    }

    // Check if grid controller is available to provide visual feedback
    const hasGridController = gridController.value !== null;

    // Map grid rows to different synthesis parameters:
    // Row 0: Note on/off with different frequencies (one column = one note)
    // Row 1: Waveform selection (sine, square, sawtooth, triangle)
    // Row 2: Volume control (columns = 0% to 100%)
    // Row 3: Filter cutoff (left = low, right = high)
    // Row 4: Filter resonance (left = low, right = high)

    // Visual Feedback - light up the row to show it's selected
    const showRowFeedback = async (rowNumber: number) => {
      if (hasGridController) {
        // First clear grid
        await gridController.value.setAll(0);

        // Then light up the row
        await gridController.value.highlightRow(rowNumber, 5);

        // Finally highlight the selected parameter
        await gridController.value.setLed(x, rowNumber, 15);
      }
    };

    // Control every connected client
    connectedClients.forEach((clientId) => {
      const client = clients.value.get(clientId);
      if (!client || !client.synthParams) return;

      switch (y) {
        case 0: // Row 0: Note on/off with different frequencies
          // Map x position to note frequency
          const noteNames = [
            "C3",
            "D3",
            "E3",
            "F3",
            "G3",
            "A3",
            "B3",
            "C4",
            "D4",
            "E4",
            "F4",
            "G4",
            "A4",
            "B4",
            "C5",
            "D5",
          ];
          const note = noteNames[x];

          // Visual feedback
          showRowFeedback(0);

          // Create an active note pattern where only the current note is lit
          if (hasGridController) {
            const notePattern = Array(16).fill(0);
            notePattern[x] = 15; // Full brightness for selected note
            gridController.value.drawRowPattern(0, notePattern);
          }

          // Turn on the note
          updateSynthParam(clientId, "note_on", noteToFrequency(note));
          console.log(`Grid: Set client ${clientId} note to ${note}`);
          break;

        case 1: // Row 1: Waveform selection
          // Map specific x positions to waveforms and column positions
          let waveform = "sine";
          let waveformColumn = 0;

          if (x >= 0 && x < 4) {
            waveform = "sine";
            waveformColumn = 2;
          } else if (x >= 4 && x < 8) {
            waveform = "square";
            waveformColumn = 6;
          } else if (x >= 8 && x < 12) {
            waveform = "sawtooth";
            waveformColumn = 10;
          } else if (x >= 12 && x < 16) {
            waveform = "triangle";
            waveformColumn = 14;
          }

          // Visual feedback
          showRowFeedback(1);

          // Show waveform sections
          if (hasGridController) {
            const waveformPattern = [
              0,
              0,
              8,
              8,
              0,
              0,
              8,
              8,
              0,
              0,
              8,
              8,
              0,
              0,
              8,
              8,
            ];
            waveformPattern[waveformColumn] = 15; // Highlight selected waveform
            gridController.value.drawRowPattern(1, waveformPattern);
          }

          updateSynthParam(clientId, "waveform", waveform);
          console.log(`Grid: Set client ${clientId} waveform to ${waveform}`);
          break;

        case 2: // Row 2: Volume (0-100%)
          // Map x position (0-15) to volume (0-1)
          const volume = x / 15;

          // Visual feedback - show volume level as a bar graph
          showRowFeedback(2);

          if (hasGridController) {
            const volumePattern = Array(16).fill(0);
            // Create volume bar from 0 to selected position
            for (let i = 0; i <= x; i++) {
              volumePattern[i] = 5; // Dim brightness for the bar
            }
            volumePattern[x] = 15; // Highlight current position
            gridController.value.drawRowPattern(2, volumePattern);
          }

          updateSynthParam(clientId, "volume", volume);
          console.log(
            `Grid: Set client ${clientId} volume to ${
              Math.round(volume * 100)
            }%`,
          );
          break;

        case 3: // Row 3: Filter cutoff
          // Map x position to filter cutoff frequency (left = low, right = high)
          // Use logarithmic scale for more natural frequency mapping (20Hz to 20,000Hz)
          const minFreq = Math.log(20);
          const maxFreq = Math.log(20000);
          const freqRange = maxFreq - minFreq;
          const freqValue = Math.exp(minFreq + (x / 15) * freqRange);

          // Visual feedback - show filter cutoff as position
          showRowFeedback(3);

          if (hasGridController) {
            const cutoffPattern = Array(16).fill(0);
            // Create gradient effect
            for (let i = 0; i <= x; i++) {
              // Brightness increases with frequency
              cutoffPattern[i] = Math.ceil((i / 15) * 7); // 0-7 brightness range
            }
            cutoffPattern[x] = 15; // Highlight current position
            gridController.value.drawRowPattern(3, cutoffPattern);
          }

          updateSynthParam(clientId, "filterCutoff", freqValue);
          console.log(
            `Grid: Set client ${clientId} filter cutoff to ${
              Math.round(freqValue)
            }Hz`,
          );
          break;

        case 4: // Row 4: Filter resonance
          // Map x position to filter resonance (0-30)
          const resonance = (x / 15) * 30;

          // Visual feedback
          showRowFeedback(4);

          if (hasGridController) {
            const resonancePattern = Array(16).fill(0);
            // Higher resonance = more LEDs lit
            resonancePattern[x] = 15; // Highlight current position
            gridController.value.drawRowPattern(4, resonancePattern);
          }

          updateSynthParam(clientId, "filterResonance", resonance);
          console.log(
            `Grid: Set client ${clientId} filter resonance to ${
              resonance.toFixed(1)
            }`,
          );
          break;

        case 7: // Row 7 (bottom row): Note off controls
          if (x === 15) { // Bottom-right corner turns off notes
            // Visual feedback - bottom-right corner lights up
            if (hasGridController) {
              gridController.value.setAll(0); // Clear grid
              gridController.value.setLed(15, 7, 15); // Light up bottom-right
            }

            updateSynthParam(clientId, "note_off", null);
            console.log(`Grid: Turned off note for client ${clientId}`);
          }
          break;
      }
    });
  };

  // Example function to demonstrate controlling the grid from the WebRTC controller
  const _sendPatternToGrid = async () => {
    if (!gridController.value) {
      console.log("Grid controller not initialized");
      return;
    }

    // Clear the grid first
    await gridController.value.setAll(0);

    // Create a simple diagonal pattern
    for (let i = 0; i < 8; i++) {
      // Set a pixel on the diagonal
      await gridController.value.setLed(i, i, 15);

      // Set a pixel on the opposite diagonal
      await gridController.value.setLed(15 - i, i, 15);

      // Small delay for animation effect
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };

  return (
    <div class="container controller-panel">
      <div
        class="controller-header"
        style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;"
      >
        <div>
          <h1 style="margin: 0;">WebRTC Controller</h1>
          <p style="margin: 5px 0 0 0;">Welcome, {user.name}</p>
        </div>
        <div style="display: flex; align-items: center; gap: 15px;">
          <span class="controller-id">ID: {id.value}</span>
          <span
            class={`wake-lock-status ${
              wakeLock.value ? "wake-lock-active" : "wake-lock-inactive"
            }`}
            title={wakeLock.value
              ? "Screen will stay awake"
              : "Screen may sleep (no wake lock)"}
          >
            {wakeLock.value ? "🔆" : "💤"}
          </span>
          <a href="/ctrl/logout" class="logout-link">Logout</a>
        </div>
      </div>

      {/* Monome Grid section at the top */}
      <div style="margin-bottom: 30px; padding: 20px; background-color: #222; border-radius: 8px; text-align: center;">
        <h2 style="margin-top: 0; color: #f0f0f0;">Monome Grid</h2>
        <p style="margin-bottom: 15px; color: #ccc;">
          Control synthesis parameters directly with the Monome Grid!
        </p>
        <div style="display: flex; justify-content: center;">
          <GridController
            host="localhost"
            port={gridPort}
            onGridKey={handleGridKey}
            onSetupController={handleGridSetup}
            debugMode={false}
          />
        </div>

        {/* Grid parameter map and controls */}
        <div style="margin-top: 20px; display: flex; justify-content: center; gap: 10px;">
          <button
            type="button"
            style="background-color: #444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            onClick={async () => {
              if (gridController.value) {
                // Clear grid first
                await gridController.value.setAll(0);

                // Show mapping template - light up each row with a different pattern
                // Row 0: Notes
                const notePattern = [
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                  5,
                  0,
                ];
                await gridController.value.drawRowPattern(0, notePattern);

                // Row 1: Waveforms - four sections
                const waveformPattern = [
                  5,
                  5,
                  5,
                  5,
                  0,
                  5,
                  5,
                  5,
                  0,
                  5,
                  5,
                  5,
                  0,
                  5,
                  5,
                  5,
                ];
                await gridController.value.drawRowPattern(1, waveformPattern);

                // Row 2: Volume - gradient
                const volumePattern = Array(16).fill(0).map((_, i) =>
                  Math.ceil(i / 3)
                );
                await gridController.value.drawRowPattern(2, volumePattern);

                // Row 3: Filter cutoff - increasing pattern
                const cutoffPattern = Array(16).fill(0).map((_, i) =>
                  i % 3 === 0 ? 5 : 0
                );
                await gridController.value.drawRowPattern(3, cutoffPattern);

                // Row 4: Resonance
                const resonancePattern = [
                  0,
                  0,
                  5,
                  0,
                  0,
                  0,
                  5,
                  0,
                  0,
                  0,
                  5,
                  0,
                  0,
                  0,
                  5,
                  0,
                ];
                await gridController.value.drawRowPattern(4, resonancePattern);

                // Row 7: Note off control
                await gridController.value.setLed(15, 7, 8); // Note off button
              }
            }}
          >
            Show Parameter Map
          </button>

          <button
            type="button"
            style="background-color: #444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            onClick={async () => {
              if (gridController.value) {
                await gridController.value.setAll(0);
              }
            }}
          >
            Clear Grid
          </button>
        </div>

        {/* Grid parameter description */}
        <div style="margin-top: 15px; background-color: #333; padding: 10px; border-radius: 4px; color: #ddd; text-align: left; font-size: 14px;">
          <strong>Grid Parameter Mapping:</strong>
          <ul style="list-style-type: none; padding-left: 0; margin: 10px 0;">
            <li>• Row 0: Notes (C3-D5)</li>
            <li>
              • Row 1: Waveform Selection (sine, square, sawtooth, triangle)
            </li>
            <li>• Row 2: Volume (0-100%)</li>
            <li>• Row 3: Filter Cutoff (20Hz-20kHz)</li>
            <li>• Row 4: Filter Resonance (0-30)</li>
            <li>• Bottom-Right: Note Off</li>
          </ul>
        </div>

        {gridLastKeyEvent.value && (
          <div style="margin-top: 10px; font-family: monospace; background-color: #333; padding: 5px 10px; border-radius: 4px; color: #ddd; display: inline-block;">
            Last key: x={gridLastKeyEvent.value.x}, y={gridLastKeyEvent.value
              .y}, s={gridLastKeyEvent.value.s}
          </div>
        )}
      </div>

      <div class="controller-active">
        <h2 style="margin-top: 0;">WebRTC Connections</h2>
        <div
          class="connection-status status-active"
          style="margin-bottom: 15px;"
        >
          WebRTC Status: Ready
        </div>

        {/* Add client form */}
        <div class="add-client-form">
          <h3>Add Client by ID</h3>
          <div class="message-input">
            <input
              type="text"
              placeholder="Enter client ID to connect..."
              value={newClientId.value}
              onInput={(e) => newClientId.value = e.currentTarget.value}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newClientId.value.trim()) {
                  addClient(newClientId.value);
                }
              }}
            />
            <button
              type="button"
              onClick={() => addClient(newClientId.value)}
              disabled={!newClientId.value.trim()}
            >
              Add Client
            </button>
          </div>
        </div>

        <div class="client-list">
          <h3>Connected Clients ({clients.value.size})</h3>
          {clients.value.size === 0
            ? <p class="no-clients">No clients connected</p>
            : (
              <ul>
                {Array.from(clients.value.values()).map((client) => (
                  <li
                    key={client.id}
                  >
                    <div class="client-info">
                      <div class="client-id-container">
                        <span class="client-id">{client.id}</span>
                        <span
                          class="latency-indicator"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent selecting the client
                            console.log(
                              `Manual ping requested for ${client.id}`,
                            );
                            if (
                              connections.value.has(client.id) &&
                              connections.value.get(client.id)?.connected
                            ) {
                              // Always use the test message approach which sets a synthetic value
                              sendTestMessage(client.id);
                            }
                          }}
                          title="Click to measure latency"
                        >
                          {connections.value.has(client.id) &&
                              connections.value.get(client.id)?.connected
                            ? (client.latency === -1
                              ? (
                                <span className="latency-measuring">
                                  measuring...
                                </span>
                              )
                              : (
                                <span
                                  className={client.staleLatency
                                    ? "latency-stale"
                                    : ""}
                                >
                                  {client.latency || 0}ms
                                </span>
                              ))
                            : ""}
                        </span>

                        {/* Audio Status Indicator */}
                        {connections.value.has(client.id) &&
                          connections.value.get(client.id)?.connected && (
                          <>
                            <span
                              class={`audio-status-indicator ${
                                !client.isMuted
                                  ? "audio-enabled"
                                  : client.pendingNote
                                  ? "audio-pending-note"
                                  : "audio-disabled"
                              }`}
                              title={!client.isMuted
                                ? `Audio ${client.audioState || "enabled"}`
                                : client.pendingNote
                                ? "Audio muted (note pending)"
                                : "Audio muted"}
                            >
                              {!client.isMuted
                                ? (client.audioState === "running"
                                  ? "🔊"
                                  : "🔈")
                                : "🔇"}
                            </span>
                            <span
                              class="client-wake-lock-indicator"
                              title="Wake lock presumed active on client"
                            >
                              🔆
                            </span>
                          </>
                        )}
                      </div>
                      <span
                        class={`connection-status ${
                          connections.value.has(client.id) &&
                            connections.value.get(client.id)?.connected
                            ? client.verifiedConnection
                              ? "status-verified"
                              : "status-connected"
                            : "status-disconnected"
                        }`}
                        title="Connection verified through ping/pong"
                      >
                        {connections.value.has(client.id) &&
                            connections.value.get(client.id)?.connected
                          ? client.verifiedConnection ? "Verified" : "Connected"
                          : "Available"}
                      </span>

                      {/* Show synth controls for connected clients */}
                      {connections.value.has(client.id) &&
                        connections.value.get(client.id)?.connected &&
                        client.synthParams && (
                        <SynthControls
                          clientId={client.id}
                          params={client.synthParams}
                          onParamChange={(param, value) =>
                            updateSynthParam(client.id, param, value)}
                        />
                      )}
                    </div>

                    <div class="client-actions">
                      {!connections.value.has(client.id) ||
                          !connections.value.get(client.id)?.connected
                        ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Use async/await pattern to handle the promise
                              (async () => {
                                try {
                                  await connectToClient(client.id);
                                } catch (error) {
                                  console.error(
                                    `Error connecting to ${client.id}:`,
                                    error,
                                  );
                                }
                              })();
                            }}
                          >
                            Connect
                          </button>
                        )
                        : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              disconnect(client.id);
                            }}
                            class="disconnect-button"
                          >
                            Disconnect
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div class="message-area">
          <div class="broadcast-info">
            <span>
              Message to: <strong>All connected clients</strong>
            </span>
          </div>
          <div class="message-input">
            <input
              type="text"
              placeholder="Send broadcast message to all clients..."
              value={message.value}
              onInput={(e) => message.value = e.currentTarget.value}
              onKeyDown={handleKeyDown}
              disabled={!connections.value.size}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!connections.value.size || !message.value.trim()}
            >
              Send
            </button>
          </div>
        </div>

        <div class="log">
          <h3>Controller Log</h3>
          <ul>
            {logs.value.map((log, index) => <li key={index}>{log}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
