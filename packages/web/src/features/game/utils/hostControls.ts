import clsx from "clsx"

// Shared secondary-control look for the in-game host bar: white surface, subtle
// border, consistent height/radius/padding, focus ring + >=44px touch target.
// Used by the Auto-Modus toggle, Satellite (DisplayControl), Sim (SimControl),
// Vollbild and Exit so the cluster reads as one cohesive set of controls.
// Lives in a leaf module so DisplayControl/SimControl can share it without an
// import cycle with GameWrapper (which imports those two components).
export const HOST_CONTROL_BTN = clsx(
  "flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5",
  "text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
)
