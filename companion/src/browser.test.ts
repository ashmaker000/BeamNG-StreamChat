import assert from "node:assert/strict";
import test from "node:test";
import { parseTwitchActivationUrl } from "./browser.js";

test("accepts only Twitch device activation URLs", () => {
  assert.equal(
    parseTwitchActivationUrl("https://www.twitch.tv/activate?device-code=ABCDEFGH"),
    "https://www.twitch.tv/activate?device-code=ABCDEFGH"
  );
  assert.throws(() => parseTwitchActivationUrl("https://example.com/activate?device-code=ABCDEFGH"));
  assert.throws(() => parseTwitchActivationUrl("https://www.twitch.tv/settings"));
  assert.throws(() => parseTwitchActivationUrl("file:///C:/Windows/System32/cmd.exe"));
});
