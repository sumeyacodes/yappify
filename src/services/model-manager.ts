import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, createWriteStream } from "fs";
import { showToast, Toast } from "@raycast/api";
import { promisify } from "util";
import { pipeline, Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";

const streamPipeline = promisify(pipeline);

export class ModelManager {
  private modelsDir: string;

  private modelUrls: Record<string, string> = {
    tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  };

  constructor() {
    this.modelsDir = join(homedir(), ".whisper-raycast");
    this.ensureModelsDir();
  }

  private ensureModelsDir(): void {
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  async getModelPath(modelName: string): Promise<string> {
    const modelPath = join(this.modelsDir, `ggml-${modelName}.en.bin`);

    if (!existsSync(modelPath)) {
      await this.downloadModel(modelName, modelPath);
    }

    return modelPath;
  }

  private async downloadModel(modelName: string, modelPath: string): Promise<void> {
    const url = this.modelUrls[modelName];
    if (!url) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Downloading ${modelName} model...`,
      message: "This may take a few minutes",
    });

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Download failed: empty response body");
      }

      const fileStream = createWriteStream(modelPath);
      const nodeStream = Readable.fromWeb(response.body as NodeReadableStream);
      await streamPipeline(nodeStream, fileStream);

      toast.style = Toast.Style.Success;
      toast.title = "Model downloaded successfully";
      toast.message = `${modelName} model ready to use`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Download failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }

  modelExists(modelName: string): boolean {
    const modelPath = join(this.modelsDir, `ggml-${modelName}.en.bin`);
    return existsSync(modelPath);
  }
}
