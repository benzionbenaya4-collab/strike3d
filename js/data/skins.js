// סקינים – צבעי מתכת/גוף/דגש לנשקים ולדמות. a=גוף ראשי, b=משני, glow=זוהר (או null).
export const SKINS = [
  { id: 'default', he: 'רגיל',        rarity: 'common',    a: '#8d939b', b: '#26292e', glow: null },
  { id: 'camo',    he: 'הסוואה',      rarity: 'common',    a: '#5d6b3c', b: '#3b3324', glow: null },
  { id: 'neon',    he: 'שחור־ניאון',  rarity: 'rare',      a: '#16181d', b: '#0b0c0f', glow: '#22f0ff' },
  { id: 'ice',     he: 'קרח',         rarity: 'epic',      a: '#bfe9ff', b: '#5aa7d6', glow: '#9ff3ff' },
  { id: 'lava',    he: 'לבה',         rarity: 'legendary', a: '#2a1410', b: '#140805', glow: '#ff5a1f' },
  { id: 'gold',    he: 'זהב',         rarity: 'legendary', a: '#e8b93a', b: '#5a3b0c', glow: null },
  { id: 'galaxy',  he: 'גלקסיה',      rarity: 'mythic',    a: '#2b1450', b: '#0d0820', glow: '#c77dff' },
];
export const skin = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
