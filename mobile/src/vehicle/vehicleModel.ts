export interface VehicleDetails {
  schemaVersion: 1;
  ownerId: string;
  type: string;
  color: string;
  photoBase64: string;
  plate: string;
  plateRegion: string;
}
// A bounded thumbnail keeps the emulator demo self-contained, including export/import.
export const MAX_VEHICLE_PHOTO_LENGTH = 350_000;
export function parseVehicle(value: unknown, ownerId: string): VehicleDetails {
  if (!value || typeof value !== 'object')
    throw new Error('Add your vehicle details.');
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number) => {
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > max)
      throw new Error(`Check your vehicle ${key}.`);
    return v[key].trim();
  };
  if (v.schemaVersion !== 1 || v.ownerId !== ownerId)
    throw new Error('Invalid vehicle owner.');
  const photo = text('photoBase64', MAX_VEHICLE_PHOTO_LENGTH);
  if (!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(photo) || photo.length % 4 !== 0)
    throw new Error('Choose a JPEG photo of your car.');
  const plate = text('plate', 16).toUpperCase();
  if (!/^[A-Z0-9 -]{1,16}$/.test(plate))
    throw new Error('Check your license plate.');
  return {
    schemaVersion: 1,
    ownerId,
    type: text('type', 80),
    color: text('color', 40),
    photoBase64: photo,
    plate,
    plateRegion: text('plateRegion', 40),
  };
}
export function vehicleIsComplete(value: unknown, ownerId: string): boolean {
  try {
    parseVehicle(value, ownerId);
    return true;
  } catch {
    return false;
  }
}
