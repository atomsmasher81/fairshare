// Parsing helpers shared by web, Telegram bot, Siri/Shortcuts and SMS capture.
// Plain JS (CommonJS) so the bot can require it without a build step.

const CATEGORY_KEYWORDS = {
  groceries: ['blinkit', 'zepto', 'instamart', 'bigbasket', 'grocery', 'groceries', 'milk', 'eggs', 'egg', 'bread', 'paneer', 'curd', 'dahi', 'atta', 'rice', 'dal', 'fruits', 'vegetables', 'veggies', 'sabzi', 'dmart', 'kirana', 'water can'],
  food: ['swiggy', 'zomato', 'chai', 'tea', 'coffee', 'breakfast', 'lunch', 'dinner', 'snacks', 'food', 'restaurant', 'cafe', 'starbucks', 'dominos', 'pizza', 'burger', 'kfc', 'mcd', 'mcdonald', 'biryani', 'juice', 'beer', 'drinks', 'bar', 'liquor'],
  travel: ['uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'metro', 'bus', 'train', 'irctc', 'flight', 'indigo', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag', 'makemytrip', 'goibibo', 'redbus'],
  utilities: ['electricity', 'bescom', 'wifi', 'internet', 'broadband', 'airtel', 'jio', 'vi ', 'recharge', 'gas', 'cylinder', 'water bill', 'maid', 'cook', 'laundry', 'dhobi', 'society', 'maintenance'],
  rent: ['rent', 'deposit', 'brokerage'],
  entertainment: ['movie', 'netflix', 'prime', 'hotstar', 'spotify', 'youtube', 'bookmyshow', 'pvr', 'inox', 'concert', 'game', 'steam'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'decathlon', 'ikea', 'clothes', 'shoes'],
  health: ['meds', 'medicine', 'pharmacy', 'apollo', 'pharmeasy', '1mg', 'doctor', 'hospital', 'clinic', 'gym', 'cult', 'lab', 'test'],
};

function guessCategory(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(w.length <= 3 ? ` ${w.trim()} ` : w))) return cat;
  }
  return 'other';
}

function toPaise(str) {
  const n = Number.parseFloat(String(str).replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * Parse free text like:
 *   "milk 20", "20 milk", "rent 30,390", "dinner 1200 @flat", "₹450 swiggy #personal"
 * Returns { description, amount (paise), tag (group hint or null), category }
 */
function parseQuickText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { error: 'Text is required', code: 'TEXT_REQUIRED' };
  }
  let t = text.trim();
  if (t.startsWith('/')) return { error: 'Commands are not expense entries', code: 'COMMAND_IGNORED' };

  // group hint: @flat or #flat (anywhere)
  let tag = null;
  t = t.replace(/(?:^|\s)[@#]([\w.-]+)/g, (_, g) => {
    tag = g.toLowerCase();
    return ' ';
  }).trim();

  // amount: first number (optionally prefixed with ₹/rs/inr)
  const amtRe = /(?:₹|rs\.?|inr)?\s?(\d[\d,]*(?:\.\d{1,2})?)(?:\s?(?:₹|rs|rupees|\/-))?/i;
  const m = t.match(amtRe);
  if (!m) {
    return { error: "Didn't understand. Try: milk 20, 20 milk, or dinner 1200 @flat", code: 'INVALID_FORMAT' };
  }
  const amount = toPaise(m[1]);
  if (amount <= 0) return { error: 'Amount must be greater than 0', code: 'INVALID_AMOUNT' };

  let description = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
    .trim();
  if (!description) description = 'Expense';

  return { description, amount, tag, category: guessCategory(description), rawText: text.trim() };
}

/**
 * Parse an Indian bank SMS / PhonePe / GPay payment screenshot text.
 * Returns null when it's not a debit we should record.
 * Returns { amount, payee, ref, kind: 'debit' }
 */
function parseBankMessage(raw) {
  if (!raw) return null;
  const text = String(raw).replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  // Ignore OTPs, requests, failures, and incoming money
  if (/\botp\b|one time password|verification code/.test(lower)) return null;
  if (/\b(failed|declined|reversed|refund(ed)?|unsuccessful)\b/.test(lower)) return null;
  if (/requested money|collect request|has requested/.test(lower)) return null;
  const isDebit = /(debited|spent|paid|sent|withdrawn|purchase|txn of|transaction of|payment of|dr\.?\s|debit)/i.test(text)
    || /paid to|sent to|money sent/i.test(text);
  const isCredit = /(credited|received|deposited)/i.test(text) && !/debited/i.test(text);
  if (!isDebit || isCredit) return null;

  // Amount
  const amtMatch = text.match(/(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/([\d,]+(?:\.\d{1,2})?)\s?(?:₹|rs\.?|inr)\b/i)
    || text.match(/(?:debited|spent|paid|sent)\s+(?:by|for|of)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amtMatch) return null;
  const amount = toPaise(amtMatch[1]);
  if (!amount) return null;

  // UPI reference (12 digits) for de-dupe
  const refMatch = text.match(/(?:upi\s*ref(?:\.|erence)?\s*(?:no\.?|number)?|ref\s*no\.?|rrn|utr|upi transaction id|transaction id|txn id)[:\s#-]*([a-z0-9]{10,})/i)
    || text.match(/\b(\d{12})\b/);
  const ref = refMatch ? refMatch[1] : null;

  // Payee
  let payee = null;
  const payeePatterns = [
    /upi\/p2[am]\/\d+\/([a-z][a-z0-9 .&'-]{2,}?)(?:\s+not you|\/|\.|$)/i,
    /;\s*([a-z][a-z0-9 .&'-]{1,40}?)\s+credited/i,
    /paid to\s+([^₹\n]+?)(?:\s+₹|\s+rs|\s+on\b|\s+upi|\s+via|\s+ref|\s+from|$)/i,
    /\bto\s+vpa\s+([\w.\-]+@[\w]+)/i,
    /\btrf to\s+([a-z0-9 .&'-]+?)(?:\s+ref|\s+refno|\s+on\b|\.|$)/i,
    /\bto\s+([a-z0-9 .&'-]+?)\s+on\s+\d/i,
    /\b(?:info|towards)[:\s]+(?:upi\/)?(?:p2[am]\/)?(?:\d+\/)?([a-z][a-z0-9 .&'-]{2,})/i,
    /\bat\s+([a-z0-9 .&*'-]{3,}?)(?:\s+on\b|\s+ref|\.|$)/i,
    /([\w.\-]+@(?:ybl|ibl|axl|okaxis|okhdfcbank|okicici|oksbi|paytm|upi|apl|yapl|ptyes|ptsbi|pthdfc|ptaxis|axisbank|icici|hdfcbank|sbi|kotak|fbl|ikwik|jupiteraxis|slc|naviaxis|freecharge|waaxis|wahdfcbank|waicici|wasbi|[a-z]+))/i,
    /\bto\s+([a-z][a-z0-9 .&'-]{2,40}?)(?:\s+ref|\s+via|\.|,|$)/i,
  ];
  for (const re of payeePatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const cand = m[1].trim().replace(/[.,]+$/, '');
      if (cand && !/^(your|a\/c|ac|account|bank|you)\b/i.test(cand)) {
        payee = cand;
        break;
      }
    }
  }

  return { amount, payee, ref, kind: 'debit' };
}

// Normalised key for "remember this payee" rules
function payeeKey(payee) {
  if (!payee) return null;
  let p = String(payee).toLowerCase().trim();
  if (p.includes('@')) {
    // VPAs like swiggy.stores@axisbank or 9876543210@ybl -> keep full VPA
    return p;
  }
  p = p.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return p.slice(0, 60) || null;
}

function prettyPayee(payee) {
  if (!payee) return 'UPI payment';
  const p = String(payee).trim();
  if (p.includes('@')) {
    const handle = p.split('@')[0];
    if (/^\d{8,}$/.test(handle)) return `UPI ${handle.slice(-4).padStart(handle.length > 4 ? 8 : 4, '•').slice(-8)}`;
    return titleCase(handle.replace(/[._-]+/g, ' ').replace(/\d{4,}/g, '').trim() || handle);
  }
  return titleCase(p);
}

module.exports = {
  CATEGORY_KEYWORDS,
  guessCategory,
  parseQuickText,
  parseBankMessage,
  payeeKey,
  prettyPayee,
  toPaise,
};
