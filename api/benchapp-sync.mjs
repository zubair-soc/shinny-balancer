const SUPABASE_URL = 'https://jabumqdjahkprjmntmkz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Zcp8wGkFBcR67tR7GGXh2w_5ozRV1uB';
const FEED_HOST = 'ics.benchapp.com';
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const EDMONTON_TZ = 'America/Edmonton';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function decodeText(value = '') {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function unfoldedLines(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function property(lines, name) {
  const prefix = `${name.toUpperCase()}`;
  const line = lines.find(item => item.slice(0, item.indexOf(':')).split(';')[0].toUpperCase() === prefix);
  if (!line) return null;
  const colon = line.indexOf(':');
  const left = line.slice(0, colon).split(';');
  const params = {};
  for (const part of left.slice(1)) {
    const equals = part.indexOf('=');
    if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, '');
  }
  return { value: line.slice(colon + 1), params };
}

function dateParts(raw) {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  return { year: +match[1], month: +match[2], day: +match[3], hour: +(match[4] || 0), minute: +(match[5] || 0), second: +(match[6] || 0), utc: Boolean(match[7]), dateOnly: !match[4] };
}

function edmontonParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EDMONTON_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function parseCalendarDate(item) {
  if (!item) return null;
  const parts = dateParts(item.value);
  if (!parts || parts.dateOnly) return null;

  if (parts.utc) {
    const local = edmontonParts(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)));
    return { date: `${local.year}-${local.month}-${local.day}`, time: `${local.hour}:${local.minute}` };
  }

  // BenchApp feeds use local rink times. Preserve those directly when a TZID
  // is present, and treat floating date-times as Edmonton local time as well.
  return {
    date: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    time: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
  };
}

function parseBenchAppEvents(icsText) {
  const lines = unfoldedLines(icsText);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) current.push(line);
  }

  const results = [];
  for (const linesInEvent of events) {
    const uid = property(linesInEvent, 'UID')?.value.trim();
    const summary = property(linesInEvent, 'SUMMARY')?.value;
    const start = parseCalendarDate(property(linesInEvent, 'DTSTART'));
    const end = parseCalendarDate(property(linesInEvent, 'DTEND'));
    if (!uid || !summary || !start) continue;

    const recurrence = property(linesInEvent, 'RECURRENCE-ID')?.value;
    const eventUid = recurrence ? `${uid}::${recurrence}` : uid;
    const titleText = decodeText(summary).trim();
    const legacyMatch = titleText.match(/(?:^|:\s*)Skate\s+(\d+)\s*:\s*(.+)$/i);
    const skateNumber = legacyMatch?.[1] || null;
    const tier = legacyMatch?.[2]?.trim() || titleText.match(/Tier\s*[123][^:|]*/i)?.[0]?.trim() || null;
    const summaryPrefix = titleText.split(':')[0]?.trim() || '';
    const eventType = /^skate\s+\d+/i.test(summaryPrefix) || !titleText.includes(':') ? 'Scrimmage' : summaryPrefix;
    const location = property(linesInEvent, 'LOCATION')?.value;
    const status = property(linesInEvent, 'STATUS')?.value.trim().toUpperCase();

    results.push({
      uid: eventUid,
      cancelled: status === 'CANCELLED',
      skate: {
        benchapp_event_uid: eventUid,
        title: legacyMatch ? `Skate ${skateNumber} ${tier}` : titleText,
        date: start.date,
        time_start: `${start.time}:00`,
        time_end: `${(end || start).time}:00`,
        location: decodeText(location || '').trim() || 'TBD',
        tier,
        skate_number: skateNumber,
        event_type: eventType,
        cost: '$25',
        capacity: 24,
        is_archived: false
      }
    });
  }
  return { eventCount: events.length, results };
}

async function supabaseRequest(path, accessToken, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {})
    }
  });
}

async function runBenchAppSync(request, setStage) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  setStage('checking your sign-in');
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: 'Sign in before syncing the calendar.' }, 401);

  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` }
  });
  if (!authResponse.ok) return json({ error: 'Your session expired. Sign in again.' }, 401);

  setStage('reading the sync request');
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  let feedUrl;
  try { feedUrl = new URL(body.feedUrl); } catch { return json({ error: 'Enter a valid BenchApp ICS link.' }, 400); }
  if (feedUrl.protocol !== 'https:' || feedUrl.hostname !== FEED_HOST || feedUrl.username || feedUrl.password) {
    return json({ error: 'Use the HTTPS ICS link copied from BenchApp.' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let feedResponse;
  setStage('downloading the BenchApp calendar');
  try {
    feedResponse = await fetch(feedUrl, { signal: controller.signal, headers: { accept: 'text/calendar, text/plain;q=0.9' } });
  } catch {
    clearTimeout(timeout);
    return json({ error: 'Could not reach the BenchApp calendar. No skates were changed.' }, 502);
  }
  clearTimeout(timeout);
  if (!feedResponse.ok) return json({ error: `BenchApp calendar returned ${feedResponse.status}. No skates were changed.` }, 502);
  const contentLength = Number(feedResponse.headers.get('content-length') || 0);
  if (contentLength > MAX_FEED_BYTES) return json({ error: 'Calendar feed is larger than expected. No skates were changed.' }, 413);
  const icsText = await feedResponse.text();
  if (icsText.length > MAX_FEED_BYTES || !icsText.includes('BEGIN:VCALENDAR')) {
    return json({ error: 'The link did not return a valid calendar feed. No skates were changed.' }, 502);
  }

  const { eventCount, results } = parseBenchAppEvents(icsText);
  setStage('reading the calendar events');
  const usable = results.filter(item => !item.cancelled);
  if (eventCount === 0 || results.length === 0 || usable.length === 0) {
    return json({ error: 'The calendar contained no usable skate events. No skates were changed.' }, 422);
  }

  setStage('checking existing skates in Supabase');
  const existingResponse = await supabaseRequest('/rest/v1/skates?select=id,benchapp_event_uid,date,is_archived&benchapp_event_uid=not.is.null', accessToken);
  if (!existingResponse.ok) return json({ error: 'Could not read existing imported skates. No skates were changed.' }, 502);
  const existingSkates = await existingResponse.json();
  const existingByUid = new Map(existingSkates.map(skate => [skate.benchapp_event_uid, skate]));

  const incoming = usable.map(({ skate }) => {
    const existing = existingByUid.get(skate.benchapp_event_uid);
    return existing ? { ...skate, cost: undefined, capacity: undefined } : skate;
  }).map(skate => {
    if (skate.cost === undefined) delete skate.cost;
    if (skate.capacity === undefined) delete skate.capacity;
    return skate;
  });

  const upsertUrl = new URL('/rest/v1/skates', SUPABASE_URL);
  setStage('saving imported skates');
  upsertUrl.searchParams.set('on_conflict', 'benchapp_event_uid');
  const upsertResponse = await supabaseRequest(`${upsertUrl.pathname}${upsertUrl.search}`, accessToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(incoming)
  });
  if (!upsertResponse.ok) return json({ error: 'Could not save imported skates. Check that the database update has been applied.' }, 502);

  const incomingUids = new Set(usable.map(item => item.uid));
  const cancelledUids = new Set(results.filter(item => item.cancelled).map(item => item.uid));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: EDMONTON_TZ }).format(new Date());
  const archiveIds = existingSkates
    .filter(skate => !skate.is_archived && skate.date >= today && (!incomingUids.has(skate.benchapp_event_uid) || cancelledUids.has(skate.benchapp_event_uid)))
    .map(skate => skate.id);

  if (archiveIds.length) {
    setStage('archiving removed skates');
    const archiveUrl = new URL('/rest/v1/skates', SUPABASE_URL);
    archiveUrl.searchParams.set('id', `in.(${archiveIds.join(',')})`);
    const archiveResponse = await supabaseRequest(`${archiveUrl.pathname}${archiveUrl.search}`, accessToken, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ is_archived: true })
    });
    if (!archiveResponse.ok) return json({ error: 'Skates synced, but removed skates could not be archived. Try syncing again.' }, 502);
  }

  const newCount = usable.filter(item => !existingByUid.has(item.uid)).length;
  const updatedCount = usable.length - newCount;
  return json({
    ok: true,
    newCount,
    updatedCount,
    archivedCount: archiveIds.length,
    eventCount: usable.length,
    syncedAt: new Date().toISOString()
  });
}

export default {
  async fetch(request) {
    let stage = 'starting the sync';
    try {
      return await runBenchAppSync(request, value => { stage = value; });
    } catch (error) {
      console.error(`BenchApp sync crashed while ${stage}:`, error);
      return json({ error: `The sync server crashed while ${stage}. Please try again later.` }, 500);
    }
  }
};
