import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

import type { Gig } from '@/context/DataContext';

async function getWritableGoogleCalendar() {
  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Calendar permission is required to sync gigs.');
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter(calendar => calendar.allowsModifications);
  const google = writable.filter(calendar => {
    const source = String(calendar.source?.name ?? '').toLowerCase();
    const owner = String(calendar.ownerAccount ?? '').toLowerCase();
    const type = String(calendar.source?.type ?? '').toLowerCase();
    return source.includes('google') || type.includes('google') || owner.includes('@gmail.com');
  });
  const selected =
    google.find(calendar => Platform.OS === 'android' && calendar.isPrimary) ||
    google[0];

  if (!selected) {
    throw new Error('No writable Google calendar was found. Add your Google account to the device Calendar app first.');
  }
  return selected;
}

function eventDetails(gig: Gig) {
  const startDate = new Date(gig.startsAt);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  return {
    title: gig.title,
    location: gig.venue || undefined,
    notes: gig.notes || 'Created by StandUp Companion',
    startDate,
    endDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    alarms: [{ relativeOffset: -60 }],
  };
}

export async function syncGigEvent(gig: Gig) {
  if (Platform.OS === 'web') {
    throw new Error('Google Calendar device sync is available in the Android and iOS app.');
  }

  if (gig.calendarEventId && gig.calendarId) {
    await Calendar.updateEventAsync(gig.calendarEventId, eventDetails(gig));
    return {
      calendarId: gig.calendarId,
      calendarEventId: gig.calendarEventId,
      calendarSyncedAt: new Date().toISOString(),
    };
  }

  const calendar = await getWritableGoogleCalendar();
  const calendarEventId = await Calendar.createEventAsync(calendar.id, eventDetails(gig));
  return {
    calendarId: calendar.id,
    calendarEventId,
    calendarSyncedAt: new Date().toISOString(),
  };
}

export async function deleteGigEvent(gig: Gig) {
  if (!gig.calendarEventId || Platform.OS === 'web') return;
  await Calendar.deleteEventAsync(gig.calendarEventId);
}

