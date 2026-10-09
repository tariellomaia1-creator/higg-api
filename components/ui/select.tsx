"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

/**
 * Select — Base UI `Select` with the Quanta skin (q-select-* / q-dropdown-* /
 * q-menu-* from styles/quanta/components). Same export names as the shadcn
 * component so call sites stay the same; extra Quanta parts (`SelectItemIcon`,
 * `SelectItemContent`, `SelectItemDescription`, `SelectItemIndicator`) let you
 * compose icon + two-line rows.
 */

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("q-select-group", className)}
      {...props}
    />
  )
}

function SelectGroupLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn("q-menu-group-label", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("q-select-value", className)}
      {...props}
    />
  )
}

const TRIGGER_SIZE = {
  sm: "q-select-trigger-sm",
  default: "",
  lg: "q-select-trigger-lg",
} as const

function SelectTrigger({
  className,
  size = "default",
  bare = false,
  invalid = false,
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  /** Field height: sm 32px, default 40px, lg 48px. */
  size?: keyof typeof TRIGGER_SIZE
  /** Skip the field surface — the `render` host owns all styling (e.g. a prompt-box pill). */
  bare?: boolean
  invalid?: boolean
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        !bare && "q-field-control q-select-trigger",
        !bare && TRIGGER_SIZE[size],
        invalid && "q-field-control-invalid",
        className
      )}
      {...props}
    >
      {children}
      {bare ? null : <SelectIcon />}
    </SelectPrimitive.Trigger>
  )
}

/** The trigger chevron — flips while the popup is open. */
function SelectIcon({
  className,
  children,
  ...props
}: SelectPrimitive.Icon.Props) {
  return (
    <SelectPrimitive.Icon
      data-slot="select-icon"
      className={cn("q-select-icon", className)}
      {...props}
    >
      {children ?? <ChevronDownIcon />}
    </SelectPrimitive.Icon>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 4,
  alignOffset,
  collisionPadding = 16,
  alignItemWithTrigger = false,
  surface = "glass",
  variant = "default",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    | "side"
    | "align"
    | "sideOffset"
    | "alignOffset"
    | "collisionPadding"
    | "alignItemWithTrigger"
  > & {
    /** `glass` frosted popup, `solid` opaque secondary background. */
    surface?: "glass" | "solid"
    /** `picker` — compact builder-picker rows (44px, body-sm, lime check). */
    variant?: "default" | "picker"
  }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-q-dropdown"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "q-dropdown-content q-select-content",
            surface === "solid" && "q-dropdown-content-solid",
            variant === "picker" && "q-select-content-picker",
            className
          )}
          {...props}
        >
          <SelectPrimitive.List className="q-select-list">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn("q-menu-item q-select-item", className)}
      {...props}
    >
      {typeof children === "string" ? (
        <SelectItemText>{children}</SelectItemText>
      ) : (
        children
      )}
      <SelectItemIndicator />
    </SelectPrimitive.Item>
  )
}

/** Leading 20px icon slot. */
function SelectItemIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="select-item-icon"
      className={cn("q-menu-item-icon", className)}
      {...props}
    />
  )
}

/** Column stacking `SelectItemText` over `SelectItemDescription`. */
function SelectItemContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-item-content"
      className={cn("q-menu-item-label", className)}
      {...props}
    />
  )
}

function SelectItemDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="select-item-description"
      className={cn("q-menu-item-description", className)}
      {...props}
    />
  )
}

/** The option label echoed back into `SelectValue`. */
function SelectItemText({
  className,
  ...props
}: SelectPrimitive.ItemText.Props) {
  return (
    <SelectPrimitive.ItemText
      data-slot="select-item-text"
      className={cn("q-select-item-text", className)}
      {...props}
    />
  )
}

function SelectItemIndicator({
  className,
  children,
  ...props
}: SelectPrimitive.ItemIndicator.Props) {
  return (
    <SelectPrimitive.ItemIndicator
      data-slot="select-item-indicator"
      className={cn("q-select-item-indicator", className)}
      {...props}
    >
      {children ?? <CheckIcon className="q-dropdown-check" />}
    </SelectPrimitive.ItemIndicator>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("q-select-separator", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectIcon,
  SelectItem,
  SelectItemContent,
  SelectItemDescription,
  SelectItemIcon,
  SelectItemIndicator,
  SelectItemText,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
