import Controller from "../../islands/Controller.tsx";
import GridController from "../../islands/GridController.tsx";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { GridSynthMapper } from "../../lib/grid/GridSynthMapper.ts";
import { DEFAULT_SYNTH_PARAMS } from "../../lib/synth/index.ts";

// Simple development page that bypasses OAuth
export default function ControllerDevPage() {
  // Mock user for development
  const mockUser = {
    email: "dev@example.com",
    name: "Developer",
    id: "dev-user-id",
  };

  // Used to generate a unique client ID
  const clientId = useSignal(
    `controller-dev-${Math.random().toString(36).substring(2, 8)}`,
  );

  // GridSynthMapper reference
  const gridMapper = useSignal<GridSynthMapper | null>(null);

  // Grid controller reference
  interface GridController {
    setLed: (x: number, y: number, s: number) => Promise<boolean>;
    setAll: (s: number) => Promise<boolean>;
    setMap: (
      x_offset: number,
      y_offset: number,
      data: number[][],
    ) => Promise<boolean>;
  }

  const gridController = useSignal<GridController | null>(null);

  // Initialize the GridSynthMapper
  useEffect(() => {
    // This would typically be handled in the Controller component, but we're setting it up
    // here for demonstration purposes in the dev environment
    const mapper = new GridSynthMapper(
      DEFAULT_SYNTH_PARAMS,
      (param, value) => {
        console.log(`Synth parameter update: ${param} = ${value}`);
        // In a real implementation, this would update the synth and distribute to clients
      },
    );

    gridMapper.value = mapper;

    // Clean up on unmount
    return () => {
      gridMapper.value = null;
    };
  }, []);

  // Handle grid setup
  const handleGridSetup = (controller: GridController) => {
    gridController.value = controller;

    // Connect the grid controller to the mapper
    if (gridMapper.value) {
      gridMapper.value.setGridController(controller);
    }
  };

  // Handle grid key events
  const handleGridKey = (x: number, y: number, s: number) => {
    if (gridMapper.value) {
      gridMapper.value.handleGridKey(x, y, s);
    }
  };

  return (
    <div>
      <div
        class="dev-warning"
        style="background-color: #fdf6b2; color: #723b13; padding: 12px; border-radius: 4px; margin-bottom: 20px; text-align: center; border: 1px solid #f3cc4a;"
      >
        <strong>Development Mode</strong> - OAuth authentication bypassed
      </div>

      <div class="integration-notes" style="margin-bottom: 20px;">
        <h3>Integration Notes</h3>
        <ul>
          <li>
            The Swift app establishes a WebSocket server on localhost:8001
          </li>
          <li>The browser controller connects as a client to the server</li>
          <li>Grid button presses are sent from Swift to the browser</li>
          <li>LED updates are sent from the browser to Swift</li>
          <li>
            The grid controller maps physical inputs to synthesis parameters
          </li>
        </ul>
      </div>

      <Controller 
        user={mockUser} 
        clientId={clientId.value} 
        gridPort={8001}
      />
    </div>
  );
}
