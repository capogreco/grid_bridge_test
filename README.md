# Grid Bridge Test

A prototype for integrating a Monome Grid controller with a distributed
synthesis system via WebSockets.

## Project Goal

This project tests the WebSocket connectivity between:

- An existing macOS Swift app that interfaces with a physical Monome Grid
  controller
- A web-based controller client built with Deno/Fresh that manages a distributed
  synthesis system

## Context

This test project is part of a larger distributed synthesis system for
co-located networked music performance. In the full system:

1. A performer uses a Monome Grid to control synthesis parameters
2. A controller client distributes these parameters to multiple audience devices
   via WebRTC
3. Each audience device runs a Web Audio API synthesis engine in their browser
4. Audio is emitted through audience device speakers, creating a spatially
   distributed sound experience

## What's Being Tested

This specific project validates whether the Swift app can successfully:

- Connect to the controller client via WebSockets
- Relay Grid key presses to the controller
- Receive LED updates from the controller to display on the Grid

The reference folder contains a browser-based implementation of a Grid WebSocket
bridge that this project aims to replace with a native Swift app connection.

## Development

Make sure to install Deno: https://deno.land/manual/getting_started/installation

Start the project:

```
deno task start
```

This will watch the project directory and restart as necessary.

## Key Components

- `/islands/Controller.tsx` - WebRTC controller interface that will integrate
  with the Grid
- `/islands/WebRTC.tsx` - WebRTC client interface for synthesis on audience
  devices
- `/routes/api/signal.ts` - Signaling server for WebRTC connection establishment
- `/lib/synth/` - Web Audio synthesis engine
- `/reference/` - Reference implementation of browser-based Grid WebSocket
  bridge
