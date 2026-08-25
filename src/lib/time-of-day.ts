export const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function endTimeToMinutes(value: string) {
  const minutes = timeToMinutes(value);
  return minutes === 0 ? MINUTES_PER_DAY : minutes;
}

export function minutesToTime(value: number) {
  const normalized = ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function displayEndTime(value: string) {
  return value.slice(0, 5) === "24:00" ? "00:00" : value.slice(0, 5);
}

export function isValidSameDayTimeRange(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = endTimeToMinutes(endTime);
  return start < end && !(start === 0 && end === MINUTES_PER_DAY);
}
