/** What a screen read reports from an agent's composer; UI-only, excluded from `tail`. */
export type RuntimeTerminalComposerRead = {
  /** Composer text the user typed. */
  draft?: string
  /** The dim suggestion an agent painted into its empty prompt. Optional: older hosts
   *  report it as `draft`. */
  suggestion?: string
}
