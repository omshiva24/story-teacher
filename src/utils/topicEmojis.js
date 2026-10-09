'use strict';

/**
 * Picture words for the quick lesson: finds real things named in the text
 * (sun, planets, water, heart…) and pairs each with an emoji, so the backup
 * lesson gets colourful, topic-related pictures without the AI.
 * Order matters only for ties; every match keeps the word as written.
 */
const PICTURE_WORDS = [
  [/\bsun\b/i, '☀️'], [/\bplanets?\b/i, '🪐'], [/\bmoons?\b/i, '🌙'], [/\bstars?\b/i, '⭐'],
  [/\bearth\b/i, '🌍'], [/\bspace\b/i, '🚀'], [/\brockets?\b/i, '🚀'], [/\borbits?\b/i, '🔄'],
  [/\bcomets?\b/i, '☄️'], [/\basteroids?\b/i, '🪨'], [/\bgalax(y|ies)\b/i, '🌌'], [/\btelescopes?\b/i, '🔭'],
  [/\bwater\b/i, '💧'], [/\brain\b/i, '🌧️'], [/\bclouds?\b/i, '☁️'], [/\bsnow\b/i, '❄️'], [/\bice\b/i, '🧊'],
  [/\boceans?\b|\bseas?\b/i, '🌊'], [/\brivers?\b/i, '🏞️'], [/\bmountains?\b/i, '⛰️'], [/\bvolcano(es)?\b/i, '🌋'],
  [/\blava\b|\bmagma\b/i, '🔥'], [/\bearthquakes?\b/i, '🫨'], [/\brocks?\b/i, '🪨'], [/\bsoil\b/i, '🟫'],
  [/\bweather\b/i, '🌦️'], [/\bwind\b/i, '💨'], [/\bair\b/i, '🌬️'], [/\boxygen\b/i, '🫧'], [/\bcarbon dioxide\b/i, '💨'],
  [/\bgas(es)?\b/i, '💨'], [/\blight\b/i, '💡'], [/\benergy\b/i, '⚡'], [/\belectric(ity)?\b/i, '⚡'], [/\bmagnets?\b/i, '🧲'],
  [/\bheat\b/i, '🔥'], [/\bfire\b/i, '🔥'], [/\bsound\b/i, '🔊'], [/\bmusic\b/i, '🎵'],
  [/\bplants?\b/i, '🌱'], [/\bleaf\b|\bleaves\b/i, '🍃'], [/\btrees?\b|\bforests?\b/i, '🌳'], [/\bflowers?\b/i, '🌸'],
  [/\bseeds?\b/i, '🌰'], [/\broots?\b/i, '🌿'], [/\bfruits?\b/i, '🍎'], [/\bfood\b/i, '🍽️'], [/\bsugar\b|\bglucose\b/i, '🍬'],
  [/\banimals?\b/i, '🐾'], [/\bbirds?\b/i, '🐦'], [/\bfish\b/i, '🐟'], [/\bbees?\b|\bhoney\b/i, '🐝'], [/\bbutterfl(y|ies)\b/i, '🦋'],
  [/\binsects?\b/i, '🐞'], [/\btigers?\b/i, '🐯'], [/\blions?\b/i, '🦁'], [/\belephants?\b/i, '🐘'], [/\bdinosaurs?\b/i, '🦕'],
  [/\bcells?\b/i, '🧫'], [/\bblood\b/i, '🩸'], [/\bheart\b/i, '❤️'], [/\bbrain\b/i, '🧠'], [/\blungs?\b/i, '🫁'],
  [/\bbones?\b|\bskeleton\b/i, '🦴'], [/\bteeth\b|\btooth\b/i, '🦷'], [/\beyes?\b/i, '👁️'], [/\bbody\b/i, '🧍'], [/\bgerms?\b|\bbacteria\b/i, '🦠'],
  [/\bnumbers?\b/i, '🔢'], [/\bfractions?\b/i, '➗'], [/\bshapes?\b|\btriangles?\b/i, '🔺'], [/\bmeasure(ment)?s?\b/i, '📏'],
  [/\bmoney\b|\brupees?\b/i, '💰'], [/\btime\b|\bclocks?\b/i, '⏰'],
  [/\bcomputers?\b/i, '💻'], [/\bphones?\b/i, '📱'], [/\binternet\b/i, '🌐'], [/\brobots?\b/i, '🤖'], [/\bmachines?\b/i, '⚙️'],
  [/\bcars?\b/i, '🚗'], [/\btrains?\b/i, '🚆'], [/\b(aero)?planes?\b|\baircraft\b/i, '✈️'], [/\bships?\b|\bboats?\b/i, '🚢'], [/\bsatellites?\b/i, '🛰️'],
  [/\bkings?\b|\bqueens?\b|\bempire\b/i, '👑'], [/\bscientists?\b/i, '🧑‍🔬'], [/\bbooks?\b/i, '📚'], [/\bschools?\b/i, '🏫'],
  [/\bcit(y|ies)\b/i, '🏙️'], [/\bbuildings?\b|\btemples?\b/i, '🏛️'], [/\bmovies?\b|\bfilms?\b/i, '🎬'], [/\btoys?\b/i, '🧸'],
  [/\bcricket\b/i, '🏏'], [/\bfootball\b|\bsoccer\b/i, '⚽'], [/\bgames?\b/i, '🎮'], [/\bpaint(ing)?s?\b|\bart\b/i, '🎨'],
];

/**
 * Finds picture words in text, in the order they appear.
 * @param {string} text
 * @param {number} [max=4]
 * @returns {{ emoji: string, label: string }[]}
 */
function findPictureWords(text, max = 4) {
  const found = [];
  PICTURE_WORDS.forEach(([pattern, emoji]) => {
    const match = text.match(pattern);
    if (match) found.push({ index: match.index, emoji, label: match[0] });
  });
  const seenEmoji = new Set();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((item) => (seenEmoji.has(item.emoji) ? false : seenEmoji.add(item.emoji)))
    .slice(0, max)
    .map(({ emoji, label }) => ({ emoji, label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() }));
}

module.exports = { findPictureWords, PICTURE_WORDS };
