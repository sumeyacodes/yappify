import { closeMainWindow, showHUD, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { ModelManager } from "./services/model-manager";
import { WhisperService } from "./services/whisper-service";
import { AudioRecorder } from "./services/audio-recorder";
import { PasteService } from "./services/paste-service";

interface Preferences {
  model: string;
  outputMode: string;
}

export default async function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const modelManager = new ModelManager();
  const whisperService = new WhisperService();
  const audioRecorder = new AudioRecorder();
  const pasteService = new PasteService();

  try {
    await closeMainWindow();
    await showHUD("🎤 Recording...");

    await audioRecorder.start();

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const audioBuffer = await audioRecorder.stop();

    await showHUD("🤖 Transcribing...");

    const modelPath = await modelManager.getModelPath(preferences.model);

    const text = await whisperService.transcribe({
      modelPath,
      audioBuffer,
      language: "en",
      useGpu: true,
    });

    if (!text || text.trim().length === 0) {
      await showHUD("⚠️  No speech detected");
      return;
    }

    if (preferences.outputMode === "paste") {
      await pasteService.paste(text);
      await showHUD(`✅ Pasted: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`);
    } else {
      await pasteService.copyToClipboard(text);
      await showHUD(`📋 Copied: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`);
    }
  } catch (error) {
    console.error("Voice-to-text error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await showToast({
      style: Toast.Style.Failure,
      title: "Voice-to-text failed",
      message: errorMessage,
    });
  }
}
