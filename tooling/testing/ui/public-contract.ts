/**
 * Props that let a caller restyle, re-render, or re-wire a shared component instead of choosing
 * a supported presentation and behavior: styling hooks, render and slot overrides, focus and
 * visibility overrides, unstable library props, and raw pointer events that bypass press handling.
 */
type EscapeHatch =
  | "className"
  | "style"
  | "render"
  | "slot"
  | "excludeFromTabOrder"
  | "inert"
  | "onClick"
  | `UNSTABLE_${string}`
  | `onPointer${string}`
  | `onMouse${string}`
  | `onTouch${string}`;

/**
 * Exports of a design-system module that accept an escape hatch. A public contract test expects
 * `never`. Allowed names a module's deliberate exceptions, such as the events a router needs.
 */
export type EscapeHatches<Module, Allowed extends string = never> = {
  [Name in keyof Module]: Module[Name] extends (props: infer Props) => unknown
    ? Exclude<Extract<keyof Props, EscapeHatch>, Allowed> extends never
      ? never
      : Name
    : never;
}[keyof Module];
