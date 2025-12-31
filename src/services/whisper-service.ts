import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { environment } from "@raycast/api";

const assetsAddonPath = join(environment.assetsPath, "addon.node");
const localAddonPath = join(__dirname, "../../native/addon.node");
const resolvedAddonPath = [assetsAddonPath, localAddonPath].find((path) => existsSync(path));

if (!resolvedAddonPath) {
  throw new Error("Whisper addon binary not found. Please run pnpm run build:addon.");
}

const { whisper } = require(resolvedAddonPath);
const whisperAsync = promisify(whisper);

export interface TranscriptionOptions {
  modelPath: string;
  audioBuffer: Float32Array;
  language?: string;
  useGpu?: boolean;
}

export class WhisperService {
  async transcribe(options: TranscriptionOptions): Promise<string> {
    const { modelPath, audioBuffer, language = "en", useGpu = true } = options;

    try {
      const result = await whisperAsync({
        model: modelPath,
        pcmf32: audioBuffer,
        language,
        use_gpu: useGpu,
        no_timestamps: true,
        no_prints: true,
        flash_attn: false,
      });

      if (!result || !result.transcription) {
        throw new Error("No transcription result");
      }

      const text = result.transcription
        .map((seg: [string, string, string]) => seg[2])
        .join(" ")
        .trim();

      return text;
    } catch (error) {
      console.error("Whisper transcription error:", error);
      throw error;
    }
  }
}
