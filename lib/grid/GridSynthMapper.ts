/**
 * GridSynthMapper.ts
 * Maps Grid key events to synthesis parameters and updates Grid LEDs based on synth state
 */

// Synthesis parameter types
import { SynthParams } from "../synth/types.ts";

// Grid row mappings
enum GridRow {
  WAVEFORM = 0,
  OSCILLATOR = 1,
  NOTES = 2,
  VOLUME = 3,
  FILTER = 4,
  ENVELOPE = 5,
  VIBRATO = 6,
  PORTAMENTO = 7,
}

// Available waveforms
const WAVEFORMS: OscillatorType[] = ["sine", "square", "sawtooth", "triangle"];

// Note frequency mappings (one octave, starting from C)
const NOTES = [
  "C4",
  "C#4",
  "D4",
  "D#4",
  "E4",
  "F4",
  "F#4",
  "G4",
  "G#4",
  "A4",
  "A#4",
  "B4",
  "C5",
  "C#5",
  "D5",
  "D#5",
];

// Filter types
const FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch"];

// Parameter range mappings
const PARAM_RANGES = {
  volume: { min: 0, max: 1 },
  filterCutoff: { min: 20, max: 20000 },
  filterResonance: { min: 0, max: 30 },
  attack: { min: 0.001, max: 5 },
  release: { min: 0.001, max: 10 },
  vibratoRate: { min: 0, max: 20 },
  vibratoWidth: { min: 0, max: 100 },
  portamentoTime: { min: 0, max: 5 },
};

/**
 * Maps a grid position to a parameter value
 */
function mapGridPositionToValue(
  x: number,
  min: number,
  max: number,
  isLogarithmic = false,
): number {
  // Scale x (0-15) to the parameter range
  const normalized = x / 15;

  if (isLogarithmic) {
    // For parameters that work better with logarithmic scaling (like frequency)
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    return Math.exp(logMin + normalized * (logMax - logMin));
  } else {
    // Linear scaling
    return min + normalized * (max - min);
  }
}

/**
 * Maps a parameter value to a grid position
 */
function mapValueToGridPosition(
  value: number,
  min: number,
  max: number,
  isLogarithmic = false,
): number {
  if (isLogarithmic) {
    // For parameters that work better with logarithmic scaling
    const logMin = Math.log(min);
    const logMax = Math.log(max);
    const logValue = Math.log(Math.max(min, Math.min(max, value)));

    const normalized = (logValue - logMin) / (logMax - logMin);
    return Math.round(normalized * 15);
  } else {
    // Linear scaling
    const normalized = (value - min) / (max - min);
    return Math.round(normalized * 15);
  }
}

export class GridSynthMapper {
  // Reference to the grid controller
  private gridController: {
    setLed: (x: number, y: number, s: number) => Promise<boolean>;
    setAll: (s: number) => Promise<boolean>;
    setMap: (
      x_offset: number,
      y_offset: number,
      data: number[][],
    ) => Promise<boolean>;
  } | null = null;

  // Current synth parameters
  private synthParams: SynthParams;

  // Callback for parameter updates
  private onParamChange: (param: string, value: any) => void;

  /**
   * Create a new GridSynthMapper
   */
  constructor(
    initialParams: SynthParams,
    onParamChange: (param: string, value: any) => void,
  ) {
    this.synthParams = { ...initialParams };
    this.onParamChange = onParamChange;
  }

  /**
   * Set the grid controller reference
   */
  setGridController(controller: {
    setLed: (x: number, y: number, s: number) => Promise<boolean>;
    setAll: (s: number) => Promise<boolean>;
    setMap: (
      x_offset: number,
      y_offset: number,
      data: number[][],
    ) => Promise<boolean>;
  }) {
    this.gridController = controller;

    // Update the grid with the current synth state
    this.updateGridFromSynthParams();
  }

  /**
   * Handle a key event from the grid
   */
  handleGridKey(x: number, y: number, s: number) {
    // Only handle key press events (not releases)
    if (s === 0) return;

    // Map the grid position to a synth parameter based on the row
    switch (y) {
      case GridRow.WAVEFORM:
        // Select waveform type based on x position (0-3)
        if (x < WAVEFORMS.length) {
          this.updateParam("waveform", WAVEFORMS[x]);
        }
        break;

      case GridRow.OSCILLATOR:
        // Toggle oscillator on/off
        if (x === 0) {
          this.updateParam(
            "oscillatorEnabled",
            !this.synthParams.oscillatorEnabled,
          );
        }
        break;

      case GridRow.NOTES:
        // Select note based on x position (0-15)
        this.updateParam("note", NOTES[x]);
        break;

      case GridRow.VOLUME:
        // Set volume based on x position (0-15)
        const volume = mapGridPositionToValue(
          x,
          PARAM_RANGES.volume.min,
          PARAM_RANGES.volume.max,
        );
        this.updateParam("volume", volume);
        break;

      case GridRow.FILTER:
        // First 4 positions select filter type
        if (x < 4) {
          // Not directly supported in this synth, would need extension
        } // Remaining positions control cutoff (5-9) and resonance (10-15)
        else if (x >= 5 && x < 10) {
          const normalizedX = x - 5;
          const cutoff = mapGridPositionToValue(
            normalizedX * 3, // Scale to full range
            PARAM_RANGES.filterCutoff.min,
            PARAM_RANGES.filterCutoff.max,
            true, // Logarithmic scaling for frequency
          );
          this.updateParam("filterCutoff", cutoff);
        } else if (x >= 10) {
          const normalizedX = x - 10;
          const resonance = mapGridPositionToValue(
            normalizedX * 2.5, // Scale to full range
            PARAM_RANGES.filterResonance.min,
            PARAM_RANGES.filterResonance.max,
          );
          this.updateParam("filterResonance", resonance);
        }
        break;

      case GridRow.ENVELOPE:
        // First half controls attack (0-7), second half controls release (8-15)
        if (x < 8) {
          const attack = mapGridPositionToValue(
            x * 2, // Scale to full range
            PARAM_RANGES.attack.min,
            PARAM_RANGES.attack.max,
            true, // Logarithmic scaling for time
          );
          this.updateParam("attack", attack);
        } else {
          const normalizedX = x - 8;
          const release = mapGridPositionToValue(
            normalizedX * 2, // Scale to full range
            PARAM_RANGES.release.min,
            PARAM_RANGES.release.max,
            true, // Logarithmic scaling for time
          );
          this.updateParam("release", release);
        }
        break;

      case GridRow.VIBRATO:
        // First half controls rate (0-7), second half controls width (8-15)
        if (x < 8) {
          const rate = mapGridPositionToValue(
            x * 2, // Scale to full range
            PARAM_RANGES.vibratoRate.min,
            PARAM_RANGES.vibratoRate.max,
          );
          this.updateParam("vibratoRate", rate);
        } else {
          const normalizedX = x - 8;
          const width = mapGridPositionToValue(
            normalizedX * 2, // Scale to full range
            PARAM_RANGES.vibratoWidth.min,
            PARAM_RANGES.vibratoWidth.max,
          );
          this.updateParam("vibratoWidth", width);
        }
        break;

      case GridRow.PORTAMENTO:
        // Control portamento time
        const portamento = mapGridPositionToValue(
          x,
          PARAM_RANGES.portamentoTime.min,
          PARAM_RANGES.portamentoTime.max,
          true, // Logarithmic scaling for time
        );
        this.updateParam("portamentoTime", portamento);
        break;
    }
  }

  /**
   * Update a synth parameter and notify callback
   */
  private updateParam(param: string, value: any) {
    // Update local synth parameters
    (this.synthParams as any)[param] = value;

    // Call the callback
    this.onParamChange(param, value);

    // Update the grid display
    this.updateGridFromSynthParams();
  }

  /**
   * Update synth parameters from external source
   */
  updateSynthParams(params: Partial<SynthParams>) {
    // Update local synth parameters
    this.synthParams = { ...this.synthParams, ...params };

    // Update the grid display
    this.updateGridFromSynthParams();
  }

  /**
   * Update the grid LEDs based on current synth parameters
   */
  updateGridFromSynthParams() {
    if (!this.gridController) return;

    // Clear grid
    this.gridController.setAll(0);

    // Update waveform selection
    const waveformIndex = WAVEFORMS.indexOf(this.synthParams.waveform);
    if (waveformIndex >= 0) {
      this.gridController.setLed(waveformIndex, GridRow.WAVEFORM, 15);
    }

    // Update oscillator state
    this.gridController.setLed(
      0,
      GridRow.OSCILLATOR,
      this.synthParams.oscillatorEnabled ? 15 : 0,
    );

    // Update note selection
    const noteIndex = NOTES.indexOf(this.synthParams.note || "A4");
    if (noteIndex >= 0) {
      this.gridController.setLed(noteIndex, GridRow.NOTES, 15);
    }

    // Update volume
    const volumeX = mapValueToGridPosition(
      this.synthParams.volume,
      PARAM_RANGES.volume.min,
      PARAM_RANGES.volume.max,
    );
    this.gridController.setLed(volumeX, GridRow.VOLUME, 15);

    // Update filter parameters
    const cutoffX = mapValueToGridPosition(
      this.synthParams.filterCutoff,
      PARAM_RANGES.filterCutoff.min,
      PARAM_RANGES.filterCutoff.max,
      true, // Logarithmic
    );
    // Scale to the 5-9 range
    const scaledCutoffX = Math.floor(cutoffX / 3) + 5;
    this.gridController.setLed(scaledCutoffX, GridRow.FILTER, 15);

    const resonanceX = mapValueToGridPosition(
      this.synthParams.filterResonance,
      PARAM_RANGES.filterResonance.min,
      PARAM_RANGES.filterResonance.max,
    );
    // Scale to the 10-15 range
    const scaledResonanceX = Math.floor(resonanceX / 2.5) + 10;
    this.gridController.setLed(scaledResonanceX, GridRow.FILTER, 15);

    // Update envelope parameters
    const attackX = mapValueToGridPosition(
      this.synthParams.attack,
      PARAM_RANGES.attack.min,
      PARAM_RANGES.attack.max,
      true, // Logarithmic
    );
    // Scale to the 0-7 range
    const scaledAttackX = Math.floor(attackX / 2);
    this.gridController.setLed(scaledAttackX, GridRow.ENVELOPE, 15);

    const releaseX = mapValueToGridPosition(
      this.synthParams.release,
      PARAM_RANGES.release.min,
      PARAM_RANGES.release.max,
      true, // Logarithmic
    );
    // Scale to the 8-15 range
    const scaledReleaseX = Math.floor(releaseX / 2) + 8;
    this.gridController.setLed(scaledReleaseX, GridRow.ENVELOPE, 15);

    // Update vibrato parameters
    const rateX = mapValueToGridPosition(
      this.synthParams.vibratoRate,
      PARAM_RANGES.vibratoRate.min,
      PARAM_RANGES.vibratoRate.max,
    );
    // Scale to the 0-7 range
    const scaledRateX = Math.floor(rateX / 2);
    this.gridController.setLed(scaledRateX, GridRow.VIBRATO, 15);

    const widthX = mapValueToGridPosition(
      this.synthParams.vibratoWidth,
      PARAM_RANGES.vibratoWidth.min,
      PARAM_RANGES.vibratoWidth.max,
    );
    // Scale to the 8-15 range
    const scaledWidthX = Math.floor(widthX / 2) + 8;
    this.gridController.setLed(scaledWidthX, GridRow.VIBRATO, 15);

    // Update portamento
    const portamentoX = mapValueToGridPosition(
      this.synthParams.portamentoTime,
      PARAM_RANGES.portamentoTime.min,
      PARAM_RANGES.portamentoTime.max,
      true, // Logarithmic
    );
    this.gridController.setLed(portamentoX, GridRow.PORTAMENTO, 15);
  }
}
