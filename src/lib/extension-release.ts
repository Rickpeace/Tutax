import release from "../../public/downloads/steply-recorder.json";

/**
 * Aktuell ausgelieferte Steply-Erweiterung (ZIP + Versionsdatei in public/downloads). Die
 * Version kommt aus derselben Datei, die auch die Erweiterung für ihren Update-Hinweis liest
 * (panel.js → checkForUpdate) — zur Build-Zeit eingebunden, also ohne Dateizugriff zur Laufzeit.
 */
export const EXTENSION_VERSION: string =
  typeof release.version === "string" && release.version ? release.version : "";

export const EXTENSION_ZIP_URL = "/downloads/steply-recorder.zip";
