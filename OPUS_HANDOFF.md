# VRM Avatar Integration - Handoff to Opus

## Background

The goal is to enhance the polygon mode by integrating VRM avatars using Three.js, @pixiv/three-vrm, and Kalidokit. This will make the face tracking experience more engaging by replacing simple 2D polygon meshes with 3D VRM avatars.

## Completed Work (Phase 1-3)

### Phase 1: Package Installation ✅
- Installed dependencies:
  - `three@^0.160.0` - WebGL 3D rendering engine
  - `@pixiv/three-vrm@^3.0.0` - VRM model loader and controller
  - `kalidokit@^1.1.5` - MediaPipe to VRM parameter conversion
  - `@types/three@^0.160.0` - TypeScript definitions

### Phase 2: VRM Model Setup ✅
- Created directory: `public/models/`
- VRM model uploaded: `public/models/avatar.vrm` (7.6MB, ~20,000 polygons)

### Phase 3: React Hooks Implementation ✅

**Created Files:**
1. **`src/hooks/useVRMAvatar.ts`** - VRM model loading hook
   - Loads VRM from URL using GLTFLoader + VRMLoaderPlugin
   - Returns `{ vrm, isLoading, error }`
   - Successfully loads the avatar.vrm model

2. **`src/hooks/useThreeScene.ts`** - Three.js scene management hook
   - Initializes scene, camera, and renderer
   - Sets up lighting (directional + ambient)
   - Implements ResizeObserver for automatic canvas resizing
   - Returns `{ scene, camera, renderer, render, forceResize }`

**Modified Files:**
1. **`src/types.ts`** - Added 'vrm' to FaceDisplayMode type
2. **`src/components/FaceFlickCanvas.tsx`** - Integrated VRM rendering
3. **`src/components/Toolbar.tsx`** - Replaced "Polygon" with "VRM" button

## Current State

### What Works ✅
- VRM model loads successfully (confirmed)
- Three.js scene initializes properly
- Canvas elements are created and sized correctly
- Animation loop runs continuously
- Mode switching (none → points → vrm) works

### Known Issue ❌
**WebGL rendering not visible on screen**

Despite all systems being operational (VRM loaded, rendering loop running, canvas properly sized), the WebGL content does not appear on screen. The underlying issue appears to be related to how the dual-canvas architecture (Canvas 2D + Canvas WebGL) is set up.

**Diagnosis:**
- VRM renders are being called (confirmed via debugging)
- WebGL Canvas exists and has correct dimensions
- Previous debugging attempts that failed:
  - Setting `renderer.setClearColor()` to visible colors (blue, magenta) - still showed blank
  - Direct WebGL context `gl.clearColor()` test - didn't display
  - Z-index and layer order adjustments - no effect
  - Alpha channel toggling - no effect

**Root Cause Hypothesis:**
During debugging, it was discovered that setting `canvas.width` and `canvas.height` directly resets the WebGL context. This has been removed in the current clean state, but the display issue persists and needs further investigation.

## Next Steps for Opus

### Phase 4: Kalidokit Integration (Partially Complete)
**File:** `src/utils/vrm/applyMediaPipeToVRM.ts`

This file exists with conversion logic mapping MediaPipe blendshapes to VRM expressions:
- Head rotation (yaw, pitch, roll)
- Mouth shapes (aa, ih, ou, ee, oh)
- Eye blinks
- Eyebrow movements

**Status:** Implementation complete but **untested** due to WebGL display issue.

### Phase 5: UI Updates
- Display mode controls (completed - "VRM" button works)
- Loading states (completed - loading indicator shows)
- Error handling (completed - error messages display)

### Phase 6-8: Testing, Optimization, Documentation
- Not yet started

## Immediate Priority

**Fix the WebGL rendering display issue.** All infrastructure is in place, but the 3D content is not visible. Once this is resolved, the existing Kalidokit integration can be tested and refined.

## Technical Architecture

**Dual Canvas System:**
- **Canvas 2D (z-index: 0)**: Video feed, keyboard overlay, UI elements
- **Canvas WebGL (z-index: 10)**: VRM avatar rendering
- When in 'vrm' mode, Canvas 2D clears the video feed area for transparency

**Files Structure:**
```
src/
├── hooks/
│   ├── useVRMAvatar.ts      # VRM loading
│   └── useThreeScene.ts     # Three.js scene management
├── utils/vrm/
│   ├── index.ts             # Exports
│   └── applyMediaPipeToVRM.ts  # MediaPipe → VRM conversion
├── components/
│   ├── FaceFlickCanvas.tsx  # Main integration
│   └── Toolbar.tsx          # UI controls
└── types.ts                 # Type definitions
```

## Key Code Locations

- VRM integration: `FaceFlickCanvas.tsx:47-54` (hooks), `FaceFlickCanvas.tsx:352-368` (rendering)
- Mode toggle: `FaceFlickCanvas.tsx:855-861`
- Canvas elements: `FaceFlickCanvas.tsx:876-892`

## Resources

- Three.js docs: https://threejs.org/docs/
- @pixiv/three-vrm: https://github.com/pixiv/three-vrm
- Kalidokit: https://github.com/yeemachine/kalidokit

---

**Last updated:** Phase 3 complete, cleaned of debug code
**Branch:** `claude/plan-polygon-mode-vrm-0iLC8`
