# RCC Structural Analysis Tool

A web-based tool for designing and analysing Reinforced Cement Concrete (RCC) basement structures per **IS 456:2000**.

Draw columns, walls, beams, and slabs on a 2D canvas, assign reinforcement, and run capacity checks — all in the browser.

## Features

- **2D Drawing Canvas** — draw and edit structural elements with snap-to-grid and ortho mode (Konva)
- **IS 456:2000 Capacity Checks** — flexure, shear, deflection, development length, anchorage, biaxial bending
- **Automatic Load Distribution** — tributary width calculation with two-way slab load reduction (Cl. 24.5)
- **Steel Scheduling** — bar count, weight, and quantity summaries
- **Lateral Earth Pressure** — active/at-rest/passive pressure on retaining walls with optional water table
- **3D Visualisation** — Babylon.js preview of the structure
- **PDF Report Export** — annotated drawings and check results
- **Unit Flexibility** — ft, ft-in, mm, cm, m with dual-unit display

## Tech Stack

React, Vite, Zustand, Konva (2D), Babylon.js (3D)

## Getting Started

```bash
cd rcc-tool
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
```

Output goes to `rcc-tool/dist/`.

## License

Private — all rights reserved.
