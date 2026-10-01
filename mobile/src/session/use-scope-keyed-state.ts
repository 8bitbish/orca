import { useCallback, useMemo, useState } from 'react'

type Scope = { scopeKey: string | null; generation: number }

let nextGeneration = 0

/**
 * State that resets to `initial(scope)` whenever `scopeKey` changes, in that same render, so a
 * scope switch never shows the previous scope's value. Returning to a scope resets it too, and a
 * write from a callback that captured an earlier scope is dropped. `initial` must be stable.
 */
export function useScopeKeyedState<T>(
  scopeKey: string | null,
  initial: (scopeKey: string | null) => T
): readonly [T, (update: (previous: T) => T) => void] {
  const scope = useMemo<Scope>(() => ({ scopeKey, generation: ++nextGeneration }), [scopeKey])
  const [state, setState] = useState(() => ({ scope, value: initial(scopeKey) }))
  const value = useMemo(
    () => (state.scope === scope ? state.value : initial(scope.scopeKey)),
    [initial, scope, state]
  )
  const update = useCallback(
    (next: (previous: T) => T) => {
      setState((previous) => {
        if (previous.scope.generation > scope.generation) {
          return previous
        }
        const current = previous.scope === scope ? previous.value : initial(scope.scopeKey)
        return { scope, value: next(current) }
      })
    },
    [initial, scope]
  )
  return [value, update] as const
}
