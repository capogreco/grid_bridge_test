# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Grid Bridge Test is a prototype for testing WebSocket connectivity between:

- A macOS Swift app that interfaces with a Monome Grid controller
- A web-based controller client built with Deno/Fresh

This project is part of a larger distributed synthesis system that allows a
performer using a Monome Grid to control sound synthesis across multiple
audience devices via WebRTC.

The reference folder contains a browser-based implementation of a WebSocket
bridge to the Monome Grid, which this project aims to replace with a native
Swift app connection.

## Important Implementation Notes

- NEVER implement mocks, simulations, or stub code unless explicitly instructed
- Implement real, working code that fulfills the specified requirements
- The Swift app will act as the WebSocket SERVER (on localhost:8001)
- The browser controller will act as the WebSocket CLIENT that connects to the
  Swift app
- All code should work in a local environment without requiring external
  services

## Build/Development Commands

- `deno task start` - Start development server with watch mode
- `deno task check` - Run formatting check, linting and type checking
- `deno task build` - Build the project
- `deno task preview` - Preview the built project

## Key Components

- `/islands/Controller.tsx` - WebRTC controller interface that will integrate
  with the Grid
- `/islands/WebRTC.tsx` - WebRTC client interface for synthesis on audience
  devices
- `/routes/api/signal.ts` - Signaling server for WebRTC connection establishment
- `/lib/synth/` - Web Audio synthesis engine
- `/reference/` - Reference implementation of browser-based Grid WebSocket
  bridge

## Code Style Guidelines

- Prefer Preact hooks and signals for state management (`useSignal`,
  `useEffect`)
- TypeScript types for all function parameters and signals
- Use TSX for UI components
- Utilize `islands/` directory for interactive client-side components
- Employ async/await for promises rather than .then() chains where possible
- Use camelCase for variables and PascalCase for components
- Handle errors with try/catch blocks with appropriate logging
- Organize WebRTC signaling logic separately from rendering
- Leverage Deno standard libraries from imports ($std/)
- Format imports with preact first, followed by $fresh, then $std
