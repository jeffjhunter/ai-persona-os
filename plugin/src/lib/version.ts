/**
 * Single source of truth for the plugin's runtime version string.
 *
 * Keep in lockstep with package.json#version and openclaw.plugin.json#version
 * when shipping a new release. The doctor uses this to detect drift between
 * the running plugin and a workspace's VERSION.md.
 */
export const PLUGIN_VERSION = "3.0.0-alpha.3";
