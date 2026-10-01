import { cn } from '@/lib/utils'
import { IpynbMarkdownCell } from './IpynbCellEditor'
import { IpynbHtmlOutput } from './IpynbHtmlOutput'
import { AnsiText } from './AnsiText'
import type { IpynbCell, IpynbOutput, IpynbOutputItem } from './ipynb-parse'

function valueToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).join('')
  }
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined || value === null) {
    return ''
  }
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

function dataUriForImage(item: IpynbOutputItem): string | null {
  const value = valueToText(item.value).replace(/\s/g, '')
  if (!value) {
    return null
  }
  if (item.mime === 'image/svg+xml') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(valueToText(item.value))}`
  }
  return `data:${item.mime};base64,${value}`
}

function isRenderableMime(mime: string): boolean {
  return (
    mime.startsWith('image/') ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime.endsWith('+json')
  )
}

function TextOutput({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <pre
      className={cn(
        'max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md px-3 py-2 font-mono text-xs leading-5 text-foreground scrollbar-editor',
        error && 'bg-destructive/10'
      )}
    >
      <AnsiText text={text} />
    </pre>
  )
}

function DisplayItem({ item }: { item: IpynbOutputItem }): React.JSX.Element | null {
  if (item.mime === 'text/html') {
    return <IpynbHtmlOutput html={valueToText(item.value)} />
  }
  if (item.mime.startsWith('image/')) {
    const uri = dataUriForImage(item)
    return uri ? (
      <img
        src={uri}
        alt={item.mime}
        className="mx-3 max-h-[520px] max-w-full self-start object-contain"
      />
    ) : null
  }
  if (item.mime === 'text/markdown') {
    return <IpynbMarkdownCell source={valueToText(item.value)} />
  }
  return <TextOutput text={valueToText(item.value)} />
}

function Output({ output }: { output: IpynbOutput }): React.JSX.Element | null {
  if (output.kind === 'stream') {
    return <TextOutput text={output.text} error={output.name === 'stderr'} />
  }
  if (output.kind === 'error') {
    // Jupyter tracebacks already end with "ename: evalue".
    return <TextOutput error text={output.traceback || `${output.name}: ${output.message}`} />
  }
  // Items arrive richest-first; like Jupyter, show only the best representation.
  const item = output.items.find((candidate) => isRenderableMime(candidate.mime))
  return item ? <DisplayItem item={item} /> : null
}

export function IpynbCellOutputs({ cell }: { cell: IpynbCell }): React.JSX.Element | null {
  if (cell.outputs.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 pt-2">
      {cell.outputs.map((output, index) => (
        // Scoping by run means a re-execution remounts outputs instead of reusing stale frames.
        <Output key={`${cell.executionCount}:${index}`} output={output} />
      ))}
    </div>
  )
}
