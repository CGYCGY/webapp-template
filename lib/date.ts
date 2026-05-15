import { formatRelative } from 'date-fns';

export function formatRelativeFromNow(timestamp: number): string {
  return formatRelative(new Date(timestamp), new Date());
}
