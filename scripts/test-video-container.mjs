// Sicherheitsprüfung Runde 4: Der Video-Worker gibt nur echte Video-Container an ffmpeg
// (HLS-Playlists/concat-Listen könnten lokale Server-Dateien einlesen). Rein, ohne ffmpeg.
// Nutzung:  node scripts/test-video-container.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { looksLikeVideoContainer } from "../video-worker/media.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-"));
const file = (name, buf) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
};
const cases = [
  ["WebM/MKV (EBML)", file("a.webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), true],
  ["MP4 (ftyp)", file("b.mp4", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom0000")])), true],
  ["MOV (moov)", file("c.mov", Buffer.concat([Buffer.from([0, 0, 0, 0x08]), Buffer.from("moov00000000")])), true],
  ["AVI (RIFF…AVI )", file("d.avi", Buffer.from("RIFF\u0000\u0000\u0000\u0000AVI LIST", "latin1")), true],
  ["HLS-Playlist", file("e.mp4", Buffer.from("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\nfile:///etc/passwd\n")), false],
  ["concat-Liste", file("f.mp4", Buffer.from("ffconcat version 1.0\nfile '/proc/self/environ'\n")), false],
  ["leere Datei", file("g.mp4", Buffer.alloc(0)), false],
  ["gibt es nicht", path.join(dir, "fehlt.mp4"), false],
];
let bad = 0;
for (const [name, p, want] of cases) {
  const got = looksLikeVideoContainer(p);
  console.log(`${got === want ? "✓" : "✗"} ${name} → ${got ? "Video" : "abgelehnt"}`);
  if (got !== want) bad++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `\n✗ ${bad} falsch.` : "\n✓ Video-Container-Prüfung korrekt.");
process.exit(bad ? 1 : 0);
