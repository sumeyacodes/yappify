import { spawn, spawnSync, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { showToast, Toast } from "@raycast/api";

const REC_CANDIDATES = [process.env.REC_PATH, "/opt/homebrew/bin/rec", "/usr/local/bin/rec"]
  .filter(Boolean)
  .map((path) => path!.trim());

const resolveRecorderBinary = (): string => {
  for (const candidate of REC_CANDIDATES) {
    if (candidate.startsWith("/") && existsSync(candidate)) {
      return candidate;
    }
  }

  const whichResult = spawnSync("which", ["rec"]);
  const resolved = whichResult.status === 0 ? whichResult.stdout.toString().trim() : "";

  if (resolved) {
    return resolved;
  }

  throw new Error("Could not find the `rec` binary. Install SoX (brew install sox) or set REC_PATH to its location.");
};

export class AudioRecorder {
  private process: ChildProcess | null = null;
  private audioChunks: Buffer[] = [];
  private isRecording = false;

  async start(): Promise<void> {
    if (this.isRecording) {
      throw new Error("Already recording");
    }

    this.audioChunks = [];
    this.isRecording = true;

    try {
      const recorderBinary = resolveRecorderBinary();

      this.process = spawn(recorderBinary, [
        "-q", // Quiet mode
        "-r",
        "16000", // 16kHz sample rate (whisper requirement)
        "-c",
        "1", // Mono
        "-b",
        "16", // 16-bit
        "-t",
        "wav", // WAV format
        "-", // Output to stdout
      ]);

      this.process.stdout?.on("data", (data: Buffer) => {
        this.audioChunks.push(data);
      });

      this.process.on("error", (error) => {
        console.error("Recording error:", error);
        showToast({
          style: Toast.Style.Failure,
          title: "Recording failed",
          message: "Make sure SoX is installed: brew install sox",
        });
      });
    } catch (error) {
      this.isRecording = false;
      await showToast({
        style: Toast.Style.Failure,
        title: "Recording failed",
        message: error instanceof Error ? error.message : "Unable to start recorder. Install SoX (brew install sox).",
      });
      throw error;
    }
  }

  async stop(): Promise<Float32Array> {
    if (!this.isRecording || !this.process) {
      throw new Error("Not recording");
    }

    return new Promise((resolve, reject) => {
      this.process!.on("close", () => {
        try {
          const audioBuffer = this.convertToFloat32Array(Buffer.concat(this.audioChunks));
          this.isRecording = false;
          this.process = null;
          this.audioChunks = [];
          resolve(audioBuffer);
        } catch (error) {
          reject(error);
        }
      });

      this.process!.kill("SIGTERM");
    });
  }

  private convertToFloat32Array(buffer: Buffer): Float32Array {
    // Skip WAV header (44 bytes) and convert PCM16 to Float32
    const dataStart = 44;
    if (buffer.length <= dataStart) {
      throw new Error("No audio captured. Try speaking again.");
    }

    const pcmLength = buffer.length - dataStart;

    if (pcmLength % 2 !== 0) {
      throw new Error("Corrupted audio buffer received from recorder.");
    }

    const numSamples = pcmLength / 2;
    const float32Array = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const offset = dataStart + i * 2;
      const int16 = buffer.readInt16LE(offset);
      float32Array[i] = int16 / 32768.0; // Normalize to -1.0 to 1.0
    }

    return float32Array;
  }

  isActive(): boolean {
    return this.isRecording;
  }
}
