// Vercel Serverless Function: Check Gmail for e-transfer emails
// Path: /api/check-emails.js

// Gmail OAuth
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

// Supabase (test database)
const SUPABASE_URL = 'https://vbmsvtcglwxjzpabnnoi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibXN2dGNnbHd4anpwYWJubm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4Mzg5OTIsImV4cCI6MjA4ODQxNDk5Mn0.GwKfpNQ3Fv9CCtvodsabDmpryqY0ZOg6asX-WWaC4E4';

// Simple Supabase client (fetch-based)
class SimpleSupabase {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
  }

  async query(table, options = {}) {
    let url = `${this.url}/rest/v1/${table}`;
    
    // Add select
    if (options.select) {
      url += `?select=${options.select}`;
    }
    
    // Add filters
    if (options.eq) {
      Object.entries(options.eq).forEach(([key, value]) => {
        url += url.includes('?') ? '&' : '?';
        url += `${key}=eq.${value}`;
      });
    }
    
    if (options.in) {
      Object.entries(options.in).forEach(([key, values]) => {
        url += url.includes('?') ? '&' : '?';
        url += `${key}=in.(${values.join(',')})`;
      });
    }
    
    // Add order
    if (options.order) {
      url += url.includes('?') ? '&' : '?';
      url += `order=${options.order.column}.${options.order.ascending ? 'asc' : 'desc'}`;
    }
    
    const response = await fetch(url, {
      headers: this.headers
    });
    
    return await response.json();
  }

  async insert(table, data) {
    const url = `${this.url}/rest/v1/${table}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    
    return await response.json();
  }
}

const supabase = new SimpleSupabase(SUPABASE_URL, SUPABASE_KEY);

// ========== GET ACCESS TOKEN ==========
async function getAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.access_token;
}

// ========== FETCH EMAILS ==========
async function fetchEmails(accessToken) {
  // Search for Interac emails from last 7 days
  const query = 'from:notify@payments.interac.ca subject:"INTERAC e-Transfer" newer_than:7d';
  
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
  
  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();
  return data.messages || [];
}

// ========== GET EMAIL DETAILS ==========
async function getEmailDetails(messageId, accessToken) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();
  
  // Recursively find text/plain part
  function findTextPart(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return part.body.data;
    }
    
    if (part.parts) {
      for (const subpart of part.parts) {
        const result = findTextPart(subpart);
        if (result) return result;
      }
    }
    
    return null;
  }
  
  // Extract body
  let body = '';
  const textData = findTextPart(data.payload);
  if (textData) {
    body = Buffer.from(textData, 'base64').toString('utf-8');
    // Normalize line endings immediately
    body = body.replace(/\r\n/g, '\n');
  }

  // Extract subject
  const subjectHeader = data.payload.headers.find(h => h.name === 'Subject');
  const subject = subjectHeader?.value || '';

  console.log('📧 Extracted body length:', body.length);
  console.log('📧 Body sample (first 200 chars):', body.substring(0, 200));
  
  return { body, subject };
}

// ========== PARSE EMAIL ==========
function parseInteracEmail(body, subject) {
  const patterns = {
    amount: /Amount:\s*\$(\d+\.?\d{0,2})\s*(?:\(CAD\)|CAD)?/i,
    sender: /Sent From:\s*(.+?)(?:\n|$)/i,
    memo: /Message:\s*\n([\s\S]+?)(?=\nDate:|$)/i, // Multi-line message
    date: /Date:\s*([^\n]+)/i,
    reference: /Reference Number:\s*(\w+)/i,
    email: /(?:Email|E-mail):\s*([^\s\n]+@[^\s\n]+)/i
  };

  const amount = body.match(patterns.amount)?.[1];
  const sender = body.match(patterns.sender)?.[1]?.trim();
  const memoRaw = body.match(patterns.memo)?.[1];
  const memo = memoRaw ? memoRaw.trim().replace(/\n+/g, ' ') : ''; // Collapse newlines to spaces
  const dateStr = body.match(patterns.date)?.[1]?.trim();
  const reference = body.match(patterns.reference)?.[1];
  const senderEmail = body.match(patterns.email)?.[1];

  if (!amount || !sender || !reference) {
    console.log('Parse failed - missing fields:', { amount, sender, reference });
    return null;
  }

  let etransferDate = new Date().toISOString().split('T')[0];
  if (dateStr) {
    try {
      etransferDate = new Date(dateStr).toISOString().split('T')[0];
    } catch (e) {}
  }

  console.log('✅ Parsed:', { amount, sender, memo, reference });

  return {
    amount: parseFloat(amount),
    sender_name: sender,
    sender_email: senderEmail || null,
    memo: memo || '',
    etransfer_date: etransferDate,
    etransfer_reference: reference,
    raw_email_body: body,
    email_subject: subject
  };
}

// ========== MATCH TO SKATES ==========
async function matchToSkates(payment) {
  const memo = payment.memo || '';
  
  // Extract skate numbers
  const skateNumbers = [];
  const numberPattern = /\b(\d{3})\b/g;
  let match;
  while ((match = numberPattern.exec(memo)) !== null) {
    skateNumbers.push(parseInt(match[1]));
  }

  if (skateNumbers.length === 0) return { skates: [], confidence: 0 };

  // Find skates
  const skates = await supabase.query('skates', {
    select: '*',
    in: { id: skateNumbers }
  });

  if (!skates || skates.length === 0) return { skates: [], confidence: 0 };

  // Check amount
  const expectedAmount = skates.reduce((sum, s) => 
    sum + parseFloat(s.cost.replace('$', '')), 0
  );

  const amountMatches = Math.abs(expectedAmount - payment.amount) < 0.01;
  const confidence = amountMatches ? 90 : 70;

  return { skates, confidence, amountMatches };
}

// ========== MATCH TO PLAYER ==========
async function matchToPlayer(payment) {
  const senderName = payment.sender_name;

  // Get all players and do matching in JavaScript
  const players = await supabase.query('players', { select: '*' });

  if (!players) return { player: null, confidence: 0 };

  // Try exact match (case insensitive)
  const exactMatch = players.find(p => 
    p.name.toLowerCase() === senderName.toLowerCase()
  );

  if (exactMatch) {
    return { player: exactMatch, confidence: 30 };
  }

  // Try fuzzy match
  const nameParts = senderName.toLowerCase().split(' ').filter(p => p.length > 2);
  
  if (nameParts.length >= 2) {
    for (const player of players) {
      const normalizedPlayer = player.name.toLowerCase();
      const matches = nameParts.filter(part => normalizedPlayer.includes(part));
      if (matches.length >= 2) {
        return { player, confidence: 15 };
      }
    }
  }

  return { player: null, confidence: 0 };
}

// ========== PROCESS PAYMENT ==========
async function processPayment(parsed) {
  // Check if already processed
  const existing = await supabase.query('test_payment_records', {
    select: 'id',
    eq: { etransfer_reference: parsed.etransfer_reference }
  });

  if (existing && existing.length > 0) {
    console.log('Already processed:', parsed.etransfer_reference);
    return { status: 'duplicate', id: existing[0].id };
  }

  // Match to skates and player
  const skateMatch = await matchToSkates(parsed);
  const playerMatch = await matchToPlayer(parsed);

  const totalConfidence = skateMatch.confidence + playerMatch.confidence;

  // Insert payment record
  const payment = await supabase.insert('test_payment_records', {
    etransfer_date: parsed.etransfer_date,
    etransfer_reference: parsed.etransfer_reference,
    amount: parsed.amount,
    sender_name: parsed.sender_name,
    sender_email: parsed.sender_email,
    memo: parsed.memo,
    raw_email_body: parsed.raw_email_body,
    email_subject: parsed.email_subject,
    email_received_at: new Date().toISOString()
  });

  if (!payment || payment.length === 0) {
    throw new Error('Failed to insert payment');
  }

  const paymentId = payment[0].id;

  // Log match result
  await supabase.insert('test_payment_log', {
    payment_id: paymentId,
    action: 'auto_matched',
    matched_skate_ids: skateMatch.skates.map(s => s.id),
    matched_player_id: playerMatch.player?.id || null,
    confidence_score: totalConfidence,
    admin_notes: `Auto-matched: ${skateMatch.skates.length} skates, player: ${playerMatch.player?.name || 'none'}`
  });

  // Create assignments
  if (skateMatch.skates.length > 0 && playerMatch.player) {
    for (const skate of skateMatch.skates) {
      await supabase.insert('test_payment_assignments', {
        payment_id: paymentId,
        skate_id: skate.id,
        player_id: playerMatch.player.id,
        would_add_to_roster: true,
        assignment_type: totalConfidence >= 80 ? 'auto' : 'needs_review',
        notes: `Confidence: ${totalConfidence}%`
      });
    }
  }

  return {
    status: 'processed',
    id: paymentId,
    confidence: totalConfidence,
    skates: skateMatch.skates.length,
    player: playerMatch.player?.name || 'none'
  };
}

// ========== MAIN HANDLER ==========
module.exports = async function handler(req, res) {
  try {
    console.log('🔍 Checking for new emails...');

    // Get access token
    const accessToken = await getAccessToken();

    // Fetch emails
    const messages = await fetchEmails(accessToken);
    console.log(`📧 Found ${messages.length} emails`);

    const results = [];

    // Process each email
    const debugInfo = [];
    for (const message of messages.slice(0, 30)) { // Process max 30 at a time
      try {
        const { body, subject } = await getEmailDetails(message.id, accessToken);
        console.log('📧 Email subject:', subject);
        console.log('📧 Body length:', body.length);
        console.log('📧 Body first 1000 chars:', body.substring(0, 1000));
        
        // Add to debug info
        debugInfo.push({
          subject,
          bodyLength: body.length,
          bodyPreview: body.substring(0, 500)
        });
        
        const parsed = parseInteracEmail(body, subject);

        if (parsed) {
          const result = await processPayment(parsed);
          results.push(result);
          console.log('✅ Processed:', parsed.etransfer_reference, result);
        } else {
          console.log('❌ Failed to parse email');
          results.push({ status: 'parse_failed', subject });
        }
      } catch (error) {
        console.error('Error processing email:', message.id, error);
        results.push({ status: 'error', error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      total_emails: messages.length,
      processed: results.filter(r => r.status === 'processed' || r.status === 'duplicate').length,
      failed: results.filter(r => r.status === 'parse_failed' || r.status === 'error').length,
      results,
      debug: debugInfo.slice(0, 2) // Include first 2 email previews
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
