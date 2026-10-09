import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/**
 * Input — Quanta TextField skin (q-field-* from styles/quanta/components/input.css):
 * a 40px white-5% surface with a lime focus ring. `start`/`end` are 20px affix slots.
 */
function Input({
  className,
  type,
  start,
  end,
  invalid = false,
  ...props
}: React.ComponentProps<"input"> & {
  start?: React.ReactNode
  end?: React.ReactNode
  invalid?: boolean
}) {
  return (
    <div
      data-slot="input-control"
      className={cn(
        "q-field-control",
        invalid && "q-field-control-invalid",
        className
      )}
    >
      {start != null ? <span className="q-field-affix">{start}</span> : null}
      <InputPrimitive
        type={type}
        data-slot="input"
        className="q-field-input"
        aria-invalid={invalid || undefined}
        {...props}
      />
      {end != null ? <span className="q-field-affix">{end}</span> : null}
    </div>
  )
}

export { Input }
