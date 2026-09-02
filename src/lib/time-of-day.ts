export const MINUTES_PER_DAY = 24 * 60;

export function timeToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function endTimeToMinutes(value: string) {
  const minutes = timeToMinutes(value);
  return minutes === 0 ? MINUTES_PER_DAY : minutes;
}

/** End on the start-date axis; never use UTC for local schedule arithmetic. */
export function intervalEndMinutes(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return end < start ? end + MINUTES_PER_DAY : end;
}

export function isValidBookingTimeRange(startTime: string, endTime: string) {
  const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  return pattern.test(startTime) && pattern.test(endTime) && startTime !== endTime;
}

export function endsNextDay(startTime: string, endTime: string) {
  return timeToMinutes(endTime) < timeToMinutes(startTime) || endTime.slice(0, 5) === "24:00";
}

export function formatBookingTimeRange(startTime: string, endTime: string) {
  return `${startTime}–${displayEndTime(endTime)}`;
}

/** Original anchors, including negative minutes from yesterday's spill. */
export function civilDayWindows(hours: { weekday: number; startTime: string; endTime: string }[], weekday: number) {
  return hours.flatMap((hour) => {
    const offset = hour.weekday === weekday ? 0 : (hour.weekday + 1) % 7 === weekday ? -MINUTES_PER_DAY : null;
    if (offset === null) return [];
    const start = timeToMinutes(hour.startTime) + offset;
    const end = intervalEndMinutes(hour.startTime, hour.endTime) + offset;
    return end > 0 ? [{ start, end }] : [];
  });
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
