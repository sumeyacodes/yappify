import { Clipboard } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

export class PasteService {
  async paste(text: string): Promise<void> {
    try {
      await Clipboard.copy(text);

      await runAppleScript(`
        tell application "System Events"
          keystroke "v" using command down
        end tell
      `);
    } catch (error) {
      console.error("Paste error:", error);
      throw new Error("Failed to paste text. Ensure accessibility permissions are granted.");
    }
  }

  async copyToClipboard(text: string): Promise<void> {
    await Clipboard.copy(text);
  }
}
