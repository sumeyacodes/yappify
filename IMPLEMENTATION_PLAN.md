# Raycast Extension for Whisper.cpp Voice-to-Text

## Overview
Build a Raycast extension that uses whisper.cpp to transcribe voice input for Claude Code terminal. Press right option key → speak → auto-paste transcribed text into terminal.

## Architecture Decision: addon.node (Native Node.js Addon)

**Rationale:**
- Model stays loaded in memory (faster repeated transcriptions)
- Direct buffer support (no temp files needed)
- Progress callbacks for better UX
- VAD (Voice Activity Detection) built-in
- GPU acceleration via Metal on Apple Silicon

**Why NOT whisper-cli:**
- Model reloads every time (~500ms overhead)
- File I/O overhead for each transcription
- Subprocess spawn overhead

**Implementation:** Use whisper.cpp's addon.node with audio chunking for pseudo-real-time transcription

## Project Structure

```
yappify/
├── package.json              # Extension manifest + Raycast command config
├── tsconfig.json             # TypeScript config
├── native/
│   └── addon.node           # Compiled whisper addon (from whisper.cpp)
├── models/
│   └── ggml-tiny.en.bin     # Whisper model (auto-downloaded)
├── src/
│   ├── commands/
│   │   └── yap.tsx                # Main command entry point
│   ├── services/
│   │   ├── audio-recorder.ts      # Audio capture via SoX
│   │   ├── whisper-service.ts     # addon.node wrapper
│   │   ├── paste-service.ts       # Clipboard + AppleScript paste
│   │   └── model-manager.ts       # Model download/caching
```

## Implementation Steps

### 1. Build addon.node (Node.js Native Addon)

**METHOD:** whisper.cpp is included as a git submodule. Build is automated via package.json scripts.

#### Automated Build (Recommended)

```bash
# Clone with submodules
git clone --recursive https://github.com/your-username/yappify.git
cd yappify

# Install dependencies (auto-initializes submodules)
pnpm install

# Build addon.node (automated)
pnpm run build:addon
```

The `build:addon` script:
1. Checks if `native/addon.node` already exists (skips rebuild)
2. If not, installs whisper.cpp dependencies
3. Compiles addon.node from submodule
4. Copies to `native/addon.node`

#### Manual Build (Force Rebuild)

```bash
# Force rebuild from submodule
pnpm run build:addon:force
```

**What happens:**
```bash
cd whisper.cpp/examples/addon.node
npm install                          # Install node-addon-api
cd ../..
npx cmake-js compile -T addon.node -B Release
cp build/Release/addon.node.node ../native/addon.node
```

**Expected result:** `addon.node` at `yappify/native/addon.node`

#### Verify It Works

```bash
node -e "console.log(require('./native/addon.node'))"
# Should output: { whisper: [Function (anonymous)] }
```

### 2. Git Submodule Setup

whisper.cpp is included as a git submodule at `yappify/whisper.cpp/`

**Configuration:**
- `.gitmodules` - Submodule URL and path
- `package.json` postinstall - Auto-initializes submodules
- `.gitignore` - Ignores build artifacts (`whisper.cpp/build/`)

**For developers:**
```bash
# Initialize submodules (if not cloned with --recursive)
git submodule update --init --recursive

# Update submodule to latest
cd whisper.cpp
git pull origin master
cd ..
git add whisper.cpp
git commit -m "Update whisper.cpp submodule"
```

### 3. Package.json Configuration

The package.json has been configured with:

```json
{
  "commands": [{
    "name": "voice-to-text",
    "title": "Voice to Text",
    "mode": "no-view",
    "hotkey": {
      "key": "option",
      "modifiers": ["right"]
    }
  }],
  "preferences": [
    {
      "name": "model",
      "type": "dropdown",
      "title": "Model",
      "default": "tiny",
      "data": [
        {"title": "Tiny (75MB, fast)", "value": "tiny"},
        {"title": "Base (142MB, better)", "value": "base"}
      ]
    },
    {
      "name": "outputMode",
      "type": "dropdown",
      "title": "Output",
      "default": "paste",
      "data": [
        {"title": "Auto-paste", "value": "paste"},
        {"title": "Clipboard", "value": "clipboard"}
      ]
    }
  ]
}
```

### 4. Implement ModelManager Service

**File:** `src/services/model-manager.ts`

- Store models in `~/.whisper-raycast/`
- Download from HuggingFace on first run: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin`
- Show toast with download progress

### 5. Implement AudioRecorder Service

**File:** `src/services/audio-recorder.ts`

Use SoX for audio capture (requires `brew install sox`):

```typescript
import { spawn, ChildProcess } from "child_process";

export class AudioRecorder {
  private process: ChildProcess | null = null;
  private audioChunks: Buffer[] = [];

  async start(): Promise<void> {
    this.audioChunks = [];

    this.process = spawn("rec", [
      "-q",           // Quiet mode
      "-r", "16000",  // 16kHz (whisper requirement)
      "-c", "1",      // Mono
      "-b", "16",     // 16-bit
      "-t", "wav",    // WAV format
      "-"             // Output to stdout
    ]);

    this.process.stdout?.on("data", (data: Buffer) => {
      this.audioChunks.push(data);
    });
  }

  async stop(): Promise<Float32Array> {
    return new Promise((resolve) => {
      this.process!.on("close", () => {
        const buffer = Buffer.concat(this.audioChunks);
        const audioBuffer = this.convertToFloat32Array(buffer);
        resolve(audioBuffer);
      });

      this.process!.kill("SIGTERM");
    });
  }

  private convertToFloat32Array(buffer: Buffer): Float32Array {
    // Skip WAV header (44 bytes) and convert PCM16 to Float32
    const dataStart = 44;
    const numSamples = (buffer.length - dataStart) / 2;
    const float32Array = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const offset = dataStart + i * 2;
      const int16 = buffer.readInt16LE(offset);
      float32Array[i] = int16 / 32768.0;  // Normalize to -1.0 to 1.0
    }

    return float32Array;
  }
}
```

**Recording strategy:** Fixed duration (e.g., 5 seconds) or user-triggered stop

### 6. Implement WhisperService

**File:** `src/services/whisper-service.ts`

Use addon.node for direct transcription:

```typescript
import path from "path";
import { promisify } from "util";

const { whisper } = require(path.join(__dirname, "../../native/addon.node"));
const whisperAsync = promisify(whisper);

export class WhisperService {
  private modelPath: string;

  constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  async transcribe(audioBuffer: Float32Array): Promise<string> {
    const result = await whisperAsync({
      model: this.modelPath,
      pcmf32: audioBuffer,  // Direct buffer input - no files!
      language: "en",
      use_gpu: true,
      no_timestamps: true,
      no_prints: true,
      vad: false,
      progress_callback: (progress: number) => {
        console.log(`Transcription: ${progress}%`);
      }
    });

    // Extract text from transcription segments
    return result.transcription
      .map((seg: [string, string, string]) => seg[2])
      .join(" ")
      .trim();
  }
}
```

**Key differences from whisper-cli:**
- No temp files needed (direct buffer input)
- Model stays loaded in memory
- Progress callbacks for UX
- Faster repeated transcriptions

### 7. Implement PasteService

**File:** `src/services/paste-service.ts`

**Primary:** Auto-paste via AppleScript
```typescript
import { Clipboard, runAppleScript } from "@raycast/api";

export class PasteService {
  async paste(text: string): Promise<void> {
    await Clipboard.copy(text);
    await runAppleScript(`
      tell application "System Events"
        keystroke "v" using command down
      end tell
    `);
  }

  async copyToClipboard(text: string): Promise<void> {
    await Clipboard.copy(text);
  }
}
```

**Fallback:** Clipboard only (if paste fails)

### 8. Implement Main Command

**File:** `src/commands/yap.tsx`

Flow:
1. Show HUD: "Recording..."
2. Start audio recording (SoX)
3. Wait for fixed duration (e.g., 5 seconds)
4. Stop recording → get Float32Array buffer
5. Show HUD: "Transcribing..."
6. Call whisperService.transcribe() with buffer
7. Parse output text
8. Auto-paste into terminal (or copy to clipboard)
9. Show HUD: "Pasted: {text}"

### 9. Error Handling

Handle common scenarios:
- **No mic permission:** Prompt user to grant in System Preferences
- **SoX not installed:** Show toast with `brew install sox` command
- **Model download failed:** Retry button
- **Whisper transcription failed:** Save audio for debugging, copy error to clipboard
- **Paste failed:** Fallback to clipboard
- **addon.node not found:** Show setup instructions

### 10. Testing Checklist

- [ ] addon.node loads correctly
- [ ] Model downloads correctly on first run
- [ ] Audio records at 16kHz mono WAV
- [ ] SoX recording works properly
- [ ] Whisper transcribes accurately
- [ ] Auto-paste works in terminal
- [ ] Clipboard fallback works
- [ ] Errors show helpful messages

## Critical File References

### From whisper.cpp:
- `/Users/admin/Desktop/whisper.cpp/examples/addon.node/addon.cpp` - Native addon implementation
- `/Users/admin/Desktop/whisper.cpp/build/addon.node` - Compiled addon to copy
- `/Users/admin/Desktop/whisper.cpp/include/whisper.h` - C API reference

### To Create in /Users/admin/Desktop/yappify:
- `package.json` - Add "yap" command
- `native/addon.node` - Compiled whisper addon (copied from whisper.cpp/build/)
- `models/ggml-tiny.en.bin` - Whisper model (auto-downloaded)
- `src/commands/yap.tsx` - Main command
- `src/services/audio-recorder.ts` - Mic capture with SoX
- `src/services/whisper-service.ts` - addon.node wrapper
- `src/services/paste-service.ts` - AppleScript paste
- `src/services/model-manager.ts` - Model downloads

## Expected Performance

- **Latency:** ~2-5s total (10s audio with tiny model)
  - Recording: Real-time
  - Transcription: ~1-2s (tiny) or ~3-4s (base)
  - Paste: <100ms
- **Memory:** ~200MB peak during transcription
- **Disk:** ~76MB (addon.node + tiny model)

## Dependencies

- **System:** SoX (`brew install sox`)
- **npm:** `@raycast/api`, `node-fetch`
- **Bundled:** addon.node, tiny model (auto-downloaded)

## Privacy & Security

- 100% on-device processing (no cloud)
- No temp files needed (direct buffer processing)
- No analytics or tracking
- Microphone permission required (standard macOS prompt)

## Post-MVP Enhancements

- Real-time streaming with partial results (chunked transcription)
- Multi-language auto-detection
- Custom vocabulary for technical terms
- Voice commands ("new line", "delete", etc.)
- Transcription history search
