import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

/** Mouse: small move to drag. Touch: press-and-hold so the page can still scroll. */
export function useAppDndSensors(coordinateGetter?: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, coordinateGetter ? { coordinateGetter } : {})
  );
}
