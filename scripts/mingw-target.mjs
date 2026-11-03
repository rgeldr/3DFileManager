/**
 * MinGW on PATH / CC=x86_64-w64-mingw32-gcc is only valid when Rust is building
 * for the windows-gnu target. MSVC builds must use link.exe and cl.exe instead.
 */

/**
 * @param {string} rustcVersionOutput
 * @returns {string}
 */
export function parseHostTripleFromRustcVersionOutput(rustcVersionOutput) {
  const match = rustcVersionOutput.match(/^host: (\S+)/m);
  return match?.[1] ?? "";
}

/**
 * @param {{ hostTriple?: string, cargoBuildTarget?: string, cargoTarget?: string }} input
 * @returns {string}
 */
export function effectiveRustTriple(input) {
  const fromEnv = (input.cargoBuildTarget || input.cargoTarget || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  return (input.hostTriple || "").trim();
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} hostTriple
 * @returns {boolean}
 */
export function shouldUseMingwToolchain(env, hostTriple) {
  const triple = effectiveRustTriple({
    hostTriple,
    cargoBuildTarget: env.CARGO_BUILD_TARGET,
    cargoTarget: env.CARGO_TARGET,
  });
  if (!triple) {
    return false;
  }
  return triple.includes("windows-gnu");
}
