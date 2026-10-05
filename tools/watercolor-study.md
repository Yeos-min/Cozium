# Watercolor look study

Open `/tools/watercolor-study.html` to compare the same bed/window camera:
1. Previous weighted-sector filter, lighting, GLB material, and outlines.
2. Revised filter and restrained outlines, previous lighting/materials.
3. Revised filter, late-afternoon lighting, original GLB material, and wall pigment variation (current app defaults).

This is a visual study inspired by the supplied reference, not an exact reproduction of its shader. The 49 disk samples and tensor-guided orientation remain; `sectorMode: "select"` chooses the minimum-variance sector instead of blending all sectors. `sectorMode: "blend"` preserves the previous algorithm. The old look's numerical settings are retained in the comparison page.

Tuning is in `js/three/tuning.js`: `kuwahara`, `outline`, `light`, and `wallWash`. Bed texture files and GLB geometry are unchanged. The app now preserves bed roughness/metalness textures and normal-map strength as requested by the artist. Only the existing opaque-material correction remains. Wall color variation is world-anchored in the material shader, before lighting and postprocessing. Text overlays continue to render separately with depth testing.

Historical validation of the first look study (before the afternoon lighting update):
- 96 Node tests passed.
- `tools/kuwahara-check.html`: all WebGL checks passed, including exact text ink (880 pixels, zero changed), occlusion, effect bypass, outline thickness, and DPR resizing.
- Main sample room: imported bed and cards loaded, revised defaults visible, no captured browser errors.
- Comparison scene, 1280×720, weak setting, outlines enabled, 20 CPU+GPU-synchronized renders: previous 1.22 ms; filter/outline adjustment 1.06 ms; full revision 0.97 ms. Single short local measurement, not a speedup guarantee or game FPS. Use the comparison button to measure again on the target machine.

Known visual tradeoff: minimum-variance selection creates sharper color regions and can switch regions during camera movement. The previous blend mode remains available in tuning. This pass reduces heavy contours; it does not reproduce the reference's detailed environment or water effects.

Afternoon revision: sunlight elevation 28 degrees, warm key light from the back-left window side, shadow radius 7 and intensity 0.55. Original GLB material maps restored; browser rendering checked with no captured errors. The comparison page now keeps the same original bed material in every mode.
